<script lang="ts">
	import {
		queryMapLayers,
		auditMapProjectionConsistency,
		buildInverseMapEditCommand,
		layerContent,
		type MapFeature,
		type MapGenerationKind,
		type MapLayerCategory,
		type MapLayerQueryEntry,
		type SceneVisibility,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	// UX-MAP-004/005/008/014 (MAP-003/004/005/006/007/016) — the DM LAYER-MANAGEMENT surface, with the
	// established layer-panel row anatomy (type badge · DM-display eye · player-visibility · name ·
	// opacity · lock · actions), a tag/type FILTER bar, and the deterministic generation controls. The
	// layer LIST is the actor-filtered query result, so viewed as a player/observer the panel shows ONLY
	// the layers that actor may see and the authoring controls disappear — a live proof a dm-only layer
	// is never read into a player/observer context. Every mutation dispatches a durable command
	// (Contract 1); the GUI never writes state or re-derives visibility.
	interface Props {
		mapId: string;
	}
	const { mapId }: Props = $props();
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId]);
	const isDm = $derived(actor?.role === 'dm');

	const query = $derived(
		queryMapLayers(runtime.state.maps, runtime.state.permissions, runtime.activeActorId, { mapId }),
	);
	const layers = $derived<MapLayerQueryEntry[]>(query.layers);

	const consistency = $derived(
		isDm ? auditMapProjectionConsistency({ map: runtime.state.maps.maps[mapId]! }) : null,
	);

	// UX-MAP-005 — the layer-type badge model: a human label + a distinct Lucide glyph + a hue per
	// category. The `tone` keys the `--layer-*` hue in the scoped stylesheet (badge fg + border, with
	// a low-alpha mix for the fill); the `icon` is the non-colour cue so the type survives grayscale.
	const CATEGORY: Record<MapLayerCategory, { label: string; tone: string; icon: IconName }> = {
		base: { label: 'Base', tone: 'base', icon: 'layer-base' },
		terrain: { label: 'Terrain', tone: 'terrain', icon: 'layer-height' },
		roads: { label: 'Roads', tone: 'roads', icon: 'layer-roads' },
		poi: { label: 'POI', tone: 'poi', icon: 'layer-poi' },
		fog: { label: 'Fog', tone: 'fog', icon: 'layer-fog' },
		'dm-annotations': { label: 'DM notes', tone: 'dm', icon: 'layer-dm' },
		'player-overlay': { label: 'Player overlay', tone: 'player', icon: 'layer-player' },
	};
	const VIS_LABEL: Record<string, string> = {
		'dm-only': 'DM only',
		'player-visible': 'Player visible',
		shared: 'Shared',
	};

	// UX-MAP-014 — filter the layer list by type. The categories present in the (already actor-filtered)
	// list become chips; "All" clears the filter. Client-side over the actor-safe list (no new query).
	let typeFilter = $state<MapLayerCategory | 'all'>('all');
	const presentCategories = $derived(
		[...new Set(layers.map((layer) => layer.category))] as MapLayerCategory[],
	);
	const shownLayers = $derived(
		layers.filter((layer) => typeFilter === 'all' || layer.category === typeFilter),
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
		void dispatch({ type: 'map.set-layer-visibility', actorId: runtime.activeActorId, payload: { mapId, layerId, visibility } });
	}
	function setOpacity(layerId: string, opacity: number) {
		void dispatch({ type: 'map.set-layer-opacity', actorId: runtime.activeActorId, payload: { mapId, layerId, opacity } });
	}
	function setEnabled(layerId: string, enabled: boolean) {
		void dispatch({ type: 'map.set-layer-enabled', actorId: runtime.activeActorId, payload: { mapId, layerId, enabled } });
	}
	function setLock(layerId: string, locked: boolean) {
		void dispatch({ type: 'map.lock-layer', actorId: runtime.activeActorId, payload: { mapId, layerId, locked } });
	}
	function reorder(layerId: string, toOrder: number) {
		void dispatch({ type: 'map.reorder-layer', actorId: runtime.activeActorId, payload: { mapId, layerId, toOrder } });
	}
	function duplicate(layerId: string) {
		void dispatch({ type: 'map.duplicate-layer', actorId: runtime.activeActorId, payload: { mapId, layerId } });
	}
	function remove(layerId: string) {
		void dispatch({ type: 'map.delete-layer', actorId: runtime.activeActorId, payload: { mapId, layerId } });
	}

	let lastEdit = $state<{ layerId: string; before: MapFeature[]; after: MapFeature[] } | null>(null);

	async function paint(layerId: string) {
		const before = layerContent(runtime.state.maps.maps[mapId]!, layerId);
		const stroke: MapFeature = {
			id: runtime.newId(),
			kind: 'stroke',
			points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }],
			style: 'ink:black',
		};
		const after = [...before, stroke];
		await dispatch({ type: 'map.edit-layer', actorId: runtime.activeActorId, payload: { mapId, layerId, before, after } });
		lastEdit = { layerId, before, after };
	}
	async function undoLastEdit() {
		if (!lastEdit) return;
		const inverse = buildInverseMapEditCommand({ mapId, layerId: lastEdit.layerId, before: lastEdit.before, after: lastEdit.after });
		await dispatch({ type: 'map.edit-layer', actorId: runtime.activeActorId, payload: inverse });
		lastEdit = null;
	}

	let genKind = $state<MapGenerationKind>('dungeon');
	let genSeed = $state('crypt-1');
	async function generate(event: SubmitEvent) {
		event.preventDefault();
		const seed = genSeed.trim();
		if (!seed) return;
		await dispatch({
			type: 'map.generate-layers',
			actorId: runtime.activeActorId,
			payload: { mapId, kind: genKind, seed, width: 8, height: 8, density: 0.5, idPrefix: `gen-${genKind}-${seed}` },
		});
	}
