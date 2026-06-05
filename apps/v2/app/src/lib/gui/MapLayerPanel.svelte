<script lang="ts">
	import {
		queryMapLayers,
		auditMapProjectionConsistency,
		buildInverseMapEditCommand,
		layerContent,
		type MapFeature,
		type MapGenerationKind,
		type MapLayerQueryEntry,
		type SceneVisibility,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	/**
	 * MAP-005 / MAP-006 / MAP-007 / MAP-016 — the DM layer-management surface.
	 *
	 * The DM authors layers here (create / rename / reorder / duplicate / lock / delete, and the
	 * three INDEPENDENT presentation axes: player-visibility, DM-display, opacity). Every mutation is
	 * dispatched as a Processing-Core command through the runtime — the GUI never writes durable
	 * state (Contract 1). The layer LIST itself is the actor-filtered query result, so when the page
	 * is viewed as a player/observer the panel shows ONLY the layers that actor may see and the
	 * authoring controls disappear. That makes the panel itself a live proof that a DM-only layer is
	 * never read into a player/observer context (MAP-006/MAP-007).
	 */
	interface Props {
		mapId: string;
	}
	const { mapId }: Props = $props();
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId]);
	const isDm = $derived(actor?.role === 'dm');

	// The actor-filtered layer query (MAP-007). A non-DM result OMITS hidden layers entirely; the DM
	// result includes every layer. This is the single read path the panel renders from.
	const query = $derived(
		queryMapLayers(runtime.state.maps, runtime.state.permissions, runtime.activeActorId, { mapId }),
	);
	const layers = $derived<MapLayerQueryEntry[]>(query.layers);

	// MAP-016: the pre-projection consistency report, DM-only. With no POI/route/token/nested graph
	// authored in this prototype the report is empty, but the surface proves the check runs and is
	// gated to the DM (a non-DM never receives it).
	const consistency = $derived(
		isDm ? auditMapProjectionConsistency({ map: runtime.state.maps.maps[mapId]! }) : null,
	);

	let newName = $state('');
	let busy = $state(false);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]) {
		if (busy) return;
		busy = true;
		try {
			await runtime.dispatch(command);
		} finally {
			busy = false;
		}
	}

	async function createLayer(event: SubmitEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		await dispatch({
			type: 'map.create-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, name, category: 'dm-annotations', visibility: 'dm-only' },
		});
		newName = '';
	}

	function setVisibility(layerId: string, visibility: SceneVisibility) {
		void dispatch({
			type: 'map.set-layer-visibility',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, visibility },
		});
	}

	function setOpacity(layerId: string, opacity: number) {
		void dispatch({
			type: 'map.set-layer-opacity',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, opacity },
		});
	}

	function setEnabled(layerId: string, enabled: boolean) {
		void dispatch({
			type: 'map.set-layer-enabled',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, enabled },
		});
	}

	function setLock(layerId: string, locked: boolean) {
		void dispatch({
			type: 'map.lock-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, locked },
		});
	}

	function reorder(layerId: string, toOrder: number) {
		void dispatch({
			type: 'map.reorder-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, toOrder },
		});
	}

	function duplicate(layerId: string) {
		void dispatch({
			type: 'map.duplicate-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId },
		});
	}

	function remove(layerId: string) {
		void dispatch({
			type: 'map.delete-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId },
		});
	}

	// MAP-003: the last committed paint edit's before/after, so the Undo control can dispatch the
	// inverse (before/after swapped) to restore the exact prior content. GUI-local memory only — the
	// authoritative undo target is the captured before-state carried in the command (Contract 1).
	let lastEdit = $state<{ layerId: string; before: MapFeature[]; after: MapFeature[] } | null>(
		null,
	);

	/**
	 * MAP-003: paint a deterministic stroke onto a layer. The edit captures the layer's CURRENT content
	 * as `before` and the appended stroke as `after`, so the committed command is both undoable and
	 * sync-replayable. The GUI reads the before-base from the Processing Core query result (it never
	 * reaches durable state).
	 */
	async function paint(layerId: string) {
		const before = layerContent(runtime.state.maps.maps[mapId]!, layerId);
		const stroke: MapFeature = {
			id: runtime.newId(),
			kind: 'stroke',
			// A small deterministic mark; a real brush tool would supply pointer-traced points.
			points: [
				{ x: 0.4, y: 0.4 },
				{ x: 0.6, y: 0.6 },
			],
			style: 'ink:black',
		};
		const after = [...before, stroke];
		await dispatch({
			type: 'map.edit-layer',
			actorId: runtime.activeActorId,
			payload: { mapId, layerId, before, after },
		});
		lastEdit = { layerId, before, after };
	}

	/** MAP-003: undo the last paint edit by dispatching its inverse (before/after swapped). */
	async function undoLastEdit() {
		if (!lastEdit) return;
		const inverse = buildInverseMapEditCommand({
			mapId,
			layerId: lastEdit.layerId,
			before: lastEdit.before,
			after: lastEdit.after,
		});
		await dispatch({ type: 'map.edit-layer', actorId: runtime.activeActorId, payload: inverse });
		lastEdit = null;
	}

	// MAP-004: explicit generation parameters. The DM picks a kind + seed; generation is deterministic
	// (same seed ⇒ identical layers) and the result is saved as editable layers the DM can paint on.
	let genKind = $state<MapGenerationKind>('dungeon');
	let genSeed = $state('crypt-1');

	async function generate(event: SubmitEvent) {
		event.preventDefault();
		const seed = genSeed.trim();
		if (!seed) return;
		await dispatch({
			type: 'map.generate-layers',
			actorId: runtime.activeActorId,
			payload: {
				mapId,
				kind: genKind,
				seed,
				width: 8,
				height: 8,
				density: 0.5,
				// Deterministic id prefix derived from the seed so a re-run reproduces stable ids; the
				// `gen-` namespace keeps it from colliding with the seeded demo layers.
				idPrefix: `gen-${genKind}-${seed}`,
			},
		});
	}
