import { norm, normPoint } from '../generation/types';
import type { Point, Rect, Ring } from './types';
import { polygonCentroid } from './polygon';
import { clamp, dist, rectToRing } from './vec';

/**
 * Delaunay triangulation, its Voronoi dual, Prim's MST, and Lloyd relaxation.
 *
 * These four are the skeleton of every non-grid generator here. Delaunay gives the candidate connections
 * between rooms/settlements/islands ("who is plausibly adjacent to whom"); the MST of those candidates is
 * the guaranteed-connected spine (add a few of the rejected edges back and you have loops, and the ones
 * you did NOT add back are exactly where secret doors belong); the Voronoi dual gives regions — city
 * wards, biome patches, faction territory — and Lloyd relaxation makes those regions even.
 *
 * Bowyer–Watson, because it is thirty lines and dependency-free. `packages/core` takes no dependencies,
 * so Delaunator is not on the table, and at the sizes this tool generates (tens to low thousands of
 * points) the O(n log n) advantage is not worth a supply-chain edge.
 *
 * DEGENERATE INPUT DOES NOT THROW. Fewer than three points, every point on one line, the same point
 * twice — a generator gets these from an unlucky seed, and an exception there is a map the user cannot
 * make. Each returns empty triangles and the sensible trivial edge set (a chain along the line), so the
 * MST downstream still connects everything.
 */

export interface Triangulation {
	points: Point[];
	/** Flat triples of indices into `points`. */
	triangles: number[];
	/** Unique undirected edges as sorted index pairs. */
	edges: Array<[number, number]>;
}

interface Triangle {
	a: number;
	b: number;
	c: number;
	cx: number;
	cy: number;
	r2: number;
}

const EPS = 1e-12;

export function delaunay(points: readonly Point[]): Triangulation {
	const out: Point[] = points.map((p) => ({ x: p.x, y: p.y }));

	// Collapse exact duplicates onto their first occurrence: two coincident sites have no bisector, and a
	// zero-area triangle poisons every circumcircle it touches.
	const firstAt = new Map<string, number>();
	const unique: number[] = [];
	for (let i = 0; i < out.length; i += 1) {
		const p = out[i] as Point;
		const k = `${norm(p.x)}:${norm(p.y)}`;
		if (firstAt.has(k)) continue;
		firstAt.set(k, i);
		unique.push(i);
	}

	if (unique.length < 3) return { points: out, triangles: [], edges: chainEdges(out, unique) };

	const work: Point[] = unique.map((i) => out[i] as Point);
	const n = work.length;

	// Super-triangle, comfortably enclosing every point. Its vertices live at indices n, n+1, n+2 and every
	// triangle still touching one of them at the end is scaffolding, not geometry.
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of work) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	const span = Math.max(maxX - minX, maxY - minY) || 1;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	work.push({ x: cx - 20 * span, y: cy - span });
	work.push({ x: cx, y: cy + 20 * span });
	work.push({ x: cx + 20 * span, y: cy - span });

	let triangles: Triangle[] = [];
	const seed = makeTriangle(work, n, n + 1, n + 2);
	if (seed) triangles.push(seed);

	const boundary: Array<[number, number]> = [];
	for (let i = 0; i < n; i += 1) {
		const p = work[i] as Point;
		boundary.length = 0;
		const kept: Triangle[] = [];
		for (const t of triangles) {
			const dx = p.x - t.cx;
			const dy = p.y - t.cy;
			// Strictly inside. Cocircular points (the four corners of a square) must NOT invalidate a
			// triangle, or the re-fan produces an overlapping cavity.
			if (dx * dx + dy * dy < t.r2) {
				boundary.push([t.a, t.b], [t.b, t.c], [t.c, t.a]);
			} else {
				kept.push(t);
			}
		}
		triangles = kept;

		// An edge shared by two invalidated triangles is interior to the cavity; only the unshared ones
		// form the polygon we re-fan from p.
		for (let e = 0; e < boundary.length; e += 1) {
			const edge = boundary[e] as [number, number];
			let shared = false;
			for (let f = 0; f < boundary.length; f += 1) {
				if (f === e) continue;
				const other = boundary[f] as [number, number];
				if (
					(edge[0] === other[0] && edge[1] === other[1]) ||
					(edge[0] === other[1] && edge[1] === other[0])
				) {
					shared = true;
					break;
				}
			}
			if (shared) continue;
			const t = makeTriangle(work, edge[0], edge[1], i);
			if (t) triangles.push(t);
		}
	}

	const flat: number[] = [];
	for (const t of triangles) {
		if (t.a >= n || t.b >= n || t.c >= n) continue; // scaffolding
		flat.push(unique[t.a] as number, unique[t.b] as number, unique[t.c] as number);
	}

	if (flat.length === 0) return { points: out, triangles: [], edges: chainEdges(out, unique) };
	return { points: out, triangles: flat, edges: edgesOf(flat) };
}

