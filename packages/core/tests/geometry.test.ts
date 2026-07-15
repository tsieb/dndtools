import { describe, expect, it } from 'vitest';

import {
	boundsOf,
	chaikin,
	contourGrid,
	createGrid,
	createValueNoise,
	delaunay,
	distanceField,
	domainWarp,
	fbm,
	floodRegions,
	gridCount,
	gridGet,
	gridSet,
	dist,
	isClockwise,
	lloydRelax,
	minimumSpanningTree,
	offsetPolyline,
	poissonDisk,
	pointInRing,
	pointToSegmentDistance,
	rasterizeRing,
	rectToRing,
	resample,
	ringArea,
	ringPerimeter,
	segmentIntersection,
	segmentsIntersect,
	simplify,
	unionBoundary,
	voronoiCells,
	type CellGrid,
	type Point,
	type Ring,
} from '../src/geometry/index';
import { createRng } from '../src/state/prng';

/**
 * The geometry kit's contract tests. Two properties carry the most weight and are asserted everywhere:
 * winding sign (positive = outer boundary, negative = hole — the whole island/lake distinction rests on
 * it) and determinism (no ambient entropy anywhere, so the same seed twice is the same bytes twice).
 */

/** Fill a rectangular block of cells, in grid coordinates. */
function fillBlock(g: CellGrid, x0: number, y0: number, x1: number, y1: number, v = 1): void {
	for (let y = y0; y <= y1; y += 1) {
		for (let x = x0; x <= x1; x += 1) gridSet(g, x, y, v);
	}
}

describe('simplify / chaikin / resample', () => {
	it('Douglas-Peucker drops collinear interior points and keeps the endpoints', () => {
		const line: Point[] = [
			{ x: 0, y: 0 },
			{ x: 0.25, y: 0 },
			{ x: 0.5, y: 0 },
			{ x: 0.75, y: 0 },
			{ x: 1, y: 0 },
		];
		expect(simplify(line, 0.01)).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		]);
	});

	it('Douglas-Peucker keeps a deviation above epsilon and drops one below', () => {
		const bump: Point[] = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.2 },
			{ x: 1, y: 0 },
		];
		expect(simplify(bump, 0.1)).toHaveLength(3);
		expect(simplify(bump, 0.5)).toHaveLength(2);
	});

	it('does not mutate its input', () => {
		const input: Point[] = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.2 },
			{ x: 1, y: 0 },
		];
		const before = JSON.stringify(input);
		simplify(input, 0.5);
		chaikin(input, 2, false);
		resample(input, 0.1);
		expect(JSON.stringify(input)).toBe(before);
	});

	it('chaikin cuts corners, keeps open endpoints, and closes a ring', () => {
		const open: Point[] = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
		];
		const smoothedOpen = chaikin(open, 1, false);
		expect(smoothedOpen[0]).toEqual({ x: 0, y: 0 });
		expect(smoothedOpen[smoothedOpen.length - 1]).toEqual({ x: 1, y: 1 });
		expect(smoothedOpen).toHaveLength(6);

		// Closed: every corner is cut, including the wrap-around one, so 2 points per edge and no endpoints.
		const closed = chaikin(rectToRing({ x: 0, y: 0, w: 1, h: 1 }), 1, true);
		expect(closed).toHaveLength(8);
		// Smoothing preserves winding (a reversed ring here would flip every hole into an island).
		expect(ringArea(closed)).toBeGreaterThan(0);
	});

	it('resample produces roughly-even spacing and preserves both endpoints', () => {
		const line: Point[] = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		];
		const out = resample(line, 0.25);
		expect(out[0]).toEqual({ x: 0, y: 0 });
		expect(out[out.length - 1]).toEqual({ x: 1, y: 0 });
		for (let i = 1; i < out.length; i += 1) {
			expect(dist(out[i - 1] as Point, out[i] as Point)).toBeGreaterThan(0.1);
			expect(dist(out[i - 1] as Point, out[i] as Point)).toBeLessThanOrEqual(0.26);
		}
	});
});

