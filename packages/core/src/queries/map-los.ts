import type { MapFeature } from '../state/map-state';
import { dist, raySegmentHit, segmentIntersection, type Point, type Ring } from '../geometry';
import { norm } from '../generation/types';

/**
 * MAP-021 — line of sight, computed from the SAME wall polylines the map already carries.
 *
 * Research §6.3 files auto-shadows/LOS under "free: your wall polylines ARE the LOS segments", and that
 * is exactly what this module trades on. There is no separate vision-mesh, no baked shadow map, and
 * nothing for a DM to author twice: the walls `generation/derive.ts` extracted from the floors are the
 * occluders, so vision is correct by construction and stays correct when the DM edits a wall by hand.
 *
 * The door rule is the part that makes it feel real rather than technically correct: an OPEN door does
 * not block, a CLOSED or LOCKED one does. Opening a door and watching the room beyond light up is the
 * single most-used interaction in a VTT, and here it is one flag on one feature.
 *
 * Pure and deterministic: no RNG, no clock. `computeVisibility` is a plain function of its inputs, so it
 * can be recomputed on every token move without touching durable state.
 */

/** A blocking edge, flattened from a wall polyline or a door span. */
interface Occluder {
	a: Point;
	b: Point;
}

/**
 * Whether a feature blocks sight RIGHT NOW.
 *
 * Fail-open on `blocksSight: false` (an explicit author override — a window, a low rail, an archway) and
 * fail-CLOSED on everything else: an unrecognized wall-ish feature blocks. Getting this backwards leaks
 * the contents of a room to a player, which is the one failure mode of a vision system that actually
 * costs a table something.
 */
function blocksSight(f: MapFeature): boolean {
	if (f.props?.blocksSight === false) return false;
	if (f.kind === 'door') {
		const state = f.props?.state;
		// An open door is a hole. A closed or locked one is a wall. An archway is emitted `open`.
		if (state === 'open') return false;
		return true;
	}
	return f.kind === 'wall';
}

/** Flatten the sight-blocking features into a segment soup. */
function occludersOf(walls: readonly MapFeature[]): Occluder[] {
	const occluders: Occluder[] = [];
	for (const f of walls) {
		if (!blocksSight(f)) continue;
		for (let i = 0; i + 1 < f.points.length; i += 1) {
			const a = f.points[i]!;
			const b = f.points[i + 1]!;
			if (dist(a, b) < 1e-9) continue;
			occluders.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
		}
	}
	return occluders;
}

export interface VisibilityOptions {
	/** Sight radius in normalized units. Rays that hit nothing stop here. Default 0.5 (half the map). */
	radius?: number;
	/** Extra uniformly-spaced rays, on top of the corner rays. They round out the radius in open space. */
	rays?: number;
}

/**
 * Cast a visibility polygon from `origin`.
 *
 * The algorithm is the standard one and the epsilon is the whole trick: cast a ray at every occluder
 * ENDPOINT, plus one a hair either side of it. The centre ray stops ON the corner; the two flanking rays
 * slip PAST it and travel on to whatever is behind — which is what produces the shadow's diverging edges.
 * Without the ±epsilon pair you get a polygon whose corners are pinned to the walls and no shadows at
 * all, and it is the mistake every from-scratch implementation makes once.
 *
 * Returns a {@link Ring} (no repeated first point) in normalized space, sorted by angle.
 */
export function computeVisibility(
	origin: Point,
	walls: readonly MapFeature[],
	options?: VisibilityOptions,
): Ring {
	const radius = options?.radius ?? 0.5;
	const extraRays = options?.rays ?? 64;
	const occluders = occludersOf(walls);

	const epsilon = 0.00001;
	const angles: number[] = [];

	for (const occluder of occluders) {
		for (const corner of [occluder.a, occluder.b]) {
			const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
			angles.push(angle - epsilon, angle, angle + epsilon);
		}
	}
	for (let i = 0; i < extraRays; i += 1) {
		angles.push((i / extraRays) * Math.PI * 2 - Math.PI);
	}
	// Sort by angle so the hit points come back in polygon order. Doing this AFTER collecting (rather
	// than inserting into a sorted structure) keeps the traversal order explicit and stable.
	angles.sort((a, b) => a - b);

	const ring: Ring = [];
	let previous: Point | null = null;
	for (const angle of angles) {
		const dir = { x: Math.cos(angle), y: Math.sin(angle) };
		let best = radius;
		for (const occluder of occluders) {
			const t = raySegmentHit(origin, dir, occluder.a, occluder.b);
			// Reject hits behind the origin and hits at the origin itself (a token standing on a wall).
			if (t !== null && t > 1e-9 && t < best) best = t;
		}
		const point = { x: norm(origin.x + dir.x * best), y: norm(origin.y + dir.y * best) };
		// Collapse the duplicate vertices the ±epsilon triples produce wherever a corner is NOT a shadow
		// edge; a visibility polygon with three coincident vertices per wall corner is a rendering hazard.
		if (previous && dist(previous, point) < 1e-6) continue;
		ring.push(point);
		previous = point;
	}
	if (ring.length > 1 && dist(ring[0]!, ring[ring.length - 1]!) < 1e-6) ring.pop();
	return ring;
}

/**
 * Is `to` visible from `from`? The direct predicate — cheaper than building the whole polygon when all
 * you need is "can this token see that token".
 */
export function isVisible(from: Point, to: Point, walls: readonly MapFeature[]): boolean {
	for (const occluder of occludersOf(walls)) {
		if (segmentIntersection(from, to, occluder.a, occluder.b)) return false;
	}
	return true;
}