/** Circumcircle, or null when the three points are collinear (which makes the triangle useless anyway). */
function makeTriangle(points: readonly Point[], a: number, b: number, c: number): Triangle | null {
	const pa = points[a] as Point;
	const pb = points[b] as Point;
	const pc = points[c] as Point;
	const d = 2 * (pa.x * (pb.y - pc.y) + pb.x * (pc.y - pa.y) + pc.x * (pa.y - pb.y));
	if (Math.abs(d) < EPS) return null;
	const la = pa.x * pa.x + pa.y * pa.y;
	const lb = pb.x * pb.x + pb.y * pb.y;
	const lc = pc.x * pc.x + pc.y * pc.y;
	const cx = (la * (pb.y - pc.y) + lb * (pc.y - pa.y) + lc * (pa.y - pb.y)) / d;
	const cy = (la * (pc.x - pb.x) + lb * (pa.x - pc.x) + lc * (pb.x - pa.x)) / d;
	const dx = pa.x - cx;
	const dy = pa.y - cy;
	return { a, b, c, cx, cy, r2: dx * dx + dy * dy };
}

function edgesOf(flat: readonly number[]): Array<[number, number]> {
	const seen = new Set<string>();
	const edges: Array<[number, number]> = [];
	for (let i = 0; i < flat.length; i += 3) {
		const a = flat[i] as number;
		const b = flat[i + 1] as number;
		const c = flat[i + 2] as number;
		const pairs: Array<[number, number]> = [
			[a, b],
			[b, c],
			[c, a],
		];
		for (const [x, y] of pairs) {
			const lo = Math.min(x, y);
			const hi = Math.max(x, y);
			const k = `${lo}:${hi}`;
			if (seen.has(k)) continue;
			seen.add(k);
			edges.push([lo, hi]);
		}
	}
	return edges;
}

/**
 * The trivial edge set for input a triangulation cannot handle: order the sites along their own line and
 * connect each to the next. One point gives no edges, two give one, n collinear give n-1 — so the MST
 * downstream still spans everything and a generator handed a straight row of rooms still connects them.
 */
function chainEdges(points: readonly Point[], unique: readonly number[]): Array<[number, number]> {
	if (unique.length < 2) return [];
	const ordered = [...unique].sort((i, j) => {
		const a = points[i] as Point;
		const b = points[j] as Point;
		return a.x - b.x || a.y - b.y || i - j;
	});
	const edges: Array<[number, number]> = [];
	for (let i = 1; i < ordered.length; i += 1) {
		const x = ordered[i - 1] as number;
		const y = ordered[i] as number;
		edges.push([Math.min(x, y), Math.max(x, y)]);
	}
	return edges;
}

/**
 * Prim's MST over the given edges, weighted by Euclidean distance. THE corridor spine: run it over the
 * Delaunay edges and every room is reachable with no redundancy, which is the baseline a dungeon then
 * adds loops back on top of. Disconnected input yields a spanning FOREST rather than an exception.
 */
export function minimumSpanningTree(
	points: readonly Point[],
	edges: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
	const n = points.length;
	if (n < 2) return [];

	const adjacency: Array<Array<{ to: number; weight: number }>> = [];
	for (let i = 0; i < n; i += 1) adjacency.push([]);
	for (const [a, b] of edges) {
		if (a < 0 || b < 0 || a >= n || b >= n || a === b) continue;
		const weight = dist(points[a] as Point, points[b] as Point);
		(adjacency[a] as Array<{ to: number; weight: number }>).push({ to: b, weight });
		(adjacency[b] as Array<{ to: number; weight: number }>).push({ to: a, weight });
	}

	const inTree = new Uint8Array(n);
	const best = new Float64Array(n).fill(Infinity);
	const parent = new Int32Array(n).fill(-1);
	const tree: Array<[number, number]> = [];

	for (let root = 0; root < n; root += 1) {
		if (inTree[root] === 1) continue;
		best[root] = 0;
		// Grow one component. Ties break on the lower index, so the tree is a function of the input alone.
		for (;;) {
			let pick = -1;
			for (let i = 0; i < n; i += 1) {
				if (inTree[i] === 1 || best[i] === Infinity) continue;
				if (pick === -1 || (best[i] as number) < (best[pick] as number)) pick = i;
			}
			if (pick === -1) break;
			inTree[pick] = 1;
			const from = parent[pick] as number;
			if (from >= 0) tree.push([Math.min(from, pick), Math.max(from, pick)]);
			for (const edge of adjacency[pick] as Array<{ to: number; weight: number }>) {
				if (inTree[edge.to] === 1) continue;
				if (edge.weight < (best[edge.to] as number)) {
					best[edge.to] = edge.weight;
					parent[edge.to] = pick;
				}
			}
		}
	}
	return tree;
}

