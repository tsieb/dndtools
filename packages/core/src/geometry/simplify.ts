import type { Point } from './types';
import { dist, lerpPoint } from './vec';
import { pointToSegmentDistance } from './intersect';

/**
 * Polyline reduction and smoothing — steps 5 and 6 of the raster→vector pipeline.
 *
 * A raw marching-squares contour of a 256² cave is ~10,000 vertices, every one of them on a half-cell
 * lattice. Persisting that is unusable: it is slow to render, impossible to hand-edit, and it looks
 * like a staircase. Douglas–Peucker takes it to ~200 vertices with no visible loss, and Chaikin then
 * rounds the remaining corners. The pair is what makes generated geometry look drawn rather than
 * computed, and it is why nothing in this kit emits a contour without passing it through here first.
 */

/**
 * Douglas–Peucker. `epsilon` is in the same units as the points, so a contour is simplified in CELL
 * units (where a sensible epsilon is ~0.5–1.5) before it is normalized, not after.
 *
 * Iterative rather than recursive: a 10k-vertex contour with a pathological split point would blow the
 * stack, and a generator is not allowed to crash on an unlucky seed.
 */
export function simplify(points: readonly Point[], epsilon: number): Point[] {
	if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }));
	if (!(epsilon > 0)) return points.map((p) => ({ x: p.x, y: p.y }));

	const keep = new Uint8Array(points.length);
	keep[0] = 1;
	keep[points.length - 1] = 1;

	const stack: Array<[number, number]> = [[0, points.length - 1]];
	while (stack.length > 0) {
		const range = stack.pop() as [number, number];
		const [first, last] = range;
		if (last <= first + 1) continue;
		const a = points[first] as Point;
		const b = points[last] as Point;
		let worst = -1;
		let worstIndex = -1;
		for (let i = first + 1; i < last; i += 1) {
			const d = pointToSegmentDistance(points[i] as Point, a, b);
			if (d > worst) {
				worst = d;
				worstIndex = i;
			}
		}
		if (worst > epsilon && worstIndex > first) {
			keep[worstIndex] = 1;
			stack.push([first, worstIndex]);
			stack.push([worstIndex, last]);
		}
	}

	const out: Point[] = [];
	for (let i = 0; i < points.length; i += 1) {
		if (keep[i] === 1) out.push({ x: (points[i] as Point).x, y: (points[i] as Point).y });
	}
	return out;
}

/**
 * Chaikin corner-cutting. Each iteration replaces every corner with its 1/4 and 3/4 points, which
 * converges on a quadratic B-spline. Two passes is the sweet spot for caves; zero keeps architecture
 * crisp (a cut corner on a stone wall reads as a mistake, not as a curve).
 *
 * `closed` treats the input as a ring, so the wrap-around corner is cut too — without it a smoothed
 * cave has one conspicuous sharp vertex where the contour happened to start.
 */
export function chaikin(points: readonly Point[], iterations: number, closed: boolean): Point[] {
	let current: Point[] = points.map((p) => ({ x: p.x, y: p.y }));
	if (iterations <= 0 || current.length < 3) return current;

	for (let pass = 0; pass < iterations; pass += 1) {
		const next: Point[] = [];
		const last = closed ? current.length : current.length - 1;
		if (!closed) next.push({ x: (current[0] as Point).x, y: (current[0] as Point).y });
		for (let i = 0; i < last; i += 1) {
			const a = current[i] as Point;
			const b = current[(i + 1) % current.length] as Point;
			next.push(lerpPoint(a, b, 0.25));
			next.push(lerpPoint(a, b, 0.75));
		}
		if (!closed) {
			const tail = current[current.length - 1] as Point;
			next.push({ x: tail.x, y: tail.y });
		}
		current = next;
	}
	return current;
}

/**
 * Resample to roughly-even `spacing`, preserving both endpoints. Used wherever a subsequent step needs a
 * uniform vertex density it cannot get from the source — perturbing a corridor with noise, or walking a
 * river to place props — because displacing an unevenly-sampled polyline amplifies the sampling, not the
 * shape.
 */
export function resample(points: readonly Point[], spacing: number): Point[] {
	if (points.length < 2 || !(spacing > 0)) return points.map((p) => ({ x: p.x, y: p.y }));

	const first = points[0] as Point;
	const out: Point[] = [{ x: first.x, y: first.y }];
	let carry = 0; // distance already consumed toward the next output point

	for (let i = 1; i < points.length; i += 1) {
		const a = points[i - 1] as Point;
		const b = points[i] as Point;
		const segment = dist(a, b);
		if (segment <= 0) continue;
		let travelled = spacing - carry;
		while (travelled <= segment) {
			out.push(lerpPoint(a, b, travelled / segment));
			travelled += spacing;
		}
		carry = segment - (travelled - spacing);
	}

	const tail = points[points.length - 1] as Point;
	const emitted = out[out.length - 1] as Point;
	// Replace rather than append when the walk already landed on (or a hair short of) the endpoint,
	// so the last span is never a sliver.
	if (dist(emitted, tail) < spacing * 0.5 && out.length > 1) out.pop();
	out.push({ x: tail.x, y: tail.y });
	return out;
}
