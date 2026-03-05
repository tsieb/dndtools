import type { MapData, MapRouteData, MapRouteWaypointData } from '$lib/types/object.js';

export interface MapDistanceSummary {
	pixels: number;
	gridSquares: number | null;
	scaledDistance: number | null;
	unitLabel: string | null;
}

export interface TravelPaceEstimate {
	miles: number;
	hours: number;
	days: number;
}

export interface TravelTimeEstimate {
	distanceMiles: number;
	pace: {
		slow: TravelPaceEstimate;
		normal: TravelPaceEstimate;
		fast: TravelPaceEstimate;
	};
}

function distance2d(a: MapRouteWaypointData, b: MapRouteWaypointData): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return Math.hypot(dx, dy);
}

function catmullRom(
	p0: MapRouteWaypointData,
	p1: MapRouteWaypointData,
	p2: MapRouteWaypointData,
	p3: MapRouteWaypointData,
	t: number,
): MapRouteWaypointData {
	const t2 = t * t;
	const t3 = t2 * t;
	const x =
		0.5 *
		(2 * p1.x +
			(-p0.x + p2.x) * t +
			(2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
			(-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
	const y =
		0.5 *
		(2 * p1.y +
			(-p0.y + p2.y) * t +
			(2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
			(-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
	return {
		x: Math.min(1, Math.max(0, x)),
		y: Math.min(1, Math.max(0, y)),
	};
}

export function sampleRouteWaypoints(
	route: Pick<MapRouteData, 'style' | 'waypoints'>,
	stepsPerSegment = 10,
): MapRouteWaypointData[] {
	if (!Array.isArray(route.waypoints) || route.waypoints.length < 2) {
		return route.waypoints ?? [];
	}
	if (route.style !== 'curved' || route.waypoints.length < 3) {
		return [...route.waypoints];
	}

	const sampled: MapRouteWaypointData[] = [];
	for (let i = 0; i < route.waypoints.length - 1; i += 1) {
		const p0 = route.waypoints[Math.max(0, i - 1)]!;
		const p1 = route.waypoints[i]!;
		const p2 = route.waypoints[i + 1]!;
		const p3 = route.waypoints[Math.min(route.waypoints.length - 1, i + 2)]!;
		const maxStep = Math.max(2, stepsPerSegment);
		for (let step = 0; step < maxStep; step += 1) {
			const t = step / maxStep;
			sampled.push(catmullRom(p0, p1, p2, p3, t));
		}
	}
	sampled.push(route.waypoints[route.waypoints.length - 1]!);
	return sampled;
}

export function routeLengthPixels(
	route: Pick<MapRouteData, 'style' | 'waypoints'>,
	image: { width: number; height: number },
): number {
	if (image.width <= 0 || image.height <= 0) return 0;
	const sampled = sampleRouteWaypoints(route, route.style === 'curved' ? 12 : 2);
	if (sampled.length < 2) return 0;
	let total = 0;
	for (let i = 0; i < sampled.length - 1; i += 1) {
		const a = sampled[i]!;
		const b = sampled[i + 1]!;
		total += distance2d(
			{ x: a.x * image.width, y: a.y * image.height },
			{ x: b.x * image.width, y: b.y * image.height },
		);
	}
	return total;
}

function toMiles(distance: number, unitLabel: string): number | null {
	const normalized = unitLabel.trim().toLowerCase();
	if (!normalized) return null;
	if (normalized === 'mi' || normalized === 'mile' || normalized === 'miles') return distance;
	if (normalized === 'ft' || normalized === 'foot' || normalized === 'feet' || normalized === "'") {
		return distance / 5280;
	}
	if (
		normalized === 'm' ||
		normalized === 'meter' ||
		normalized === 'meters' ||
		normalized === 'metre' ||
		normalized === 'metres'
	) {
		return distance / 1609.344;
	}
	if (normalized === 'km' || normalized === 'kilometer' || normalized === 'kilometers') {
		return distance / 1.609344;
	}
	return null;
}

export function summarizeRouteDistance(
	route: Pick<MapRouteData, 'style' | 'waypoints'>,
	mapData: Pick<MapData, 'grid' | 'scale' | 'width' | 'height'>,
): MapDistanceSummary {
	const width = mapData.width ?? 0;
	const height = mapData.height ?? 0;
	const pixels = routeLengthPixels(route, { width, height });
	const gridCellSize = mapData.grid?.cellSize ?? null;
	const gridSquares = gridCellSize && gridCellSize > 0 ? pixels / gridCellSize : null;
	const scaledDistance =
		gridSquares !== null && mapData.scale ? gridSquares * mapData.scale.unitsPerGridSquare : null;
	return {
		pixels,
		gridSquares,
		scaledDistance,
		unitLabel: mapData.scale?.unitLabel ?? null,
	};
}

export function estimateTravelTimeFromMiles(distanceMiles: number): TravelTimeEstimate {
	const miles = Math.max(0, distanceMiles);
	const hoursFor = (paceMilesPerHour: number): TravelPaceEstimate => {
		const hours = miles / paceMilesPerHour;
		return {
			miles,
			hours,
			days: hours / 8,
		};
	};
	return {
		distanceMiles: miles,
		pace: {
			slow: hoursFor(2),
			normal: hoursFor(3),
			fast: hoursFor(4),
		},
	};
}

export function estimateTravelTimeForRoute(
	route: Pick<MapRouteData, 'style' | 'waypoints'>,
	mapData: Pick<MapData, 'grid' | 'scale' | 'width' | 'height'>,
): TravelTimeEstimate | null {
	const summary = summarizeRouteDistance(route, mapData);
	if (summary.scaledDistance === null || !summary.unitLabel) return null;
	const miles = toMiles(summary.scaledDistance, summary.unitLabel);
	if (miles === null) return null;
	return estimateTravelTimeFromMiles(miles);
}

export function formatScaledDistance(distance: number, unitLabel: string): string {
	const normalized = unitLabel.trim().toLowerCase();
	if (!Number.isFinite(distance) || distance < 0 || !normalized) return '';
	if (normalized === 'ft' || normalized === 'foot' || normalized === 'feet' || normalized === "'") {
		if (distance >= 5280) {
			return `${(distance / 5280).toFixed(2)} mi (${Math.round(distance)} ft)`;
		}
		return `${Math.round(distance)} ft`;
	}
	if (
		normalized === 'm' ||
		normalized === 'meter' ||
		normalized === 'meters' ||
		normalized === 'metre' ||
		normalized === 'metres'
	) {
		if (distance >= 1000) {
			return `${(distance / 1000).toFixed(2)} km (${Math.round(distance)} m)`;
		}
		return `${Math.round(distance)} m`;
	}
	return `${Number(distance.toFixed(2))} ${unitLabel.trim()}`;
}
