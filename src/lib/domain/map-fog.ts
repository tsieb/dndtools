import type {
	MapFogBrushShape,
	MapFogColorTheme,
	MapFogOperationMode,
	MapFogPoint,
	MapFogPolygonOperation,
	MapFogState,
} from '$lib/types/map-fog.js';
import { nowISO } from '$lib/utils/date.js';

export const DEFAULT_MAP_FOG_COLOR_THEME: MapFogColorTheme = 'smoky_gray';
export const DEFAULT_MAP_FOG_POLYGON_LIMIT = 800;
export const DEFAULT_MAP_FOG_POINTS_LIMIT = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampUnit(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function asFiniteNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return value;
}

function normalizeFogColorTheme(value: unknown): MapFogColorTheme {
	return value === 'black' ? 'black' : DEFAULT_MAP_FOG_COLOR_THEME;
}

function normalizeFogPoint(value: unknown): MapFogPoint | null {
	if (!isRecord(value)) return null;
	const x = asFiniteNumber(value.x);
	const y = asFiniteNumber(value.y);
	if (x === null || y === null) return null;
	return { x: clampUnit(x), y: clampUnit(y) };
}

function normalizeFogMode(value: unknown): MapFogOperationMode {
	return value === 'refog' ? 'refog' : 'reveal';
}

function normalizeFogShape(value: unknown): MapFogBrushShape {
	return value === 'circle' || value === 'rectangle' ? value : 'polygon';
}

function normalizeFogPolygonOperation(
	value: unknown,
	index: number,
	fallbackMode: MapFogOperationMode,
): MapFogPolygonOperation | null {
	if (!isRecord(value)) return null;
	const pointsRaw = Array.isArray(value.points) ? value.points : [];
	const points = pointsRaw
		.map((point) => normalizeFogPoint(point))
		.filter((point): point is MapFogPoint => !!point)
		.slice(0, DEFAULT_MAP_FOG_POINTS_LIMIT);
	if (points.length < 3) return null;
	const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `fog-${index + 1}`;
	const createdAt =
		typeof value.createdAt === 'string' && value.createdAt.trim() ? value.createdAt : nowISO();
	return {
		id,
		mode: value.mode === undefined ? fallbackMode : normalizeFogMode(value.mode),
		shape: normalizeFogShape(value.shape),
		points,
		createdAt,
	};
}

export function createDefaultMapFogState(updatedAt = nowISO()): MapFogState {
	return {
		colorTheme: DEFAULT_MAP_FOG_COLOR_THEME,
		freeExplore: false,
		polygons: [],
		updatedAt,
	};
}

export function normalizeMapFogState(
	value: unknown,
	options?: { fallbackUpdatedAt?: string },
): MapFogState | undefined {
	if (!isRecord(value)) return undefined;
	const updatedAt =
		typeof value.updatedAt === 'string' && value.updatedAt.trim()
			? value.updatedAt
			: (options?.fallbackUpdatedAt ?? nowISO());
	const colorTheme = normalizeFogColorTheme(value.colorTheme);
	const freeExplore = value.freeExplore === true;

	if (Array.isArray(value.polygons)) {
		const polygons = value.polygons
			.map((entry, index) => normalizeFogPolygonOperation(entry, index, 'reveal'))
			.filter((entry): entry is MapFogPolygonOperation => !!entry)
			.slice(-DEFAULT_MAP_FOG_POLYGON_LIMIT);
		return {
			colorTheme,
			freeExplore,
			polygons,
			updatedAt,
		};
	}

	const legacyRevealRaw = Array.isArray(value.revealedPolygons) ? value.revealedPolygons : [];
	const legacyRefogRaw = Array.isArray(value.hiddenPolygons) ? value.hiddenPolygons : [];
	if (legacyRevealRaw.length === 0 && legacyRefogRaw.length === 0) {
		return {
			colorTheme,
			freeExplore,
			polygons: [],
			updatedAt,
		};
	}

	const revealed = legacyRevealRaw
		.map((entry, index) => normalizeFogPolygonOperation(entry, index, 'reveal'))
		.filter((entry): entry is MapFogPolygonOperation => !!entry)
		.map((entry) => ({ ...entry, mode: 'reveal' as const }));
	const refog = legacyRefogRaw
		.map((entry, index) => normalizeFogPolygonOperation(entry, index, 'refog'))
		.filter((entry): entry is MapFogPolygonOperation => !!entry)
		.map((entry) => ({ ...entry, mode: 'refog' as const }));
	return {
		colorTheme,
		freeExplore,
		polygons: [...revealed, ...refog].slice(-DEFAULT_MAP_FOG_POLYGON_LIMIT),
		updatedAt,
	};
}

