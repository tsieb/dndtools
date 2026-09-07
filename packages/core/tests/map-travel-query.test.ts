import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE_ID,
	DND5E_TRAVEL_PACES,
	GENERIC_SYSTEM_PACKAGE_ID,
	createDemoMapState,
	estimateRouteTravel,
	findTravelPace,
	getMapViewForActor,
	quantizeTravelDays,
	routeTravelForActor,
	travelPacesForSystem,
	travelSpeedForPace,
	type MapState,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';

/**
 * RC-MAP-3.7 — travel time by pace over the actor-filtered map view.
 *
 * The seeded Western Reaches is 120 miles wide and carries `route-north-road`, a two-waypoint march
 * from (0.14, 0.20) to (0.62, 0.34): a normalized length of exactly 0.5, so 60 miles — 2 days at the
 * fast pace, 2.5 at normal. The Ruined Keep is scaled in FEET, which is the unit-mismatch case.
 */

const PERMISSIONS = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
const WESTERN = 'map-western-reaches';
const KEEP = 'map-ruined-keep';
const ROUTE = 'route-north-road';

function demo(): MapState {
	return createDemoMapState();
}

describe('RC-MAP-3.7 the 5e pace table', () => {
	it('states 30 / 24 / 18 miles a day, fast to slow', () => {
		expect(DND5E_TRAVEL_PACES.map((pace) => [pace.key, pace.distancePerDay, pace.unit])).toEqual([
			['fast', 30, 'miles'],
			['normal', 24, 'miles'],
			['slow', 18, 'miles'],
		]);
	});

	it('serves 5e from the package id, and the documented default to a system that states none', () => {
		expect(travelPacesForSystem(DND5E_SYSTEM_PACKAGE_ID)).toBe(DND5E_TRAVEL_PACES);
		expect(travelPacesForSystem(GENERIC_SYSTEM_PACKAGE_ID)).toEqual(DND5E_TRAVEL_PACES);
		expect(travelPacesForSystem(null)).toEqual(DND5E_TRAVEL_PACES);
	});

	it('falls back to the normal pace for an unknown key rather than returning undefined', () => {
		expect(findTravelPace(DND5E_TRAVEL_PACES, 'slow').distancePerDay).toBe(18);
		expect(findTravelPace(DND5E_TRAVEL_PACES, null).key).toBe('normal');
		expect(travelSpeedForPace(findTravelPace(DND5E_TRAVEL_PACES, 'fast'))).toEqual({
			distancePerTime: 30,
			timeUnit: 'days',
		});
	});
});

describe('RC-MAP-3.7 quantizing a duration for reading', () => {
	it('reads a journey in half-days and anything under a day in half-hours', () => {
		expect(quantizeTravelDays(2)).toEqual({ value: 2, unit: 'days' });
		expect(quantizeTravelDays(2.5)).toEqual({ value: 2.5, unit: 'days' });
		expect(quantizeTravelDays(2.3)).toEqual({ value: 2.5, unit: 'days' });
		expect(quantizeTravelDays(0.25)).toEqual({ value: 6, unit: 'hours' });
		expect(quantizeTravelDays(0)).toEqual({ value: 0, unit: 'hours' });
	});

	it('refuses a non-finite or negative day count instead of rendering NaN', () => {
		expect(quantizeTravelDays(Number.NaN)).toBeNull();
		expect(quantizeTravelDays(Number.POSITIVE_INFINITY)).toBeNull();
		expect(quantizeTravelDays(-1)).toBeNull();
	});
});

