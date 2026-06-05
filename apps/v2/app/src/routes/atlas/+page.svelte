<script lang="ts">
	import { page } from '$app/state';
	import { resolveDeepLink, type DeepLinkTarget } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	const runtime = useRuntime();

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
