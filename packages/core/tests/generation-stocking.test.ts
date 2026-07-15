import { describe, expect, it } from 'vitest';
import { createRng } from '../src/state/prng';
import type { GeneratedGraph } from '../src/generation/types';
import { MOTIFS, stockDungeon, stockRegion, type Motif } from '../src/generation/stocking';
import { generateName, generateNames, type NameKind } from '../src/generation/names';

/**
 * A dungeon shaped so the key/lock property has teeth: two branches hang off the entrance, EACH behind
 * its own chokepoint. The naive rule ("put the key on the entrance side of the lock") permits putting
 * branch A's key in branch B and branch B's key in branch A — a mutual deadlock that no party can open.
 * The frontier walk must not do that.
 */
function twoBranchGraph(): GeneratedGraph {
	const nodes = [
		{ id: 'n0', position: { x: 0.1, y: 0.5 }, role: 'entrance' },
		{ id: 'n1', position: { x: 0.25, y: 0.5 }, role: 'guard' },
		// Branch A, behind chokepoint n1–a1.
		{ id: 'a1', position: { x: 0.4, y: 0.25 }, role: 'room' },
		{ id: 'a2', position: { x: 0.55, y: 0.2 }, role: 'storage' },
		{ id: 'a3', position: { x: 0.7, y: 0.25 }, role: 'treasure' },
		// Branch B, behind chokepoint n1–b1.
		{ id: 'b1', position: { x: 0.4, y: 0.75 }, role: 'shrine' },
		{ id: 'b2', position: { x: 0.6, y: 0.8 }, role: 'room' },
		// The boss sits behind a THIRD chokepoint, deepest of all.
		{ id: 'boss', position: { x: 0.85, y: 0.8 }, role: 'boss' },
	];
	const edges: GeneratedGraph['edges'] = [
		{ from: 'n0', to: 'n1', kind: 'corridor', chokepoint: true },
		{ from: 'n1', to: 'a1', kind: 'corridor', chokepoint: true },
		{ from: 'a1', to: 'a2', kind: 'corridor' },
		{ from: 'a2', to: 'a3', kind: 'corridor' },
		{ from: 'a3', to: 'a1', kind: 'corridor' }, // a loop: not a chokepoint
		{ from: 'n1', to: 'b1', kind: 'corridor', chokepoint: true },
		{ from: 'b1', to: 'b2', kind: 'corridor' },
		{ from: 'b2', to: 'boss', kind: 'corridor', chokepoint: true },
		{ from: 'a3', to: 'b2', kind: 'secret' }, // a rejected candidate: NOT a way through
	];
	return { nodes, edges };
}

/**
 * The real assertion: play the dungeon. Start at the entrance with no keys, pick up every key in every
 * room you can reach, and only cross a locked door once you hold its key. If any room is unreachable,
 * the stocking produced an unplayable dungeon.
 */
function playthrough(graph: GeneratedGraph, locks: Array<{ from: string; to: string; keyItem: string }>, keysByRoom: Map<string, string[]>): Set<string> {
	const lockKey = (a: string, b: string): string => [a, b].sort().join('|');
	const lockedBy = new Map<string, string>();
	for (const lock of locks) lockedBy.set(lockKey(lock.from, lock.to), lock.keyItem);

	const adjacency = new Map<string, string[]>();
	for (const node of graph.nodes) adjacency.set(node.id, []);
	for (const edge of graph.edges) {
		if (edge.kind !== 'corridor') continue;
		adjacency.get(edge.from)?.push(edge.to);
		adjacency.get(edge.to)?.push(edge.from);
	}

	const entrance = graph.nodes.find((n) => n.role === 'entrance')!.id;
	const reached = new Set<string>([entrance]);
	const held = new Set<string>(keysByRoom.get(entrance) ?? []);

	// Fixed point: keep expanding while any new room or key unlocks something.
	let progressed = true;
	while (progressed) {
		progressed = false;
		for (const from of [...reached]) {
			for (const to of adjacency.get(from) ?? []) {
				if (reached.has(to)) continue;
				const required = lockedBy.get(lockKey(from, to));
				// THE RULE: you may not cross a locked door without already holding its key.
				if (required && !held.has(required)) continue;
				reached.add(to);
				for (const key of keysByRoom.get(to) ?? []) held.add(key);
				progressed = true;
			}
		}
	}
	return reached;
}

