import type { Point } from './types';
import { pointToSegmentDistance } from './intersect';

/**
 * The raster scratch buffer.
 *
 * A grid is NEVER persisted. It exists inside one generator call, for exactly as long as it takes a
 * raster algorithm (cellular automata, noise threshold, drunkard's walk, a rasterized union of rooms) to
 * do the thing rasters are good at — and then `contourGrid` turns it back into rings and the grid is
 * thrown away. The persisted model is vectors in 0..1 space, always. Treating the grid as a scratch
 * buffer rather than a model is what keeps map documents small, editable and resolution-independent.
 *
 * Cell (x, y) covers the normalized box [x/w, (x+1)/w) × [y/h, (y+1)/h); its CENTRE — the sample point
 * every function here uses — is ((x + 0.5) / w, (y + 0.5) / h).
 */

export interface CellGrid {
	w: number;
	h: number;
	/** `cells[y * w + x]`; 1 = solid/filled, 0 = empty. */
	cells: Uint8Array;
}

export function createGrid(w: number, h: number, fill = 0): CellGrid {
	const width = Math.max(0, Math.floor(w));
	const height = Math.max(0, Math.floor(h));
	const cells = new Uint8Array(width * height);
	if (fill !== 0) cells.fill(fill);
	return { w: width, h: height, cells };
}

/** Out-of-bounds reads return 0 — the grid is surrounded by an infinite void, which is what makes a blob
 *  that touches the edge still close into a ring rather than dangling. */
export function gridGet(g: CellGrid, x: number, y: number): number {
	if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0;
	return g.cells[y * g.w + x] as number;
}

export function gridSet(g: CellGrid, x: number, y: number, v: number): void {
	if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
	g.cells[y * g.w + x] = v;
}

export function gridCount(g: CellGrid, value: number): number {
	let total = 0;
	for (let i = 0; i < g.cells.length; i += 1) {
		if (g.cells[i] === value) total += 1;
	}
	return total;
}

/**
 * 4-connected flood fill, returning one array of cell INDICES per connected region of cells equal to
 * `target`. Scanned in row-major order, so region order is deterministic and does not depend on a Set's
 * iteration order.
 *
 * This is the connectivity referee: a cave generator uses it to keep only the largest floor region (or to
 * tunnel the others into it), and a dungeon uses it to prove every room is reachable before it emits.
 */
export function floodRegions(g: CellGrid, target: number): number[][] {
	const seen = new Uint8Array(g.cells.length);
	const regions: number[][] = [];
	const stack: number[] = [];

	for (let start = 0; start < g.cells.length; start += 1) {
		if (seen[start] === 1 || g.cells[start] !== target) continue;
		const region: number[] = [];
		stack.push(start);
		seen[start] = 1;
		while (stack.length > 0) {
			const index = stack.pop() as number;
			region.push(index);
			const x = index % g.w;
			const y = (index - x) / g.w;
			if (x > 0) push(index - 1);
			if (x < g.w - 1) push(index + 1);
			if (y > 0) push(index - g.w);
			if (y < g.h - 1) push(index + g.w);
		}
		region.sort((a, b) => a - b);
		regions.push(region);
	}
	return regions;

	function push(index: number): void {
		if (seen[index] === 1 || g.cells[index] !== target) return;
		seen[index] = 1;
		stack.push(index);
	}
}

/**
 * Burn a normalized (0..1) ring into the grid as `value`. Scanline fill with the even-odd rule, sampled
 * at cell centres — so a ring rasterized and then contoured comes back where it started, and a
 * self-overlapping ring (the kind `offsetPolyline` happily produces at a hairpin) fills as its outline
 * rather than punching a hole in itself.
 */
