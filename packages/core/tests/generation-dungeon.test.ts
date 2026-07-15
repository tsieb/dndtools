import { describe, expect, it } from 'vitest';
import {
	DUNGEON_GENERATORS,
	bspDungeon,
	roomsAndMazesDungeon,
	tinykeepDungeon,
} from '../src/generation/dungeon';
import {
	resolveParams,
	type GeneratedGraph,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
	type ParamValue,
} from '../src/generation/types';
import { createRngStreams } from '../src/state/prng';

/**
 * MAP-021 — the dungeon generator contract.
 *
 * These are not "does it draw something" tests. Each one pins a property the rest of the system leans
 * on: byte-identical replay across devices (Contract 2), sub-stream isolation (so a slider is a nudge
 * and not a reroll), coordinates inside the normalized map square, and a connectivity graph that is
 * actually connected — because "every room is reachable" is the one promise a dungeon generator cannot
 * be allowed to break silently.
 */

const STAMP = { actorId: 'user-dm', now: '2026-07-14T00:00:00.000Z' };

function run(
	definition: GeneratorDefinition,
	seed: number | string,
	raw: Record<string, unknown> = {},
): GeneratorOutput {
	const resolved = resolveParams(definition, raw);
	if ('error' in resolved) throw new Error(`unexpected param error: ${resolved.error.message}`);
	const ctx: GeneratorContext = {
		params: resolved.params,
		rng: createRngStreams(seed),
		idPrefix: 'gen-1',
		visibility: 'dm-only',
		stamp: STAMP,
	};
	return definition.run(ctx);
}

function allPoints(output: GeneratorOutput): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	for (const layer of output.layers) {
		for (const item of layer.content) points.push(...item.points);
	}
	for (const poi of output.pois ?? []) points.push(poi.position);
	for (const node of output.graph?.nodes ?? []) points.push(node.position);
	return points;
}

/** Rooms are the `room`-kind features on the floor layer. Corridors are the polygons. */
function roomFeatures(output: GeneratorOutput) {
	const floor = output.layers.find((layer) => layer.category === 'base');
	expect(floor).toBeDefined();
	return (floor?.content ?? []).filter((item) => item.kind === 'room');
}

function corridorFloors(output: GeneratorOutput) {
	const floor = output.layers.find((layer) => layer.category === 'base');
	return (floor?.content ?? []).filter((item) => item.kind === 'polygon');
}

