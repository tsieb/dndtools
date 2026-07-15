import type { MapFeature } from '../state/map-state';
import type { SeededRng } from '../state/prng';
import {
	boundsOf,
	centroid,
	dist,
	pointInRing,
	pointToSegmentDistance,
	poissonDisk,
	rectToRing,
	ringArea,
	segmentIntersection,
	unionBoundary,
	type Point,
	type Ring,
} from '../geometry';
import { feature, norm } from './types';

/**
 * MAP-021 — AUTO-DERIVATION: walls, doors and lights from floor geometry.
 *
 * Research §6.3 is blunt about why this module is the whole product: "the boundary of your floor-polygon
 * union IS the wall set... this is a killer advantage of a vector model over a raster one." A raster tool
 * (or an image generator) has to SOLVE a vision problem to find walls; we get them for free from geometry
 * we already have. Everything a modern VTT actually wants — the irreducible triple of walls + doors +
 * lights (§8.4) — falls out of that one union, and it is what turns a picture of a dungeon into a scene
 * with working line-of-sight.
 *
 * So the generator fleet deliberately emits FLOORS ONLY (rooms, chambers, corridors). It does not draw a
 * single wall. This module is the single place walls exist, which means every generator — dungeon, cave,
 * city, ruin — gets identical, correct, exportable line-of-sight without knowing anything about it.
 *
 * Determinism (Contract 2): walls are a pure function of the floors; doors and lights draw only from the
 * injected {@link SeededRng}. No clock, no `Math.random`, no ambient state.
 */

export interface DeriveOptions {
	/** Rendered wall thickness in normalized units. Presentation only — stamped on `props.thickness`. */
	wallThickness?: number;
	/** Douglas–Peucker tolerance for the contoured boundary, in normalized units. */
	simplifyTolerance?: number;
	/** Raster resolution the union is contoured at. Higher = crisper corners, slower. */
	resolution?: number;
	/** Width used to stroke a corridor CENTRELINE into a floor, when the corridor has no `props.width`. */
	corridorWidth?: number;

	/** Relative weight of a plain door at a doorway. */
	doorChance?: number;
	/** Relative weight of a secret door. Secret doors are always `closed`. */
	secretDoorChance?: number;
	/** Relative weight of an open archway (no leaf — always `open`, never blocks sight). */
	archwayChance?: number;
	/** Relative weight of a portcullis. */
	portcullisChance?: number;
	/** Probability that a door with a leaf is `locked` rather than merely `closed`. */
	lockedChance?: number;
	/** Probability that an unlocked, leafed door is standing `open`. */
	openChance?: number;
	/** Door span in normalized units. Widened to fill the doorway when the opening is wider. */
	doorWidth?: number;

	/** Poisson-disk radius for wall torches, in normalized units. */
	torchSpacing?: number;
	/** Bright radius of a torch, in normalized units. */
	lightRadius?: number;
	/** Dim radius of a torch, in normalized units. */
	lightDimRadius?: number;
	/** Torch colour as a hex string. */
	lightColor?: string;
	/** How far off the wall a torch is pushed, in normalized units. A torch inside the wall is invisible. */
	lightWallOffset?: number;

	/** When false, {@link deriveLights} / {@link deriveAll} emit no lights. */
	placeLights?: boolean;
	/** When false, {@link deriveDoors} / {@link deriveAll} emit no doors. */
	placeDoors?: boolean;

	/** Deterministic id prefix for every emitted feature. Never a clock, never a counter from outside. */
	idPrefix?: string;
}

type ResolvedOptions = Required<DeriveOptions>;

const DEFAULTS: ResolvedOptions = {
	wallThickness: 0.004,
	simplifyTolerance: 0.002,
	resolution: 256,
	corridorWidth: 0.02,

	doorChance: 0.7,
	secretDoorChance: 0.08,
	archwayChance: 0.18,
	portcullisChance: 0.04,
	lockedChance: 0.12,
	openChance: 0.25,
	doorWidth: 0.024,

	torchSpacing: 0.12,
	lightRadius: 0.08,
	lightDimRadius: 0.16,
	lightColor: 'ffd6aa',
	lightWallOffset: 0.008,

	placeLights: true,
	placeDoors: true,

	idPrefix: 'derived',
};

function resolve(options?: DeriveOptions): ResolvedOptions {
	return { ...DEFAULTS, ...(options ?? {}) };
}