export function rasterizeRing(g: CellGrid, ring: readonly Point[], value: number): void {
	if (ring.length < 3 || g.w === 0 || g.h === 0) return;

	// Ring in CELL coordinates, where the sample point of row y is y + 0.5.
	const rx = ring.map((p) => p.x * g.w);
	const ry = ring.map((p) => p.y * g.h);

	let minY = Infinity;
	let maxY = -Infinity;
	for (const y of ry) {
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	const firstRow = Math.max(0, Math.floor(minY - 0.5));
	const lastRow = Math.min(g.h - 1, Math.ceil(maxY));

	const crossings: number[] = [];
	for (let row = firstRow; row <= lastRow; row += 1) {
		const sampleY = row + 0.5;
		crossings.length = 0;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
			const ay = ry[j] as number;
			const by = ry[i] as number;
			// Half-open in y so a vertex on the scanline is counted exactly once.
			if (ay > sampleY === by > sampleY) continue;
			const ax = rx[j] as number;
			const bx = rx[i] as number;
			crossings.push(ax + ((sampleY - ay) / (by - ay)) * (bx - ax));
		}
		if (crossings.length < 2) continue;
		crossings.sort((a, b) => a - b);
		for (let i = 0; i + 1 < crossings.length; i += 2) {
			const from = crossings[i] as number;
			const to = crossings[i + 1] as number;
			const startX = Math.max(0, Math.ceil(from - 0.5));
			const endX = Math.min(g.w - 1, Math.floor(to - 0.5));
			for (let x = startX; x <= endX; x += 1) g.cells[row * g.w + x] = value;
		}
	}
}

/**
 * Burn a normalized (0..1) polyline of normalized `width` into the grid. A cell is burned when its CENTRE
 * lies within `width / 2` of the polyline — so a stroke of width w across a grid of resolution R covers
 * w·R cells, which is the property `unionBoundary` relies on to make a 0.02-wide corridor actually two
 * cells wide at resolution 100.
 *
 * A sub-cell width would otherwise burn nothing at all, so the containing cell of every point along the
 * path is burned unconditionally: a hairline corridor still connects the rooms it was drawn to connect.
 */
export function rasterizePolyline(
	g: CellGrid,
	points: readonly Point[],
	width: number,
	value: number,
): void {
	if (points.length === 0 || g.w === 0 || g.h === 0) return;
	const radius = Math.max(0, width) / 2;

	if (points.length === 1) {
		stampDisc(g, points[0] as Point, radius, value);
		return;
	}

	for (let i = 0; i + 1 < points.length; i += 1) {
		const a = points[i] as Point;
		const b = points[i + 1] as Point;

		// Every cell whose centre is within `radius` of the segment, searched over the segment's padded
		// bounding box in cell space.
		const minX = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius) * g.w - 0.5));
		const maxX = Math.min(g.w - 1, Math.ceil((Math.max(a.x, b.x) + radius) * g.w));
		const minY = Math.max(0, Math.floor((Math.min(a.y, b.y) - radius) * g.h - 0.5));
		const maxY = Math.min(g.h - 1, Math.ceil((Math.max(a.y, b.y) + radius) * g.h));
		for (let y = minY; y <= maxY; y += 1) {
			for (let x = minX; x <= maxX; x += 1) {
				const centre = { x: (x + 0.5) / g.w, y: (y + 0.5) / g.h };
				if (pointToSegmentDistance(centre, a, b) <= radius) g.cells[y * g.w + x] = value;
			}
		}

		// Guarantee connectivity for widths below one cell: walk the segment and burn what it passes over.
		const steps = Math.max(
			1,
			Math.ceil(Math.max(Math.abs(b.x - a.x) * g.w, Math.abs(b.y - a.y) * g.h) * 2),
		);
		for (let s = 0; s <= steps; s += 1) {
			const t = s / steps;
			const px = Math.floor((a.x + (b.x - a.x) * t) * g.w);
			const py = Math.floor((a.y + (b.y - a.y) * t) * g.h);
			gridSet(g, px, py, value);
		}
	}
}

function stampDisc(g: CellGrid, p: Point, radius: number, value: number): void {
	const minX = Math.max(0, Math.floor((p.x - radius) * g.w - 0.5));
	const maxX = Math.min(g.w - 1, Math.ceil((p.x + radius) * g.w));
	const minY = Math.max(0, Math.floor((p.y - radius) * g.h - 0.5));
	const maxY = Math.min(g.h - 1, Math.ceil((p.y + radius) * g.h));
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const dx = (x + 0.5) / g.w - p.x;
			const dy = (y + 0.5) / g.h - p.y;
			if (Math.sqrt(dx * dx + dy * dy) <= radius) g.cells[y * g.w + x] = value;
		}
	}
	gridSet(g, Math.floor(p.x * g.w), Math.floor(p.y * g.h), value);
}
