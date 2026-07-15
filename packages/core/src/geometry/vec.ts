import type { Point, Rect, Ring } from './types';

/**
 * Point/rect primitives. Nothing here allocates more than it must and nothing mutates its input: these
 * sit in the inner loop of every raster generator, and a hidden mutation here would show up as a
 * non-reproducible map three call frames away.
 */

export function dist(a: Point, b: Point): number {
	return Math.sqrt(dist2(a, b));
}

/** Squared distance. Use this in hot loops — the `sqrt` is pure overhead when you only compare. */
export function dist2(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function polylineLength(points: readonly Point[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		total += dist(points[i - 1] as Point, points[i] as Point);
	}
	return total;
}

/** The arithmetic mean of the points (NOT the area-weighted polygon centroid — see `polygonCentroid`). */
export function centroid(points: readonly Point[]): Point {
	if (points.length === 0) return { x: 0, y: 0 };
	let sx = 0;
	let sy = 0;
	for (const p of points) {
		sx += p.x;
		sy += p.y;
	}
	return { x: sx / points.length, y: sy / points.length };
}

export function boundsOf(points: readonly Point[]): Rect {
	if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rectCenter(r: Rect): Point {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Rects overlap when they overlap after both are grown by `padding` — the room-spacing test. */
export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
	return (
		a.x - padding < b.x + b.w &&
		a.x + a.w + padding > b.x &&
		a.y - padding < b.y + b.h &&
		a.y + a.h + padding > b.y
	);
}

/**
 * The four corners, wound so that `ringArea` is POSITIVE. That sign — not a visual reading of the
 * screen — is this kit's definition of CCW: normalized map space has y pointing DOWN, so a
 * positive-shoelace ring reads as clockwise to the eye. Fixing the convention on the sign rather than on
 * the picture is what lets `contourGrid` tell an island from a lake without knowing which way is up.
 */
export function rectToRing(r: Rect): Ring {
	return [
		{ x: r.x, y: r.y },
		{ x: r.x + r.w, y: r.y },
		{ x: r.x + r.w, y: r.y + r.h },
		{ x: r.x, y: r.y + r.h },
	];
}

export function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}