describe('polygon', () => {
	const square = rectToRing({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });

	it('rectToRing is CCW by ringArea sign, and the reverse is CW', () => {
		expect(ringArea(square)).toBeGreaterThan(0);
		expect(ringArea(square)).toBeCloseTo(0.36, 9);
		expect(isClockwise(square)).toBe(false);
		expect(isClockwise([...square].reverse())).toBe(true);
		expect(ringArea([...square].reverse())).toBeCloseTo(-0.36, 9);
	});

	it('ringPerimeter includes the implicit closing edge', () => {
		expect(ringPerimeter(square)).toBeCloseTo(2.4, 9);
	});

	it('pointInRing uses the even-odd rule', () => {
		expect(pointInRing(square, { x: 0.5, y: 0.5 })).toBe(true);
		expect(pointInRing(square, { x: 0.1, y: 0.5 })).toBe(false);
		expect(pointInRing(square, { x: 0.9, y: 0.9 })).toBe(false);
	});

	it('offsetPolyline strokes a line into a closed CCW ring that contains the line', () => {
		const stroke = offsetPolyline(
			[
				{ x: 0.2, y: 0.5 },
				{ x: 0.8, y: 0.5 },
			],
			0.05,
		);
		expect(stroke.length).toBeGreaterThan(4);
		// Closed by convention: the first point is NOT repeated at the end.
		expect(stroke[0]).not.toEqual(stroke[stroke.length - 1]);
		expect(ringArea(stroke)).toBeGreaterThan(0);
		// A capsule: 0.6 x 0.1 body plus the two half-discs.
		expect(Math.abs(ringArea(stroke))).toBeGreaterThan(0.06);
		expect(Math.abs(ringArea(stroke))).toBeLessThan(0.08);
		expect(pointInRing(stroke, { x: 0.5, y: 0.5 })).toBe(true);
		expect(pointInRing(stroke, { x: 0.5, y: 0.54 })).toBe(true);
		expect(pointInRing(stroke, { x: 0.5, y: 0.6 })).toBe(false);
	});

	it('offsetPolyline degrades to a disc for a single point, and to nothing for none', () => {
		expect(offsetPolyline([{ x: 0.5, y: 0.5 }], 0.1).length).toBeGreaterThan(6);
		expect(offsetPolyline([], 0.1)).toEqual([]);
	});
});

describe('grid', () => {
	it('reads out of bounds as 0 and counts values', () => {
		const g = createGrid(4, 4, 0);
		gridSet(g, 1, 1, 1);
		expect(gridGet(g, 1, 1)).toBe(1);
		expect(gridGet(g, -1, 0)).toBe(0);
		expect(gridGet(g, 4, 0)).toBe(0);
		expect(gridCount(g, 1)).toBe(1);
		expect(gridCount(g, 0)).toBe(15);
	});

	it('floodRegions finds 4-connected regions and ignores diagonal touches', () => {
		const g = createGrid(5, 5, 0);
		fillBlock(g, 0, 0, 1, 1);
		fillBlock(g, 3, 3, 4, 4); // touches nothing
		gridSet(g, 2, 2, 1); // diagonal-only bridge between the two blocks
		expect(floodRegions(g, 1)).toHaveLength(3);
	});

	it('rasterizeRing burns a normalized rect at the expected cell count', () => {
		const g = createGrid(10, 10, 0);
		rasterizeRing(g, rectToRing({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }), 1);
		expect(gridCount(g, 1)).toBe(16); // cells 3..6 in both axes
		expect(gridGet(g, 3, 3)).toBe(1);
		expect(gridGet(g, 6, 6)).toBe(1);
		expect(gridGet(g, 2, 3)).toBe(0);
		expect(gridGet(g, 7, 3)).toBe(0);
	});
});

