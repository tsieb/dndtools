import type { MapAsset, MapFogRegion } from '@dndtools/core';

/**
 * Pure geometry/selection helpers behind the map authoring surfaces (MapBuilder canvas gestures,
 * fog-region construction, raster base-layer selection). Kept DOM-free so the fog-shape rules —
 * polygon closing, brush-stroke thinning, the core's 256-point caps — are unit-testable without
 * a renderer.
 */

export interface NormPoint {
	x: number;
	y: number;
}

/** The core fog schemas cap polygon vertices and stroke points at 256 (fail-closed). */
export const MAX_FOG_POINTS = 256;

/** Minimum drag extent (normalized) below which a fog rect is treated as an accidental micro-drag. */
export const MIN_FOG_RECT_EXTENT = 0.01;

/** Minimum normalized distance between recorded brush points (thinning threshold). */
export const MIN_STROKE_POINT_DISTANCE = 0.005;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const round6 = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

const normPoint = (p: NormPoint): NormPoint => ({ x: round6(clamp01(p.x)), y: round6(clamp01(p.y)) });

/**
 * Build a rect fog region from a drag's start/current corners (normalized space). Returns null for
 * an accidental micro-drag — the core rejects zero-area regions, so the caller dispatches nothing.
 */
export function rectRegionFromDrag(start: NormPoint, cur: NormPoint): MapFogRegion | null {
	const x = clamp01(Math.min(start.x, cur.x));
	const y = clamp01(Math.min(start.y, cur.y));
	const w = Math.min(Math.abs(cur.x - start.x), 1 - x);
	const h = Math.min(Math.abs(cur.y - start.y), 1 - y);
	if (w < MIN_FOG_RECT_EXTENT || h < MIN_FOG_RECT_EXTENT) return null;
	return { shape: 'rect', x: round6(x), y: round6(y), w: round6(w), h: round6(h) };
}

/**
 * Append a clicked polygon vertex: clamps to map space, dedupes a repeat click on the last vertex,
 * and enforces the core's vertex cap (further clicks are ignored, never silently dropped mid-list).
 */
export function appendPolygonVertex(points: readonly NormPoint[], next: NormPoint): NormPoint[] {
	if (points.length >= MAX_FOG_POINTS) return [...points];
	const p = normPoint(next);
	const last = points[points.length - 1];
	if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_STROKE_POINT_DISTANCE) return [...points];
	return [...points, p];
}

/**
 * Close an in-progress polygon into a fog region. Returns null when fewer than the core's minimum
 * of 3 vertices exist (the caller keeps collecting instead of dispatching a doomed command).
 */
export function closePolygonRegion(points: readonly NormPoint[]): MapFogRegion | null {
	if (points.length < 3) return null;
	return { shape: 'polygon', points: points.slice(0, MAX_FOG_POINTS).map(normPoint) };
}

/**
 * Append a swept brush point with distance thinning: points closer than the threshold to the last
 * recorded point are skipped so a slow drag doesn't burn the 256-point cap on near-duplicates.
 * Once the cap is reached further points are dropped (the stroke stays valid, never truncated
 * retroactively).
 */
export function appendStrokePoint(
	points: readonly NormPoint[],
	next: NormPoint,
	minDistance: number = MIN_STROKE_POINT_DISTANCE,
): NormPoint[] {
	if (points.length >= MAX_FOG_POINTS) return [...points];
	const p = normPoint(next);
	const last = points[points.length - 1];
	if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDistance) return [...points];
	return [...points, p];
}

/** Finish a brush sweep into a stroke fog region. A single tap yields a disc (1 point). */
export function strokeRegionFromPoints(
	points: readonly NormPoint[],
	radius: number,
): MapFogRegion | null {
	if (points.length === 0) return null;
	const r = Math.min(0.5, Math.max(0, round6(radius)));
	if (r <= 0) return null;
	return { shape: 'stroke', points: points.slice(0, MAX_FOG_POINTS).map(normPoint), radius: r };
}

/**
 * Gaussian blur stdDeviation (in the 0..100 map viewBox) for a normalized feather width. A feather
 * of f normalized units is an f*100-unit soft band in viewBox space; stdDev of half that reads as
 * the band. Zero/absent feather renders sharp.
 */
export function featherBlurStdDev(feather: number | undefined): number {
	if (!feather || !Number.isFinite(feather) || feather <= 0) return 0;
	return (Math.min(0.2, feather) * 100) / 2;
}

/**
 * Pick the raster base-layer asset for a map: the most recently imported native image/SVG asset
 * whose metadata record exists. Returns null when the map has no renderable raster (the canvas
 * stays a pure geometry well).
 */
export function pickRasterAssetId(
	assetIds: readonly string[],
	assets: Readonly<Record<string, MapAsset>>,
): string | null {
	for (let i = assetIds.length - 1; i >= 0; i -= 1) {
		const asset = assets[assetIds[i]!];
		if (asset && (asset.kind === 'image' || asset.kind === 'svg')) return asset.id;
	}
	return null;
}
