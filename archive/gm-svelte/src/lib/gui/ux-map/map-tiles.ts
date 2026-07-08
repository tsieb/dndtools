import type { MapRegion } from '@dndtools/core';
import type { CanvasTile } from '$lib/gui/canvas/types';

// UX-MAP-001 — project a map's actor-visible regions into the foundational spatial surface's tile
// model so the map viewer reuses the shared `ViewportController` pan/zoom/minimap (CanvasViewport)
// rather than re-implementing a viewport per surface. Region bounds are stored normalized (0..1); we
// scale them into a schematic pixel extent so zoom-to-fit frames the whole map and small POIs stay
// large enough to read. Pure (no Svelte/DOM) so the mapping is unit-testable and cannot drift.

/** Schematic pixel extent a normalized (0..1) map coordinate maps onto. */
export const MAP_EXTENT = 1000;
/** Minimum on-screen tile size so a point-like region (w/h ≈ 0) is still a visible, hittable marker. */
const MIN_TILE = 48;

export function regionsToTiles(regions: readonly MapRegion[]): CanvasTile[] {
	return regions.map((region) => {
		const w = Math.max(MIN_TILE, region.bounds.w * MAP_EXTENT);
		const h = Math.max(MIN_TILE, region.bounds.h * MAP_EXTENT);
		return {
			id: region.id,
			title: region.name,
			type: 'region',
			x: region.bounds.x * MAP_EXTENT,
			y: region.bounds.y * MAP_EXTENT,
			w,
			h,
			// Regions carry no per-region visibility in this model (visibility is a map/layer concept,
			// already enforced upstream — the regions reaching here are the actor-filtered set), so they
			// render as visible markers rather than DM-only stripes.
			visibility: 'player-visible',
		} satisfies CanvasTile;
	});
}