describe('contourGrid', () => {
	it('a solid block yields ONE CCW ring at the expected bounds', () => {
		const g = createGrid(10, 10, 0);
		fillBlock(g, 3, 3, 6, 6); // a 4x4 block
		const rings = contourGrid(g, { smoothIterations: 0, simplifyEpsilon: 0.1 });
		expect(rings).toHaveLength(1);

		const ring = rings[0] as Ring;
		expect(ringArea(ring)).toBeGreaterThan(0); // outer boundary = CCW
		const b = boundsOf(ring);
		// The contour lands on the cell BOUNDARY between the solid and empty cells: cells 3..6 of 10 span
		// normalized 0.30..0.70, and that is exactly where the interpolated crossings put it.
		expect(b.x).toBeCloseTo(0.3, 6);
		expect(b.y).toBeCloseTo(0.3, 6);
		expect(b.x + b.w).toBeCloseTo(0.7, 6);
		expect(b.y + b.h).toBeCloseTo(0.7, 6);
		for (const p of ring) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(1);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(1);
		}
	});

	it('a block with a hole yields an outer CCW ring and an inner CW ring', () => {
		const g = createGrid(16, 16, 0);
		fillBlock(g, 3, 3, 12, 12);
		fillBlock(g, 6, 6, 9, 9, 0); // punch a hole
		const rings = contourGrid(g, { smoothIterations: 0, simplifyEpsilon: 0.1 });
		expect(rings).toHaveLength(2);

		const areas = rings.map(ringArea);
		const outer = areas.filter((a) => a > 0);
		const holes = areas.filter((a) => a < 0);
		expect(outer).toHaveLength(1);
		expect(holes).toHaveLength(1);
		// The hole is inside the outer ring, and smaller.
		const outerRing = rings[areas.indexOf(outer[0] as number)] as Ring;
		const holeRing = rings[areas.indexOf(holes[0] as number)] as Ring;
		expect(Math.abs(holes[0] as number)).toBeLessThan(outer[0] as number);
		expect(pointInRing(outerRing, { x: 0.5, y: 0.5 })).toBe(true);
		expect(pointInRing(holeRing, { x: 0.5, y: 0.5 })).toBe(true);
	});

	it('two solid cells touching only diagonally stay ONE ring (the saddle rule: solid is 8-connected)', () => {
		const g = createGrid(12, 12, 0);
		fillBlock(g, 2, 2, 5, 5);
		fillBlock(g, 6, 6, 9, 9); // shares exactly one corner with the first block
		const rings = contourGrid(g, { smoothIterations: 0, simplifyEpsilon: 0.1 });
		expect(rings).toHaveLength(1);
		expect(ringArea(rings[0] as Ring)).toBeGreaterThan(0);
	});

	it('drops rings below minRingArea', () => {
		const g = createGrid(20, 20, 0);
		fillBlock(g, 5, 5, 12, 12);
		gridSet(g, 18, 18, 1); // a one-cell speck; its contour is a diamond of area 0.5 cells
		const crisp = { simplifyEpsilon: 0.1, smoothIterations: 0 };
		expect(contourGrid(g, { ...crisp, minRingArea: 4 })).toHaveLength(1);
		expect(contourGrid(g, { ...crisp, minRingArea: 0.1 })).toHaveLength(2);
		// The DEFAULT 0.75-cell epsilon also removes the speck: a one-cell diamond cannot survive it.
		expect(contourGrid(g)).toHaveLength(1);
	});

	it('an empty grid and a full grid both behave', () => {
		expect(contourGrid(createGrid(8, 8, 0))).toEqual([]);
		const full = createGrid(8, 8, 1);
		const rings = contourGrid(full, { smoothIterations: 0, simplifyEpsilon: 0.1 });
		expect(rings).toHaveLength(1);
		const b = boundsOf(rings[0] as Ring);
		expect(b.x).toBeCloseTo(0, 6);
		expect(b.y).toBeCloseTo(0, 6);
		expect(b.w).toBeCloseTo(1, 6);
		expect(b.h).toBeCloseTo(1, 6);
	});

	it('smoothing and simplification reduce the vertex count without flipping winding', () => {
		const g = createGrid(32, 32, 0);
		fillBlock(g, 4, 4, 27, 27);
		const raw = contourGrid(g, { simplifyEpsilon: 0, smoothIterations: 0 }) as Ring[];
		const tidy = contourGrid(g, { simplifyEpsilon: 1, smoothIterations: 2 }) as Ring[];
		expect((tidy[0] as Ring).length).toBeLessThan((raw[0] as Ring).length);
		expect(ringArea(tidy[0] as Ring)).toBeGreaterThan(0);
	});

	it('is deterministic', () => {
		const g = createGrid(24, 24, 0);
		fillBlock(g, 3, 5, 18, 16);
		expect(contourGrid(g)).toEqual(contourGrid(g));
	});
});

