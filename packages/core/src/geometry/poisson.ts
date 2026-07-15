import { normPoint } from '../generation/types';
import type { SeededRng } from '../state/prng';
import type { Point, Rect } from './types';
import { dist2 } from './vec';

/**
 * Bridson's Poisson-disk sampling — blue noise, in O(N).
 *
 * This is the correct way to scatter ANYTHING: trees, rubble, torches, encounter markers, Voronoi seeds,
 * settlement sites. Uniform random scatter clumps (that is what uniform means), and a jittered grid reads
 * as a grid. Blue noise is the thing a person means when they say "randomly placed".
 *
 * The background grid holds at most one sample per cell (cell size r/√2), so the "is anything too close"
 * test is a fixed-size neighbourhood scan rather than a search — that is where the O(N) comes from.
 *
 * `radiusAt` is the move that makes this worth having: a radius that VARIES with position gives dense
 * scatter in the clearing and sparse scatter on the rock, from one call, with the spacing guarantee still
 * holding. Two samples are kept apart by the LARGER of their two radii, which is what makes the sparse
 * region genuinely sparse instead of merely thinned.
 */

export interface PoissonOptions {
	/** Minimum distance between samples, in normalized units. */
	radius: number;
	/** Candidates per active sample; default 30. Lower is faster and leaves gaps. */
	k?: number;
	/** Hard cap; default 5000. */
	maxSamples?: number;
	/** Default `{ x: 0, y: 0, w: 1, h: 1 }`. */
	bounds?: Rect;
	/** Variable-radius Poisson: dense here, sparse there. Overrides `radius` when provided. */
	radiusAt?: (p: Point) => number;
	/** Reject samples outside a mask (e.g. only inside the floor polygons). */
	accept?: (p: Point) => boolean;
	/** Start the active list from these instead of one random point. */
	seedPoints?: readonly Point[];
}

/** Below this a "radius" is a divide-by-zero waiting to happen, and the sample count explodes. */
const MIN_RADIUS = 1e-4;
/** Attempts to find an accepted starting point before giving up and returning nothing. */
const SEED_ATTEMPTS = 128;
/** Lattice used to estimate the range of a variable radius. Deterministic; costs no RNG draws. */
const RADIUS_PROBE = 32;

