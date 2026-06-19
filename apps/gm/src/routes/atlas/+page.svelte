<script lang="ts">
	import { page } from '$app/state';
	import { listMapsForActor, resolveDeepLink, type DeepLinkTarget, type MapRegion } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import MapPoiControl from '$lib/gui/MapPoiControl.svelte';
	import MapLayerPanel from '$lib/gui/MapLayerPanel.svelte';
	import MapNestedAreas from '$lib/gui/MapNestedAreas.svelte';
	import MapAuthoringPanel from '$lib/gui/MapAuthoringPanel.svelte';
	import MapAnnotationsPanel from '$lib/gui/MapAnnotationsPanel.svelte';
	import MapViewer from '$lib/gui/ux-map/MapViewer.svelte';
	import DeepLinkUnavailable from '$lib/gui/ux-shell/DeepLinkUnavailable.svelte';

	const runtime = useRuntime();

	// MAP-015: a GUI-local viewport focus, set when a POI control's "Focus region" action is
	// pressed. It is presentation-only (which region the viewport is centered on) — it never
	// mutates durable state, so it stays in GUI memory (Contract 1, GUI Knowledge Limits).
	let focusedRegionId = $state<string | null>(null);

	// NAV-005 / SRCH-007: a map deep link carries the target map and an optional POI/region in the
	// query string, e.g. `/atlas/?map=map-western-reaches&poi=region-coast`. A SEARCH-OPENED POI deep
	// link additionally carries `x`/`y` viewport-focus coordinates (SRCH-007 AC1), e.g.
	// `/atlas/?map=...&poi=poi-harbor-town&x=0.62&y=0.34`. The GUI owns parsing the URL into a
	// DeepLinkTarget (route-shape knowledge — Contract 1); the Processing Core resolves it, evaluating
	// visibility before any selection is exposed. We resolve the `poi` selection as a POI first (the
	// search-opened case) and fall back to a region (the original NAV-005 case), so both link shapes work.
	const target = $derived.by<DeepLinkTarget | null>(() => {
		const mapId = page.url.searchParams.get('map');
		if (!mapId) return null;
		const poi = page.url.searchParams.get('poi') ?? undefined;
		// A POI deep link addresses `<map>#<poi>` and focuses the POI's coordinate; when the selection is a
		// region id it falls through to a region focus. Try the POI resolution first and, if it is
		// unavailable purely because the selection is a region (not a POI), fall back to the map target.
		const poiResolution = poi
			? resolveDeepLink(runtime.state, runtime.activeActorId, {
					type: 'poi',
					entityId: mapId,
					selectionId: poi,
					sectionId: 'atlas',
				})
			: null;
		if (poiResolution && poiResolution.kind === 'restore') {
			return { type: 'poi', entityId: mapId, selectionId: poi, sectionId: 'atlas' };
		}
		return {
			type: 'map',
			entityId: mapId,
			selectionId: poi,
			sectionId: 'atlas',
		};
	});

	// SRCH-007 AC1 — the viewport-focus coordinates carried by a search-opened POI deep link. Preserved
	// through resolution so the viewport centers on the focused POI; presentation-only (Contract 1).
	const viewportParams = $derived.by<{ x: number; y: number } | null>(() => {
		const x = page.url.searchParams.get('x');
		const y = page.url.searchParams.get('y');
		if (x === null || y === null) return null;
		const px = Number(x);
		const py = Number(y);
		return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : null;
	});

	// Resolve the deep link for the active actor. A hidden target resolves to a single
	// generic `unavailable` state that never reveals the target exists (NAV-005 AC2); an
	// uncached/offline target resolves to `unavailable` while the section is preserved
	// (NAV-005 AC3). When no deep link is present, the Atlas lists the actor-visible maps.
	const resolution = $derived(
		target ? resolveDeepLink(runtime.state, runtime.activeActorId, target) : null,
	);

	// The regions/POIs of the resolved map, for the interaction-safe POI control surface
	// (MAP-015). Read straight from the actor-filtered resolution: the map only resolves to
	// `restore` when the actor may see it, so no hidden map's POIs are ever exposed here.
	const resolvedRegions = $derived.by<MapRegion[]>(() => {
		if (!resolution || resolution.kind !== 'restore') return [];
		const map = runtime.state.maps.maps[resolution.entityId];
		return map ? map.regions : [];
	});

	function focusRegion(regionId: string) {
		focusedRegionId = regionId;
	}

	// CON-001: the actor-visible map list comes from the Processing Core's actor-filtered query
	// (listMapsForActor), never from reading raw map state and filtering by visibility in the GUI.
	// The GUI never makes the authoritative visibility decision — it renders what the data layer returns.
	const visibleMaps = $derived(
		listMapsForActor(runtime.state.maps, runtime.state.permissions, runtime.activeActorId),
	);

	// The map's default visibility, surfaced as the at-a-glance card badge (the package's
	// VisibilityChip vocabulary). This is REAL data from the actor-filtered list — it is not the
	// mockup's faked "Projecting" state (no such field exists on the list entry).
	const MAP_VIS_LABEL: Record<string, string> = {
		'dm-only': 'DM only',
		'player-visible': 'Player visible',
		shared: 'Shared',
	};