describe('unionBoundary', () => {
	it('two overlapping rects merge into ONE ring', () => {
		const rings = unionBoundary(
			{
				rings: [
					rectToRing({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }),
					rectToRing({ x: 0.4, y: 0.3, w: 0.3, h: 0.3 }),
				],
			},
			{ resolution: 128, smoothIterations: 0, simplifyEpsilon: 0.5 },
		);
		expect(rings).toHaveLength(1);
		const ring = rings[0] as Ring;
		expect(ringArea(ring)).toBeGreaterThan(0);
		// The union spans both rects.
		const b = boundsOf(ring);
		expect(b.x).toBeCloseTo(0.2, 2);
		expect(b.y).toBeCloseTo(0.2, 2);
		expect(b.x + b.w).toBeCloseTo(0.7, 2);
		expect(b.y + b.h).toBeCloseTo(0.6, 2);
		// Both rect interiors survive the merge.
		expect(pointInRing(ring, { x: 0.3, y: 0.3 })).toBe(true);
		expect(pointInRing(ring, { x: 0.6, y: 0.5 })).toBe(true);
		// The notch between them does not.
		expect(pointInRing(ring, { x: 0.6, y: 0.25 })).toBe(false);
	});

	it('two DISJOINT rects stay two rings', () => {
		const rings = unionBoundary(
			{
				rings: [
					rectToRing({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
					rectToRing({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 }),
				],
			},
			{ resolution: 128, smoothIterations: 0 },
		);
		expect(rings).toHaveLength(2);
	});

	it('a stroke fuses two disjoint rooms into one ring — the wall-derivation case', () => {
		const rings = unionBoundary(
			{
				rings: [
					rectToRing({ x: 0.1, y: 0.4, w: 0.2, h: 0.2 }),
					rectToRing({ x: 0.7, y: 0.4, w: 0.2, h: 0.2 }),
				],
				strokes: [
					{
						points: [
							{ x: 0.2, y: 0.5 },
							{ x: 0.8, y: 0.5 },
						],
						width: 0.04,
					},
				],
			},
			{ resolution: 128, smoothIterations: 0, simplifyEpsilon: 0.5 },
		);
		expect(rings).toHaveLength(1);
		expect(pointInRing(rings[0] as Ring, { x: 0.5, y: 0.5 })).toBe(true);
		expect(pointInRing(rings[0] as Ring, { x: 0.5, y: 0.3 })).toBe(false);
	});

	it('a rect with a rect punched through it comes back as CCW outer + CW hole', () => {
		// A ring-shaped keep: rasterize four walls as strokes around a courtyard.
		const rings = unionBoundary(
			{
				strokes: [
					{
						points: [
							{ x: 0.2, y: 0.2 },
							{ x: 0.8, y: 0.2 },
							{ x: 0.8, y: 0.8 },
							{ x: 0.2, y: 0.8 },
							{ x: 0.2, y: 0.2 },
						],
						width: 0.06,
					},
				],
			},
			{ resolution: 128, smoothIterations: 0, simplifyEpsilon: 0.5 },
		);
		expect(rings).toHaveLength(2);
		const areas = rings.map(ringArea).sort((a, b) => a - b);
		expect(areas[0]).toBeLessThan(0); // the courtyard is a hole
		expect(areas[1]).toBeGreaterThan(0); // the outer wall face is a boundary
	});

	it('an empty input yields no rings', () => {
		expect(unionBoundary({})).toEqual([]);
	});
});

describe('delaunay / MST / voronoi', () => {
	const square: Point[] = [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
		{ x: 0, y: 1 },
	];

	it('a square triangulates into 2 triangles and 5 edges', () => {
		const t = delaunay(square);
		expect(t.triangles).toHaveLength(6); // 2 triangles × 3 indices
		expect(t.edges).toHaveLength(5); // 4 sides + 1 diagonal
		expect(t.points).toHaveLength(4);
	});

	it('every triangle indexes real points and every edge is sorted + unique', () => {
		const rng = createRng('delaunay');
		const points: Point[] = [];
		for (let i = 0; i < 40; i += 1) points.push({ x: rng.next(), y: rng.next() });
		const t = delaunay(points);
		expect(t.triangles.length % 3).toBe(0);
		for (const index of t.triangles) {
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(points.length);
		}
		const seen = new Set<string>();
		for (const [a, b] of t.edges) {
			expect(a).toBeLessThan(b);
			expect(seen.has(`${a}:${b}`)).toBe(false);
			seen.add(`${a}:${b}`);
		}
	});

	it('degenerate input does NOT throw and yields a trivial edge set', () => {
		expect(() => delaunay([])).not.toThrow();
		expect(delaunay([]).triangles).toEqual([]);
		expect(delaunay([]).edges).toEqual([]);

		expect(delaunay([{ x: 0.5, y: 0.5 }]).edges).toEqual([]);

		const two = delaunay([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		]);
		expect(two.triangles).toEqual([]);
		expect(two.edges).toEqual([[0, 1]]);

		// All-collinear: no triangles, but a chain along the line so the MST still spans.
		const collinear = delaunay([
			{ x: 0, y: 0 },
			{ x: 0.25, y: 0.25 },
			{ x: 0.5, y: 0.5 },
			{ x: 1, y: 1 },
		]);
		expect(collinear.triangles).toEqual([]);
		expect(collinear.edges).toHaveLength(3);

		// Exact duplicates collapse rather than producing zero-area triangles.
		const dupes = delaunay([
			{ x: 0, y: 0 },
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
		]);
		expect(dupes.triangles).toHaveLength(3);
		expect(() => delaunay([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }])).not.toThrow();
	});

	it('is deterministic for the same input', () => {
		const rng = createRng(7);
		const points: Point[] = [];
		for (let i = 0; i < 30; i += 1) points.push({ x: rng.next(), y: rng.next() });
		expect(delaunay(points)).toEqual(delaunay(points));
	});

	it('the MST of n points has n-1 edges and connects every one of them', () => {
		const rng = createRng('mst');
		const points: Point[] = [];
		for (let i = 0; i < 25; i += 1) points.push({ x: rng.next(), y: rng.next() });
		const t = delaunay(points);
		const tree = minimumSpanningTree(points, t.edges);
		expect(tree).toHaveLength(points.length - 1);

		// Every node reachable from node 0.
		const adjacency = new Map<number, number[]>();
		for (const [a, b] of tree) {
			adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
			adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
		}
		const seen = new Set<number>([0]);
		const stack = [0];
		while (stack.length > 0) {
			for (const next of adjacency.get(stack.pop() as number) ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				stack.push(next);
			}
		}
		expect(seen.size).toBe(points.length);
	});

	it('the MST of a square picks the three cheapest sides, never the diagonal', () => {
		const tree = minimumSpanningTree(square, delaunay(square).edges);
		expect(tree).toHaveLength(3);
		for (const [a, b] of tree) {
			expect(dist(square[a] as Point, square[b] as Point)).toBeCloseTo(1, 9);
		}
	});

	it('voronoiCells returns one cell per point, each inside the bounds and containing its own site', () => {
		const bounds = { x: 0, y: 0, w: 1, h: 1 };
		const rng = createRng('voronoi');
		const points: Point[] = [];
		for (let i = 0; i < 20; i += 1) points.push({ x: rng.next(), y: rng.next() });

		const cells = voronoiCells(points, bounds);
		expect(cells).toHaveLength(points.length);

		let totalArea = 0;
		for (let i = 0; i < cells.length; i += 1) {
			const cell = cells[i] as Ring;
			expect(cell.length).toBeGreaterThanOrEqual(3);
			expect(ringArea(cell)).toBeGreaterThan(0); // clipping preserves the CCW subject winding
			for (const p of cell) {
				expect(p.x).toBeGreaterThanOrEqual(-1e-6);
				expect(p.x).toBeLessThanOrEqual(1 + 1e-6);
				expect(p.y).toBeGreaterThanOrEqual(-1e-6);
				expect(p.y).toBeLessThanOrEqual(1 + 1e-6);
			}
			expect(pointInRing(cell, points[i] as Point)).toBe(true);
			totalArea += ringArea(cell);
		}
		// The cells tile the bounds exactly — no gaps, no overlap.
		expect(totalArea).toBeCloseTo(1, 4);
	});

	it('lloydRelax evens out a clumped set and stays inside the bounds', () => {
		const bounds = { x: 0, y: 0, w: 1, h: 1 };
		const rng = createRng('lloyd');
		const points: Point[] = [];
		// Deliberately clumped into the top-left quadrant.
		for (let i = 0; i < 16; i += 1) points.push({ x: rng.next() * 0.4, y: rng.next() * 0.4 });

		const spread = (ps: readonly Point[]): number => {
			let worst = Infinity;
			for (let i = 0; i < ps.length; i += 1) {
				for (let j = i + 1; j < ps.length; j += 1) {
					worst = Math.min(worst, dist(ps[i] as Point, ps[j] as Point));
				}
			}
			return worst;
		};

		const relaxed = lloydRelax(points, bounds, 3);
		expect(relaxed).toHaveLength(points.length);
		expect(spread(relaxed)).toBeGreaterThan(spread(points));
		for (const p of relaxed) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(1);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(1);
		}
		expect(lloydRelax(points, bounds, 3)).toEqual(relaxed); // deterministic
	});
});