/* ------------------------------------------------------------------------------------------------ */
/* Floor geometry                                                                                    */
/* ------------------------------------------------------------------------------------------------ */

/**
 * The two shapes a floor can arrive in. A `room`/`fill` is a rect from two corners; a `polygon` is a
 * closed ring; a `stroke`/`road` is a corridor CENTRELINE that has to be stroked to a width before it
 * can contribute floor area. Anything else (markers, text, existing walls) is not floor and is ignored,
 * so a caller can hand this function a whole layer's content without pre-filtering it.
 */
interface FloorGeometry {
	rings: Ring[];
	strokes: Array<{ points: Point[]; width: number }>;
}

function isRingFeature(kind: MapFeature['kind']): boolean {
	return kind === 'polygon' || kind === 'room' || kind === 'fill';
}

function isStrokeFeature(kind: MapFeature['kind']): boolean {
	return kind === 'stroke' || kind === 'road';
}

/** The ring a room/fill/polygon feature occupies. A rect feature carries only its two opposite corners. */
export function featureRing(f: MapFeature): Ring | null {
	if (f.kind === 'room' || f.kind === 'fill') {
		if (f.points.length < 2) return null;
		const a = f.points[0]!;
		const b = f.points[1]!;
		return rectToRing({
			x: Math.min(a.x, b.x),
			y: Math.min(a.y, b.y),
			w: Math.abs(b.x - a.x),
			h: Math.abs(b.y - a.y),
		});
	}
	if (f.kind === 'polygon' || f.kind === 'water') {
		if (f.points.length < 3) return null;
		const points = f.points.map((p) => ({ x: p.x, y: p.y }));
		// Tolerate a ring that repeats its first point at the end (a closed polyline) — the geometry API's
		// rings do not repeat, and a duplicated vertex produces a zero-length edge downstream.
		const first = points[0]!;
		const last = points[points.length - 1]!;
		if (points.length > 3 && dist(first, last) < 1e-9) points.pop();
		return points;
	}
	return null;
}

function collectFloors(floors: readonly MapFeature[], options: ResolvedOptions): FloorGeometry {
	const rings: Ring[] = [];
	const strokes: Array<{ points: Point[]; width: number }> = [];
	for (const f of floors) {
		if (isRingFeature(f.kind)) {
			const ring = featureRing(f);
			if (ring && ring.length >= 3) rings.push(ring);
			continue;
		}
		if (isStrokeFeature(f.kind) && f.points.length >= 2) {
			const width = typeof f.props?.width === 'number' ? f.props.width : options.corridorWidth;
			strokes.push({ points: f.points.map((p) => ({ x: p.x, y: p.y })), width });
		}
	}
	return { rings, strokes };
}

/* ------------------------------------------------------------------------------------------------ */
/* A. WALLS                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Derive the wall set from floor geometry: rasterize every floor ring and stroked corridor into one
 * mask, then contour the boundary of the union.
 *
 * Two properties fall out of doing it as a UNION rather than per-feature, and both are the point:
 *
 *   - Two overlapping rooms produce ONE merged boundary, not two rectangles crossing each other. A
 *     per-feature outline would draw a wall straight through the middle of the merged space.
 *   - A corridor that touches a room DISSOLVES the wall where it meets it, leaving a doorway-shaped gap
 *     that {@link deriveDoors} then fills. The opening is not special-cased anywhere; it is just what the
 *     union boundary does.
 *
 * Holes in the union (a pillar, an interior block, a courtyard) come back as CLOCKWISE rings and are
 * emitted as walls too — dropping them is the classic bug that makes a pillar invisible to line-of-sight.
 */
export function deriveWalls(floors: readonly MapFeature[], options?: DeriveOptions): MapFeature[] {
	const opts = resolve(options);
	const { rings, strokes } = collectFloors(floors, opts);
	if (rings.length === 0 && strokes.length === 0) return [];

	const boundary = unionBoundary(
		{ rings, strokes },
		{
			resolution: opts.resolution,
			// Architecture wants crisp corners; smoothing a dungeon wall makes it read as a cave.
			smoothIterations: 0,
			simplifyEpsilon: Math.max(0.5, opts.simplifyTolerance * opts.resolution),
			interpolate: true,
		},
	);

	const walls: MapFeature[] = [];
	for (let i = 0; i < boundary.length; i += 1) {
		const ring = boundary[i]!;
		if (ring.length < 3) continue;
		// A wall is a POLYLINE, so close the ring explicitly by repeating the first vertex. Consumers
		// (line-of-sight, UVTT) walk consecutive pairs; without the closing vertex the last edge of every
		// room is missing and light leaks through it.
		const points = [...ring, ring[0]!];
		const hole = ringArea(ring) < 0;
		walls.push(
			feature(`${opts.idPrefix}-wall-${i}`, 'wall', points, 'wall:stone', {
				thickness: norm(opts.wallThickness),
				ring: hole ? 'hole' : 'outer',
				blocksSight: true,
				blocksMovement: true,
			}),
		);
	}
	return walls;
}