describe('stockDungeon', () => {
	const graph = twoBranchGraph();

	it('keys EVERY room', () => {
		const result = stockDungeon(graph, createRng('stock'), {
			motif: 'undead',
			level: 3,
			density: 0.6,
		});

		expect(result.notes).toHaveLength(graph.nodes.length);
		expect(result.rooms).toHaveLength(graph.nodes.length);
		for (const node of graph.nodes) {
			const note = result.notes.find((n) => n.key === node.id);
			expect(note, `room ${node.id} was not keyed`).toBeDefined();
			expect(note!.title.length).toBeGreaterThan(0);
			expect(note!.body.length).toBeGreaterThan(0);
		}
		// Numbered 1..n in breadth-first order from the entrance, so room 1 IS the entrance.
		expect(result.rooms.map((r) => r.number)).toEqual(
			graph.nodes.map((_, i) => i + 1),
		);
		expect(result.rooms[0]!.role).toBe('entrance');
	});

	it('puts the boss in the boss room, and the hoard in the treasure room', () => {
		const result = stockDungeon(graph, createRng('stock'), {
			motif: 'goblinoid',
			level: 5,
			density: 0.5,
		});

		const boss = result.rooms.find((r) => r.role === 'boss')!;
		expect(boss.nodeId).toBe('boss');
		expect(boss.encounter).toBeTruthy();
		expect(boss.treasure).toBeTruthy();
		expect(boss.body).toContain('**Encounter:**');

		const vault = result.rooms.find((r) => r.role === 'treasure')!;
		expect(vault.treasure).toBeTruthy();
		expect(vault.body).toContain('**Treasure:**');

		// The boss and the vault also surface as POIs so they land on the map, not just in the text.
		expect(result.pois.some((p) => p.id === 'boss-poi' && p.category === 'quest')).toBe(true);
		expect(result.pois.some((p) => p.id === 'n0-poi' && p.category === 'landmark')).toBe(true);
	});

	it('places EVERY key so it is reachable BEFORE the lock it opens', () => {
		// Sweep seeds: the property must hold for every draw, not just a lucky one.
		for (let seed = 0; seed < 60; seed += 1) {
			const result = stockDungeon(graph, createRng(`seed-${seed}`), {
				motif: 'cult',
				level: 4,
				density: 0.7,
			});

			// One lock per chokepoint corridor edge.
			expect(result.locks).toHaveLength(4);

			const keysByRoom = new Map<string, string[]>();
			for (const lock of result.locks) {
				const existing = keysByRoom.get(lock.keyNodeId);
				if (existing) existing.push(lock.keyItem);
				else keysByRoom.set(lock.keyNodeId, [lock.keyItem]);
			}

			// Play it. Every room must be reachable — which is only possible if every key was placed
			// somewhere the party can stand before they need the door it opens.
			const reached = playthrough(graph, result.locks, keysByRoom);
			expect(
				[...graph.nodes].map((n) => n.id).filter((id) => !reached.has(id)),
				`seed ${seed}: rooms behind an unopenable lock`,
			).toEqual([]);

			// And the key's room must be stated in that room's text, or the GM cannot hand it over.
			for (const lock of result.locks) {
				const room = result.rooms.find((r) => r.nodeId === lock.keyNodeId)!;
				expect(room.body).toContain(lock.keyItem);
			}
		}
	});

	it('never hides a key behind its own lock even in the mutual-deadlock shape', () => {
		// Explicitly: branch A's key must not sit in branch B while branch B's key sits in branch A.
		const branchA = new Set(['a1', 'a2', 'a3']);
		const branchB = new Set(['b1', 'b2', 'boss']);
		for (let seed = 0; seed < 60; seed += 1) {
			const { locks } = stockDungeon(graph, createRng(`d-${seed}`), {
				motif: 'beast',
				level: 2,
				density: 0.5,
			});
			const lockA = locks.find((l) => l.to === 'a1' || l.from === 'a1')!;
			const lockB = locks.find((l) => l.to === 'b1' || l.from === 'b1')!;
			const deadlocked =
				branchB.has(lockA.keyNodeId) && branchA.has(lockB.keyNodeId);
			expect(deadlocked, `seed ${seed} produced a mutual deadlock`).toBe(false);
		}
	});

	it('is deterministic per seed and differs across seeds', () => {
		const opts = { motif: 'undead' as Motif, level: 3, density: 0.6 };
		const a = stockDungeon(graph, createRng('same'), opts);
		const b = stockDungeon(graph, createRng('same'), opts);
		const c = stockDungeon(graph, createRng('other'), opts);
		expect(a).toEqual(b);
		expect(JSON.stringify(a.notes)).not.toBe(JSON.stringify(c.notes));
	});

	it('handles every motif and an empty graph without throwing', () => {
		for (const motif of MOTIFS) {
			const result = stockDungeon(graph, createRng('m'), { motif, level: 10, density: 1 });
			expect(result.notes).toHaveLength(graph.nodes.length);
			expect(result.rooms.every((r) => r.body.length > 0)).toBe(true);
		}
		expect(stockDungeon({ nodes: [], edges: [] }, createRng('e'), {
			motif: 'fey',
			level: 1,
			density: 0.5,
		})).toEqual({ notes: [], pois: [], rooms: [], locks: [] });
	});

	it('scales content with density — an empty ruin is emptier than a garrison', () => {
		const sparse = stockDungeon(graph, createRng('same'), {
			motif: 'abandoned',
			level: 3,
			density: 0,
		});
		const packed = stockDungeon(graph, createRng('same'), {
			motif: 'abandoned',
			level: 3,
			density: 1,
		});
		const count = (r: ReturnType<typeof stockDungeon>): number =>
			r.rooms.filter((room) => room.encounter !== null).length;
		expect(count(packed)).toBeGreaterThan(count(sparse));
	});

	it('does not mutate the graph it was handed', () => {
		const before = JSON.stringify(graph);
		stockDungeon(graph, createRng('pure'), { motif: 'construct', level: 8, density: 0.5 });
		expect(JSON.stringify(graph)).toBe(before);
	});
});

