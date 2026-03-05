import { describe, expect, it } from 'vitest';
import {
	estimateTravelTimeForRoute,
	formatScaledDistance,
	routeLengthPixels,
	summarizeRouteDistance,
	type TravelTimeEstimate,
} from '$lib/domain/map-routes.js';
import type { MapRouteData } from '$lib/types/object.js';

function makeRoute(overrides: Partial<MapRouteData> = {}): MapRouteData {
	return {
		id: 'route-1',
		name: 'North Road',
		style: 'straight',
		waypoints: [
			{ x: 0.1, y: 0.2 },
			{ x: 0.5, y: 0.2 },
			{ x: 0.8, y: 0.4 },
		],
		...overrides,
	};
}

describe('map-routes', () => {
	it('calculates pixel length from normalized waypoints', () => {
		const route = makeRoute();
		const length = routeLengthPixels(route, { width: 1000, height: 500 });
		expect(length).toBeGreaterThan(0);
		expect(Number(length.toFixed(2))).toBe(716.23);
	});

	it('summarizes route distance in grid squares and scaled units', () => {
		const route = makeRoute();
		const summary = summarizeRouteDistance(route, {
			width: 1000,
			height: 500,
			grid: {
				type: 'square',
				visible: true,
				originX: 0,
				originY: 0,
				cellSize: 50,
			},
			scale: {
				unitsPerGridSquare: 1,
				unitLabel: 'mi',
			},
		});
		expect(Number((summary.gridSquares ?? 0).toFixed(2))).toBe(14.32);
		expect(Number((summary.scaledDistance ?? 0).toFixed(2))).toBe(14.32);
		expect(summary.unitLabel).toBe('mi');
	});

	it('estimates travel time by D&D paces for scaled routes', () => {
		const route = makeRoute();
		const estimate = estimateTravelTimeForRoute(route, {
			width: 1000,
			height: 500,
			grid: {
				type: 'square',
				visible: true,
				originX: 0,
				originY: 0,
				cellSize: 50,
			},
			scale: {
				unitsPerGridSquare: 1,
				unitLabel: 'mi',
			},
		}) as TravelTimeEstimate;
		expect(estimate).toBeTruthy();
		expect(Number(estimate.distanceMiles.toFixed(2))).toBe(14.32);
		expect(Number(estimate.pace.normal.hours.toFixed(2))).toBe(4.77);
		expect(Number(estimate.pace.fast.days.toFixed(2))).toBe(0.45);
	});

	it('formats feet with miles fallback for large distances', () => {
		expect(formatScaledDistance(2400, 'ft')).toBe('2400 ft');
		expect(formatScaledDistance(10560, 'ft')).toContain('mi');
	});
});