/* ------------------------------------------------------------------------------------------------ */
/* B. DOORS                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

interface Segment {
	a: Point;
	b: Point;
}

/** Every segment of every wall polyline, flattened once so the door/light snapping loops stay O(n·m). */
export function wallSegments(walls: readonly MapFeature[]): Segment[] {
	const segments: Segment[] = [];
	for (const wall of walls) {
		for (let i = 0; i + 1 < wall.points.length; i += 1) {
			const a = wall.points[i]!;
			const b = wall.points[i + 1]!;
			if (dist(a, b) < 1e-9) continue;
			segments.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
		}
	}
	return segments;
}

/** Closest point on segment a–b to p. The geometry API exposes the DISTANCE; snapping needs the point. */
function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq < 1e-18) return { x: a.x, y: a.y };
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return { x: a.x + t * dx, y: a.y + t * dy };
}

function nearestWall(
	p: Point,
	segments: readonly Segment[],
): { point: Point; distance: number } | null {
	let best: Segment | null = null;
	let bestDistance = Infinity;
	for (const segment of segments) {
		const d = pointToSegmentDistance(p, segment.a, segment.b);
		if (d < bestDistance) {
			bestDistance = d;
			best = segment;
		}
	}
	if (!best) return null;
	return { point: closestPointOnSegment(p, best.a, best.b), distance: bestDistance };
}

type PortalKind = 'door' | 'secret' | 'archway' | 'portcullis';
type PortalState = 'open' | 'closed' | 'locked';

/**
 * Find every place a CORRIDOR crosses a ROOM boundary and put a portal there.
 *
 * This is the whole definition of a doorway, and stating it geometrically rather than bookkeeping it
 * during generation is what lets every generator stay ignorant of doors: a corridor that meets a room
 * makes a door, whether the generator "meant" to or not, and a corridor that merely passes nearby does
 * not.
 *
 * The emitted door is SNAPPED onto the derived wall so that its two endpoints lie exactly on wall
 * segments (the jambs on either side of the union's gap) and its span runs ALONG the wall line. A door
 * floating in a doorway with its ends off the wall is the tell of a tool that draws doors rather than
 * fitting them, and it exports to a VTT as a portal that does not seal.
 */
