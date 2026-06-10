<script lang="ts">
	import {
		getMapViewForActor,
		searchMapsForActor,
		deliveredMapIdsForActor,
		MAP_OVERLAY_MODES,
		MAP_POI_CATEGORIES,
		type MapOverlayMode,
		type MapPoiCategory,
		type MapViewResult,
		type SceneVisibility,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	/**
	 * MAP-010/011/012/013/014/018/019 — the map ANNOTATIONS inspector surface (POIs, routes, fog,
	 * tokens, combat overlay modes).
	 *
	 * Per ADR-014 the pixel renderer is deferred, so this is a LIST/INSPECTOR surface, not a canvas. It
	 * renders ENTIRELY from the single actor-filtered map query (`getMapViewForActor` — the MAP-018
	 * keystone). Because that one model already omits every artifact the active actor may not see, this
	 * panel is itself a live proof of non-leak: viewed as a player/observer it shows ONLY the POIs,
	 * routes, fog, and tokens that actor may see, and the DM authoring controls disappear. Search runs
	 * through `searchMapsForActor`, which is built on the same model, so a hidden POI is never a hit.
	 *
	 * Every mutation is dispatched as a Processing-Core command through the runtime — the GUI never
	 * writes durable state (Contract 1).
	 */
	interface Props {
		mapId: string;
	}
	const { mapId }: Props = $props();
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId]);
	const isDm = $derived(actor?.role === 'dm');

	// The single actor-filtered map view. `shared` delivery follows the session projection model.
	const delivered = $derived(deliveredMapIdsForActor(runtime.state.session, runtime.activeActorId));
	const view = $derived<MapViewResult>(
		getMapViewForActor(runtime.state.maps, runtime.state.permissions, runtime.activeActorId, mapId, {
			deliveredMapIds: delivered,
			// A demo travel speed so the route shows a deterministic travel time (MAP-013).
			travelSpeed: { distancePerTime: 24, timeUnit: 'days' },
		}),
	);

	// The layers the actor may see, as create targets for new annotations (DM only).
	const layerOptions = $derived(view.kind === 'available' ? view.layers : []);

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

	// MAP-010: create a POI on the first visible layer at a fixed demo position. A real authoring tool
	// would capture the pointer position; the command path and normalized storage are identical.
	let poiLabel = $state('');
	let poiCategory = $state<MapPoiCategory>('landmark');
	let poiVisibility = $state<SceneVisibility>('dm-only');
	async function createPoi(event: SubmitEvent) {
		event.preventDefault();
		const label = poiLabel.trim();
		const layerId = layerOptions[0]?.id;
		if (!label || !layerId) return;
		await dispatch({
			type: 'map.create-poi',
			actorId: runtime.activeActorId,
			payload: {
				mapId,
				layerId,
				label,
				category: poiCategory,
				position: { x: 0.5, y: 0.5 },
				visibility: poiVisibility,
			},
		});
		poiLabel = '';
	}

	function setPoiVisibility(poiId: string, visibility: SceneVisibility) {
		void dispatch({
			type: 'map.update-poi',
			actorId: runtime.activeActorId,
			payload: { mapId, poiId, visibility },
		});
	}

	function deletePoi(poiId: string) {
		void dispatch({ type: 'map.delete-poi', actorId: runtime.activeActorId, payload: { mapId, poiId } });
	}

	// MAP-012: append a fog reveal/conceal. `connectionState` drives queued-vs-delivered (MAP-012 AC2).
	function appendFog(kind: 'reveal' | 'conceal', connectionState: 'connected' | 'offline') {
		const layerId = layerOptions[0]?.id;
		if (!layerId) return;
		void dispatch({
			type: 'map.append-fog',
			actorId: runtime.activeActorId,
			payload: {
				mapId,
				layerId,
				kind,
				region: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
				visibility: 'shared',
				connectionState,
			},
		});
	}

	// MAP-014: explicit overlay mode + prerequisite gating. A blocked mode surfaces the reason.
	let overlayMode = $state<MapOverlayMode>('grid-align');
	let autoSatisfy = $state(false);
	async function setOverlayMode(event: SubmitEvent) {
		event.preventDefault();
		await dispatch({
			type: 'map.set-overlay-mode',
			actorId: runtime.activeActorId,
			payload: { mapId, mode: overlayMode, autoSatisfyPrerequisites: autoSatisfy },
		});
	}

	// MAP-019: move the first token the actor may MOVE by a small delta. Proves the actor-filtered
	// control surface (a player can move only their token; the DM moves any).
	function nudgeToken(tokenId: string, x: number, y: number) {
		void dispatch({
			type: 'map.move-token',
			actorId: runtime.activeActorId,
			payload: { mapId, tokenId, position: { x, y } },
		});
	}

	// MAP-018: actor-filtered search across POIs/routes/tokens. A hidden artifact is never a hit.
	let searchQuery = $state('');
	const searchHits = $derived(
		searchQuery.trim().length > 0
			? searchMapsForActor(
					runtime.state.maps,
					runtime.state.permissions,
					runtime.activeActorId,
					searchQuery,
					{ deliveredMapIds: delivered },
				)
			: [],
	);
