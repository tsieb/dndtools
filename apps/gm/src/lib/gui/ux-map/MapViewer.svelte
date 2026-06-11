<script lang="ts">
	import type { MapRegion } from '@dndtools/core';
	import CanvasViewport from '$lib/gui/canvas/CanvasViewport.svelte';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { regionsToTiles } from './map-tiles';

	// UX-MAP-001/002/003 — the map VIEWER. It reuses the foundational spatial surface (CanvasViewport,
	// driven by the shared ViewportController) so pan, scroll/keyboard/pinch zoom, zoom-to-fit, and the
	// minimap come from the one canvas runtime every spatial route embeds — not a maps-only viewport
	// (UX-MAP-001 / UX-MAP-003). Above it sits a wayfinding BREADCRUMB (UX-MAP-002) showing the path
	// from the Atlas to the current map (and the focused region/POI), each crumb a one-click return.
	// The regions are the ALREADY actor-filtered set from the deep-link resolution, so a hidden region
	// never becomes a tile here (no-leak).
	interface Props {
		mapName: string;
		regions: readonly MapRegion[];
		/** The focused POI/region label + id, when the map was opened at a specific selection. */
		selectionLabel?: string | null;
		selectionId?: string | null;
	}
	const { mapName, regions, selectionLabel = null, selectionId = null }: Props = $props();

	const profile = useProfile();
	const tiles = $derived(regionsToTiles(regions));
	// Persistent minimap on roomy profiles; a toggle (collapsed-by-default) on the compact profile,
	// per UX-MAP-003 (mobile minimap collapsed by default).
	const minimap = $derived(profile.isCompact ? 'toggle' : 'persistent');
</script>

<div class="map-viewer">
	<nav class="breadcrumb" aria-label="Map nesting">
		<ol>
			<li><a href="?" data-testid="map-breadcrumb-atlas">Atlas</a></li>
			<li aria-hidden="true" class="sep">›</li>
			<li>
				<a
					href={`?map=${''}`}
					data-testid="map-breadcrumb-current"
					aria-current={selectionId ? undefined : 'page'}
					class="crumb-current"
				>{mapName}</a>
			</li>
			{#if selectionId && selectionLabel}
				<li aria-hidden="true" class="sep">›</li>
				<li><span class="crumb-current" aria-current="page" data-testid="map-breadcrumb-selection">{selectionLabel}</span></li>
			{/if}
		</ol>
	</nav>

	<CanvasViewport {tiles} label={`Map viewport — ${mapName}`} {minimap} />
</div>

<style>
	.map-viewer {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.breadcrumb ol {
		list-style: none;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		font-size: var(--text-sm);
	}
	.breadcrumb a {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-floor);
		padding: 0 var(--space-1);
		color: var(--color-text-link);
		border-radius: var(--radius-sm);
		text-decoration: none;
	}
	.breadcrumb a:hover {
		text-decoration: underline;
	}
	.crumb-current {
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
	}
	.sep {
		color: var(--color-text-secondary);
	}
</style>