export function deriveDoors(
	walls: readonly MapFeature[],
	corridors: readonly MapFeature[],
	rooms: readonly MapFeature[],
	rng: SeededRng,
	options?: DeriveOptions,
): MapFeature[] {
	const opts = resolve(options);
	if (!opts.placeDoors) return [];

	const segments = wallSegments(walls);
	if (segments.length === 0) return [];

	const roomRings: Ring[] = [];
	for (const room of rooms) {
		const ring = featureRing(room);
		if (ring && ring.length >= 3) roomRings.push(ring);
	}
	if (roomRings.length === 0) return [];

	/** Candidate doorways, collected in a FIXED order (corridor, then segment, then room, then edge) so
	 *  the RNG draws below are replayable. Never collect through a Set/Map iteration. */
	const crossings: Array<{ point: Point; direction: Point }> = [];
	const minSeparation = opts.doorWidth * 0.75;

	for (const corridor of corridors) {
		if (!isStrokeFeature(corridor.kind) || corridor.points.length < 2) continue;
		for (let i = 0; i + 1 < corridor.points.length; i += 1) {
			const c1 = corridor.points[i]!;
			const c2 = corridor.points[i + 1]!;
			for (const ring of roomRings) {
				for (let j = 0; j < ring.length; j += 1) {
					const r1 = ring[j]!;
					const r2 = ring[(j + 1) % ring.length]!;
					const hit = segmentIntersection(c1, c2, r1, r2);
					if (!hit) continue;
					// One doorway per opening: a corridor whose centreline clips a room corner can cross two
					// edges within a hair of each other, and two overlapping doors in one gap is a visible bug.
					if (crossings.some((existing) => dist(existing.point, hit) < minSeparation)) continue;
					const length = dist(r1, r2);
					if (length < 1e-9) continue;
					crossings.push({
						point: hit,
						// The door is oriented along the ROOM WALL it pierces, never along the corridor.
						direction: { x: (r2.x - r1.x) / length, y: (r2.y - r1.y) / length },
					});
				}
			}
		}
	}

	const doors: MapFeature[] = [];
	const kinds: readonly PortalKind[] = ['door', 'secret', 'archway', 'portcullis'];
	const weights: readonly number[] = [
		opts.doorChance,
		opts.secretDoorChance,
		opts.archwayChance,
		opts.portcullisChance,
	];

	for (let i = 0; i < crossings.length; i += 1) {
		const { point, direction } = crossings[i]!;
		const half = opts.doorWidth / 2;
		let a: Point = { x: point.x - direction.x * half, y: point.y - direction.y * half };
		let b: Point = { x: point.x + direction.x * half, y: point.y + direction.y * half };

		// Snap both jambs onto the nearest wall. When the union's gap is wider than `doorWidth` this pulls
		// the door OUT to fill the opening; when it is narrower the endpoints already sit on the wall.
		const snappedA = nearestWall(a, segments);
		const snappedB = nearestWall(b, segments);
		if (snappedA && snappedB && dist(snappedA.point, snappedB.point) > opts.doorWidth * 0.25) {
			a = snappedA.point;
			b = snappedB.point;
		}

		// PRNG call order is part of the contract: kind first, then state. Never reorder.
		const portal = rng.weighted(kinds, weights);
		let state: PortalState;
		if (portal === 'archway') {
			state = 'open';
		} else if (portal === 'secret') {
			state = 'closed';
		} else if (rng.chance(opts.lockedChance)) {
			state = 'locked';
		} else {
			state = rng.chance(opts.openChance) ? 'open' : 'closed';
		}

		doors.push(
			feature(`${opts.idPrefix}-door-${i}`, 'door', [a, b], `door:${portal}`, {
				portal,
				state,
				// An archway is a hole in a wall; it must not block sight, or every VTT import will wall it up.
				blocksSight: portal !== 'archway' && state !== 'open',
				blocksMovement: state !== 'open',
			}),
		);
	}
	return doors;
}

/* ------------------------------------------------------------------------------------------------ */
/* C. LIGHTS                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

/** Outer rings and hole rings of the floor union — the test for "is this point on the floor". */
function floorMask(walls: readonly MapFeature[]): { outers: Ring[]; holes: Ring[] } {
	const outers: Ring[] = [];
	const holes: Ring[] = [];
	for (const wall of walls) {
		const points = wall.points.map((p) => ({ x: p.x, y: p.y }));
		// Undo the explicit ring closure `deriveWalls` added; `pointInRing` wants an open ring.
		if (points.length > 3 && dist(points[0]!, points[points.length - 1]!) < 1e-9) points.pop();
		if (points.length < 3) continue;
		if (wall.props?.ring === 'hole') holes.push(points);
		else outers.push(points);
	}
	return { outers, holes };
}

function insideFloor(p: Point, mask: { outers: Ring[]; holes: Ring[] }): boolean {
	if (!mask.outers.some((ring) => pointInRing(ring, p))) return false;
	return !mask.holes.some((ring) => pointInRing(ring, p));
}

/**
 * Poisson-disk the floor at `torchSpacing`, then pull every sample onto the nearest wall.
 *
 * The snapping is not a nicety: research §6.3 lists `wallHuggingBias` as "critical for believability",
 * and the reason is that a torch belongs in a sconce. A light hovering in the middle of a room reads
 * instantly as generated, and on a VTT it casts shadows from the wrong side of every pillar. Room
 * centroids additionally get one brighter source, because a hall lit only from its walls has a dark
 * middle.
 */
export function deriveLights(
	floors: readonly MapFeature[],
	rooms: readonly MapFeature[],
	rng: SeededRng,
	options?: DeriveOptions,
): MapFeature[] {
	const opts = resolve(options);
	if (!opts.placeLights) return [];

	const walls = deriveWalls(floors, options);
	return lightsFromWalls(walls, rooms, rng, opts);
}