describe('RC-MAP-3.7 measuring a drawn route at a pace', () => {
	it('reads 60 miles: 2 days fast, 2.5 days at normal pace', () => {
		const fast = routeTravelForActor(demo(), PERMISSIONS, DM_ACTOR.id, {
			mapId: WESTERN,
			routeId: ROUTE,
			paceKey: 'fast',
		});
		expect(fast?.distance).toBeCloseTo(60, 6);
		expect(fast?.distanceUnit).toBe('miles');
		expect(fast?.duration).toEqual({ value: 2, unit: 'days' });

		const normal = routeTravelForActor(demo(), PERMISSIONS, DM_ACTOR.id, {
			mapId: WESTERN,
			routeId: ROUTE,
			paceKey: 'normal',
		});
		expect(normal?.duration).toEqual({ value: 2.5, unit: 'days' });
		expect(normal?.unavailable).toBeNull();
		expect(normal?.label).toBe('North Road March');
	});

	it('gives the distance but NO time when the map scale is not in the pace unit', () => {
		const state = demo();
		const keep = state.maps[KEEP]!;
		keep.routes = [
			{
				...demo().maps[WESTERN]!.routes[0]!,
				layerId: keep.layers[0]!.id,
				visibility: 'player-visible',
			},
		];
		const estimate = routeTravelForActor(state, PERMISSIONS, DM_ACTOR.id, {
			mapId: KEEP,
			routeId: ROUTE,
			paceKey: 'normal',
		});
		expect(estimate?.distanceUnit).toBe('feet');
		expect(estimate?.distance).toBeCloseTo(100, 6);
		expect(estimate?.duration).toBeNull();
		expect(estimate?.unavailable).toBe('scale-unit');
	});

	it('reports no scale rather than guessing one when the map has none', () => {
		const state = demo();
		state.maps[WESTERN]!.scale = null;
		const estimate = routeTravelForActor(state, PERMISSIONS, DM_ACTOR.id, {
			mapId: WESTERN,
			routeId: ROUTE,
		});
		expect(estimate?.distance).toBeNull();
		expect(estimate?.duration).toBeNull();
		expect(estimate?.unavailable).toBe('no-scale');
	});

	it('accepts the singular and the abbreviation a DM types into the scale field', () => {
		const state = demo();
		state.maps[WESTERN]!.scale = { unitsPerMap: 120, unit: 'mi' };
		const estimate = routeTravelForActor(state, PERMISSIONS, DM_ACTOR.id, {
			mapId: WESTERN,
			routeId: ROUTE,
			paceKey: 'normal',
		});
		expect(estimate?.duration).toEqual({ value: 2.5, unit: 'days' });
	});
});

describe('RC-MAP-3.7 the estimate is actor-scoped, not a second read path', () => {
	it('returns null for a route the actor may not see, not an unmeasured route', () => {
		const state = demo();
		const map = state.maps[WESTERN]!;
		map.routes = map.routes.map((route) => ({ ...route, visibility: 'dm-only' }));
		expect(
			routeTravelForActor(state, PERMISSIONS, DM_ACTOR.id, { mapId: WESTERN, routeId: ROUTE }),
		).not.toBeNull();
		const player = routeTravelForActor(state, PERMISSIONS, PLAYER_ACTOR.id, {
			mapId: WESTERN,
			routeId: ROUTE,
		});
		expect(player).toBeNull();
	});

	it('returns null for an unknown route id and an unknown map', () => {
		expect(
			routeTravelForActor(demo(), PERMISSIONS, DM_ACTOR.id, { mapId: WESTERN, routeId: 'nope' }),
		).toBeNull();
		expect(
			routeTravelForActor(demo(), PERMISSIONS, DM_ACTOR.id, { mapId: 'no-map', routeId: ROUTE }),
		).toBeNull();
	});

	it('estimates straight off a projected route view, so the renderer measures what it draws', () => {
		const view = getMapViewForActor(demo(), PERMISSIONS, DM_ACTOR.id, WESTERN);
		if (view.kind !== 'available') throw new Error('unavailable');
		const route = view.routes.find((candidate) => candidate.id === ROUTE)!;
		expect(estimateRouteTravel(route, findTravelPace(DND5E_TRAVEL_PACES, 'slow')).duration).toEqual(
			{
				value: 3.5,
				unit: 'days',
			},
		);
	});
});
