import { describe, expect, it } from 'vitest';
import { createRng } from '../src/state/prng';
import type { MapFeature } from '../src/state/map-state';
import {
	deriveAll,
	deriveDoors,
	deriveLights,
	deriveWalls,
	wallSegments,
} from '../src/generation/derive';
import { computeVisibility, isVisible } from '../src/queries/map-los';
import { pointInRing, pointToSegmentDistance, ringArea, type Point } from '../src/geometry';

const OPTS = { resolution: 512, simplifyTolerance: 0.001 };

function room(id: string, x: number, y: number, w: number, h: number): MapFeature {
	return {
		id,
		kind: 'room',
		points: [
			{ x, y },
			{ x: x + w, y: y + h },
		],
		style: 'floor:stone',
	};
}

function polygon(id: string, points: Point[]): MapFeature {
	return { id, kind: 'polygon', points, style: 'floor:stone' };
}

function corridor(id: string, points: Point[], width = 0.03): MapFeature {
	return { id, kind: 'stroke', points, style: 'floor:corridor', props: { width } };
}

/** Shortest distance from `p` to any wall segment. The load-bearing assertion for door/light placement. */
function distanceToWalls(p: Point, walls: MapFeature[]): number {
	let best = Infinity;
	for (const segment of wallSegments(walls)) {
		best = Math.min(best, pointToSegmentDistance(p, segment.a, segment.b));
	}
	return best;
}

function outerRings(walls: MapFeature[]): Point[][] {
	return walls
		.filter((wall) => wall.props?.ring !== 'hole')
		.map((wall) => wall.points.slice(0, -1).map((p) => ({ x: p.x, y: p.y })));
}

function holeRings(walls: MapFeature[]): Point[][] {
	return walls
		.filter((wall) => wall.props?.ring === 'hole')
		.map((wall) => wall.points.slice(0, -1).map((p) => ({ x: p.x, y: p.y })));
}

function onFloor(p: Point, walls: MapFeature[]): boolean {
	const inOuter = outerRings(walls).some((ring) => pointInRing(ring, p));
	const inHole = holeRings(walls).some((ring) => pointInRing(ring, p));
	return inOuter && !inHole;
}