</script>

<section class="layers" data-testid="map-layer-panel" aria-label="Map layers">
	<header class="layers__head">
		<h3 id={`layers-${mapId}`}>Layers</h3>
		<p class="layers__count" data-testid="layer-count">
			{layers.length} layer{layers.length === 1 ? '' : 's'}
			{#if isDm && query.hiddenMatchCount > 0}
				<span class="layers__hidden" data-testid="layer-hidden-count">· {query.hiddenMatchCount} hidden from players</span>
			{/if}
		</p>
	</header>

	{#if presentCategories.length > 1}
		<div class="filters" role="group" aria-label="Filter layers by type">
			<button type="button" class="chip" class:chip--active={typeFilter === 'all'} aria-pressed={typeFilter === 'all'} data-testid="layer-filter-all" onclick={() => (typeFilter = 'all')}>All</button>
			{#each presentCategories as category (category)}
				<button type="button" class="chip" class:chip--active={typeFilter === category} aria-pressed={typeFilter === category} data-testid={`layer-filter-${category}`} onclick={() => (typeFilter = category)}>{CATEGORY[category].label}</button>
			{/each}
		</div>
	{/if}

	{#if isDm}
		<form class="layers__create" onsubmit={createLayer}>
			<label class="grow">
				<span class="sr-only">New layer name</span>
				<input type="text" data-testid="layer-new-name" placeholder="New layer name" bind:value={newName} />
			</label>
			<button type="submit" class="button" data-testid="layer-create" disabled={busy}>Add layer</button>
		</form>

		<!-- UX-MAP-008: deterministic procedural generation (same kind + seed reproduce the same layers). -->
		<form class="layers__generate" onsubmit={generate} aria-label="Generate map layers">
			<label class="control"><span class="sr-only">Generation kind</span>
				<select data-testid="generate-kind" bind:value={genKind} disabled={busy}>
					<option value="terrain">Terrain</option>
					<option value="settlement">Settlement</option>
					<option value="dungeon">Dungeon</option>
				</select></label>
			<label class="control grow"><span class="sr-only">Generation seed</span>
				<input type="text" data-testid="generate-seed" placeholder="Seed" bind:value={genSeed} /></label>
			<button type="submit" class="button secondary" data-testid="generate-submit" disabled={busy}>Generate</button>
			<button type="button" class="button ghost" data-testid="edit-undo" disabled={busy || lastEdit === null} onclick={undoLastEdit}>Undo paint</button>
		</form>
	{/if}

	<ul class="layer-list" data-testid="layer-list">
		{#each shownLayers as layer, index (layer.layerId)}
			<li class="layer" data-testid={`layer-${layer.layerId}`} data-locked={layer.locked} data-category={layer.category}>
				<div class="layer__row">
					<span class="type-badge" data-tone={CATEGORY[layer.category]?.tone}>
						<Icon name={CATEGORY[layer.category]?.icon ?? 'layer-poi'} size="micro" />
						{CATEGORY[layer.category]?.label ?? layer.category}
					</span>
					<span class="layer__name" data-testid={`layer-name-${layer.layerId}`}>{layer.name}</span>
					<span class="vis-badge" data-testid={`layer-visibility-${layer.layerId}`} data-visibility={layer.visibility}>
						{VIS_LABEL[layer.visibility] ?? layer.visibility}
					</span>
					{#if layer.locked}<span class="lock-badge" data-testid={`layer-locked-${layer.layerId}`}>🔒 Locked</span>{/if}
					<span class="content-badge" data-testid={`layer-content-count-${layer.layerId}`}>{layer.content.length} mark{layer.content.length === 1 ? '' : 's'}</span>
				</div>

				{#if isDm}
					<div class="layer__controls">
						<button
							type="button"
							class="icon-toggle"
							data-testid={`layer-set-enabled-${layer.layerId}`}
							aria-pressed={layer.enabled}
							aria-label={`DM display for ${layer.name}: ${layer.enabled ? 'on' : 'off'}`}
							disabled={layer.locked || busy}
							onclick={() => setEnabled(layer.layerId, !layer.enabled)}
						>{layer.enabled ? '👁' : '🚫'}</button>

						<label class="control"><span class="sr-only">Player visibility for {layer.name}</span>
							<select data-testid={`layer-set-visibility-${layer.layerId}`} value={layer.visibility} disabled={layer.locked || busy}
								onchange={(event) => setVisibility(layer.layerId, event.currentTarget.value as SceneVisibility)}>
								<option value="dm-only">DM only</option>
								<option value="player-visible">Player visible</option>
								<option value="shared">Shared</option>
							</select></label>

						<label class="control opacity"><span class="sr-only">Opacity for {layer.name}</span>
							<input type="range" min="0" max="1" step="0.05" data-testid={`layer-set-opacity-${layer.layerId}`} value={layer.opacity} disabled={layer.locked || busy}
								onchange={(event) => setOpacity(layer.layerId, Number(event.currentTarget.value))} />
							<span class="opacity-readout" data-testid={`layer-opacity-${layer.layerId}`}>{Math.round(layer.opacity * 100)}%</span></label>

						<div class="layer__actions">
							<button type="button" class="button ghost" data-testid={`layer-paint-${layer.layerId}`} disabled={layer.locked || busy} onclick={() => paint(layer.layerId)}>Paint</button>
							<button type="button" class="icon-btn" data-testid={`layer-up-${layer.layerId}`} aria-label="Move layer up" disabled={layer.locked || busy || index === 0} onclick={() => reorder(layer.layerId, index - 1)}>↑</button>
							<button type="button" class="icon-btn" data-testid={`layer-down-${layer.layerId}`} aria-label="Move layer down" disabled={layer.locked || busy || index === shownLayers.length - 1} onclick={() => reorder(layer.layerId, index + 1)}>↓</button>
							<button type="button" class="button ghost" data-testid={`layer-duplicate-${layer.layerId}`} disabled={busy} onclick={() => duplicate(layer.layerId)}>Duplicate</button>
							<button type="button" class="icon-toggle" data-testid={`layer-lock-${layer.layerId}`} aria-pressed={layer.locked} aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`} disabled={busy} onclick={() => setLock(layer.layerId, !layer.locked)}>{layer.locked ? '🔒' : '🔓'}</button>
							<button type="button" class="button danger" data-testid={`layer-delete-${layer.layerId}`} disabled={layer.locked || busy || layers.length <= 1} onclick={() => remove(layer.layerId)}>Delete</button>
						</div>
					</div>
				{/if}
			</li>
		{/each}
		{#if layers.length === 0}
			<li class="layer-empty" data-testid="layer-empty">No layers are visible to you.</li>
		{:else if shownLayers.length === 0}
			<li class="layer-empty">No {CATEGORY[typeFilter as MapLayerCategory]?.label ?? ''} layers.</li>
		{/if}
	</ul>

	{#if isDm && consistency}
		<section class="consistency" data-testid="layer-consistency" aria-label="Projection check">
			<h4>Pre-projection check</h4>
			{#if consistency.blocked}
				<p class="consistency__err" role="alert" data-testid="consistency-blocked">
					Projection blocked: {consistency.problems.filter((p) => p.severity === 'error').length} visibility inconsistencies must be resolved.
				</p>
			{:else}
				<p class="consistency__ok" data-testid="consistency-ok">Safe to project — no blocking visibility inconsistencies.</p>
			{/if}
		</section>
	{/if}
</section>

<style>
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.layers { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
	.layers__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
	.layers__head h3 { margin: 0; }
	.layers__count { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.layers__hidden { color: var(--color-text-tertiary); }
	.filters { display: flex; flex-wrap: wrap; gap: var(--space-1); }
	.chip { min-height: var(--touch-target-min); padding: var(--space-1) var(--space-3); font-size: var(--text-sm); background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-full); cursor: pointer; }
	.chip--active { color: var(--color-accent-foreground); background: var(--color-accent); border-color: var(--color-accent); }
	.layers__create, .layers__generate { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
	.grow { flex: 1 1 8rem; min-width: 0; }
	.layers__create input, .layers__generate input, .layers__generate select { width: 100%; min-height: var(--touch-target-min); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.control { display: inline-flex; align-items: center; gap: var(--space-1); }
	.layer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
	.layer { padding: var(--space-2) var(--space-3); background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
	.layer[data-locked='true'] { opacity: 0.7; }
	/* UX-MAP-005 — the safety-critical DM-annotations accent: a 3px purple rail painted as an inset
	   shadow so the warm cue never shifts the row's box geometry (icon + label carry it too). */
	.layer[data-category='dm-annotations'] { box-shadow: inset 3px 0 0 0 var(--layer-dm); }
	.layer__row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.layer__name { font-weight: var(--font-weight-semibold); }
	/* UX-MAP-005 — the layer-type badge: its `--layer-*` hue is the fg + border, the fill is a
	   low-alpha mix of that hue against the surface, and the distinct glyph rides beside the label. */
	.type-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		--h: var(--color-text-secondary);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		white-space: nowrap;
		padding: 0 var(--space-1-5);
		border-radius: var(--radius-full);
		color: var(--h);
		border: 1px solid color-mix(in oklab, var(--h) 55%, transparent);
		background: color-mix(in oklab, var(--h) 16%, var(--color-surface));
	}
	.type-badge[data-tone='base'] { --h: var(--layer-base); }
	.type-badge[data-tone='terrain'] { --h: var(--layer-height); }
	.type-badge[data-tone='roads'] { --h: var(--layer-roads); }
	.type-badge[data-tone='poi'] { --h: var(--layer-poi); }
	.type-badge[data-tone='fog'] { --h: var(--layer-fog); }
	.type-badge[data-tone='dm'] { --h: var(--layer-dm); }
	.type-badge[data-tone='player'] { --h: var(--layer-player); }
	.vis-badge, .lock-badge, .content-badge { font-size: var(--text-2xs); padding: 0 var(--space-1-5); border-radius: var(--radius-full); border: 1px solid var(--color-border); color: var(--color-text-secondary); }
	.vis-badge[data-visibility='dm-only'] { color: var(--color-dm-only-badge); border-color: var(--color-dm-only-badge); background: var(--color-dm-only-subtle); }
	.content-badge { margin-left: auto; }
	.layer__controls { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
	.layer__controls select { min-height: var(--touch-target-min); padding: var(--space-1) var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.opacity { gap: var(--space-2); }
	.opacity-readout { font-size: var(--text-sm); font-variant-numeric: tabular-nums; color: var(--color-text-secondary); min-width: 2.5rem; }
	.layer__actions { display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }
	.icon-btn, .icon-toggle { min-width: var(--touch-target-min); min-height: var(--touch-target-min); display: inline-flex; align-items: center; justify-content: center; background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; }
	.icon-toggle[aria-pressed='true'] { background: var(--color-interactive-selected); border-color: var(--color-accent-border); }
	.icon-btn:disabled, .icon-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
	.button.ghost { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
	.button.danger { background: transparent; color: var(--color-status-error-text); border: 1px solid var(--color-status-error); }
	.layer-empty { color: var(--color-text-secondary); font-size: var(--text-sm); padding: var(--space-3); }
	.consistency { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-sunken); }
	.consistency h4 { margin: 0 0 var(--space-1); font-size: var(--text-sm); }
	.consistency__ok { margin: 0; font-size: var(--text-sm); color: var(--color-status-success-text); }
	.consistency__err { margin: 0; font-size: var(--text-sm); color: var(--color-status-error-text); }
</style>
