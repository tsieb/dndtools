import { describe, expect, it } from 'vitest';

import { cityGenerator, villageGenerator } from '../src/generation/city';
import type { GeneratorContext, GeneratorDefinition, GeneratorOutput } from '../src/generation/types';
import { resolveParams } from '../src/generation/types';
import type { MapFeature, MapLayer } from '../src/state/map-state';
import { createRngStreams } from '../src/state/prng';
import type { Point } from '../src/geometry';
import { pointInRing, pointToSegmentDistance } from '../src/geometry';

/** Run a generator the way the command handler will: resolve params fail-closed, then run. */
function run(
	definition: GeneratorDefinition,
	seed: number | string,
	raw: Readonly<Record<string, unknown>> = {},
): GeneratorOutput {
	const resolved = resolveParams(definition, raw);
	if ('error' in resolved) throw new Error(`unexpected param error: ${resolved.error.message}`);
	const ctx: GeneratorContext = {
		params: resolved.params,
		rng: createRngStreams(seed),
		idPrefix: 'gen-test',
		visibility: 'dm-only',
		stamp: { actorId: 'dm-1', now: '2026-07-14T00:00:00.000Z' },
	};
	return definition.run(ctx);
}

function layer(output: GeneratorOutput, suffix: string): MapLayer {
	const found = output.layers.find((l) => l.id === `gen-test-${suffix}`);
	if (!found) throw new Error(`missing layer "${suffix}" (have: ${output.layers.map((l) => l.id).join(', ')})`);
	return found;
}

function allPoints(output: GeneratorOutput): Point[] {
	const points: Point[] = [];
	for (const l of output.layers) for (const f of l.content) points.push(...f.points);
	for (const poi of output.pois ?? []) points.push(poi.position);
	return points;
}

/** Shortest distance from a point to a polyline. */
function distanceToPolyline(p: Point, line: readonly Point[]): number {
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i + 1 < line.length; i += 1) {
		best = Math.min(best, pointToSegmentDistance(p, line[i] as Point, line[i + 1] as Point));
	}
	return best;
}

function distanceToRing(p: Point, ring: readonly Point[]): number {
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < ring.length; i += 1) {
		best = Math.min(best, pointToSegmentDistance(p, ring[i] as Point, ring[(i + 1) % ring.length] as Point));
	}
	return best;
}

const WALLED_CITY = { size: 12, walls: 'wall', water: 'river', density: 0.6, age: 'organic', gateCount: 4 } as const;

