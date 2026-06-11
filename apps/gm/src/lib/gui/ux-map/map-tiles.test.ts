import { describe, expect, it } from 'vitest';
import type { MapRegion } from '@dndtools/core';
import { MAP_EXTENT, regionsToTiles } from './map-tiles';

// UX-MAP-001 — the region→tile projection that lets the map viewer reuse the foundational
// CanvasViewport. Normalized (0..1) bounds scale into the schematic pixel extent; tiny regions are
// floored to a visible marker size.

const region = (id: string, b: { x: number; y: number; w: number; h: number }): MapRegion => ({
	id,
	name: `Region ${id}`,
	bounds: b,
});

describe('regionsToTiles', () => {
	it('scales normalized bounds into the schematic extent and carries id/title', () => {
		const [tile] = regionsToTiles([region('a', { x: 0.25, y: 0.5, w: 0.2, h: 0.3 })]);
		expect(tile).toMatchObject({
			id: 'a',
			title: 'Region a',
			type: 'region',
			x: 0.25 * MAP_EXTENT,
			y: 0.5 * MAP_EXTENT,
			w: 0.2 * MAP_EXTENT,
			h: 0.3 * MAP_EXTENT,
			visibility: 'player-visible',
		});
	});

	it('floors a point-like region to a visible marker size', () => {
		const [tile] = regionsToTiles([region('p', { x: 0.5, y: 0.5, w: 0, h: 0 })]);
		expect(tile!.w).toBeGreaterThanOrEqual(48);
		expect(tile!.h).toBeGreaterThanOrEqual(48);
	});

	it('maps each region to exactly one tile', () => {
		const tiles = regionsToTiles([
			region('a', { x: 0, y: 0, w: 0.1, h: 0.1 }),
			region('b', { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }),
		]);
		expect(tiles.map((t) => t.id)).toEqual(['a', 'b']);
	});
});