</script>

<section class="layer-panel" data-testid="map-layer-panel" aria-label="Map layers">
	<header class="layer-head">
		<h3 id={`layers-${mapId}`}>Layers</h3>
		<p class="meta" data-testid="layer-count">
			{layers.length} layer{layers.length === 1 ? '' : 's'}
			{#if isDm && query.hiddenMatchCount > 0}
				<span data-testid="layer-hidden-count">
					({query.hiddenMatchCount} hidden from players)</span
				>
			{/if}
		</p>
	</header>

	{#if isDm}
		<form class="layer-create" onsubmit={createLayer}>
			<label>
				<span class="visually-hidden">New layer name</span>
				<input
					type="text"
					data-testid="layer-new-name"
					placeholder="New layer name"
					bind:value={newName}
				/>
			</label>
			<button type="submit" class="button" data-testid="layer-create" disabled={busy}>
				Add layer
			</button>
		</form>

		<!-- MAP-004: deterministic procedural generation from explicit parameters. The DM picks a kind
		     and a seed; the result is saved as editable layers (the DM can then paint on them). The same
		     seed + parameters reproduce the same layer set. -->
		<form class="layer-generate" onsubmit={generate} aria-label="Generate map layers">
			<label class="control">
				<span class="visually-hidden">Generation kind</span>
				<select data-testid="generate-kind" bind:value={genKind} disabled={busy}>
					<option value="terrain">Terrain</option>
					<option value="settlement">Settlement</option>
					<option value="dungeon">Dungeon</option>
				</select>
			</label>
			<label class="control">
				<span class="visually-hidden">Generation seed</span>
				<input type="text" data-testid="generate-seed" placeholder="Seed" bind:value={genSeed} />
			</label>
			<button type="submit" class="button" data-testid="generate-submit" disabled={busy}>
				Generate
			</button>
		</form>

		<!-- MAP-003: undo the last paint edit. The inverse command (captured before-state) restores the
		     exact prior content. Disabled when there is nothing to undo. -->
		<button
			type="button"
			class="button secondary"
			data-testid="edit-undo"
			disabled={busy || lastEdit === null}
			onclick={undoLastEdit}
		>
			Undo last paint
		</button>
	{/if}

	<ul class="layer-list" data-testid="layer-list">
		{#each layers as layer, index (layer.layerId)}
			<li class="layer-item" data-testid={`layer-${layer.layerId}`}>
				<div class="layer-row">
					<span class="layer-name" data-testid={`layer-name-${layer.layerId}`}>{layer.name}</span>
					<span
						class="layer-visibility"
						data-testid={`layer-visibility-${layer.layerId}`}
						data-visibility={layer.visibility}
					>
						{layer.visibility}
					</span>
					{#if layer.locked}
						<span class="layer-locked" data-testid={`layer-locked-${layer.layerId}`}>locked</span>
					{/if}
					<!-- MAP-003/MAP-004: the painted/generated content count for this layer. Read from the
					     actor-filtered query, so a non-DM only ever sees counts for layers they may see. -->
					<span class="layer-content" data-testid={`layer-content-count-${layer.layerId}`}>
						{layer.content.length} mark{layer.content.length === 1 ? '' : 's'}
					</span>
				</div>

				{#if isDm}
					<div class="layer-controls">
						<label class="control">
							<span class="visually-hidden">Player visibility for {layer.name}</span>
							<select
								data-testid={`layer-set-visibility-${layer.layerId}`}
								value={layer.visibility}
								disabled={layer.locked || busy}
								onchange={(event) =>
									setVisibility(layer.layerId, event.currentTarget.value as SceneVisibility)}
							>
								<option value="dm-only">dm-only</option>
								<option value="player-visible">player-visible</option>
								<option value="shared">shared</option>
							</select>
						</label>

						<label class="control">
							<span class="visually-hidden">DM display for {layer.name}</span>
							<input
								type="checkbox"
								data-testid={`layer-set-enabled-${layer.layerId}`}
								checked={layer.enabled}
								disabled={layer.locked || busy}
								onchange={(event) => setEnabled(layer.layerId, event.currentTarget.checked)}
							/>
							<span>DM shown</span>
						</label>

						<label class="control">
							<span class="visually-hidden">Opacity for {layer.name}</span>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								data-testid={`layer-set-opacity-${layer.layerId}`}
								value={layer.opacity}
								disabled={layer.locked || busy}
								onchange={(event) => setOpacity(layer.layerId, Number(event.currentTarget.value))}
							/>
							<span data-testid={`layer-opacity-${layer.layerId}`}>{layer.opacity}</span>
						</label>

						<div class="layer-actions">
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-paint-${layer.layerId}`}
								disabled={layer.locked || busy}
								onclick={() => paint(layer.layerId)}
							>
								Paint
							</button>
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-up-${layer.layerId}`}
								disabled={layer.locked || busy || index === 0}
								onclick={() => reorder(layer.layerId, index - 1)}
							>
								Move up
							</button>
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-down-${layer.layerId}`}
								disabled={layer.locked || busy || index === layers.length - 1}
								onclick={() => reorder(layer.layerId, index + 1)}
							>
								Move down
							</button>
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-duplicate-${layer.layerId}`}
								disabled={busy}
								onclick={() => duplicate(layer.layerId)}
							>
								Duplicate
							</button>
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-lock-${layer.layerId}`}
								disabled={busy}
								aria-pressed={layer.locked}
								onclick={() => setLock(layer.layerId, !layer.locked)}
							>
								{layer.locked ? 'Unlock' : 'Lock'}
							</button>
							<button
								type="button"
								class="button secondary"
								data-testid={`layer-delete-${layer.layerId}`}
								disabled={layer.locked || busy || layers.length <= 1}
								onclick={() => remove(layer.layerId)}
							>
								Delete
							</button>
						</div>
					</div>
				{/if}
			</li>
		{/each}
		{#if layers.length === 0}
			<li class="meta" data-testid="layer-empty">No layers are visible to you.</li>
		{/if}
	</ul>

	{#if isDm && consistency}
		<section
			class="layer-consistency"
			data-testid="layer-consistency"
			aria-label="Projection check"
		>
			<h4>Pre-projection check</h4>
			{#if consistency.blocked}
				<p class="error" role="alert" data-testid="consistency-blocked">
					Projection blocked: {consistency.problems.filter((p) => p.severity === 'error').length}
					visibility inconsistencies must be resolved.
				</p>
			{:else}
				<p class="meta" data-testid="consistency-ok">
					Safe to project — no blocking visibility inconsistencies.
				</p>
			{/if}
		</section>
	{/if}
</section>

<style>
	.layer-panel {
		margin-top: 1rem;
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
	.layer-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.layer-create,
	.layer-generate {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.layer-content {
		font-size: 0.75rem;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: var(--card);
		border: 1px solid var(--border);
	}
	.layer-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.layer-item {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
	}
	.layer-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.layer-name {
		font-weight: 600;
	}
	.layer-visibility,
	.layer-locked {
		font-size: 0.75rem;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: var(--card);
		border: 1px solid var(--border);
	}
	.layer-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.layer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
