import { norm } from '../generation/types';
import type { Point, Ring } from './types';
import type { CellGrid } from './grid';
import { createGrid, gridGet, rasterizePolyline, rasterizeRing } from './grid';
import { ringArea } from './polygon';
import { chaikin, simplify } from './simplify';
import { clamp01 } from './vec';

/**
 * MARCHING SQUARES — the raster→vector bridge, and the single most load-bearing function in this kit.
 *
 * Every raster generator (cellular-automata caves, noise-thresholded biomes, drunkard's-walk tunnels,
 * the rasterized union of a hundred rooms) exits through here, because the persisted map model is
 * VECTORS in 0..1 space. A grid is a scratch buffer; this is the door back out of it.
 *
 * The pipeline, in order, is the one the research pass settled on:
 *   1. binarize the grid (any non-zero cell is solid) and march the 2×2 dual cells,
 *   2. place each crossing by linear interpolation along the sample edge,
 *   3. stitch the directed segments into CLOSED rings,
 *   4. keep the winding, which is what tells an island from a lake,
 *   5. Douglas–Peucker at `simplifyEpsilon` cells, then
 *   6. Chaikin at `smoothIterations`, then normalize to 0..1.
 *
 * THE TWO DECISIONS THAT MATTER
 *
 * (a) SADDLES. Cases 5 and 10 — the two configurations with solid on one diagonal and empty on the
 *     other — are genuinely ambiguous: the contour can either join the two solid corners or separate
 *     them, and both are valid isocontours. The rule here, applied to BOTH cases with no exceptions, is
 *     that SOLID IS 8-CONNECTED ACROSS A SADDLE (and empty is therefore 4-connected). A blob is never
 *     split into diagonal crumbs, a pillar stays one pillar, and — the reason this is not a style
 *     choice — the rule is the same in every cell, which is what keeps the stitched rings from
 *     self-intersecting. Inconsistency here is the classic marching-squares bug.
 *
 * (b) ORIENTATION. Every directed segment is emitted with SOLID on a fixed side. That single invariant
 *     does all the work: it makes each crossing point the start of exactly one segment (so stitching is
 *     a map lookup, not a search), and it falls out that an outer boundary winds CCW (positive
 *     `ringArea`) and a hole winds CW — with no post-hoc containment test.
 *
 * Sample points are cell CENTRES, and the sample lattice is extended one ring beyond the grid, where
 * `gridGet` reads 0. A blob that runs off the edge of the grid therefore still closes, against a
 * contour that lands exactly on the 0..1 boundary.
 */

export interface ContourOptions {
	/** Sub-cell interpolation of crossings. Default true — without it contours are visibly stair-stepped. */
	interpolate?: boolean;
	/** Douglas–Peucker epsilon in CELL units. Default 0.75. */
	simplifyEpsilon?: number;
	/** Chaikin passes. Default 2. Use 0 for crisp architecture, 2–3 for organic caves. */
	smoothIterations?: number;
	/** Drop rings whose |area| (in cells) is below this. Default 4. */
	minRingArea?: number;
}

/** The threshold. The field is binarized, so this sits exactly halfway between empty and solid — which
 *  puts every interpolated crossing exactly on the boundary the two cells share. */
const ISO = 0.5;

/** Edge ids. The lattice edge each crossing lives on, within one dual cell. */
const T = 0;
const R = 1;
const B = 2;
const L = 3;

/**
 * The 16 cases, as DIRECTED segments `[fromEdge, toEdge]`. Index bits: TL=8, TR=4, BR=2, BL=1.
 * Directions are chosen so solid is always on the same side of travel (see (b) above). Cases 5 and 10
 * are the saddles, resolved solid-8-connected (see (a)).
 */
const CASES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
	[], // 0  ....
	[[L, B]], // 1  BL
	[[B, R]], // 2  BR
	[[L, R]], // 3  BR BL
	[[R, T]], // 4  TR
	[
		[L, T],
		[R, B],
	], // 5  TR BL  — saddle
	[[B, T]], // 6  TR BR
	[[L, T]], // 7  TR BR BL
	[[T, L]], // 8  TL
	[[T, B]], // 9  TL BL
	[
		[T, R],
		[B, L],
	], // 10 TL BR  — saddle
	[[T, R]], // 11 TL BR BL
	[[R, L]], // 12 TL TR
	[[R, B]], // 13 TL TR BL
	[[B, L]], // 14 TL TR BR
	[], // 15 ....
];

/** The cases whose boundary turns a corner. Only these get the staircase vertex when `interpolate` is
 *  off; the straight cases have no corner to turn and the saddles have no unambiguous corner to turn at. */
const CORNER_CASES = new Set([1, 2, 4, 7, 8, 11, 13, 14]);

interface Segment {
	a: Point;
	b: Point;
	/** The cell-corner detour inserted when `interpolate` is off. */
	via?: Point;
}