</script>

<section class="atlas" data-testid="atlas-view" aria-label="Atlas">
	<p class="atlas__lede">
		Your world's maps. Open one to pan, zoom, and navigate its regions; the DM authors maps, layers,
		points of interest, and nested areas.
	</p>

	{#if resolution}
		{#if resolution.kind === 'restore'}
			<section class="map-open" data-testid="map-viewport" aria-label="Map viewport">
				<header class="map-open__head">
					<p class="map-open__eyebrow">Open map</p>
					<h2 data-testid="map-name">{resolution.entityName}</h2>
				</header>

				<!-- UX-MAP-001/002/003: the spatial viewer — a wayfinding breadcrumb over the foundational
				     pan/zoom/minimap surface (CanvasViewport), fed the actor-filtered regions. -->
				<MapViewer
					mapName={resolution.entityName}
					regions={resolvedRegions}
					selectionLabel={resolution.selectionLabel}
					selectionId={resolution.selectionId}
				/>

				<div class="map-open__meta">
					{#if resolution.selectionId}
						<p class="meta" data-testid="map-poi">
							Focused on <strong>{resolution.selectionLabel}</strong>
							({resolution.selectionId})
						</p>
					{:else}
						<p class="meta" data-testid="map-poi-none">
							No specific POI requested — showing the map.
						</p>
					{/if}
					<!-- SRCH-007 AC1 — the viewport focus coordinate. Prefer the resolver-computed POI coordinate,
					     then the x/y params carried in the URL; both center the viewport on the search-opened POI. -->
					{#if resolution.viewport}
						<p class="meta" data-testid="viewport-coords">
							Viewport centered at ({resolution.viewport.x.toFixed(2)}, {resolution.viewport.y.toFixed(2)}).
						</p>
					{:else if viewportParams}
						<p class="meta" data-testid="viewport-coords">
							Viewport centered at ({viewportParams.x.toFixed(2)}, {viewportParams.y.toFixed(2)}).
						</p>
					{/if}
					{#if focusedRegionId}
						<p class="meta" data-testid="viewport-focus">
							Viewport centered on <strong>{focusedRegionId}</strong>.
						</p>
					{/if}
				</div>

				<!-- MAP-015: the POI interaction-safety surface. Pointer, touch, and keyboard
				     all reach every action without hover; the control dismisses only on a
				     genuine dismiss intent (the rules live in the Processing Core). -->
				<MapPoiControl
					mapId={resolution.entityId}
					regions={resolvedRegions}
					onfocusregion={focusRegion}
				/>

				<!-- MAP-005/006/007/016: the layer-management surface for the resolved map. The DM
				     authors layers and toggles their independent player-visibility/DM-display/opacity
				     axes; a player/observer sees only the layers visible to them (the panel renders
				     from the actor-filtered layer query, so a dm-only layer never appears here). -->
				<MapLayerPanel mapId={resolution.entityId} />

				<!-- MAP-010/011/012/013/014/018/019: the map annotations inspector (POIs, routes, fog,
				     tokens, combat overlay modes). It renders ENTIRELY from the single actor-filtered map
				     query, so a player/observer sees only the artifacts they may see — a dm-only POI,
				     concealed fog, or hidden token never appears here, in the list, or in search. -->
				<MapAnnotationsPanel mapId={resolution.entityId} />

				<!-- MAP-008 / MAP-009 / MAP-017: the nested-areas surface. A child map embedded in this
				     one shows as a named, zoom-able area to actors who may see it, and as a single generic
				     unavailable placeholder (no name/content leak) to actors who may not — so a DM-only
				     child of a player-visible parent never leaks through nesting. -->
				<MapNestedAreas mapId={resolution.entityId} />
			</section>
		{:else}
			<!-- UX-NAV-016 AC2/AC3 (NAV-005): one generic, non-leaking unavailable state with a clear
			     recovery action and an offline-aware retry. It names no entity and is identical whether
			     the target is hidden, missing, or uncached. -->
			<DeepLinkUnavailable message={resolution.message} />
		{/if}
	{/if}

	<section class="library" aria-label="Maps">
		<header class="library__head">
			<h2 id="maps" class="library__title">Maps</h2>
			<span class="library__count">{visibleMaps.length} map{visibleMaps.length === 1 ? '' : 's'}</span>
		</header>
		<!-- The map LIBRARY — a calm, scannable card grid (package Atlas anatomy: thumbnail header
		     with a warm tactical grid overlay, a visibility badge top-right, then name + meta). Each
		     card keeps its REAL navigation links (open the map; open at the default region). -->
		<ul class="map-grid" data-testid="atlas-map-list">
			{#each visibleMaps as map (map.id)}
				<li class="map-card" data-testid={`atlas-map-${map.id}`} data-visibility={map.visibility}>
					<div class="map-card__thumb" aria-hidden="true">
						<span class="map-card__badge" data-visibility={map.visibility}>
							{MAP_VIS_LABEL[map.visibility] ?? map.visibility}
						</span>
					</div>
					<div class="map-card__body">
						<a class="map-card__open" href={`?map=${map.id}`} data-testid={`atlas-open-${map.id}`}>{map.name}</a>
						{#if map.description}<span class="map-card__desc">{map.description}</span>{/if}
						{#if map.defaultRegionId}
							<a
								class="map-card__poi"
								href={`?map=${map.id}&poi=${map.defaultRegionId}`}
								data-testid={`atlas-open-poi-${map.id}`}
							>
								Open at {map.defaultRegionId}
							</a>
						{/if}
					</div>
				</li>
			{/each}
			{#if visibleMaps.length === 0}
				<li class="map-empty" data-testid="atlas-empty">No maps are visible to you.</li>
			{/if}
		</ul>
	</section>

	<!-- MAP-001 / MAP-002 / MAP-020: the DM map authoring + safe import surface. Creating a map yields
	     a default-dm-only map with its initial layers; importing previews diagnostics before commit and
	     rolls back cleanly on cancel. DM-only (the panel renders nothing for a player/observer). -->
	<div class="card card--authoring"><MapAuthoringPanel /></div>
</section>

<style>
	.atlas {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.atlas__lede {
		margin: 0;
		max-width: 62ch;
		color: var(--color-text-secondary);
		line-height: var(--leading-relaxed);
	}

	/* ---- Open map: the focused authoring view. The canvas is the focus; the layer / annotation /
	     nested-area panels stack below it as supporting rails. The accent border + raised elevation
	     mark this as the one primary region while a map is open (package Card accent treatment). ---- */
	.map-open {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--color-surface);
		border: 1px solid var(--color-accent-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.map-open__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
	}
	.map-open__eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}
	.map-open :global(h2) {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-tight);
		line-height: var(--leading-tight);
	}
	.map-open__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
	}
	.map-open__meta .meta {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.map-open__meta :global(strong) {
		color: var(--color-text-primary);
	}

	/* ---- Map library: a calm, scannable card grid (package Atlas anatomy). ---- */
	.library {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.library__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.library__title {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		letter-spacing: var(--tracking-tight);
	}
	.library__count {
		font-size: var(--text-sm);
		color: var(--color-text-tertiary);
	}
	.map-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17.5rem, 1fr));
		gap: var(--space-4);
	}
	.map-card {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--duration-fast) var(--easing-standard),
			box-shadow var(--duration-fast) var(--easing-standard);
	}
	.map-card:hover,
	.map-card:focus-within {
		border-color: var(--color-border-strong);
		box-shadow: var(--shadow-md);
	}
	/* Thumbnail header: a warm gradient under a faint tactical grid overlay (decorative — the
	   deferred canvas renderer owns the real preview). The visibility badge rides the top-right
	   corner, matching the package card's status-badge slot. */
	.map-card__thumb {
		position: relative;
		height: 9.25rem;
		background: linear-gradient(
			135deg,
			var(--color-surface-raised),
			var(--color-surface-sunken)
		);
	}
	.map-card__thumb::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(var(--map-grid-line) 1px, transparent 1px),
			linear-gradient(90deg, var(--map-grid-line) 1px, transparent 1px);
		background-size: 22px 22px;
	}
	.map-card__badge {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		display: inline-flex;
		align-items: center;
		padding: var(--space-0-5) var(--space-2);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		border-radius: var(--radius-full);
		color: var(--color-text-secondary);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border);
	}
	.map-card__badge[data-visibility='dm-only'] {
		color: var(--color-dm-only-badge);
		border-color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
	}
	.map-card__badge[data-visibility='player-visible'] {
		color: var(--color-status-info-text);
		border-color: var(--color-status-info);
	}
	.map-card__badge[data-visibility='shared'] {
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
	}
	.map-card__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-4);
	}
	.map-card__open {
		font-size: var(--text-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		text-decoration: none;
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}
	.map-card__open:hover {
		color: var(--color-accent);
	}
	.map-card__desc {
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
		line-height: var(--leading-snug);
	}
	.map-card__poi {
		margin-top: var(--space-1);
		color: var(--color-text-link);
		font-size: var(--text-sm);
		text-decoration: none;
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}
	.map-card__poi:hover {
		text-decoration: underline;
	}
	.map-empty {
		grid-column: 1 / -1;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		padding: var(--space-6);
		text-align: center;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	/* The authoring panel renders its own card surface (and nothing at all for non-DM actors), so
	   the wrapper must generate no box of its own — otherwise a player would see an empty frame. */
	.card--authoring {
		display: contents;
	}
</style>