function lightsFromWalls(
	walls: readonly MapFeature[],
	rooms: readonly MapFeature[],
	rng: SeededRng,
	opts: ResolvedOptions,
): MapFeature[] {
	const segments = wallSegments(walls);
	const mask = floorMask(walls);
	if (segments.length === 0 || mask.outers.length === 0) return [];

	const allPoints: Point[] = [];
	for (const ring of mask.outers) allPoints.push(...ring);
	const bounds = boundsOf(allPoints);

	const samples = poissonDisk(rng, {
		radius: opts.torchSpacing,
		bounds,
		accept: (p) => insideFloor(p, mask),
	});

	const lights: MapFeature[] = [];
	for (let i = 0; i < samples.length; i += 1) {
		const sample = samples[i]!;
		const snapped = snapToWall(sample, segments, mask, opts.lightWallOffset);
		if (!snapped) continue;
		lights.push(
			feature(`${opts.idPrefix}-light-${i}`, 'light', [snapped], 'light:torch', {
				radius: norm(opts.lightRadius),
				dimRadius: norm(opts.lightDimRadius),
				color: opts.lightColor,
				intensity: 1,
				source: 'torch',
			}),
		);
	}

	// One brighter source per room, at its centroid — but only when the centroid is actually ON the floor
	// (an L-shaped or concave room's centroid can land in the wall, and a light inside a wall lights nothing).
	for (let i = 0; i < rooms.length; i += 1) {
		const ring = featureRing(rooms[i]!);
		if (!ring || ring.length < 3) continue;
		const center = centroid(ring);
		if (!insideFloor(center, mask)) continue;
		lights.push(
			feature(`${opts.idPrefix}-light-room-${i}`, 'light', [center], 'light:brazier', {
				radius: norm(opts.lightRadius * 1.6),
				dimRadius: norm(opts.lightDimRadius * 1.6),
				color: opts.lightColor,
				intensity: 1.25,
				source: 'brazier',
			}),
		);
	}

	return lights;
}

/**
 * Move `sample` to `offset` away from the nearest wall, along the line from the wall back toward the
 * sample. Returns null when no placement keeps the light on the floor — better to drop a torch than to
 * bury one in a wall.
 */
function snapToWall(
	sample: Point,
	segments: readonly Segment[],
	mask: { outers: Ring[]; holes: Ring[] },
	offset: number,
): Point | null {
	const near = nearestWall(sample, segments);
	if (!near) return null;
	const span = near.distance;
	if (span < 1e-9) {
		// The sample landed exactly on the wall; there is no direction to push it off along.
		return insideFloor(sample, mask) ? sample : null;
	}
	const ux = (sample.x - near.point.x) / span;
	const uy = (sample.y - near.point.y) / span;
	// Walk outward from the wall in fixed steps until the point is on the floor. Bounded, so a degenerate
	// mask can never spin here.
	for (let step = 0; step < 5; step += 1) {
		const t = offset * (1 + step);
		if (t > span) break;
		const candidate = { x: near.point.x + ux * t, y: near.point.y + uy * t };
		if (insideFloor(candidate, mask)) return candidate;
	}
	return insideFloor(sample, mask) ? sample : null;
}

/* ------------------------------------------------------------------------------------------------ */
/* D. THE ONE CALL                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

export interface DeriveInput {
	/** Every floor surface: rooms, chambers, caverns, AND corridors. The union of these is the space. */
	floors: readonly MapFeature[];
	/** The corridor CENTRELINES (a subset of `floors`, or separate). A door goes where one meets a room. */
	corridors: readonly MapFeature[];
	/** The rooms. Doors are placed on room boundaries; each gets a central light. */
	rooms: readonly MapFeature[];
}

/**
 * Derive the whole irreducible triple in one pass, sharing the (expensive) wall union across all three.
 * The RNG draw order is fixed — doors, then lights — and is part of the determinism contract.
 */
export function deriveAll(
	input: DeriveInput,
	rng: SeededRng,
	options?: DeriveOptions,
): { walls: MapFeature[]; doors: MapFeature[]; lights: MapFeature[] } {
	const opts = resolve(options);
	const walls = deriveWalls(input.floors, options);
	const doors = deriveDoors(walls, input.corridors, input.rooms, rng, options);
	const lights = opts.placeLights ? lightsFromWalls(walls, input.rooms, rng, opts) : [];
	return { walls, doors, lights };
}