describe('poissonDisk', () => {
	it('respects the minimum radius and the bounds', () => {
		const radius = 0.08;
		const samples = poissonDisk(createRng('poisson'), { radius });
		expect(samples.length).toBeGreaterThan(50);
		for (let i = 0; i < samples.length; i += 1) {
			const a = samples[i] as Point;
			expect(a.x).toBeGreaterThanOrEqual(0);
			expect(a.x).toBeLessThanOrEqual(1);
			expect(a.y).toBeGreaterThanOrEqual(0);
			expect(a.y).toBeLessThanOrEqual(1);
			for (let j = i + 1; j < samples.length; j += 1) {
				// 1e-6 of slack for the norm() rounding on the emitted coordinates.
				expect(dist(a, samples[j] as Point)).toBeGreaterThanOrEqual(radius - 1e-6);
			}
		}
	});

	it('honours the accept mask — nothing lands outside it', () => {
		const inside = (p: Point): boolean => dist(p, { x: 0.5, y: 0.5 }) < 0.25;
		const samples = poissonDisk(createRng('mask'), { radius: 0.05, accept: inside });
		expect(samples.length).toBeGreaterThan(10);
		for (const p of samples) expect(inside(p)).toBe(true);
	});

	it('honours maxSamples, bounds, and seedPoints', () => {
		const capped = poissonDisk(createRng('cap'), { radius: 0.02, maxSamples: 12 });
		expect(capped).toHaveLength(12);

		const bounded = poissonDisk(createRng('bounds'), {
			radius: 0.05,
			bounds: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
		});
		expect(bounded.length).toBeGreaterThan(5);
		for (const p of bounded) {
			expect(p.x).toBeGreaterThanOrEqual(0.5);
			expect(p.y).toBeGreaterThanOrEqual(0.5);
		}

		const seeded = poissonDisk(createRng('seeded'), {
			radius: 0.1,
			seedPoints: [{ x: 0.5, y: 0.5 }],
		});
		expect(seeded[0]).toEqual({ x: 0.5, y: 0.5 });
	});

	it('variable radius makes one half dense and the other sparse, spacing still guaranteed', () => {
		const radiusAt = (p: Point): number => (p.x < 0.5 ? 0.04 : 0.16);
		const samples = poissonDisk(createRng('variable'), { radius: 0.04, radiusAt });
		const left = samples.filter((p) => p.x < 0.5).length;
		const right = samples.length - left;
		expect(left).toBeGreaterThan(right * 3);
		for (let i = 0; i < samples.length; i += 1) {
			for (let j = i + 1; j < samples.length; j += 1) {
				const a = samples[i] as Point;
				const b = samples[j] as Point;
				const required = Math.max(radiusAt(a), radiusAt(b));
				expect(dist(a, b)).toBeGreaterThanOrEqual(required - 1e-6);
			}
		}
	});

	it('is deterministic per seed and differs across seeds', () => {
		const a = poissonDisk(createRng('alpha'), { radius: 0.1 });
		const b = poissonDisk(createRng('alpha'), { radius: 0.1 });
		const c = poissonDisk(createRng('beta'), { radius: 0.1 });
		expect(a).toEqual(b);
		expect(a).not.toEqual(c);
	});
});