export function poissonDisk(rng: SeededRng, options: PoissonOptions): Point[] {
	const bounds = options.bounds ?? { x: 0, y: 0, w: 1, h: 1 };
	const k = Math.max(1, Math.floor(options.k ?? 30));
	const maxSamples = Math.max(0, Math.floor(options.maxSamples ?? 5000));
	const accept = options.accept;
	const radiusAt = options.radiusAt;
	const baseRadius = Math.max(MIN_RADIUS, options.radius);
	if (bounds.w <= 0 || bounds.h <= 0 || maxSamples === 0) return [];

	const radiusOf = radiusAt
		? (p: Point): number => Math.max(MIN_RADIUS, radiusAt(p))
		: (): number => baseRadius;

	// The background grid must be sized by the SMALLEST radius in play, or a dense region overflows a
	// cell; the neighbour scan must reach the LARGEST, or a sparse sample's exclusion zone is not checked.
	let minRadius = baseRadius;
	let maxRadius = baseRadius;
	if (radiusAt) {
		minRadius = Infinity;
		maxRadius = 0;
		for (let j = 0; j <= RADIUS_PROBE; j += 1) {
			for (let i = 0; i <= RADIUS_PROBE; i += 1) {
				const r = radiusOf({
					x: bounds.x + (bounds.w * i) / RADIUS_PROBE,
					y: bounds.y + (bounds.h * j) / RADIUS_PROBE,
				});
				if (r < minRadius) minRadius = r;
				if (r > maxRadius) maxRadius = r;
			}
		}
		if (!Number.isFinite(minRadius) || minRadius <= 0) minRadius = MIN_RADIUS;
		if (maxRadius < minRadius) maxRadius = minRadius;
	}

	const cellSize = minRadius / Math.SQRT2;
	const cols = Math.max(1, Math.ceil(bounds.w / cellSize));
	const rows = Math.max(1, Math.ceil(bounds.h / cellSize));
	const grid = new Int32Array(cols * rows).fill(-1);
	const reach = Math.max(2, Math.ceil(maxRadius / cellSize) + 1);

	const samples: Point[] = [];
	const radii: number[] = [];
	const active: number[] = [];

	const inBounds = (p: Point): boolean =>
		p.x >= bounds.x && p.x <= bounds.x + bounds.w && p.y >= bounds.y && p.y <= bounds.y + bounds.h;

	const cellOf = (p: Point): number => {
		const cx = Math.min(cols - 1, Math.max(0, Math.floor((p.x - bounds.x) / cellSize)));
		const cy = Math.min(rows - 1, Math.max(0, Math.floor((p.y - bounds.y) / cellSize)));
		return cy * cols + cx;
	};

	const fits = (p: Point, r: number): boolean => {
		const cx = Math.min(cols - 1, Math.max(0, Math.floor((p.x - bounds.x) / cellSize)));
		const cy = Math.min(rows - 1, Math.max(0, Math.floor((p.y - bounds.y) / cellSize)));
		for (let y = Math.max(0, cy - reach); y <= Math.min(rows - 1, cy + reach); y += 1) {
			for (let x = Math.max(0, cx - reach); x <= Math.min(cols - 1, cx + reach); x += 1) {
				const index = grid[y * cols + x] as number;
				if (index < 0) continue;
				const other = samples[index] as Point;
				// Kept apart by the larger of the two radii — the guarantee both samples were promised.
				const required = Math.max(r, radii[index] as number);
				if (dist2(p, other) < required * required) return false;
			}
		}
		return true;
	};

	/** Takes an ALREADY-normalized point: rounding after the spacing check could shave a micron off the
	 *  minimum distance, and the emitted values are the ones the guarantee is about. */
	const add = (point: Point): void => {
		samples.push(point);
		radii.push(radiusOf(point));
		grid[cellOf(point)] = samples.length - 1;
		active.push(samples.length - 1);
	};

	const tryPlace = (raw: Point): boolean => {
		const point = normPoint(raw.x, raw.y);
		if (!inBounds(point)) return false;
		if (accept && !accept(point)) return false;
		if (!fits(point, radiusOf(point))) return false;
		add(point);
		return true;
	};

	// Seed the active list. Explicit seed points come first (in the caller's order — never a Set's), so a
	// scatter can grow out from existing features rather than from nowhere.
	const seeds = options.seedPoints ?? [];
	for (const seed of seeds) {
		if (samples.length >= maxSamples) break;
		tryPlace(seed);
	}
	if (samples.length === 0) {
		for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
			const placed = tryPlace({
				x: bounds.x + rng.next() * bounds.w,
				y: bounds.y + rng.next() * bounds.h,
			});
			if (placed) break;
		}
	}
	if (samples.length === 0) return [];

	while (active.length > 0 && samples.length < maxSamples) {
		const slot = rng.nextInt(0, active.length - 1);
		const parentIndex = active[slot] as number;
		const parent = samples[parentIndex] as Point;
		const r = radii[parentIndex] as number;

		let placed = false;
		for (let attempt = 0; attempt < k; attempt += 1) {
			const angle = rng.next() * Math.PI * 2;
			// Uniform by AREA over the annulus [r, 2r]; a uniform radius draw biases candidates inward and
			// leaves visible voids.
			const radius = r * Math.sqrt(1 + rng.next() * 3);
			placed = tryPlace({
				x: parent.x + Math.cos(angle) * radius,
				y: parent.y + Math.sin(angle) * radius,
			});
			if (placed) break;
		}
		if (!placed) active.splice(slot, 1);
	}

	return samples;
}
