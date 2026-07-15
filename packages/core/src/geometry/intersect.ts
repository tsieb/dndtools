import type { Point } from './types';

/**
 * Segment/ray predicates. These are the referee for every "does this corridor cross that room", "does
 * this road already have a bridge here", "can this torch see that wall" question in the generators.
 */

const EPS = 1e-12;

/** Signed area of the triangle a-b-c, doubled. The sign is the side of ab that c falls on. */
function cross(a: Point, b: Point, c: Point): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * The intersection point of the two segments, or null when they are parallel, collinear, or simply miss.
 * Collinear overlap deliberately returns null: there is no single point to return, and every caller here
 * wants "where do these cross", not "do these share ink".
 */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
	const rx = a2.x - a1.x;
	const ry = a2.y - a1.y;
	const sx = b2.x - b1.x;
	const sy = b2.y - b1.y;
	const denom = rx * sy - ry * sx;
	if (Math.abs(denom) < EPS) return null;
	const t = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denom;
	const u = ((b1.x - a1.x) * ry - (b1.y - a1.y) * rx) / denom;
	if (t < 0 || t > 1 || u < 0 || u > 1) return null;
	return { x: a1.x + rx * t, y: a1.y + ry * t };
}

/** Proper-or-touching intersection test, including the collinear-overlap case that the point form skips. */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
	const d1 = cross(b1, b2, a1);
	const d2 = cross(b1, b2, a2);
	const d3 = cross(a1, a2, b1);
	const d4 = cross(a1, a2, b2);
	if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
		return true;
	}
	if (Math.abs(d1) < EPS && onSegment(b1, b2, a1)) return true;
	if (Math.abs(d2) < EPS && onSegment(b1, b2, a2)) return true;
	if (Math.abs(d3) < EPS && onSegment(a1, a2, b1)) return true;
	if (Math.abs(d4) < EPS && onSegment(a1, a2, b2)) return true;
	return false;
}

function onSegment(a: Point, b: Point, p: Point): boolean {
	return (
		Math.min(a.x, b.x) - EPS <= p.x &&
		p.x <= Math.max(a.x, b.x) + EPS &&
		Math.min(a.y, b.y) - EPS <= p.y &&
		p.y <= Math.max(a.y, b.y) + EPS
	);
}

/**
 * Distance `t` along the ray `origin + dir*t` at which it first hits segment a–b, or null. `dir` need
 * not be normalized, but `t` is then in units of |dir|. This is the line-of-sight / light-occlusion
 * primitive.
 */
export function raySegmentHit(origin: Point, dir: Point, a: Point, b: Point): number | null {
	const sx = b.x - a.x;
	const sy = b.y - a.y;
	const denom = dir.x * sy - dir.y * sx;
	if (Math.abs(denom) < EPS) return null;
	const t = ((a.x - origin.x) * sy - (a.y - origin.y) * sx) / denom;
	const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / denom;
	if (t < 0 || u < 0 || u > 1) return null;
	return t;
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < EPS) {
		const px = p.x - a.x;
		const py = p.y - a.y;
		return Math.sqrt(px * px + py * py);
	}
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const cx = a.x + dx * t;
	const cy = a.y + dy * t;
	const ex = p.x - cx;
	const ey = p.y - cy;
	return Math.sqrt(ex * ex + ey * ey);
}
