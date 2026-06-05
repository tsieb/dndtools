import { describe, expect, it } from 'vitest';
import {
	measureRange,
	measureRoute,
	normalizedPathLength,
	normalizedSegmentLength,
	type MapScale,
} from '../src';

/**
 * MAP-013 — deterministic route distance + travel-time math. Pure functions: the same waypoints +
 * scale + speed always produce the same result, and the geometry length is always available even when
 * the scale/speed are not (fail soft).
 */

const SCALE: MapScale = { unitsPerMap: 120, unit: 'miles' };

describe('MAP-013 normalized geometry', () => {
	it('measures a straight segment length in normalized space', () => {
		expect(normalizedSegmentLength({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(0.5, 10);
	});

	it('sums a multi-segment path length', () => {
		const length = normalizedPathLength([
			{ x: 0, y: 0 },
			{ x: 0.3, y: 0.4 },
			{ x: 0.3, y: 0.9 },
		]);
		// 0.5 (3-4-5) + 0.5 (straight down) = 1.0
		expect(length).toBeCloseTo(1.0, 10);
	});

	it('a degenerate (single-point) path measures length 0', () => {
		expect(normalizedPathLength([{ x: 0.5, y: 0.5 }])).toBe(0);
	});
});

describe('MAP-013 measureRoute is deterministic', () => {
	const waypoints = [{ position: { x: 0.1, y: 0.1 } }, { position: { x: 0.4, y: 0.5 } }];

	it('derives real distance from the map scale', () => {
		const a = measureRoute(waypoints, SCALE);
		const b = measureRoute(waypoints, SCALE);
		// normalized length = hypot(0.3, 0.4) = 0.5; distance = 0.5 * 120 = 60 miles.
		expect(a.normalizedLength).toBeCloseTo(0.5, 10);
		expect(a.distance).toBeCloseTo(60, 10);
		expect(a.distanceUnit).toBe('miles');
		// Determinism: identical inputs → identical outputs.
		expect(b).toEqual(a);
	});

	it('computes travel time from distance and speed', () => {
		const measurement = measureRoute(waypoints, SCALE, { distancePerTime: 24, timeUnit: 'days' });
		// 60 miles / 24 miles-per-day = 2.5 days.
		expect(measurement.travelTime).toBeCloseTo(2.5, 10);
		expect(measurement.timeUnit).toBe('days');
	});

	it('fails soft to null distance when the map has no scale', () => {
		const measurement = measureRoute(waypoints, null, { distancePerTime: 24, timeUnit: 'days' });
		expect(measurement.normalizedLength).toBeCloseTo(0.5, 10);
		expect(measurement.distance).toBeNull();
		expect(measurement.travelTime).toBeNull();
	});

	it('fails soft to null travel time on a zero/negative speed (no Infinity/NaN)', () => {
		const zero = measureRoute(waypoints, SCALE, { distancePerTime: 0, timeUnit: 'days' });
		expect(zero.distance).toBeCloseTo(60, 10);
		expect(zero.travelTime).toBeNull();
		const negative = measureRoute(waypoints, SCALE, { distancePerTime: -5, timeUnit: 'days' });
		expect(negative.travelTime).toBeNull();
	});

	it('accepts bare normalized points as well as waypoint records', () => {
		const fromPoints = measureRoute([{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.5 }], SCALE);
		const fromWaypoints = measureRoute(waypoints, SCALE);
		expect(fromPoints.distance).toBeCloseTo(fromWaypoints.distance!, 10);
	});
});

describe('MAP-019 measureRange', () => {
	it('measures real range between two points from the scale', () => {
		expect(measureRange({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, SCALE)).toBeCloseTo(60, 10);
	});

	it('returns null with no scale', () => {
		expect(measureRange({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, null)).toBeNull();
	});
});