/**
 * Voronoi cells clipped to `bounds`; `result[i]` is the cell of `points[i]`.
 *
 * Built from the Delaunay DUAL, but by half-plane clipping rather than by stitching circumcenters: a
 * Voronoi cell is exactly the bounds rectangle cut by the perpendicular bisector against each of the
 * site's DELAUNAY NEIGHBOURS (that equivalence is what the dual means), and clipping is robust for hull
 * sites — whose cells are unbounded and whose circumcenter fan is therefore incomplete. Sutherland–
 * Hodgman keeps the subject's winding, so cells come back CCW like every other ring here.
 *
 * A site outside `bounds`, or one duplicated exactly, can come back as an empty ring.
 */
export function voronoiCells(points: readonly Point[], bounds: Rect): Ring[] {
	const n = points.length;
	if (n === 0) return [];
	if (n === 1) return [rectToRing(bounds).map((p) => normPoint(p.x, p.y))];

	const { edges } = delaunay(points);
	const neighbours: number[][] = [];
	for (let i = 0; i < n; i += 1) neighbours.push([]);
	for (const [a, b] of edges) {
		(neighbours[a] as number[]).push(b);
		(neighbours[b] as number[]).push(a);
	}

	const cells: Ring[] = [];
	for (let i = 0; i < n; i += 1) {
		const site = points[i] as Point;
		// A site the triangulation dropped (an exact duplicate) has no dual adjacency to clip against; fall
		// back to every other site, which is O(n²) but always correct.
		const against =
			(neighbours[i] as number[]).length > 0 ? (neighbours[i] as number[]) : allOthers(n, i);

		let cell: Point[] = rectToRing(bounds);
		for (const j of against) {
			const other = points[j] as Point;
			const nx = other.x - site.x;
			const ny = other.y - site.y;
			if (Math.abs(nx) < EPS && Math.abs(ny) < EPS) continue; // coincident site: no bisector
			// Keep the half-plane nearer to `site`: n·p <= n·midpoint.
			const c = (nx * (site.x + other.x) + ny * (site.y + other.y)) / 2;
			cell = clipHalfPlane(cell, nx, ny, c);
			if (cell.length < 3) break;
		}
		cells.push(cell.length < 3 ? [] : cell.map((p) => normPoint(p.x, p.y)));
	}
	return cells;
}

function allOthers(n: number, i: number): number[] {
	const out: number[] = [];
	for (let j = 0; j < n; j += 1) if (j !== i) out.push(j);
	return out;
}

/** Sutherland–Hodgman against one half-plane: keep `nx*x + ny*y <= c`. */
function clipHalfPlane(poly: readonly Point[], nx: number, ny: number, c: number): Point[] {
	const out: Point[] = [];
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
		const a = poly[j] as Point;
		const b = poly[i] as Point;
		const da = nx * a.x + ny * a.y - c;
		const db = nx * b.x + ny * b.y - c;
		const aIn = da <= 0;
		const bIn = db <= 0;
		if (aIn !== bIn) {
			const t = da / (da - db);
			out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
		if (bIn) out.push({ x: b.x, y: b.y });
	}
	return out;
}

/**
 * Lloyd relaxation: move each site to the centroid of its Voronoi cell, `iterations` times. Two passes is
 * the sweet spot — zero leaves the clumps a uniform scatter always has, and five or more converges on an
 * unnaturally regular hex lattice that reads as a honeycomb, not a country.
 */
export function lloydRelax(points: readonly Point[], bounds: Rect, iterations: number): Point[] {
	let current: Point[] = points.map((p) => ({ x: p.x, y: p.y }));
	const passes = Math.max(0, Math.floor(iterations));
	for (let pass = 0; pass < passes; pass += 1) {
		const cells = voronoiCells(current, bounds);
		current = current.map((p, i) => {
			const cell = cells[i];
			if (!cell || cell.length < 3) return p; // a collapsed cell has no centroid to move to
			const centre = polygonCentroid(cell);
			return {
				x: clamp(centre.x, bounds.x, bounds.x + bounds.w),
				y: clamp(centre.y, bounds.y, bounds.y + bounds.h),
			};
		});
	}
	return current.map((p) => normPoint(p.x, p.y));
}