describe('settlement.city — determinism', () => {
	it('produces deep-equal output for the same seed and params', () => {
		const a = run(cityGenerator, 'thornwood', WALLED_CITY);
		const b = run(cityGenerator, 'thornwood', WALLED_CITY);
		expect(a).toEqual(b);
		// Byte-identical, not merely structurally equal — this is the Contract 2 claim.
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('produces different output for a different seed', () => {
		const a = run(cityGenerator, 'thornwood', WALLED_CITY);
		const b = run(cityGenerator, 'greyharbour', WALLED_CITY);
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
	});

	it('is deterministic across every preset', () => {
		for (const preset of cityGenerator.presets) {
			const a = run(cityGenerator, 42, preset.values);
			const b = run(cityGenerator, 42, preset.values);
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			expect(a.summary).toBeTruthy();
		}
	});
});

describe('settlement.city — RNG stream isolation', () => {
	it('changing building density leaves the walls and the city name byte-identical', () => {
		const sparse = run(cityGenerator, 'thornwood', { ...WALLED_CITY, density: 0.25 });
		const dense = run(cityGenerator, 'thornwood', { ...WALLED_CITY, density: 0.95 });

		// The buildings MUST change — otherwise the test proves nothing.
		expect(JSON.stringify(layer(sparse, 'buildings'))).not.toBe(JSON.stringify(layer(dense, 'buildings')));

		// …and nothing else may.
		expect(JSON.stringify(layer(sparse, 'walls'))).toBe(JSON.stringify(layer(dense, 'walls')));
		expect(JSON.stringify(layer(sparse, 'wards'))).toBe(JSON.stringify(layer(dense, 'wards')));
		expect(JSON.stringify(layer(sparse, 'streets'))).toBe(JSON.stringify(layer(dense, 'streets')));
		expect(JSON.stringify(layer(sparse, 'water'))).toBe(JSON.stringify(layer(dense, 'water')));

		const nameOf = (o: GeneratorOutput): string => {
			const label = layer(o, 'labels').content.find((f) => f.style === 'label:city');
			return String(label?.props?.text ?? '');
		};
		expect(nameOf(sparse)).toBe(nameOf(dense));
		expect(nameOf(sparse).length).toBeGreaterThan(0);
	});

	it('changing the street setback does not move the walls or rename the city', () => {
		const a = run(cityGenerator, 'thornwood', { ...WALLED_CITY, buildingSetback: 0.05 });
		const b = run(cityGenerator, 'thornwood', { ...WALLED_CITY, buildingSetback: 0.35 });
		expect(JSON.stringify(layer(a, 'walls'))).toBe(JSON.stringify(layer(b, 'walls')));
		expect(JSON.stringify(layer(a, 'wards'))).toBe(JSON.stringify(layer(b, 'wards')));
		expect(a.summary?.split(' · ')[0]).toBe(b.summary?.split(' · ')[0]);
	});
});

describe('settlement.city — bounds', () => {
	it('emits every coordinate inside [0,1]', () => {
		for (const preset of cityGenerator.presets) {
			const output = run(cityGenerator, 7, preset.values);
			for (const p of allPoints(output)) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(1);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('rounds every coordinate to six decimals', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		for (const p of allPoints(output)) {
			expect(p.x).toBe(Math.round(p.x * 1_000_000) / 1_000_000);
			expect(p.y).toBe(Math.round(p.y * 1_000_000) / 1_000_000);
		}
	});
});

describe('settlement.city — buildings respect their ward and the streets', () => {
	it('every building lies inside its own ward, clear of the ward-boundary streets', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const wards = new Map<number, MapFeature>();
		for (const f of layer(output, 'wards').content) {
			if (typeof f.props?.ward === 'number') continue;
			const match = /-ward-(\d+)$/.exec(f.id);
			if (match) wards.set(Number(match[1]), f);
		}
		const buildings = layer(output, 'buildings').content;
		expect(buildings.length).toBeGreaterThan(40);

		// The alley network runs ALONG the ward boundaries, so clearing the boundary clears the alleys.
		const ALLEY_HALF_WIDTH = 0.0011;
		for (const building of buildings) {
			const wardIndex = building.props?.ward;
			expect(typeof wardIndex).toBe('number');
			const ward = wards.get(wardIndex as number);
			expect(ward).toBeDefined();
			for (const p of building.points) {
				expect(pointInRing((ward as MapFeature).points, p)).toBe(true);
				expect(distanceToRing(p, (ward as MapFeature).points)).toBeGreaterThan(ALLEY_HALF_WIDTH);
			}
		}
	});

	it('no building overlaps an artery (the gate→plaza roads)', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const arteries = layer(output, 'streets').content.filter((f) => f.props?.role === 'artery');
		expect(arteries.length).toBeGreaterThan(0);
		const STREET_HALF_WIDTH = 0.003;
		for (const building of layer(output, 'buildings').content) {
			for (const p of building.points) {
				for (const artery of arteries) {
					expect(distanceToPolyline(p, artery.points)).toBeGreaterThanOrEqual(STREET_HALF_WIDTH);
				}
			}
		}
	});

	it('no two buildings in the same ward overlap each other', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const byWard = new Map<number, MapFeature[]>();
		for (const b of layer(output, 'buildings').content) {
			const ward = b.props?.ward as number;
			const list = byWard.get(ward) ?? [];
			list.push(b);
			byWard.set(ward, list);
		}
		for (const list of byWard.values()) {
			for (let i = 0; i < list.length; i += 1) {
				for (let j = i + 1; j < list.length; j += 1) {
					const a = list[i] as MapFeature;
					const b = list[j] as MapFeature;
					// Subdivision produces disjoint lots and each footprint is inset inside its lot, so no
					// vertex of one building may fall inside another.
					for (const p of a.points) expect(pointInRing(b.points, p)).toBe(false);
					for (const p of b.points) expect(pointInRing(a.points, p)).toBe(false);
				}
			}
		}
	});
});

describe('settlement.city — walls and gates', () => {
	it('a walled city has a CLOSED wall circuit', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const wall = layer(output, 'walls').content.find((f) => f.style === 'wall:city');
		expect(wall).toBeDefined();
		const points = (wall as MapFeature).points;
		expect(points.length).toBeGreaterThan(8);
		expect(points[0]).toEqual(points[points.length - 1]);
	});

	it('every gate sits ON the wall circuit', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const wall = layer(output, 'walls').content.find((f) => f.style === 'wall:city') as MapFeature;
		const gates = (output.pois ?? []).filter((p) => p.id.includes('-poi-gate-'));
		expect(gates.length).toBe(4);
		for (const gate of gates) {
			// A gate is derived as a ray/wall intersection, so it is on a wall SEGMENT to within rounding.
			expect(distanceToPolyline(gate.position, wall.points)).toBeLessThan(1e-4);
		}
	});

	it('places towers along the wall and none off it', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const wall = layer(output, 'walls').content.find((f) => f.style === 'wall:city') as MapFeature;
		const towers = layer(output, 'walls').content.filter((f) => f.style === 'wall:tower');
		expect(towers.length).toBeGreaterThan(4);
		for (const tower of towers) {
			expect(distanceToPolyline(tower.points[0] as Point, wall.points)).toBeLessThan(1e-4);
		}
	});

	it('an unwalled city emits no wall circuit and no gates — only road entries', () => {
		const output = run(cityGenerator, 'thornwood', { ...WALLED_CITY, walls: 'none' });
		expect(layer(output, 'walls').content.filter((f) => f.style === 'wall:city')).toHaveLength(0);
		expect((output.pois ?? []).filter((p) => p.id.includes('-poi-gate-'))).toHaveLength(0);
		// The roads still come in — they just are not gates, and the POI list must not claim they are.
		const entries = (output.pois ?? []).filter((p) => p.id.includes('-poi-entry-'));
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) expect(entry.label).toContain('Road');
	});

	it('a ruined circuit is broken into standing segments', () => {
		const output = run(cityGenerator, 'thornwood', { ...WALLED_CITY, walls: 'ruined' });
		const segments = layer(output, 'walls').content.filter((f) => f.style === 'wall:ruined');
		expect(segments.length).toBeGreaterThan(1);
	});
});