export function appendFogPolygonOperation(
	state: MapFogState | undefined,
	input: {
		id: string;
		mode: MapFogOperationMode;
		shape: MapFogBrushShape;
		points: MapFogPoint[];
		createdAt?: string;
	},
	updatedAt = nowISO(),
): MapFogState {
	const base = state ? normalizeMapFogState(state, { fallbackUpdatedAt: updatedAt }) : undefined;
	const normalizedPoints = input.points
		.map((point) => ({ x: clampUnit(point.x), y: clampUnit(point.y) }))
		.slice(0, DEFAULT_MAP_FOG_POINTS_LIMIT);
	if (normalizedPoints.length < 3) {
		return base ?? createDefaultMapFogState(updatedAt);
	}
	const next: MapFogPolygonOperation = {
		id: input.id,
		mode: input.mode,
		shape: input.shape,
		points: normalizedPoints,
		createdAt: input.createdAt ?? updatedAt,
	};
	const previous = base ?? createDefaultMapFogState(updatedAt);
	return {
		...previous,
		polygons: [...previous.polygons, next].slice(-DEFAULT_MAP_FOG_POLYGON_LIMIT),
		updatedAt,
	};
}

export function splitFogPolygonsByMode(state: MapFogState | undefined | null): {
	revealed: MapFogPolygonOperation[];
	refog: MapFogPolygonOperation[];
} {
	if (!state || state.polygons.length === 0) {
		return { revealed: [], refog: [] };
	}
	const revealed: MapFogPolygonOperation[] = [];
	const refog: MapFogPolygonOperation[] = [];
	for (const polygon of state.polygons) {
		if (polygon.mode === 'refog') refog.push(polygon);
		else revealed.push(polygon);
	}
	return { revealed, refog };
}

export function countFogPolygonsByMode(state: MapFogState | undefined | null): {
	reveal: number;
	refog: number;
} {
	const split = splitFogPolygonsByMode(state);
	return {
		reveal: split.revealed.length,
		refog: split.refog.length,
	};
}

export function polygonFromCircle(
	center: MapFogPoint,
	radiusFraction: number,
	segments = 20,
): MapFogPoint[] {
	const radius = Math.max(0.003, Math.min(0.5, radiusFraction));
	const sliceCount = Math.max(8, Math.min(96, Math.round(segments)));
	const points: MapFogPoint[] = [];
	for (let index = 0; index < sliceCount; index += 1) {
		const angle = (Math.PI * 2 * index) / sliceCount;
		points.push({
			x: clampUnit(center.x + Math.cos(angle) * radius),
			y: clampUnit(center.y + Math.sin(angle) * radius),
		});
	}
	return points;
}

export function polygonFromRectangle(start: MapFogPoint, end: MapFogPoint): MapFogPoint[] {
	const left = clampUnit(Math.min(start.x, end.x));
	const right = clampUnit(Math.max(start.x, end.x));
	const top = clampUnit(Math.min(start.y, end.y));
	const bottom = clampUnit(Math.max(start.y, end.y));
	return [
		{ x: left, y: top },
		{ x: right, y: top },
		{ x: right, y: bottom },
		{ x: left, y: bottom },
	];
}

export function normalizeLassoPoints(
	points: readonly MapFogPoint[],
	minDistance = 0.002,
): MapFogPoint[] {
	if (points.length === 0) return [];
	const normalized: MapFogPoint[] = [{ x: clampUnit(points[0]!.x), y: clampUnit(points[0]!.y) }];
	for (let index = 1; index < points.length; index += 1) {
		const current = points[index]!;
		const previous = normalized[normalized.length - 1]!;
		const clamped = { x: clampUnit(current.x), y: clampUnit(current.y) };
		if (Math.hypot(clamped.x - previous.x, clamped.y - previous.y) < minDistance) {
			continue;
		}
		normalized.push(clamped);
		if (normalized.length >= DEFAULT_MAP_FOG_POINTS_LIMIT) break;
	}
	if (normalized.length >= 3) return normalized;
	return [];
}

export function revealBoundsFromFogState(
	state: MapFogState | undefined | null,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
	if (!state || state.polygons.length === 0) return null;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let hasReveal = false;
	for (const polygon of state.polygons) {
		if (polygon.mode !== 'reveal') continue;
		hasReveal = true;
		for (const point of polygon.points) {
			if (point.x < minX) minX = point.x;
			if (point.y < minY) minY = point.y;
			if (point.x > maxX) maxX = point.x;
			if (point.y > maxY) maxY = point.y;
		}
	}
	if (!hasReveal) return null;
	return { minX, minY, maxX, maxY };
}
