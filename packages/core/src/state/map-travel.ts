import type { MapScale } from './map-state';
import type { MapRouteWaypoint, NormalizedPoint } from './map-annotations';

/**
 * MAP-013 — DETERMINISTIC, PURE route distance + travel-time math.
 *
 * Distance and travel time are DERIVED from a route's waypoints, the map's physical scale, and an
 * explicit travel speed; they are NEVER stored on the route (the route stores only geometry). So the
 * same waypoints + scale + speed always produce the same result, and editing a waypoint immediately
 * re-derives the measurement. These functions are the single source of route-measurement truth that
 * the query, the widget, and any travel-tool automation (Contract 4) all call.
 *
 * Coordinate model: waypoints are in NORMALIZED map space (0..1). The map's {@link MapScale} says how
 * many real-world units (`unit`, e.g. miles) span the full normalized width (`unitsPerMap`). So a
 * normalized delta `d` along one axis is `d * unitsPerMap` real units. Because a map is a fixed-aspect
 * image, we treat the normalized X and Y axes as sharing the same `unitsPerMap` scale (square pixels),
 * which is the prototype's flat-projection assumption (Contract: projection metadata is `flat` here).
 */

/** The straight-line normalized distance between two points (Euclidean, in 0..√2 units). */
export function normalizedSegmentLength(a: NormalizedPoint, b: NormalizedPoint): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return Math.hypot(dx, dy);
}

/** The total normalized path length of an ordered waypoint list (sum of segment lengths). */
export function normalizedPathLength(waypoints: readonly NormalizedPoint[]): number {
	let total = 0;
	for (let i = 1; i < waypoints.length; i += 1) {
		total += normalizedSegmentLength(waypoints[i - 1]!, waypoints[i]!);
	}
	return total;
}

/** A computed route measurement. `distance`/`unit` are real-world; `travelTime` is in the requested
 *  time unit. `null` fields mean the input was insufficient (no scale, or no speed) — fail soft, the
 *  geometry length is always available so the GUI can still show "unscaled length". */
export interface RouteMeasurement {
	/** Total normalized path length (0..√2·n), always available. */
	normalizedLength: number;
	/** Real-world distance, or null when the map has no scale. */
	distance: number | null;
	/** The distance unit (e.g. `miles`), or null when the map has no scale. */
	distanceUnit: string | null;
	/** Estimated travel time in `timeUnit`, or null when distance or speed is unavailable. */
	travelTime: number | null;
	/** The time unit label (e.g. `hours`), echoed from the input, or null. */
	timeUnit: string | null;
}

export interface TravelSpeed {
	/** Real-world distance covered per `timeUnit` (e.g. 24 miles per `day`). Must be positive. */
	distancePerTime: number;
	/** The time unit label, e.g. `hours`, `days`. */
	timeUnit: string;
}

/**
 * MAP-013 — measure a route deterministically. Given the waypoints, the map scale, and an optional
 * travel speed:
 *   - `normalizedLength` is always the summed segment length (unitless 0..1 space).
 *   - `distance` = `normalizedLength * scale.unitsPerMap` when a scale exists, else null.
 *   - `travelTime` = `distance / speed.distancePerTime` (in `speed.timeUnit`) when both a distance and
 *     a positive speed exist, else null.
 *
 * Pure and total: a degenerate route (< 2 waypoints) measures length 0; a zero/negative speed yields a
 * null travel time rather than throwing or returning Infinity (fail soft — the distance still shows).
 */
export function measureRoute(
	waypoints: readonly Pick<MapRouteWaypoint, 'position'>[] | readonly NormalizedPoint[],
	scale: MapScale | null,
	speed?: TravelSpeed | null,
): RouteMeasurement {
	const points: NormalizedPoint[] = waypoints.map((waypoint) =>
		'position' in waypoint ? waypoint.position : waypoint,
	);
	const normalizedLength = normalizedPathLength(points);

	const distance =
		scale && Number.isFinite(scale.unitsPerMap) && scale.unitsPerMap > 0
			? normalizedLength * scale.unitsPerMap
			: null;
	const distanceUnit = distance !== null && scale ? scale.unit : null;

	let travelTime: number | null = null;
	let timeUnit: string | null = null;
	if (
		distance !== null &&
		speed &&
		Number.isFinite(speed.distancePerTime) &&
		speed.distancePerTime > 0
	) {
		travelTime = distance / speed.distancePerTime;
		timeUnit = speed.timeUnit;
	}

	return { normalizedLength, distance, distanceUnit, travelTime, timeUnit };
}

/**
 * MAP-019 — measure the straight-line range between two normalized points in real-world units, given
 * the map scale. Used for token range measurement and AoE template radii. Returns null when the map
 * has no scale (the caller can still show the normalized length).
 */
export function measureRange(a: NormalizedPoint, b: NormalizedPoint, scale: MapScale | null): number | null {
	if (!scale || !Number.isFinite(scale.unitsPerMap) || scale.unitsPerMap <= 0) return null;
	return normalizedSegmentLength(a, b) * scale.unitsPerMap;
}