describe('noise', () => {
	it('is deterministic for a seed and differs across seeds', () => {
		const a = createValueNoise(1234);
		const b = createValueNoise(1234);
		const c = createValueNoise(1235);
		let differs = false;
		for (let i = 0; i < 50; i += 1) {
			const x = i * 0.37;
			const y = i * 0.11;
			expect(a.at(x, y)).toBe(b.at(x, y));
			if (a.at(x, y) !== c.at(x, y)) differs = true;
		}
		expect(differs).toBe(true);
	});

	it('stays roughly within -1..1 and is smooth (no lattice discontinuity)', () => {
		const noise = createValueNoise(99);
		let last = noise.at(0, 0.5);
		for (let i = 1; i <= 400; i += 1) {
			const v = noise.at(i * 0.01, 0.5);
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
			// Quintic interpolation: a 0.01 step cannot jump the whole range.
			expect(Math.abs(v - last)).toBeLessThan(0.2);
			last = v;
		}
	});

	it('lattice points are exact and repeatable regardless of sampling order', () => {
		const noise = createValueNoise(7);
		const forward: number[] = [];
		for (let i = 0; i < 10; i += 1) forward.push(noise.at(i, i));
		const backward: number[] = [];
		for (let i = 9; i >= 0; i -= 1) backward.unshift(noise.at(i, i));
		expect(forward).toEqual(backward);
	});

	it('fbm stays in range, is deterministic, and adds detail', () => {
		const base = createValueNoise(5);
		const one = fbm(base, { octaves: 1 });
		const many = fbm(base, { octaves: 6 });
		let oneVariation = 0;
		let manyVariation = 0;
		for (let i = 1; i <= 200; i += 1) {
			const x = i * 0.02;
			const v = many.at(x, 0.3);
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
			expect(many.at(x, 0.3)).toBe(many.at(x, 0.3));
			oneVariation += Math.abs(one.at(x, 0.3) - one.at(x - 0.02, 0.3));
			manyVariation += Math.abs(many.at(x, 0.3) - many.at(x - 0.02, 0.3));
		}
		// More octaves ⇒ more high-frequency detail per unit length.
		expect(manyVariation).toBeGreaterThan(oneVariation);
	});

	it('domainWarp displaces the field and is deterministic', () => {
		const field = createValueNoise(11);
		const warp = createValueNoise(12);
		const warped = domainWarp(field, warp, 0.5);
		let differs = false;
		for (let i = 0; i < 30; i += 1) {
			const x = i * 0.13;
			expect(warped.at(x, 0.2)).toBe(warped.at(x, 0.2));
			if (warped.at(x, 0.2) !== field.at(x, 0.2)) differs = true;
		}
		expect(differs).toBe(true);
		// Zero strength is the identity.
		expect(domainWarp(field, warp, 0).at(0.3, 0.4)).toBe(field.at(0.3, 0.4));
	});
});

