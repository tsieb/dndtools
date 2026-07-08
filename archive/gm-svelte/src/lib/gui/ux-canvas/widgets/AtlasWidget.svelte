<script lang="ts">
	/**
	 * Atlas Command Center widget: the active-map projection controls (set / project / queue, with the
	 * glanceable DM-only "Projecting" state and the player's delivered view) plus map thumbnails into
	 * the Atlas. All reads are actor-filtered core queries; projection is a dispatched session command.
	 */
	import {
		getActiveMapProjectionSummary,
		getActiveMapViewForActor,
		listMapsForActor,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}
	const { config }: Props = $props();
	const runtime = useRuntime();

	let selectedMapId = $state('');
	let selectedRegionId = $state<string | null>(null);
	let activeMapStatus = $state<string | null>(null);

	// Actor-FILTERED map list (the doc-promised redaction): a DM-only map never reaches a non-DM viewer.
	const maps = $derived(
		listMapsForActor(runtime.state.maps, runtime.state.permissions, runtime.defaultActorId),
	);
	const selectedMap = $derived(maps.find((map) => map.id === selectedMapId) ?? maps[0] ?? null);
	// The filtered list proves the map is visible to this actor; its regions come from the raw entity.
	const selectedRegions = $derived(
		selectedMap ? (runtime.state.maps.maps[selectedMap.id]?.regions ?? []) : [],
	);
	const activeMap = $derived(
		getActiveMapViewForActor(
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			runtime.defaultActorId,
		),
	);
	const playerActiveMap = $derived(
		getActiveMapViewForActor(
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			'actor-player',
		),
	);
	const projectionSummary = $derived(
		getActiveMapProjectionSummary(runtime.state, runtime.defaultActorId),
	);

	// Explain WHY Project / Queue are unavailable (feedback): projection requires a live session and a
	// bound active map. Surfaced as a VISIBLE inline hint (not only a title tooltip, which never shows
	// on touch) so the gate is never silent on any profile.
	const projectionDisabledHint = $derived(
		runtime.state.session.workflow !== 'active'
			? 'Start the session to project to players'
			: activeMap.kind !== 'available'
				? 'Set an active map to project to players'
				: undefined,
	);

	const thumbLimit = $derived.by(() => {
		const parsed = Number.parseInt(String(config.thumbnails ?? '3'), 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
	});
	const thumbnails = $derived(maps.slice(0, thumbLimit));

	$effect(() => {
		if (maps.length === 0) {
			selectedMapId = '';
			selectedRegionId = null;
			return;
		}
		if (!selectedMapId || !maps.some((map) => map.id === selectedMapId)) {
			const first = maps[0]!;
			selectedMapId = first.id;
			selectedRegionId = first.defaultRegionId;
		}
	});

	function selectMap(mapId: string) {
		selectedMapId = mapId;
		const nextMap = maps.find((map) => map.id === mapId) ?? null;
		selectedRegionId = nextMap?.defaultRegionId ?? null;
	}

	async function bindActiveMap() {
		if (!selectedMapId) return;
		const result = await runtime.dispatch({
			type: 'session.set-active-map',
			actorId: runtime.defaultActorId,
			payload: { mapId: selectedMapId, regionId: selectedRegionId },
		});
		activeMapStatus = result.status === 'accepted' ? 'Active map updated.' : result.rejection.message;
	}

	async function projectActiveMap(connectionState: 'connected' | 'offline') {
		const playerActorIds = runtime.actors
			.filter((actor) => actor.role === 'player')
			.map((actor) => actor.id)
			.sort();
		const result = await runtime.dispatch({
			type: 'session.project-active-map',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds, connectionState },
		});
		activeMapStatus =
			result.status === 'accepted'
				? connectionState === 'offline'
					? 'Projection queued.'
					: 'Projection delivered.'
				: result.rejection.message;
	}
</script>

<section
	aria-label="Active map"
	data-testid="cc-active-map"
	class="active-map-section"
	data-projecting={projectionSummary?.projecting ? 'true' : 'false'}