</script>

<section class="annotations-panel" data-testid="map-annotations-panel" aria-label="Map annotations">
	{#if view.kind !== 'available'}
		<p class="meta" role="status" data-testid="annotations-unavailable">
			This map is unavailable to you.
		</p>
	{:else}
		<!-- MAP-018: actor-filtered search. A hidden POI/route/token is never returned. -->
		<form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
			<label>
				<span class="visually-hidden">Search map artifacts</span>
				<input
					type="search"
					data-testid="map-search-input"
					placeholder="Search POIs, routes, tokens"
					bind:value={searchQuery}
				/>
			</label>
		</form>
		{#if searchQuery.trim().length > 0}
			<ul class="search-results" data-testid="map-search-results">
				{#each searchHits as hit (hit.kind + hit.id)}
					<li data-testid={`search-hit-${hit.id}`}>
						<span class="badge">{hit.kind}</span>
						{hit.label}
					</li>
				{/each}
				{#if searchHits.length === 0}
					<li class="meta" data-testid="search-empty">No matching artifacts you can see.</li>
				{/if}
			</ul>
		{/if}

		<!-- MAP-010 / MAP-011: POIs. The list is the actor-filtered view, so a dm-only POI never appears
		     for a player. The DM authors POIs and toggles their INDEPENDENT visibility. -->
		<section aria-labelledby={`pois-${mapId}`}>
			<h4 id={`pois-${mapId}`}>
				Points of interest
				<span class="meta" data-testid="ann-poi-count">
					({view.pois.length}{#if isDm && view.hidden.pois > 0}, {view.hidden.pois} hidden from
						players{/if})
				</span>
			</h4>
			{#if isDm}
				<form class="create-poi" onsubmit={createPoi}>
					<label>
						<span class="visually-hidden">POI label</span>
						<input data-testid="ann-poi-new-label" placeholder="POI label" bind:value={poiLabel} />
					</label>
					<label class="control">
						<span class="visually-hidden">POI category</span>
						<select data-testid="ann-poi-new-category" bind:value={poiCategory}>
							{#each MAP_POI_CATEGORIES as category (category)}
								<option value={category}>{category}</option>
							{/each}
						</select>
					</label>
					<label class="control">
						<span class="visually-hidden">POI visibility</span>
						<select data-testid="ann-poi-new-visibility" bind:value={poiVisibility}>
							<option value="dm-only">dm-only</option>
							<option value="player-visible">player-visible</option>
							<option value="shared">shared</option>
						</select>
					</label>
					<button type="submit" class="button" data-testid="ann-poi-create" disabled={busy}>
						Add POI
					</button>
				</form>
			{/if}
			<ul class="annotation-list" data-testid="ann-poi-list">
				{#each view.pois as poi (poi.id)}
					<li data-testid={`ann-poi-${poi.id}`}>
						<span class="annotation-name" data-testid={`ann-poi-label-${poi.id}`}>{poi.label}</span>
						<span class="badge">{poi.category}</span>
						<span class="badge" data-testid={`ann-poi-visibility-${poi.id}`}>{poi.visibility}</span>
						{#if poi.linkedEntityId}
							<!-- A11Y-009 AC1: a screen reader user can activate a POI by following the link to its
							     linked entity. The linked entity is only present when the actor already holds
							     visibility on it (getMapViewForActor resolves fail-closed, so only visible
							     linkedEntityIds reach this surface). -->
							<a
								href={`/knowledge/?note=${encodeURIComponent(poi.linkedEntityId)}`}
								data-testid={`ann-poi-open-${poi.id}`}
								class="activate-link"
							>
								View linked entity
							</a>
						{/if}
						{#if isDm}
							<select
								data-testid={`ann-poi-set-visibility-${poi.id}`}
								value={poi.visibility}
								disabled={busy}
								onchange={(e) =>
									setPoiVisibility(poi.id, e.currentTarget.value as SceneVisibility)}
							>
								<option value="dm-only">dm-only</option>
								<option value="player-visible">player-visible</option>
								<option value="shared">shared</option>
							</select>
							<button
								type="button"
								class="button secondary"
								data-testid={`ann-poi-delete-${poi.id}`}
								disabled={busy}
								onclick={() => deletePoi(poi.id)}
							>
								Delete
							</button>
						{/if}
					</li>
				{/each}
				{#if view.pois.length === 0}
					<li class="meta" data-testid="ann-poi-empty">No POIs are visible to you.</li>
				{/if}
			</ul>
		</section>

		<!-- MAP-013: routes with DERIVED distance + travel time. -->
		<section aria-labelledby={`routes-${mapId}`}>
			<h4 id={`routes-${mapId}`}>Routes <span class="meta" data-testid="route-count">({view.routes.length})</span></h4>
			<ul class="annotation-list" data-testid="route-list">
				{#each view.routes as route (route.id)}
					{@const linkedWaypoint = route.waypoints.find((wp) => wp.linkedEntityId)}
					<li data-testid={`route-${route.id}`}>
						<span class="annotation-name">{route.label}</span>
						<span class="meta" data-testid={`route-distance-${route.id}`}>
							{#if route.measurement.distance !== null}
								{route.measurement.distance.toFixed(1)}
								{route.measurement.distanceUnit}
							{:else}
								unscaled
							{/if}
						</span>
						{#if route.measurement.travelTime !== null}
							<span class="meta" data-testid={`route-time-${route.id}`}>
								~{route.measurement.travelTime.toFixed(2)} {route.measurement.timeUnit}
							</span>
						{/if}
						{#if linkedWaypoint?.linkedEntityId}
							<!-- A11Y-009 AC1: routes whose destination waypoint links to a known entity expose a
							     keyboard-operable activation link. The entity id is only in the view when the
							     actor already holds visibility (getMapViewForActor fail-closed guarantee). -->
							<a
								href={`/knowledge/?note=${encodeURIComponent(linkedWaypoint.linkedEntityId)}`}
								data-testid={`route-open-${route.id}`}
								class="activate-link"
							>
								View destination
							</a>
						{/if}
					</li>
				{/each}
				{#if view.routes.length === 0}
					<li class="meta" data-testid="route-empty">No routes are visible to you.</li>
				{/if}
			</ul>
		</section>

		<!-- MAP-019: combat tokens. A non-DM only ever sees tokens they may see; only the controller (or
		     the DM) sees a Move control. -->
		<section aria-labelledby={`tokens-${mapId}`}>
			<h4 id={`tokens-${mapId}`}>Tokens <span class="meta" data-testid="token-count">({view.tokens.length})</span></h4>
			<ul class="annotation-list" data-testid="token-list">
				{#each view.tokens as token (token.id)}
					<li data-testid={`token-${token.id}`}>
						<span class="annotation-name" data-testid={`token-label-${token.id}`}>{token.label}</span>
						<span class="badge" data-testid={`token-visibility-${token.id}`}>{token.visibility}</span>
						{#if token.canMove}
							<button
								type="button"
								class="button secondary"
								data-testid={`token-move-${token.id}`}
								disabled={busy}
								onclick={() => nudgeToken(token.id, 0.4, 0.4)}
							>
								Move
							</button>
						{/if}
					</li>
				{/each}
				{#if view.tokens.length === 0}
					<li class="meta" data-testid="token-empty">No tokens are visible to you.</li>
				{/if}
			</ul>
		</section>

		<!-- MAP-012: fog operations (DM authors reveal/conceal; the player sees the resulting fog). -->
		<section aria-labelledby={`fog-${mapId}`}>
			<h4 id={`fog-${mapId}`}>Fog of war <span class="meta" data-testid="fog-count">({view.fog.length})</span></h4>
			{#if isDm}
				<div class="fog-controls">
					<button type="button" class="button secondary" data-testid="fog-reveal" disabled={busy} onclick={() => appendFog('reveal', 'connected')}>Reveal area</button>
					<button type="button" class="button secondary" data-testid="fog-conceal" disabled={busy} onclick={() => appendFog('conceal', 'connected')}>Conceal area</button>
					<button type="button" class="button secondary" data-testid="fog-reveal-offline" disabled={busy} onclick={() => appendFog('reveal', 'offline')}>Reveal (offline)</button>
				</div>
				{#if runtime.lastLifecycle?.commandType === 'map.append-fog' && runtime.lastLifecycle.status === 'success'}
					<p class="meta" data-testid="fog-status" role="status">Fog operation saved.</p>
				{/if}
			{/if}
			<ul class="annotation-list" data-testid="fog-list">
				{#each view.fog as op (op.id)}
					<li data-testid={`fog-${op.id}`}>
						<span class="badge">{op.kind}</span>
						<span class="meta">seq {op.sequence}</span>
					</li>
				{/each}
				{#if view.fog.length === 0}
					<li class="meta" data-testid="fog-empty">No fog is visible to you.</li>
				{/if}
			</ul>
		</section>

		<!-- MAP-014: explicit combat overlay mode with declared prerequisite gating (DM only). -->
		{#if isDm}
			<section aria-labelledby={`overlay-${mapId}`}>
				<h4 id={`overlay-${mapId}`}>Combat overlay</h4>
				<p class="meta" data-testid="overlay-mode">
					Mode: <strong>{view.overlay.mode}</strong>; grid {view.overlay.gridVisible ? 'on' : 'off'};
					tokens {view.overlay.tokensEnabled ? 'on' : 'off'}
				</p>
				<form class="overlay-controls" onsubmit={setOverlayMode}>
					<label class="control">
						<span class="visually-hidden">Overlay mode</span>
						<select data-testid="overlay-mode-select" bind:value={overlayMode}>
							{#each MAP_OVERLAY_MODES as mode (mode)}
								<option value={mode}>{mode}</option>
							{/each}
						</select>
					</label>
					<label class="control">
						<input type="checkbox" data-testid="overlay-auto-satisfy" bind:checked={autoSatisfy} />
						<span>Auto-enable prerequisites</span>
					</label>
					<button type="submit" class="button" data-testid="overlay-set-mode" disabled={busy}>
						Set mode
					</button>
				</form>
				{#if runtime.lastError && runtime.lastLifecycle?.commandType === 'map.set-overlay-mode' && runtime.lastLifecycle.status === 'failure'}
					<p class="error" role="alert" data-testid="overlay-blocked">{runtime.lastError}</p>
				{/if}
			</section>
		{/if}
	{/if}
</section>

<style>
	.annotations-panel {
		margin-top: 1rem;
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
		display: grid;
		gap: 0.75rem;
	}
	.annotation-list,
	.search-results {
		list-style: none;
		margin: 0.25rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}
	.annotation-list li,
	.search-results li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.35rem 0.6rem;
	}
	.annotation-name {
		font-weight: 600;
	}
	.badge {
		font-size: 0.7rem;
		padding: 0.05rem 0.35rem;
		border-radius: 999px;
		background: var(--card);
		border: 1px solid var(--border);
	}
	.create-poi,
	.overlay-controls,
	.fog-controls,
	.search {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin: 0.4rem 0;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.error {
		color: var(--danger, #b00020);
	}
	.activate-link {
		font-size: 0.75rem;
		text-decoration: underline;
		color: var(--color-link, #2563eb);
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