describe('settlement.city — road connectivity', () => {
	it('every gate reaches the market plaza by walking the graph', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const graph = output.graph;
		expect(graph).toBeDefined();
		const { nodes, edges } = graph as NonNullable<typeof graph>;
		const market = nodes.find((n) => n.role === 'market');
		expect(market).toBeDefined();

		const adjacency = new Map<string, string[]>();
		for (const node of nodes) adjacency.set(node.id, []);
		for (const edge of edges) {
			adjacency.get(edge.from)?.push(edge.to);
			adjacency.get(edge.to)?.push(edge.from);
		}

		const gateNodes = nodes.filter((n) => n.role === 'gate');
		expect(gateNodes.length).toBe(4);
		for (const gate of gateNodes) {
			const seen = new Set<string>([gate.id]);
			const queue = [gate.id];
			while (queue.length > 0) {
				const current = queue.shift() as string;
				for (const next of adjacency.get(current) ?? []) {
					if (seen.has(next)) continue;
					seen.add(next);
					queue.push(next);
				}
			}
			expect(seen.has((market as { id: string }).id)).toBe(true);
		}
	});

	it('every artery road physically starts at a gate and ends at the plaza', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const arteries = layer(output, 'streets').content.filter((f) => f.props?.role === 'artery');
		const gates = (output.pois ?? []).filter((p) => p.id.includes('-poi-gate-'));
		const market = (output.pois ?? []).find((p) => p.id.endsWith('-poi-market'));
		expect(market).toBeDefined();
		expect(arteries.length).toBe(gates.length);
		for (const artery of arteries) {
			const first = artery.points[0] as Point;
			const last = artery.points[artery.points.length - 1] as Point;
			expect(gates.some((g) => g.position.x === first.x && g.position.y === first.y)).toBe(true);
			expect(last).toEqual((market as { position: Point }).position);
		}
	});
});