export function contourGrid(g: CellGrid, options: ContourOptions = {}): Ring[] {
	const interpolate = options.interpolate ?? true;
	const epsilon = options.simplifyEpsilon ?? 0.75;
	const smoothIterations = options.smoothIterations ?? 2;
	const minRingArea = options.minRingArea ?? 4;
	if (g.w === 0 || g.h === 0) return [];

	const segments: Segment[] = [];
	// Sample lattice runs one beyond the grid on every side, where the field reads 0.
	for (let j = -1; j < g.h; j += 1) {
		for (let i = -1; i < g.w; i += 1) {
			const tl = solid(g, i, j);
			const tr = solid(g, i + 1, j);
			const br = solid(g, i + 1, j + 1);
			const bl = solid(g, i, j + 1);
			const code = tl * 8 + tr * 4 + br * 2 + bl * 1;
			const pairs = CASES[code] as ReadonlyArray<readonly [number, number]>;
			if (pairs.length === 0) continue;
			const via = !interpolate && CORNER_CASES.has(code) ? { x: i + 0.5, y: j + 0.5 } : undefined;
			for (const [from, to] of pairs) {
				const segment: Segment = {
					a: edgePoint(i, j, from, tl, tr, br, bl),
					b: edgePoint(i, j, to, tl, tr, br, bl),
				};
				if (via) segment.via = via;
				segments.push(segment);
			}
		}
	}
	if (segments.length === 0) return [];

	// Stitch. Solid-on-one-side means each crossing point starts exactly one segment, so a start-point
	// index turns ring-walking into a chain of lookups. Keys are quantized: the crossings are computed by
	// arithmetic on two different edges of two different cells and must compare equal anyway.
	const startAt = new Map<string, number>();
	for (let i = 0; i < segments.length; i += 1) {
		startAt.set(key((segments[i] as Segment).a), i);
	}

	const visited = new Uint8Array(segments.length);
	const rings: Ring[] = [];
	for (let seed = 0; seed < segments.length; seed += 1) {
		if (visited[seed] === 1) continue;
		const ring: Point[] = [];
		let index: number | undefined = seed;
		while (index !== undefined && visited[index] === 0) {
			visited[index] = 1;
			const segment = segments[index] as Segment;
			ring.push(segment.a);
			if (segment.via) ring.push(segment.via);
			index = startAt.get(key(segment.b));
		}
		const finished = finishRing(ring, epsilon, smoothIterations, minRingArea, g);
		if (finished) rings.push(finished);
	}
	return rings;
}

/**
 * THE wall-derivation primitive: rasterize rings and stroked polylines into one grid, then contour the
 * union. Overlapping rooms come back as ONE outline, a corridor fuses into the rooms it touches, and a
 * courtyard inside a keep comes back as a CW hole — and we get all of it without a polygon-boolean
 * library, which is the deal this function exists to make. Resolution is the only knob that matters:
 * two features closer together than one cell will merge.
 */
export function unionBoundary(
	input: {
		rings?: readonly Ring[];
		strokes?: ReadonlyArray<{ points: readonly Point[]; width: number }>;
	},
	options: ContourOptions & { resolution?: number } = {},
): Ring[] {
	const resolution = Math.max(8, Math.floor(options.resolution ?? 256));
	const g = createGrid(resolution, resolution, 0);
	for (const ring of input.rings ?? []) rasterizeRing(g, ring, 1);
	for (const stroke of input.strokes ?? []) rasterizePolyline(g, stroke.points, stroke.width, 1);
	return contourGrid(g, options);
}

function solid(g: CellGrid, x: number, y: number): number {
	return gridGet(g, x, y) > 0 ? 1 : 0;
}

/** Linear interpolation of the crossing along a sample edge. The field is binary, so `t` evaluates to
 *  exactly 0.5 — which IS the sub-cell answer here, because the sample points are cell centres and their
 *  midpoint is the boundary the two cells share. The lerp is written out rather than hard-coded so a
 *  scalar field (a heightmap thresholded at sea level) drops straight in. */
function crossing(va: number, vb: number): number {
	const span = vb - va;
	if (Math.abs(span) < 1e-12) return 0.5;
	const t = (ISO - va) / span;
	return t < 0 ? 0 : t > 1 ? 1 : t;
}

function edgePoint(
	i: number,
	j: number,
	edge: number,
	tl: number,
	tr: number,
	br: number,
	bl: number,
): Point {
	switch (edge) {
		case T:
			return { x: i + crossing(tl, tr), y: j };
		case R:
			return { x: i + 1, y: j + crossing(tr, br) };
		case B:
			return { x: i + crossing(bl, br), y: j + 1 };
		default:
			return { x: i, y: j + crossing(tl, bl) };
	}
}

function key(p: Point): string {
	return `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}`;
}

/**
 * Simplify → smooth → normalize one stitched ring, or drop it. Everything up to the last step happens in
 * CELL units, because that is where the caller's epsilon and minimum area are expressed: a
 * resolution-independent epsilon would mean something different on a 64² grid than on a 512² one.
 */
function finishRing(
	ring: Point[],
	epsilon: number,
	smoothIterations: number,
	minRingArea: number,
	g: CellGrid,
): Ring | null {
	const deduped = dedupeRing(ring);
	if (deduped.length < 3) return null;
	if (Math.abs(ringArea(deduped)) < minRingArea) return null;

	// Douglas–Peucker on a ring: close it, reduce it as a polyline, then drop the repeated endpoint. The
	// ring's first vertex is pinned as a side effect, which is harmless — it is a contour, not a path.
	const closed = [...deduped, deduped[0] as Point];
	const reduced = simplify(closed, epsilon);
	reduced.pop();
	if (reduced.length < 3) return null;

	const smoothed = chaikin(reduced, smoothIterations, true);
	if (smoothed.length < 3) return null;

	return smoothed.map((p) => ({
		x: norm(clamp01((p.x + 0.5) / g.w)),
		y: norm(clamp01((p.y + 0.5) / g.h)),
	}));
}

function dedupeRing(points: readonly Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
		out.push(p);
	}
	const head = out[0];
	const tail = out[out.length - 1];
	if (
		out.length > 1 &&
		head &&
		tail &&
		Math.abs(head.x - tail.x) < 1e-9 &&
		Math.abs(head.y - tail.y) < 1e-9
	) {
		out.pop();
	}
	return out;
}
