import type { ActorId } from '../state/ids';
import type { MapState } from '../state/map-state';
import type { PermissionState } from '../state/permission-state';
import { getMapViewForActor, type MapQueryOptions, type MapRouteView } from './map-query';
import type { TravelSpeed } from '../state/map-travel';
import { DND5E_SYSTEM_PACKAGE_ID } from '../systems';

/**
 * RC-MAP-3.7 — TRAVEL TIME for a drawn route, by PACE.
 *
 * `state/map-travel.ts` already derives a route's distance and a travel time from an arbitrary
 * speed. What it cannot know is which speeds the campaign's rules system offers: 5e's overland pace
 * table (fast / normal / slow) is rules content, not geometry. This module is the join — it picks the
 * pace table for the active system package, then measures a route the ACTOR is allowed to see.
 *
 * Two things are deliberately fail-honest here rather than best-effort:
 *   - The read goes through {@link getMapViewForActor}, so a route on a `dm-only` layer is not merely
 *     unmeasured for a player, it is not found at all (MAP-018's single filtered read path).
 *   - A pace is expressed in a UNIT (miles per day). A map scaled in feet, squares or kilometres is
 *     not silently divided by a miles-per-day rate: the distance still reads, the travel time comes
 *     back `null` with `unavailable: 'scale-unit'`. A DM reading "0.1 days" off a dungeon map would
 *     be worse than reading nothing.
 */

export type TravelPaceKey = 'fast' | 'normal' | 'slow';

/** An overland pace: how far a party covers in a day, and the distance unit that rate is stated in. */
export interface TravelPace {
	key: TravelPaceKey;
	/** Distance covered per day at this pace, in `unit`. */
	distancePerDay: number;
	/** The distance unit the rate is stated in (compared against the map's scale unit). */
	unit: string;
}

/**
 * The 5e overland travel table (PHB "Travel Pace"): 30 / 24 / 18 miles a day. Ordered fast → slow so
 * a picker reads top-to-bottom the way the rulebook prints it.
 */
export const DND5E_TRAVEL_PACES: readonly TravelPace[] = Object.freeze([
	Object.freeze({ key: 'fast' as const, distancePerDay: 30, unit: 'miles' }),
	Object.freeze({ key: 'normal' as const, distancePerDay: 24, unit: 'miles' }),
	Object.freeze({ key: 'slow' as const, distancePerDay: 18, unit: 'miles' }),
]);

/** The pace a picker starts on, and the one a caller falls back to when a stored key is unknown. */
export const DEFAULT_TRAVEL_PACE: TravelPaceKey = 'normal';

/**
 * The pace table for a system package.
 *
 * Only 5e states overland paces today, and the `SystemPackage` model has no `travel` block yet (its
 * schema is `.strict()`, so a package cannot carry one), which means every other system — including
 * Generic — measures against the 5e table. That is a deliberate, documented default rather than a
 * silent one: the rates are ordinary marching speeds, and returning nothing would leave a Generic
 * campaign with a distance and no estimate. When `SystemPackage` grows a `travel` block this
 * function reads it and the default becomes the fallback for packages that omit it.
 */
export function travelPacesForSystem(systemPackageId: string | null): readonly TravelPace[] {
	const declared = systemPackageId ? PACES_BY_SYSTEM[systemPackageId] : undefined;
	return declared ?? DND5E_TRAVEL_PACES;
}

/** The systems that state their own overland paces. Everything else uses the documented default. */
const PACES_BY_SYSTEM: Readonly<Record<string, readonly TravelPace[]>> = Object.freeze({
	[DND5E_SYSTEM_PACKAGE_ID]: DND5E_TRAVEL_PACES,
});

/** Look a pace up by key, falling back to the table's normal pace (never undefined). */
export function findTravelPace(
	paces: readonly TravelPace[],
	key: TravelPaceKey | null | undefined,
): TravelPace {
	return (
		paces.find((pace) => pace.key === key) ??
		paces.find((pace) => pace.key === DEFAULT_TRAVEL_PACE) ??
		DND5E_TRAVEL_PACES[1]!
	);
}