describe('settlement.city — content', () => {
	it('names every POI and every note', () => {
		for (const preset of cityGenerator.presets) {
			const output = run(cityGenerator, 3, preset.values);
			expect((output.pois ?? []).length).toBeGreaterThan(0);
			for (const poi of output.pois ?? []) {
				expect(poi.label.trim().length).toBeGreaterThan(0);
				expect(poi.notes.trim().length).toBeGreaterThan(0);
				expect(poi.id.startsWith('gen-test-')).toBe(true);
			}
			for (const note of output.notes ?? []) {
				expect(note.title.trim().length).toBeGreaterThan(0);
				expect(note.body.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it('seeds a POI for every ward, every gate, the citadel and the market', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const wardCount = layer(output, 'wards').content.filter((f) => f.style.startsWith('ward:')).length;
		const pois = output.pois ?? [];
		expect(pois.filter((p) => p.id.includes('-poi-ward-'))).toHaveLength(wardCount);
		expect(pois.filter((p) => p.id.includes('-poi-gate-'))).toHaveLength(4);
		expect(pois.filter((p) => p.id.endsWith('-poi-citadel'))).toHaveLength(1);
		expect(pois.filter((p) => p.id.endsWith('-poi-market'))).toHaveLength(1);
		expect(output.notes?.length).toBeGreaterThanOrEqual(wardCount);
	});

	it('always gives a city of any size a temple, and never lets the slums take it over', () => {
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
			const output = run(cityGenerator, seed, WALLED_CITY);
			const wards = layer(output, 'wards').content.filter((f) => f.style.startsWith('ward:'));
			const roles = wards.map((w) => String(w.props?.role));
			expect(roles).toContain('temple');
			expect(roles).toContain('market');
			// A medieval city is mostly workshops. A third of it being shantytown is a broken zoning roll.
			const slums = roles.filter((r) => r === 'slum').length;
			expect(slums / roles.length).toBeLessThan(0.34);
		}
	});

	it('gives every ward a distinct name', () => {
		for (const seed of ['a', 'b', 'c', 'd']) {
			const output = run(cityGenerator, seed, { ...WALLED_CITY, size: 20 });
			const names = layer(output, 'wards')
				.content.filter((f) => f.style.startsWith('ward:'))
				.map((f) => String(f.props?.name));
			expect(new Set(names).size).toBe(names.length);
			for (const name of names) expect(name.length).toBeGreaterThan(0);
		}
	});

	it('only puts docks on a city that has water', () => {
		const dry = run(cityGenerator, 'thornwood', { ...WALLED_CITY, water: 'none' });
		const docks = layer(dry, 'wards').content.filter((f) => f.style === 'ward:docks');
		expect(docks).toHaveLength(0);

		const coastal = run(cityGenerator, 'saltmere', { ...WALLED_CITY, water: 'coastal' });
		expect(layer(coastal, 'water').content.some((f) => f.style === 'water:sea')).toBe(true);
	});

	it('bridges the river where an artery crosses it', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		const river = layer(output, 'water').content.find((f) => f.style === 'water:river');
		expect(river).toBeDefined();
		const bridges = layer(output, 'streets').content.filter((f) => f.props?.role === 'bridge');
		// Four gates around a city with a river through it: at least one road must cross the water.
		expect(bridges.length).toBeGreaterThan(0);
		for (const bridge of bridges) {
			expect(distanceToPolyline(bridge.points[0] as Point, (river as MapFeature).points)).toBeLessThan(0.05);
		}
	});

	it('reports a summary naming the wards, buildings and gates', () => {
		const output = run(cityGenerator, 'thornwood', WALLED_CITY);
		expect(output.summary).toMatch(/\d+ wards · \d+ buildings · \d+ gates/);
	});
});

describe('settlement.city — params fail closed', () => {
	it('rejects an out-of-range size with no partial output', () => {
		const result = resolveParams(cityGenerator, { size: 999 });
		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.kind).toBe('invalid-param');
			expect(result.error.paramId).toBe('size');
		}
	});

	it('rejects a non-integer ward count', () => {
		const result = resolveParams(cityGenerator, { size: 12.5 });
		expect('error' in result).toBe(true);
	});

	it('rejects an unknown wall option', () => {
		const result = resolveParams(cityGenerator, { walls: 'adamantine' });
		expect('error' in result).toBe(true);
		if ('error' in result) expect(result.error.paramId).toBe('walls');
	});

	it('rejects an unknown district tag', () => {
		const result = resolveParams(cityGenerator, { wardTypes: ['noble', 'spaceport'] });
		expect('error' in result).toBe(true);
	});

	it('defaults every unspecified param', () => {
		const result = resolveParams(cityGenerator, {});
		expect('error' in result).toBe(false);
		if (!('error' in result)) {
			expect(result.params.size).toBe(12);
			expect(result.params.walls).toBe('wall');
		}
	});

	it('declares at most five primary params (progressive disclosure)', () => {
		const primary = cityGenerator.params.filter((p) => !p.advanced);
		expect(primary.length).toBeLessThanOrEqual(5);
		for (const param of cityGenerator.params) {
			expect(param.help).toBeTruthy();
		}
		expect(cityGenerator.presets.length).toBeGreaterThanOrEqual(4);
	});
});

// ---------------------------------------------------------------------------------------------
// settlement.village
// ---------------------------------------------------------------------------------------------