describe('stockRegion', () => {
	const sites = [
		{ id: 'site-1', position: { x: 0.2, y: 0.3 } },
		{ id: 'site-2', position: { x: 0.7, y: 0.6 } },
		{ id: 'site-3', position: { x: 0.5, y: 0.85 }, label: 'The Sunken Barrow' },
	];

	it('gives every wilderness site a name, a nature, and a hook', () => {
		const result = stockRegion(sites, createRng('region'), {
			motif: 'fey',
			level: 4,
			density: 0.8,
		});
		expect(result.notes).toHaveLength(3);
		expect(result.pois).toHaveLength(3);
		for (const poi of result.pois) {
			expect(poi.label.length).toBeGreaterThan(0);
			expect(poi.notes.length).toBeGreaterThan(0);
			expect(poi.position.x).toBeGreaterThanOrEqual(0);
			expect(poi.position.x).toBeLessThanOrEqual(1);
		}
		// A supplied label is honoured rather than overwritten.
		expect(result.pois[2]!.label).toBe('The Sunken Barrow');
	});

	it('is deterministic per seed', () => {
		const opts = { motif: 'bandit' as Motif, level: 3, density: 0.5 };
		expect(stockRegion(sites, createRng('r'), opts)).toEqual(
			stockRegion(sites, createRng('r'), opts),
		);
	});
});

describe('generateName', () => {
	const kinds: NameKind[] = ['settlement', 'region', 'river', 'person', 'dungeon', 'tavern'];

	it('is deterministic per seed', () => {
		for (const kind of kinds) {
			expect(generateName(createRng('abc'), kind)).toBe(generateName(createRng('abc'), kind));
		}
	});

	it('produces non-empty names that differ across seeds and across kinds', () => {
		for (const kind of kinds) {
			const a = generateName(createRng('seed-a'), kind);
			const b = generateName(createRng('seed-b'), kind);
			expect(a.length).toBeGreaterThan(2);
			expect(a.trim()).toBe(a);
			expect(a).not.toBe(b);
		}

		// The same seed, different kinds → different names. A river must not be named like a person.
		const perKind = kinds.map((kind) => generateName(createRng('one-seed'), kind));
		expect(new Set(perKind).size).toBe(kinds.length);
	});

	it('sounds right per kind', () => {
		// Rivers take the definite article; taverns are adjective + noun; dungeons are "The <something>".
		for (let seed = 0; seed < 40; seed += 1) {
			const rng = createRng(`k-${seed}`);
			expect(generateName(rng, 'river').startsWith('The ')).toBe(true);
			expect(generateName(rng, 'tavern').startsWith('The ')).toBe(true);
			expect(generateName(rng, 'dungeon').startsWith('The ')).toBe(true);
			// A tavern name is at least two words after the article ("The Prancing Sow").
			expect(generateName(rng, 'tavern').split(' ').length).toBeGreaterThanOrEqual(3);
			// A settlement is a proper noun, capitalized, no article.
			const settlement = generateName(rng, 'settlement');
			expect(settlement.startsWith('The ')).toBe(false);
			expect(settlement[0]).toBe(settlement[0]!.toUpperCase());
		}
	});

	it('spreads across the space rather than repeating one name', () => {
		const rng = createRng('spread');
		const names = new Set<string>();
		for (let i = 0; i < 50; i += 1) names.add(generateName(rng, 'settlement'));
		expect(names.size).toBeGreaterThan(40);
	});

	it('generateNames returns the requested count, all distinct', () => {
		const names = generateNames(createRng('many'), 'settlement', 25);
		expect(names).toHaveLength(25);
		expect(new Set(names).size).toBe(25);
	});
});