describe('distanceField', () => {
	it('measures the chamfer distance to the nearest target cell', () => {
		const g = createGrid(5, 5, 0);
		gridSet(g, 2, 2, 1);
		const field = distanceField(g, 1);
		expect(field[2 * 5 + 2]).toBe(0);
		expect(field[2 * 5 + 3]).toBeCloseTo(1, 6); // orthogonal neighbour
		expect(field[3 * 5 + 3]).toBeCloseTo(Math.SQRT2, 6); // diagonal neighbour
		expect(field[0]).toBeCloseTo(2 * Math.SQRT2, 6); // the corner, two diagonal steps out
		expect(field[4 * 5 + 4]).toBeCloseTo(2 * Math.SQRT2, 6);
	});

	it('a target-free grid is entirely Infinity, and a full grid entirely 0', () => {
		const empty = createGrid(4, 4, 0);
		expect([...distanceField(empty, 1)].every((v) => v === Infinity)).toBe(true);
		const full = createGrid(4, 4, 1);
		expect([...distanceField(full, 1)].every((v) => v === 0)).toBe(true);
	});

	it('finds the deepest point of a cave — the distance-field maximum', () => {
		const g = createGrid(21, 21, 1);
		fillBlock(g, 0, 0, 20, 20, 1);
		const field = distanceField(g, 0); // distance to the nearest EMPTY cell (there are none inside)
		// With walls only outside the grid, every cell is Infinity — so carve an opening and re-measure.
		expect(field.every((v) => v === Infinity)).toBe(true);
		gridSet(g, 10, 10, 0);
		const carved = distanceField(g, 0);
		expect(carved[10 * 21 + 10]).toBe(0);
		expect(carved[10 * 21 + 11]).toBeCloseTo(1, 6);
	});
});

describe('intersect', () => {
	it('finds the crossing of two segments, and null when they miss', () => {
		const hit = segmentIntersection(
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
			{ x: 1, y: 0 },
		);
		expect(hit?.x).toBeCloseTo(0.5, 9);
		expect(hit?.y).toBeCloseTo(0.5, 9);
		expect(
			segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }),
		).toBeNull();
		expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(
			true,
		);
		expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(
			false,
		);
	});

	it('measures point-to-segment distance, clamping to the endpoints', () => {
		const a = { x: 0, y: 0 };
		const b = { x: 1, y: 0 };
		expect(pointToSegmentDistance({ x: 0.5, y: 0.5 }, a, b)).toBeCloseTo(0.5, 9);
		expect(pointToSegmentDistance({ x: 2, y: 0 }, a, b)).toBeCloseTo(1, 9); // past the end
		expect(pointToSegmentDistance({ x: -1, y: 0 }, a, b)).toBeCloseTo(1, 9); // before the start
		expect(pointToSegmentDistance({ x: 0.5, y: 0 }, a, a)).toBeCloseTo(0.5, 9); // degenerate segment
	});
});