describe('deriveWalls — the union IS the wall set', () => {
	it('merges two OVERLAPPING rooms into ONE boundary, not two', () => {
		const overlapping = [room('a', 0.2, 0.2, 0.3, 0.3), room('b', 0.4, 0.25, 0.3, 0.3)];
		const walls = deriveWalls(overlapping, OPTS);

		// The whole point of the union: one merged outline, not one per room.
		expect(walls).toHaveLength(1);
		expect(walls[0]!.kind).toBe('wall');
		expect(ringArea(walls[0]!.points.slice(0, -1))).toBeGreaterThan(0);

		// And the merged outline must NOT run through the shared interior: a point deep inside the overlap
		// is floor, not wall. (A naive per-feature outline would draw a wall right across it.)
		const insideOverlap = { x: 0.45, y: 0.35 };
		expect(onFloor(insideOverlap, walls)).toBe(true);

		// Two rooms far apart, by contrast, stay two boundaries.
		const disjoint = deriveWalls([room('a', 0.1, 0.1, 0.2, 0.2), room('b', 0.6, 0.6, 0.2, 0.2)], OPTS);
		expect(disjoint).toHaveLength(2);
	});

	it('produces an outer ring AND an inner hole ring for a room with a pillar', () => {
		// A square room with a square courtyard/pillar punched out of the middle, expressed as one ring
		// whose winding encloses the pillar (an 8-vertex "donut" cut open would be fragile; instead build
		// the floor from four bars around the void, which is how a real generator would emit it).
		const floors = [
			room('n', 0.2, 0.2, 0.6, 0.12),
			room('s', 0.2, 0.68, 0.6, 0.12),
			room('w', 0.2, 0.2, 0.12, 0.6),
			room('e', 0.68, 0.2, 0.12, 0.6),
		];
		const walls = deriveWalls(floors, OPTS);

		const outers = walls.filter((wall) => wall.props?.ring === 'outer');
		const holes = walls.filter((wall) => wall.props?.ring === 'hole');
		expect(outers).toHaveLength(1);
		expect(holes).toHaveLength(1);

		// Holes come back CLOCKWISE (negative signed area) — that is how a consumer tells them apart.
		expect(ringArea(outers[0]!.points.slice(0, -1))).toBeGreaterThan(0);
		expect(ringArea(holes[0]!.points.slice(0, -1))).toBeLessThan(0);

		// The pillar's centre is INSIDE the hole, hence not floor. Dropping the hole ring would make the
		// pillar invisible to line-of-sight — the classic bug this asserts against.
		expect(onFloor({ x: 0.5, y: 0.5 }, walls)).toBe(false);
		expect(onFloor({ x: 0.25, y: 0.25 }, walls)).toBe(true);
	});

	it('emits closed wall polylines with every coordinate in [0,1]', () => {
		const walls = deriveWalls([polygon('p', [
			{ x: 0.2, y: 0.2 },
			{ x: 0.7, y: 0.25 },
			{ x: 0.6, y: 0.7 },
			{ x: 0.25, y: 0.6 },
		])], OPTS);
		expect(walls.length).toBeGreaterThan(0);
		for (const wall of walls) {
			const first = wall.points[0]!;
			const last = wall.points[wall.points.length - 1]!;
			expect(last).toEqual(first);
			for (const p of wall.points) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(1);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('is deterministic and pure — the same floors always give the same walls', () => {
		const floors = [room('a', 0.2, 0.2, 0.3, 0.3), corridor('c', [{ x: 0.5, y: 0.35 }, { x: 0.8, y: 0.35 }])];
		const before = JSON.stringify(floors);
		expect(deriveWalls(floors, OPTS)).toEqual(deriveWalls(floors, OPTS));
		expect(JSON.stringify(floors)).toBe(before);
	});
});

describe('deriveDoors — a corridor meeting a room IS a doorway', () => {
	const rooms = [room('r1', 0.15, 0.3, 0.2, 0.2), room('r2', 0.65, 0.3, 0.2, 0.2)];
	const corridors = [corridor('c1', [
		{ x: 0.25, y: 0.4 },
		{ x: 0.75, y: 0.4 },
	])];
	const floors = [...rooms, ...corridors];

	it('lands every door ON a wall segment', () => {
		const walls = deriveWalls(floors, OPTS);
		const doors = deriveDoors(walls, corridors, rooms, createRng('doors'), OPTS);
		expect(doors.length).toBeGreaterThan(0);

		for (const door of doors) {
			expect(door.kind).toBe('door');
			expect(door.points).toHaveLength(2);
			// Both jambs sit exactly on a wall. This is the assertion that separates a door FITTED into the
			// opening from a door merely drawn near it.
			for (const p of door.points) {
				expect(distanceToWalls(p, walls)).toBeLessThan(1e-6);
			}
		}
	});

	it('only puts doors where a corridor meets a room', () => {
		const walls = deriveWalls(floors, OPTS);
		const doors = deriveDoors(walls, corridors, rooms, createRng('doors'), OPTS);

		// The corridor crosses r1's right edge and r2's left edge — exactly two doorways, and no others.
		expect(doors).toHaveLength(2);
		const xs = doors.map((d) => (d.points[0]!.x + d.points[1]!.x) / 2).sort((a, b) => a - b);
		expect(xs[0]!).toBeCloseTo(0.35, 2);
		expect(xs[1]!).toBeCloseTo(0.65, 2);

		// A corridor that never touches a room produces no doors at all.
		const strays = [corridor('c2', [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }])];
		expect(deriveDoors(walls, strays, rooms, createRng('doors'), OPTS)).toHaveLength(0);
	});

	it('is oriented along the wall it pierces', () => {
		const walls = deriveWalls(floors, OPTS);
		const doors = deriveDoors(walls, corridors, rooms, createRng('doors'), OPTS);
		for (const door of doors) {
			// The pierced walls here are VERTICAL room edges, so the door span must be vertical too —
			// a door lying along the corridor instead of across it is the bug this catches.
			const dx = Math.abs(door.points[1]!.x - door.points[0]!.x);
			const dy = Math.abs(door.points[1]!.y - door.points[0]!.y);
			expect(dy).toBeGreaterThan(dx);
		}
	});

	it('classifies portals and states from the chance params, deterministically', () => {
		const walls = deriveWalls(floors, OPTS);
		const a = deriveDoors(walls, corridors, rooms, createRng('seed-1'), OPTS);
		const b = deriveDoors(walls, corridors, rooms, createRng('seed-1'), OPTS);
		expect(a).toEqual(b);

		for (const door of a) {
			expect(['door', 'secret', 'archway', 'portcullis']).toContain(door.props!.portal);
			expect(['open', 'closed', 'locked']).toContain(door.props!.state);
		}

		// Forcing the weights all the way over must produce that kind and nothing else.
		const allSecret = deriveDoors(walls, corridors, rooms, createRng('x'), {
			...OPTS,
			doorChance: 0,
			archwayChance: 0,
			portcullisChance: 0,
			secretDoorChance: 1,
		});
		expect(allSecret.every((d) => d.props!.portal === 'secret')).toBe(true);
		expect(allSecret.every((d) => d.props!.state === 'closed')).toBe(true);

		// An archway is a hole in a wall: it must never block sight, or every VTT import walls it up.
		const allArch = deriveDoors(walls, corridors, rooms, createRng('x'), {
			...OPTS,
			doorChance: 0,
			secretDoorChance: 0,
			portcullisChance: 0,
			archwayChance: 1,
		});
		expect(allArch.every((d) => d.props!.blocksSight === false)).toBe(true);
		expect(allArch.every((d) => d.props!.state === 'open')).toBe(true);
	});

	it('emits nothing when placeDoors is false', () => {
		const walls = deriveWalls(floors, OPTS);
		expect(deriveDoors(walls, corridors, rooms, createRng('x'), { ...OPTS, placeDoors: false })).toEqual(
			[],
		);
	});
});

describe('deriveLights — torches belong in sconces', () => {
	const rooms = [room('r1', 0.2, 0.2, 0.35, 0.35), room('r2', 0.6, 0.55, 0.25, 0.25)];
	const floors = [...rooms, corridor('c1', [{ x: 0.5, y: 0.4 }, { x: 0.7, y: 0.6 }])];

	it('snaps torches to walls and keeps every light on the floor', () => {
		const walls = deriveWalls(floors, OPTS);
		const lights = deriveLights(floors, rooms, createRng('lights'), {
			...OPTS,
			torchSpacing: 0.08,
			lightWallOffset: 0.006,
		});
		expect(lights.length).toBeGreaterThan(0);

		const torches = lights.filter((light) => light.props?.source === 'torch');
		expect(torches.length).toBeGreaterThan(0);

		for (const torch of torches) {
			const p = torch.points[0]!;
			// Snapped: within a few multiples of the wall offset, not floating in the middle of the room.
			expect(distanceToWalls(p, walls)).toBeLessThan(0.006 * 5 + 1e-6);
			// And still inside the space it is meant to light.
			expect(onFloor(p, walls)).toBe(true);
		}

		// Every light carries the props a VTT needs.
		for (const light of lights) {
			expect(light.kind).toBe('light');
			expect(light.points).toHaveLength(1);
			expect(typeof light.props!.radius).toBe('number');
			expect(typeof light.props!.dimRadius).toBe('number');
			expect(typeof light.props!.color).toBe('string');
			expect(typeof light.props!.intensity).toBe('number');
		}
	});

	it('places one brighter light at each room centroid', () => {
		const lights = deriveLights(floors, rooms, createRng('lights'), OPTS);
		const braziers = lights.filter((light) => light.props?.source === 'brazier');
		expect(braziers).toHaveLength(2);
		expect(braziers[0]!.points[0]!.x).toBeCloseTo(0.375, 3);
		expect(braziers[0]!.points[0]!.y).toBeCloseTo(0.375, 3);
		for (const brazier of braziers) {
			expect(brazier.props!.intensity as number).toBeGreaterThan(1);
		}
	});

	it('is deterministic per seed and emits nothing when placeLights is false', () => {
		expect(deriveLights(floors, rooms, createRng('s'), OPTS)).toEqual(
			deriveLights(floors, rooms, createRng('s'), OPTS),
		);
		expect(deriveLights(floors, rooms, createRng('s'), { ...OPTS, placeLights: false })).toEqual([]);
	});
});

describe('deriveAll', () => {
	it('derives the irreducible triple in one pass', () => {
		const rooms = [room('r1', 0.15, 0.3, 0.2, 0.2), room('r2', 0.65, 0.3, 0.2, 0.2)];
		const corridors = [corridor('c1', [{ x: 0.25, y: 0.4 }, { x: 0.75, y: 0.4 }])];
		const input = { floors: [...rooms, ...corridors], corridors, rooms };

		const first = deriveAll(input, createRng('all'), OPTS);
		const second = deriveAll(input, createRng('all'), OPTS);
		expect(first).toEqual(second);

		expect(first.walls.length).toBeGreaterThan(0);
		expect(first.doors).toHaveLength(2);
		expect(first.lights.length).toBeGreaterThan(0);
	});
});

describe('computeVisibility / isVisible', () => {
	// One big room, split by a wall that stops short of the top edge.
	const walls: MapFeature[] = [
		{
			id: 'w-outer',
			kind: 'wall',
			points: [
				{ x: 0.1, y: 0.1 },
				{ x: 0.9, y: 0.1 },
				{ x: 0.9, y: 0.9 },
				{ x: 0.1, y: 0.9 },
				{ x: 0.1, y: 0.1 },
			],
			style: 'wall:stone',
			props: { blocksSight: true },
		},
		{
			id: 'w-divider',
			kind: 'wall',
			points: [
				{ x: 0.5, y: 0.3 },
				{ x: 0.5, y: 0.9 },
			],
			style: 'wall:stone',
			props: { blocksSight: true },
		},
	];

	const observer = { x: 0.25, y: 0.7 };

	it('does not see a point behind a wall, but does see one in the open', () => {
		expect(isVisible(observer, { x: 0.75, y: 0.7 }, walls)).toBe(false); // behind the divider
		expect(isVisible(observer, { x: 0.4, y: 0.7 }, walls)).toBe(true); // same side, clear line
		// The divider stops at y = 0.3, so a sight line that crosses x = 0.5 ABOVE that gets through to the
		// far side. (0.55, 0.15) crosses at y ≈ 0.24 — past the wall's open end.
		expect(isVisible(observer, { x: 0.55, y: 0.15 }, walls)).toBe(true);
		// …but a target only slightly lower is occluded: that line crosses x = 0.5 at y ≈ 0.34, on the wall.
		expect(isVisible(observer, { x: 0.6, y: 0.2 }, walls)).toBe(false);
	});

	it('respects blocksSight: false', () => {
		const window: MapFeature[] = [
			{ ...walls[1]!, id: 'w-window', props: { blocksSight: false } },
		];
		expect(isVisible(observer, { x: 0.75, y: 0.7 }, window)).toBe(true);
	});

	it('lets an OPEN door through and stops a CLOSED or LOCKED one', () => {
		const doorway = (state: string): MapFeature[] => [
			{
				id: 'd',
				kind: 'door',
				points: [
					{ x: 0.5, y: 0.6 },
					{ x: 0.5, y: 0.8 },
				],
				style: 'door:door',
				props: { portal: 'door', state, blocksSight: state !== 'open' },
			},
		];
		const from = { x: 0.3, y: 0.7 };
		const to = { x: 0.7, y: 0.7 };

		expect(isVisible(from, to, doorway('open'))).toBe(true);
		expect(isVisible(from, to, doorway('closed'))).toBe(false);
		expect(isVisible(from, to, doorway('locked'))).toBe(false);
	});

	it('casts a visibility polygon that excludes the shadowed half of the room', () => {
		const ring = computeVisibility(observer, walls, { radius: 1, rays: 64 });
		expect(ring.length).toBeGreaterThan(4);
		expect(ringArea(ring)).not.toBe(0);

		// The polygon must contain the observer's own side and exclude the far side of the divider.
		expect(pointInRing(ring, { x: 0.3, y: 0.7 })).toBe(true);
		expect(pointInRing(ring, { x: 0.8, y: 0.75 })).toBe(false);

		// Nothing escapes the room.
		for (const p of ring) {
			expect(p.x).toBeGreaterThanOrEqual(0.1 - 1e-6);
			expect(p.x).toBeLessThanOrEqual(0.9 + 1e-6);
			expect(p.y).toBeGreaterThanOrEqual(0.1 - 1e-6);
			expect(p.y).toBeLessThanOrEqual(0.9 + 1e-6);
		}
	});

	it('is pure — the same inputs always give the same polygon', () => {
		expect(computeVisibility(observer, walls)).toEqual(computeVisibility(observer, walls));
	});
});