>
	<h3>Active map</h3>
	<p
		class="projection-state"
		data-testid="cc-map-projection-state"
		data-projecting={projectionSummary?.projecting ? 'true' : 'false'}
		role="status"
	>
		{#if projectionSummary?.projecting}
			Projecting to {projectionSummary.deliveredCount} player{projectionSummary.deliveredCount === 1
				? ''
				: 's'}
		{:else if projectionSummary && projectionSummary.queuedCount > 0}
			Projection queued for {projectionSummary.queuedCount} player{projectionSummary.queuedCount === 1
				? ''
				: 's'}
		{:else}
			Not projecting
		{/if}
	</p>
	<div class="active-map-controls">
		<label>
			<span>Map</span>
			<select
				data-testid="cc-active-map-select"
				value={selectedMapId}
				onchange={(event) => selectMap(event.currentTarget.value)}
			>
				{#each maps as map (map.id)}
					<option value={map.id}>{map.name}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Region</span>
			<select
				data-testid="cc-active-region-select"
				value={selectedRegionId ?? ''}
				onchange={(event) => {
					selectedRegionId = event.currentTarget.value || null;
				}}
			>
				<option value="">Whole map</option>
				{#each selectedRegions as region (region.id)}
					<option value={region.id}>{region.name}</option>
				{/each}
			</select>
		</label>
		<button
			class="button secondary"
			type="button"
			data-testid="cc-active-map-bind"
			disabled={!selectedMapId}
			onclick={bindActiveMap}
		>
			Set active map
		</button>
		<button
			class="button"
			type="button"
			data-testid="cc-active-map-project"
			aria-pressed={projectionSummary?.projecting ?? false}
			disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
			title={projectionDisabledHint}
			onclick={() => projectActiveMap('connected')}
		>
			{projectionSummary?.projecting ? 'Projecting' : 'Project to players'}
		</button>
		<button
			type="button"
			data-testid="cc-active-map-queue"
			disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
			title={projectionDisabledHint}
			onclick={() => projectActiveMap('offline')}
		>
			Queue
		</button>
	</div>
	{#if projectionDisabledHint}
		<p class="active-map-hint" data-testid="cc-active-map-hint">{projectionDisabledHint}</p>
	{/if}
	{#if activeMap.kind === 'available'}
		<div class="active-map-preview" data-testid="cc-active-map-preview">
			<strong>{activeMap.name}</strong>
			<span class="meta">
				{activeMap.regionName ?? 'Whole map'} • {activeMap.layers.length} layer{activeMap.layers
					.length === 1
					? ''
					: 's'}
				{#if activeMap.hiddenLayerCount > 0}
					• {activeMap.hiddenLayerCount} hidden
				{/if}
			</span>
			<ul>
				{#each activeMap.layers as layer (layer.id)}
					<li>{layer.name}</li>
				{/each}
			</ul>
		</div>
	{:else if activeMap.kind === 'missing'}
		<p class="error" role="alert" data-testid="cc-active-map-missing">
			Active map missing: {activeMap.mapId}
		</p>
	{:else}
		<p class="meta" data-testid="cc-active-map-empty">No active map selected.</p>
	{/if}
	{#if playerActiveMap.kind === 'available'}
		<div class="active-map-preview" data-testid="cc-player-map-preview">
			<strong>Demo Player</strong>
			<span class="meta">
				{playerActiveMap.deliveryStatus} • {playerActiveMap.regionName ?? 'Whole map'} •
				{playerActiveMap.layers.length} visible layer{playerActiveMap.layers.length === 1 ? '' : 's'}
			</span>
			<ul>
				{#each playerActiveMap.layers as layer (layer.id)}
					<li>{layer.name}</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="meta" data-testid="cc-player-map-empty">Demo Player has no active map projection.</p>
	{/if}
	{#if activeMapStatus}
		<p class="meta" role="status" data-testid="cc-active-map-status">{activeMapStatus}</p>
	{/if}
</section>

<div class="atlas-tile">
	{#if thumbnails.length === 0}
		<p class="atlas-empty">No maps yet — import or create one in the Atlas.</p>
	{:else}
		<ul class="atlas-grid" data-testid="atlas-widget-grid">
			{#each thumbnails as map (map.id)}
				<li>
					<a href={`/atlas/?map=${map.id}`} data-testid={`atlas-widget-${map.id}`}>
						<span class="atlas-thumb" aria-hidden="true">🗺</span>
						<span class="atlas-name">{map.name}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	<a class="atlas-launch" href="/atlas/" data-testid="atlas-widget-launch">Open Atlas →</a>
</div>

<style>
	.atlas-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.atlas-grid {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: var(--space-2);
	}
	.atlas-grid a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--touch-target-min);
		padding: var(--space-2);
		color: var(--color-text-primary);
		text-decoration: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.atlas-grid a:hover {
		background: var(--color-interactive-hover);
	}
	.atlas-thumb {
		font-size: var(--text-lg);
		filter: grayscale(0.4);
	}
	.atlas-name {
		font-size: var(--text-xs);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.atlas-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.atlas-launch {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-text-link);
		text-decoration: none;
	}
	.atlas-launch:hover {
		text-decoration: underline;
	}
</style>