const VILLAGE = { buildings: 14, layout: 'crossroads', palisade: true, fields: true, water: 'mill' } as const;

describe('settlement.village', () => {
	it('is deterministic and seed-sensitive', () => {
		const a = run(villageGenerator, 'oakhollow', VILLAGE);
		const b = run(villageGenerator, 'oakhollow', VILLAGE);
		const c = run(villageGenerator, 'stonebrook', VILLAGE);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
	});

	it('is deterministic across every preset', () => {
		for (const preset of villageGenerator.presets) {
			const a = run(villageGenerator, 11, preset.values);
			const b = run(villageGenerator, 11, preset.values);
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		}
	});

	it('emits every coordinate inside [0,1]', () => {
		for (const preset of villageGenerator.presets) {
			for (const p of allPoints(run(villageGenerator, 5, preset.values))) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(1);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('changing the building count does not rename the village or move the stream', () => {
		const small = run(villageGenerator, 'oakhollow', { ...VILLAGE, buildings: 6 });
		const large = run(villageGenerator, 'oakhollow', { ...VILLAGE, buildings: 30 });
		expect(JSON.stringify(layer(small, 'water'))).toBe(JSON.stringify(layer(large, 'water')));
		expect(JSON.stringify(layer(small, 'roads'))).toBe(JSON.stringify(layer(large, 'roads')));
		expect(JSON.stringify(layer(small, 'fields'))).toBe(JSON.stringify(layer(large, 'fields')));
		const nameOf = (o: GeneratorOutput): string =>
			String(layer(o, 'labels').content.find((f) => f.style === 'label:settlement')?.props?.text ?? '');
		expect(nameOf(small)).toBe(nameOf(large));
		expect(nameOf(small).length).toBeGreaterThan(0);
		// …and the buildings themselves DID change.
		expect(layer(small, 'buildings').content.length).toBeLessThan(layer(large, 'buildings').content.length);
	});

	it('follows the road: every building sits back from a road, not on it', () => {
		const output = run(villageGenerator, 'oakhollow', VILLAGE);
		const roads = layer(output, 'roads').content.filter((f) => f.props?.role !== 'bridge');
		const buildings = layer(output, 'buildings').content;
		expect(buildings.length).toBeGreaterThan(5);
		for (const building of buildings) {
			if (building.style === 'building:mill') continue; // a mill is ON the water by definition.
			const centre = {
				x: building.points.reduce((s, p) => s + p.x, 0) / building.points.length,
				y: building.points.reduce((s, p) => s + p.y, 0) / building.points.length,
			};
			const nearest = Math.min(...roads.map((r) => distanceToPolyline(centre, r.points)));
			expect(nearest).toBeGreaterThan(0.005); // set back from the verge…
			expect(nearest).toBeLessThan(0.16); // …but still fronting a road.
		}
	});

	it('closes the palisade ring when one is asked for', () => {
		const output = run(villageGenerator, 'oakhollow', VILLAGE);
		const palisade = layer(output, 'structures').content.find((f) => f.style === 'wall:palisade');
		expect(palisade).toBeDefined();
		const points = (palisade as MapFeature).points;
		expect(points[0]).toEqual(points[points.length - 1]);

		const open = run(villageGenerator, 'oakhollow', { ...VILLAGE, palisade: false });
		expect(layer(open, 'structures').content.find((f) => f.style === 'wall:palisade')).toBeUndefined();
	});

	it('names every POI and seeds the mill on the stream', () => {
		const output = run(villageGenerator, 'oakhollow', VILLAGE);
		for (const poi of output.pois ?? []) {
			expect(poi.label.trim().length).toBeGreaterThan(0);
			expect(poi.notes.trim().length).toBeGreaterThan(0);
		}
		expect((output.pois ?? []).some((p) => p.label.includes('Mill'))).toBe(true);
		expect(output.summary).toContain('buildings');
	});

	it('is a different SHAPE from a city, not a smaller one', () => {
		// A village follows a road; a city fills a boundary. The village generator therefore emits no
		// wards at all — the structural claim this generator exists to make.
		const output = run(villageGenerator, 'oakhollow', VILLAGE);
		for (const l of output.layers) {
			for (const f of l.content) expect(f.style.startsWith('ward:')).toBe(false);
		}
	});

	it('fails closed on a bad layout', () => {
		const result = resolveParams(villageGenerator, { layout: 'megacity' });
		expect('error' in result).toBe(true);
	});
});