/** Walk the graph from the entrance over `corridor` edges only. Secret doors do not count as access. */
function reachableFromEntrance(graph: GeneratedGraph): Set<string> {
	const entrance = graph.nodes.find((node) => node.role === 'entrance');
	const adjacency = new Map<string, string[]>();
	for (const node of graph.nodes) adjacency.set(node.id, []);
	for (const edge of graph.edges) {
		if (edge.kind !== 'corridor') continue;
		adjacency.get(edge.from)?.push(edge.to);
		adjacency.get(edge.to)?.push(edge.from);
	}
	const seen = new Set<string>();
	if (!entrance) return seen;
	const queue = [entrance.id];
	seen.add(entrance.id);
	for (let head = 0; head < queue.length; head += 1) {
		for (const next of adjacency.get(queue[head] as string) ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return seen;
}

/** The room-count knob for each generator — the thing a GM drags, and the thing that must NOT reroll
 *  the names and roles of the rooms that survive the change. */
const COUNT_PARAM: Record<string, { id: string; low: ParamValue; high: ParamValue }> = {
	'dungeon.tinykeep': { id: 'roomCount', low: 16, high: 24 },
	'dungeon.bsp': { id: 'roomCount', low: 16, high: 21 },
	'dungeon.rooms-and-mazes': { id: 'roomDensity', low: 140, high: 175 },
};

describe('dungeon generators — registry shape', () => {
	it('ships three dungeon generators with distinct ids, params and presets', () => {
		expect(DUNGEON_GENERATORS.map((g) => g.id)).toEqual([
			'dungeon.tinykeep',
			'dungeon.bsp',
			'dungeon.rooms-and-mazes',
		]);
		for (const definition of DUNGEON_GENERATORS) {
			expect(definition.group).toBe('dungeon');
			expect(definition.presets.length).toBeGreaterThanOrEqual(4);
			expect(definition.presets.length).toBeLessThanOrEqual(6);
			// 3-5 primary knobs: everything else lives behind the Advanced disclosure.
			const primary = definition.params.filter((param) => !param.advanced);
			expect(primary.length).toBeGreaterThanOrEqual(3);
			expect(primary.length).toBeLessThanOrEqual(6);
			for (const param of definition.params) {
				expect(param.label.length).toBeGreaterThan(0);
			}
		}
	});

	it('every preset resolves against its generator and produces a dungeon', () => {
		for (const definition of DUNGEON_GENERATORS) {
			for (const preset of definition.presets) {
				const resolved = resolveParams(definition, preset.values);
				expect('error' in resolved, `${definition.id}/${preset.id}`).toBe(false);
				const output = run(definition, `preset-${preset.id}`, preset.values);
				expect(roomFeatures(output).length, `${definition.id}/${preset.id}`).toBeGreaterThan(1);
			}
		}
	});
});

describe.each(DUNGEON_GENERATORS.map((definition) => [definition.id, definition] as const))(
	'%s',
	(id, definition) => {
		it('is deterministic: the same seed and params produce deep-equal output, twice', () => {
			const a = run(definition, 'seed-alpha');
			const b = run(definition, 'seed-alpha');
			expect(a).toEqual(b);
			// And byte-identical once serialized — the actual Contract 2 requirement.
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		});

		it('a different seed produces a different dungeon', () => {
			const a = run(definition, 'seed-alpha');
			const b = run(definition, 'seed-beta');
			expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
		});

		it('emits every coordinate inside the normalized map square', () => {
			for (const seed of ['seed-alpha', 'seed-beta', 7, 12345]) {
				const output = run(definition, seed);
				const points = allPoints(output);
				expect(points.length).toBeGreaterThan(0);
				for (const point of points) {
					expect(point.x).toBeGreaterThanOrEqual(0);
					expect(point.x).toBeLessThanOrEqual(1);
					expect(point.y).toBeGreaterThanOrEqual(0);
					expect(point.y).toBeLessThanOrEqual(1);
					// norm(): six decimals, so the float serializes identically on every platform.
					expect(point.x).toBe(Math.round(point.x * 1e6) / 1e6);
					expect(point.y).toBe(Math.round(point.y * 1e6) / 1e6);
				}
			}
		});

		it('emits floors on a base layer and the graph on a dm-annotations layer, and never walls/doors/lights', () => {
			const output = run(definition, 'seed-alpha');
			expect(output.layers.map((layer) => layer.category)).toEqual(['base', 'dm-annotations']);
			for (const layer of output.layers) {
				expect(layer.visibility).toBe('dm-only');
				for (const item of layer.content) {
					expect(['wall', 'door', 'light']).not.toContain(item.kind);
				}
			}
			// Corridors are FLOOR, not roads: a wall-derivation pass has to be able to union them with
			// the rooms and take the boundary.
			expect(corridorFloors(output).length).toBeGreaterThan(0);
			for (const item of output.layers[0]?.content ?? []) {
				expect(['room', 'polygon']).toContain(item.kind);
			}
		});

		it('has exactly one entrance and one boss, and every room is reachable from the entrance', () => {
			for (const seed of ['seed-alpha', 'seed-beta', 'seed-gamma', 99]) {
				const output = run(definition, seed);
				const graph = output.graph as GeneratedGraph;
				expect(graph).toBeDefined();

				const rooms = roomFeatures(output);
				expect(graph.nodes.length).toBe(rooms.length);
				expect(graph.nodes.filter((node) => node.role === 'entrance')).toHaveLength(1);
				expect(graph.nodes.filter((node) => node.role === 'boss')).toHaveLength(1);

				// Every node points at a real emitted room feature.
				const featureIds = new Set(rooms.map((room) => room.id));
				for (const node of graph.nodes) {
					expect(featureIds.has(node.featureId ?? '')).toBe(true);
				}

				const reachable = reachableFromEntrance(graph);
				expect(reachable.size, `${id} @ ${seed}: unreachable rooms`).toBe(graph.nodes.length);
			}
		});

		it('marks chokepoints only on edges whose removal really disconnects the dungeon', () => {
			const output = run(definition, 'seed-alpha');
			const graph = output.graph as GeneratedGraph;
			const corridors = graph.edges.filter((edge) => edge.kind === 'corridor');
			expect(corridors.length).toBeGreaterThan(0);

			const connectedWithout = (skip: number): boolean => {
				const adjacency = new Map<string, string[]>();
				for (const node of graph.nodes) adjacency.set(node.id, []);
				corridors.forEach((edge, i) => {
					if (i === skip) return;
					adjacency.get(edge.from)?.push(edge.to);
					adjacency.get(edge.to)?.push(edge.from);
				});
				const start = graph.nodes[0]?.id as string;
				const seen = new Set([start]);
				const queue = [start];
				for (let head = 0; head < queue.length; head += 1) {
					for (const next of adjacency.get(queue[head] as string) ?? []) {
						if (seen.has(next)) continue;
						seen.add(next);
						queue.push(next);
					}
				}
				return seen.size === graph.nodes.length;
			};

			corridors.forEach((edge, i) => {
				expect(Boolean(edge.chokepoint), `edge ${i}`).toBe(!connectedWithout(i));
			});
		});

		it('keeps secret edges out of the corridor network (they are candidates, not connections)', () => {
			const output = run(definition, 'seed-alpha');
			const graph = output.graph as GeneratedGraph;
			const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
			const corridors = new Set(
				graph.edges.filter((e) => e.kind === 'corridor').map((e) => key(e.from, e.to)),
			);
			for (const edge of graph.edges.filter((e) => e.kind === 'secret')) {
				expect(corridors.has(key(edge.from, edge.to))).toBe(false);
			}
		});

		it('seeds POIs for the entrance and the boss at their rooms', () => {
			const output = run(definition, 'seed-alpha');
			const graph = output.graph as GeneratedGraph;
			const pois = output.pois ?? [];
			const entrance = graph.nodes.find((node) => node.role === 'entrance');
			const boss = graph.nodes.find((node) => node.role === 'boss');
			const entrancePoi = pois.find((poi) => poi.id.endsWith('-poi-entrance'));
			const bossPoi = pois.find((poi) => poi.id.endsWith('-poi-boss'));
			expect(entrancePoi?.position).toEqual(entrance?.position);
			expect(entrancePoi?.category).toBe('dungeon');
			expect(bossPoi?.position).toEqual(boss?.position);
			expect(bossPoi?.category).toBe('hazard');
		});

		it('summarizes the run', () => {
			const output = run(definition, 'seed-alpha');
			const graph = output.graph as GeneratedGraph;
			const rooms = roomFeatures(output).length;
			const corridors = graph.edges.filter((e) => e.kind === 'corridor').length;
			const secrets = graph.edges.filter((e) => e.kind === 'secret').length;
			const loops = Math.max(0, corridors - Math.max(0, graph.nodes.length - 1));
			expect(output.summary).toBe(
				`${rooms} room${rooms === 1 ? '' : 's'} · ${loops} loop${loops === 1 ? '' : 's'} · ${secrets} secret door${secrets === 1 ? '' : 's'}`,
			);
		});

		it('STREAM ISOLATION: changing the room count does not reshuffle names or roles', () => {
			const knob = COUNT_PARAM[id] as { id: string; low: ParamValue; high: ParamValue };
			const low = run(definition, 'seed-alpha', { [knob.id]: knob.low });
			const high = run(definition, 'seed-alpha', { [knob.id]: knob.high });

			// The room count really did move — otherwise this test proves nothing.
			expect(roomFeatures(high).length).not.toBe(roomFeatures(low).length);

			const identity = (output: GeneratorOutput) => {
				const map = new Map<number, { name: string; role: string }>();
				for (const room of roomFeatures(output)) {
					map.set(room.props?.index as number, {
						name: room.props?.name as string,
						role: room.props?.role as string,
					});
				}
				return map;
			};
			const before = identity(low);
			const after = identity(high);

			let shared = 0;
			for (const [index, a] of before) {
				const b = after.get(index);
				if (!b) continue;
				shared += 1;
				// A room that survives the change keeps its NAME (the 'names' stream never saw the knob)…
				expect(b.name, `room ${index} was renamed`).toBe(a.name);
				// …and its ROLE, unless the topology moved the entrance or the boss onto it, which is a
				// structural consequence of the new layout rather than a reshuffled RNG stream.
				const structural = ['entrance', 'boss'];
				if (!structural.includes(a.role) && !structural.includes(b.role)) {
					expect(b.role, `room ${index} was re-roled`).toBe(a.role);
				}
			}
			expect(shared, 'no rooms survived the change — the assertion is vacuous').toBeGreaterThan(3);
		});

		it('never emits two overlapping rooms', () => {
			for (const seed of ['seed-alpha', 'seed-beta', 'seed-gamma', 4, 55]) {
				const rects = roomFeatures(run(definition, seed)).map((room) => {
					const [a, b] = room.points as [{ x: number; y: number }, { x: number; y: number }];
					return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
				});
				for (let i = 0; i < rects.length; i += 1) {
					for (let j = i + 1; j < rects.length; j += 1) {
						const a = rects[i] as (typeof rects)[number];
						const b = rects[j] as (typeof rects)[number];
						// Touching walls are fine; sharing floor is not. The epsilon absorbs norm()'s rounding.
						const e = 1e-6;
						const overlap =
							a.x0 < b.x1 - e && b.x0 < a.x1 - e && a.y0 < b.y1 - e && b.y0 < a.y1 - e;
						expect(overlap, `${id} @ ${seed}: rooms ${i} and ${j} overlap`).toBe(false);
					}
				}
			}
		});

		it('validates params fail-closed: an out-of-range value errors and produces nothing', () => {
			const numeric = definition.params.find((p) => p.kind === 'int' || p.kind === 'number');
			expect(numeric).toBeDefined();
			const spec = numeric as Extract<(typeof definition.params)[number], { min: number }>;

			const tooHigh = resolveParams(definition, { [spec.id]: spec.max + 1 });
			expect('error' in tooHigh && tooHigh.error.paramId).toBe(spec.id);

			const tooLow = resolveParams(definition, { [spec.id]: spec.min - 1 });
			expect('error' in tooLow && tooLow.error.kind).toBe('invalid-param');

			const wrongType = resolveParams(definition, { [spec.id]: 'lots' });
			expect('error' in wrongType).toBe(true);

			const select = definition.params.find((p) => p.kind === 'select');
			if (select) {
				const bad = resolveParams(definition, { [select.id]: 'not-an-option' });
				expect('error' in bad && bad.error.paramId).toBe(select.id);
			}

			// Absent params default rather than error, so a preset saved against an older version loads.
			const empty = resolveParams(definition, {});
			expect('error' in empty).toBe(false);
		});
	},
);

describe('dungeon.tinykeep — flagship specifics', () => {
	it('promotes a few grand halls out of many small chambers (size variety is doing work)', () => {
		const varied = run(tinykeepDungeon, 'halls', { sizeVariety: 0.9, roomCount: 30 });
		const areas = roomFeatures(varied).map((room) => {
			const [a, b] = room.points as [{ x: number; y: number }, { x: number; y: number }];
			return Math.abs((b.x - a.x) * (b.y - a.y));
		});
		const mean = areas.reduce((sum, area) => sum + area, 0) / areas.length;
		expect(Math.max(...areas)).toBeGreaterThan(mean * 2);
	});

	it('the dungeon shape knob changes the footprint aspect ratio', () => {
		const aspectOf = (shape: string): number => {
			const output = run(tinykeepDungeon, 'shape', { dungeonShape: shape, roomCount: 30 });
			const points = allPoints(output);
			const xs = points.map((p) => p.x);
			const ys = points.map((p) => p.y);
			const w = Math.max(...xs) - Math.min(...xs);
			const h = Math.max(...ys) - Math.min(...ys);
			return w / Math.max(h, 1e-6);
		};
		expect(aspectOf('linear')).toBeGreaterThan(aspectOf('compact') * 1.5);
	});

	it('loopiness re-adds discarded Delaunay edges as loops', () => {
		const tree = run(tinykeepDungeon, 'loops', { loopiness: 0 });
		const loopy = run(tinykeepDungeon, 'loops', { loopiness: 40 });
		const loopsOf = (output: GeneratorOutput): number => {
			const graph = output.graph as GeneratedGraph;
			const corridors = graph.edges.filter((e) => e.kind === 'corridor').length;
			return corridors - (graph.nodes.length - 1);
		};
		// At 0% the hub graph is exactly the spanning tree, so it carves the minimum number of halls.
		expect(corridorFloors(loopy).length).toBeGreaterThan(corridorFloors(tree).length);
		expect(loopsOf(loopy)).toBeGreaterThan(loopsOf(tree));
		// Every corridor in a tree is a chokepoint. Loops are what stop the whole dungeon being locks.
		const chokepoints = (output: GeneratorOutput): number =>
			(output.graph as GeneratedGraph).edges.filter((e) => e.chokepoint).length;
		expect(chokepoints(loopy)).toBeLessThan(chokepoints(tree));
	});
});

describe('dungeon.bsp — structured specifics', () => {
	it('extra connections is the fix for BSP being a pure tree', () => {
		const pure = run(bspDungeon, 'bsp', { extraConnections: 0 });
		const graph = pure.graph as GeneratedGraph;
		const corridors = graph.edges.filter((e) => e.kind === 'corridor').length;
		expect(corridors).toBe(graph.nodes.length - 1);
		// Every edge of a tree is a chokepoint — which is exactly why the knob exists.
		expect(graph.edges.filter((e) => e.kind === 'corridor' && e.chokepoint)).toHaveLength(corridors);

		const looped = run(bspDungeon, 'bsp', { extraConnections: 40 });
		const loopedGraph = looped.graph as GeneratedGraph;
		expect(loopedGraph.edges.filter((e) => e.kind === 'corridor').length).toBeGreaterThan(
			loopedGraph.nodes.length - 1,
		);
	});
});

describe('dungeon.rooms-and-mazes — graph-paper specifics', () => {
	it('corridor wander changes the corridors without touching the rooms', () => {
		const straight = run(roomsAndMazesDungeon, 'wander', { corridorWander: 0 });
		const twisty = run(roomsAndMazesDungeon, 'wander', { corridorWander: 100 });
		// Rooms come off the 'rooms' stream and corridors off the 'corridors' stream: turning the wander
		// knob must leave room placement and room identity untouched. (Roles legitimately move, because
		// the entrance and the boss are properties of the TOPOLOGY, and the topology is what changed.)
		const identity = (output: GeneratorOutput) =>
			roomFeatures(output).map((room) => ({
				id: room.id,
				points: room.points,
				name: room.props?.name,
			}));
		expect(identity(straight)).toEqual(identity(twisty));
		expect(JSON.stringify(corridorFloors(straight))).not.toBe(
			JSON.stringify(corridorFloors(twisty)),
		);
	});

	it('removing dead ends leaves less corridor than keeping them', () => {
		const kept = run(roomsAndMazesDungeon, 'deadends', { deadEnds: 'keep' });
		const pruned = run(roomsAndMazesDungeon, 'deadends', { deadEnds: 'none' });
		const corridorPoints = (output: GeneratorOutput): number =>
			corridorFloors(output).reduce((sum, item) => sum + item.points.length, 0);
		expect(corridorPoints(pruned)).toBeLessThan(corridorPoints(kept));
	});

	it('never persists the scratch grid — the output is vector only', () => {
		const output = run(roomsAndMazesDungeon, 'vector');
		for (const layer of output.layers) {
			for (const item of layer.content) {
				expect(item.points.length).toBeGreaterThan(0);
				expect(Array.isArray(item.points)).toBe(true);
			}
		}
		expect(JSON.stringify(output)).not.toContain('cells');
	});
});
