import { describe, expect, it } from 'vitest';
import {
	appendFogPolygonOperation,
	countFogPolygonsByMode,
	createDefaultMapFogState,
	normalizeLassoPoints,
	normalizeMapFogState,
	polygonFromCircle,
	polygonFromRectangle,
	revealBoundsFromFogState,
} from '$lib/domain/map-fog.js';

describe('map-fog domain', () => {
	it('normalizes legacy revealed polygons into operations', () => {
		const normalized = normalizeMapFogState({
			colorTheme: 'black',
			revealedPolygons: [
				{
					points: [
						{ x: 0.1, y: 0.1 },
						{ x: 0.3, y: 0.1 },
						{ x: 0.3, y: 0.3 },
					],
				},
			],
		});
		expect(normalized?.colorTheme).toBe('black');
		expect(normalized?.polygons).toHaveLength(1);
		expect(normalized?.polygons[0]?.mode).toBe('reveal');
	});

	it('appends reveal and refog operations with mode counts', () => {
		let state = createDefaultMapFogState('2026-03-04T00:00:00.000Z');
		state = appendFogPolygonOperation(
			state,
			{
				id: 'reveal-1',
				mode: 'reveal',
				shape: 'rectangle',
				points: polygonFromRectangle({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }),
			},
			'2026-03-04T00:01:00.000Z',
		);
		state = appendFogPolygonOperation(
			state,
			{
				id: 'refog-1',
				mode: 'refog',
				shape: 'circle',
				points: polygonFromCircle({ x: 0.25, y: 0.25 }, 0.08),
			},
			'2026-03-04T00:02:00.000Z',
		);
		expect(countFogPolygonsByMode(state)).toEqual({ reveal: 1, refog: 1 });
		expect(state.updatedAt).toBe('2026-03-04T00:02:00.000Z');
	});

	it('normalizes lasso points and computes reveal bounds', () => {
		const points = normalizeLassoPoints([
			{ x: -0.2, y: 0.1 },
			{ x: 0.4, y: 0.2 },
			{ x: 0.7, y: 0.75 },
			{ x: 1.2, y: 0.6 },
		]);
		expect(points.length).toBeGreaterThanOrEqual(3);
		const state = appendFogPolygonOperation(createDefaultMapFogState(), {
			id: 'lasso-1',
			mode: 'reveal',
			shape: 'polygon',
			points,
		});
		const bounds = revealBoundsFromFogState(state);
		expect(bounds).toEqual(
			expect.objectContaining({
				minX: expect.any(Number),
				maxX: expect.any(Number),
				minY: expect.any(Number),
				maxY: expect.any(Number),
			}),
		);
		expect(bounds?.minX).toBeGreaterThanOrEqual(0);
		expect(bounds?.maxX).toBeLessThanOrEqual(1);
	});
});