/** A pace as a {@link TravelSpeed}, so `measureRoute` can consume it unchanged. */
export function travelSpeedForPace(pace: TravelPace): TravelSpeed {
	return { distancePerTime: pace.distancePerDay, timeUnit: 'days' };
}

/**
 * Compare a map's scale unit with a pace's unit. Tolerant of the plural and of the common
 * abbreviation a DM types into the scale field ("mile", "miles", "mi"), strict about everything else:
 * feet, squares and kilometres are NOT miles.
 */
function unitMatches(scaleUnit: string, paceUnit: string): boolean {
	const canonical = (value: string): string => {
		const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
		if (trimmed === 'mi') return 'mile';
		return trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
	};
	return canonical(scaleUnit) === canonical(paceUnit);
}

/** Why a travel estimate has no time. `null` distance and unmatched units are different problems. */
export type TravelUnavailableReason = 'no-scale' | 'scale-unit' | 'no-distance';

/** A quantized duration: whole-ish days for a journey, hours for anything under a day. */
export interface TravelDuration {
	/** Rounded for reading: days to the nearest half-day, hours to the nearest half-hour. */
	value: number;
	unit: 'days' | 'hours';
}

/**
 * Quantize a raw day count for display. Under a day reads in hours, because "0.3 days" is a number a
 * DM has to convert in their head at the table; a day or more reads in half-days, because the pace
 * table is itself an approximation and a route measured to three decimals implies a precision the
 * rules do not have.
 */
export function quantizeTravelDays(days: number): TravelDuration | null {
	if (!Number.isFinite(days) || days < 0) return null;
	if (days < 1) return { value: Math.round(days * 24 * 2) / 2, unit: 'hours' };
	return { value: Math.round(days * 2) / 2, unit: 'days' };
}

/** A route's distance and, when the units line up, how long it takes at the chosen pace. */
export interface RouteTravelEstimate {
	routeId: string;
	label: string;
	/** Real-world distance in `distanceUnit`, or null when the map has no scale. */
	distance: number | null;
	distanceUnit: string | null;
	pace: TravelPace;
	/** The estimate, or null — in which case `unavailable` says why. */
	duration: TravelDuration | null;
	unavailable: TravelUnavailableReason | null;
}

/**
 * Measure an already-projected route view at a pace. Pure: the view carries the geometry-derived
 * distance, this adds only the pace division and the display quantization.
 */
export function estimateRouteTravel(route: MapRouteView, pace: TravelPace): RouteTravelEstimate {
	const { distance, distanceUnit } = route.measurement;
	const base = {
		routeId: route.id,
		label: route.label,
		distance,
		distanceUnit,
		pace,
	};
	if (distance === null || distanceUnit === null) {
		return { ...base, duration: null, unavailable: 'no-scale' };
	}
	if (!unitMatches(distanceUnit, pace.unit)) {
		return { ...base, duration: null, unavailable: 'scale-unit' };
	}
	const duration = quantizeTravelDays(distance / pace.distancePerDay);
	return { ...base, duration, unavailable: duration ? null : 'no-distance' };
}

/**
 * The actor-scoped read: measure ONE route on ONE map at a pace, or `null` when the actor cannot see
 * that route. Built on {@link getMapViewForActor}, so the visibility decision is made once, in the
 * core, exactly as it is for the renderer and for search.
 */
export function routeTravelForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	request: {
		mapId: string;
		routeId: string;
		paceKey?: TravelPaceKey | null;
		systemPackageId?: string | null;
	},
	options?: MapQueryOptions,
): RouteTravelEstimate | null {
	const view = getMapViewForActor(maps, permissions, actorId, request.mapId, options);
	if (view.kind !== 'available') return null;
	const route = view.routes.find((candidate) => candidate.id === request.routeId);
	if (!route) return null;
	const paces = travelPacesForSystem(request.systemPackageId ?? null);
	return estimateRouteTravel(route, findTravelPace(paces, request.paceKey));
}
