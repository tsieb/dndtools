import type { Point, Ring } from './types';
import { dist } from './vec';

/**
 * Ring predicates and the polyline→ring stroke.
 *
 * The sign convention is load-bearing and is stated once, here: `ringArea` is the SIGNED shoelace area,
 * and this kit calls a positive ring CCW. Normalized map space has y pointing down, so a positive ring
 * reads clockwise on screen — but every consumer (marching squares, the wall deriver, the renderer's
 * even-odd fill) only ever asks for the SIGN, and fixing the convention on the sign rather than on a
 * mental picture is what lets an outer boundary be told from a hole with no other context.
 */

/** Even-odd (crossing-number) containment. Points exactly on the boundary are not guaranteed either way. */
export function pointInRing(ring: readonly Point[], p: Point): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const a = ring[i] as Point;
		const b = ring[j] as Point;
		// Half-open edge test (a.y counted, b.y not) so a vertex crossing is counted exactly once.
		if (a.y > p.y !== b.y > p.y) {
			const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
			if (p.x < x) inside = !inside;
		}
	}
	return inside;
}

/** SIGNED shoelace area. `> 0` means CCW (an outer boundary); `< 0` means CW (a hole). */
export function ringArea(ring: readonly Point[]): number {
	if (ring.length < 3) return 0;
	let sum = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const a = ring[j] as Point;
		const b = ring[i] as Point;
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
}

/** Perimeter INCLUDING the implicit closing edge from the last point back to the first. */
export function ringPerimeter(ring: readonly Point[]): number {
	if (ring.length < 2) return 0;
	let total = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		total += dist(ring[j] as Point, ring[i] as Point);
	}
	return total;
}

export function isClockwise(ring: readonly Point[]): boolean {
	return ringArea(ring) < 0;
}

/** Area-weighted polygon centroid — the point Lloyd relaxation moves a Voronoi seed to. Degenerates to
 *  the vertex mean when the ring has no area, so a collapsed cell still yields a usable point. */
export function polygonCentroid(ring: readonly Point[]): Point {
	if (ring.length === 0) return { x: 0, y: 0 };
	const area = ringArea(ring);
	if (Math.abs(area) < 1e-12) {
		let sx = 0;
		let sy = 0;
		for (const p of ring) {
			sx += p.x;
			sy += p.y;
		}
		return { x: sx / ring.length, y: sy / ring.length };
	}
	let cx = 0;
	let cy = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const a = ring[j] as Point;
		const b = ring[i] as Point;
		const w = a.x * b.y - b.x * a.y;
		cx += (a.x + b.x) * w;
		cy += (a.y + b.y) * w;
	}
	return { x: cx / (6 * area), y: cy / (6 * area) };
}

const CAP_SEGMENTS = 8;

/**
 * Stroke a polyline into a closed ring of the given half-width — a capsule chain: offset up one side,
 * round the far end, offset back down the other, round the start.
 *
 * This is how a corridor centreline or a river becomes a fillable polygon. It does NOT resolve
 * self-intersections at hairpin joints, and it does not need to: every consumer either rasterizes the
 * ring (where the even-odd scanline fill absorbs the overlap) or hands it to `unionBoundary`, which
 * re-derives a clean boundary from the raster. Building a real polygon-offset library to avoid a
 * self-intersection nobody can observe would be the wrong trade.
 *
 * The result is always wound CCW (positive `ringArea`).
 */
export function offsetPolyline(points: readonly Point[], radius: number): Ring {
	const r = Math.abs(radius);
	const path = dedupe(points);
	if (path.length === 0 || r <= 0) return [];
	if (path.length === 1) return circle(path[0] as Point, r);

	const ring: Point[] = [];
	// Forward along the left offset.
	for (let i = 0; i < path.length - 1; i += 1) {
		const a = path[i] as Point;
		const b = path[i + 1] as Point;
		const n = leftNormal(a, b);
		ring.push({ x: a.x + n.x * r, y: a.y + n.y * r });
		ring.push({ x: b.x + n.x * r, y: b.y + n.y * r });
	}
	// Round cap over the far end, sweeping outward past it.
	const endA = path[path.length - 2] as Point;
	const endB = path[path.length - 1] as Point;
	pushArc(ring, endB, angleOf(endA, endB) + Math.PI / 2, Math.PI, r);
	// Back along the right offset.
	for (let i = path.length - 2; i >= 0; i -= 1) {
		const a = path[i] as Point;
		const b = path[i + 1] as Point;
		const n = leftNormal(a, b);
		ring.push({ x: b.x - n.x * r, y: b.y - n.y * r });
		ring.push({ x: a.x - n.x * r, y: a.y - n.y * r });
	}
	// Round cap over the start.
	const startA = path[0] as Point;
	const startB = path[1] as Point;
	pushArc(ring, startA, angleOf(startA, startB) - Math.PI / 2, Math.PI, r);

	const cleaned = dedupe(ring);
	// The start cap lands back on the first left-offset point; the ring convention says the first point
	// is not repeated at the end.
	const head = cleaned[0];
	const tail = cleaned[cleaned.length - 1];
	if (head && tail && Math.abs(head.x - tail.x) < 1e-9 && Math.abs(head.y - tail.y) < 1e-9) {
		cleaned.pop();
	}
	return ringArea(cleaned) < 0 ? cleaned.reverse() : cleaned;
}

function leftNormal(a: Point, b: Point): Point {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.sqrt(dx * dx + dy * dy) || 1;
	return { x: -dy / len, y: dx / len };
}

function angleOf(a: Point, b: Point): number {
	return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Sweep `span` radians of arc, clockwise in angle (decreasing), which is the direction that keeps the
 *  cap on the OUTSIDE of the forward-then-backward walk above. */
function pushArc(out: Point[], center: Point, from: number, span: number, r: number): void {
	for (let i = 0; i <= CAP_SEGMENTS; i += 1) {
		const angle = from - (span * i) / CAP_SEGMENTS;
		out.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
	}
}

function circle(center: Point, r: number): Ring {
	const out: Point[] = [];
	const steps = CAP_SEGMENTS * 2;
	for (let i = 0; i < steps; i += 1) {
		const angle = (Math.PI * 2 * i) / steps;
		out.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
	}
	return ringArea(out) < 0 ? out.reverse() : out;
}

function dedupe(points: readonly Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
		out.push({ x: p.x, y: p.y });
	}
	return out;
}
