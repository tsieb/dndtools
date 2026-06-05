<script lang="ts">
	import { page } from '$app/state';
	import { resolveDeepLink, type DeepLinkTarget, type MapRegion } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import MapPoiControl from '$lib/gui/MapPoiControl.svelte';
	import MapLayerPanel from '$lib/gui/MapLayerPanel.svelte';
	import MapNestedAreas from '$lib/gui/MapNestedAreas.svelte';
	import MapAuthoringPanel from '$lib/gui/MapAuthoringPanel.svelte';
	import MapAnnotationsPanel from '$lib/gui/MapAnnotationsPanel.svelte';

	const runtime = useRuntime();

	// MAP-015: a GUI-local viewport focus, set when a POI control's "Focus region" action is
	// pressed. It is presentation-only (which region the viewport is centered on) — it never
	// mutates durable state, so it stays in GUI memory (Contract 1, GUI Knowledge Limits).
	let focusedRegionId = $state<string | null>(null);

	// NAV-005: a map deep link carries the target map and an optional POI/region in the
	// query string, e.g. `/atlas/?map=map-western-reaches&poi=region-coast`. The GUI owns
	// parsing the URL into a DeepLinkTarget (route-shape knowledge — Contract 1); the
	// Processing Core resolves it, evaluating visibility before any selection is exposed.
	const target = $derived.by<DeepLinkTarget | null>(() => {
		const mapId = page.url.searchParams.get('map');
		if (!mapId) return null;
		const poi = page.url.searchParams.get('poi');
		return {
			type: 'map',
			entityId: mapId,
			selectionId: poi ?? undefined,
			sectionId: 'atlas',
		};
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

	// The actor-visible maps, for the Atlas landing and as deep-link entry points. Maps
	// are filtered the same way the deep-link resolver filters them, so the list never
	// surfaces a map a deep link would refuse to open.
	const visibleMaps = $derived.by(() => {
		const actor = runtime.state.permissions.actors[runtime.activeActorId];
		if (!actor) return [];
		return Object.values(runtime.state.maps.maps)
			.filter((map) => {
				if (actor.role === 'dm') return true;
				return map.visibility === 'player-visible';
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	});
</script>

<section class="atlas" data-testid="atlas-view" aria-label="Atlas">
	<p class="meta">
		The map deep-link surface. Open a map to focus a region/POI in its viewport. Authoring and the
		full map list are owned by the Maps feature epics.
	</p>

	{#if resolution}
		{#if resolution.kind === 'restore'}
			<section class="map-viewport" data-testid="map-viewport" aria-label="Map viewport">
				<h2 data-testid="map-name">{resolution.entityName}</h2>
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
				{#if focusedRegionId}
					<p class="meta" data-testid="viewport-focus">
						Viewport centered on <strong>{focusedRegionId}</strong>.
					</p>
				{/if}

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
			<!-- NAV-005 AC2/AC3: one generic, non-leaking unavailable state. It names no
			     entity and is identical whether the target is hidden, missing, or uncached. -->
			<section class="unavailable" data-testid="deep-link-unavailable" aria-label="Unavailable">
				<h2>Content unavailable</h2>
				<p role="status">{resolution.message}</p>
			</section>
		{/if}
	{/if}

	<!-- MAP-001 / MAP-002 / MAP-020: the DM map authoring + safe import surface. Creating a map yields
	     a default-dm-only map with its initial layers; importing previews diagnostics before commit and
	     rolls back cleanly on cancel. DM-only (the panel renders nothing for a player/observer). -->
	<MapAuthoringPanel />

	<section aria-label="Maps">
		<h2 id="maps">Maps</h2>
		<ul class="map-list" data-testid="atlas-map-list">
			{#each visibleMaps as map (map.id)}
				<li data-testid={`atlas-map-${map.id}`}>
					<a href={`?map=${map.id}`} data-testid={`atlas-open-${map.id}`}>{map.name}</a>
					<span class="meta"> — {map.description}</span>
					{#if map.defaultRegionId}
						<a
							class="poi-link"
							href={`?map=${map.id}&poi=${map.defaultRegionId}`}
							data-testid={`atlas-open-poi-${map.id}`}
						>
							Open at {map.defaultRegionId}
						</a>
					{/if}
				</li>
			{/each}
			{#if visibleMaps.length === 0}
				<li class="meta" data-testid="atlas-empty">No maps are visible to you.</li>
			{/if}
		</ul>
	</section>
</section>
