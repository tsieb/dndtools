import { describe, expect, it } from 'vitest';

import { hexcrawlGenerator, wildernessGenerator } from '../src/generation/region';
import type { GeneratorContext, GeneratorDefinition, GeneratorOutput } from '../src/generation/types';
import { resolveParams } from '../src/generation/types';
import type { MapLayer } from '../src/state/map-state';
import { createRngStreams } from '../src/state/prng';
import type { Point } from '../src/geometry';
import { dist, pointInRing, pointToSegmentDistance } from '../src/geometry';

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

const REGION = { regionType: 'coastal', settlements: 6, dangers: 6, ruins: 4, roads: true } as const;

describe('region.wilderness — determinism', () => {
	it('produces byte-identical output for the same seed and params', () => {
		const a = run(wildernessGenerator, 'thornwood-barony', REGION);
		const b = run(wildernessGenerator, 'thornwood-barony', REGION);
		expect(a).toEqual(b);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('produces different output for a different seed', () => {
		const a = run(wildernessGenerator, 'thornwood-barony', REGION);
		const b = run(wildernessGenerator, 'ashen-march', REGION);
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
	});

	it('is deterministic across every preset', () => {
		for (const preset of wildernessGenerator.presets) {
			const a = run(wildernessGenerator, 19, preset.values);
			const b = run(wildernessGenerator, 19, preset.values);
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			expect(a.summary).toBeTruthy();
		}
	});
});

describe('region.wilderness — RNG stream isolation', () => {
	it('changing the danger count leaves the terrain, the water and the region name byte-identical', () => {
		const calm = run(wildernessGenerator, 'thornwood-barony', { ...REGION, dangers: 1 });
		const grim = run(wildernessGenerator, 'thornwood-barony', { ...REGION, dangers: 20 });

		// The stocking MUST change…
		expect((grim.pois ?? []).length).toBeGreaterThan((calm.pois ?? []).length);

		// …and the land must not.
		expect(JSON.stringify(layer(calm, 'terrain'))).toBe(JSON.stringify(layer(grim, 'terrain')));
		expect(JSON.stringify(layer(calm, 'water'))).toBe(JSON.stringify(layer(grim, 'water')));

		const nameOf = (o: GeneratorOutput): string =>
			String(layer(o, 'labels').content.find((f) => f.style === 'label:region')?.props?.text ?? '');
		expect(nameOf(calm)).toBe(nameOf(grim));
		expect(nameOf(calm).length).toBeGreaterThan(0);
	});

	it('changing terrain roughness does not touch the region name', () => {
		const smooth = run(wildernessGenerator, 'thornwood-barony', { ...REGION, roughness: 0.25 });
		const rough = run(wildernessGenerator, 'thornwood-barony', { ...REGION, roughness: 0.95 });
		expect(JSON.stringify(layer(smooth, 'terrain'))).not.toBe(JSON.stringify(layer(rough, 'terrain')));
		const nameOf = (o: GeneratorOutput): string =>
			String(layer(o, 'labels').content.find((f) => f.style === 'label:region')?.props?.text ?? '');
		expect(nameOf(smooth)).toBe(nameOf(rough));
	});
});

describe('region.wilderness — bounds', () => {
	it('emits every coordinate inside [0,1]', () => {
		for (const preset of wildernessGenerator.presets) {
			for (const p of allPoints(run(wildernessGenerator, 8, preset.values))) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(1);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('rounds every coordinate to six decimals', () => {
		for (const p of allPoints(run(wildernessGenerator, 'thornwood-barony', REGION))) {
			expect(p.x).toBe(Math.round(p.x * 1_000_000) / 1_000_000);
			expect(p.y).toBe(Math.round(p.y * 1_000_000) / 1_000_000);
		}
	});
});

describe('region.wilderness — content seeding', () => {
	it('never puts a settlement in the ocean', () => {
		// A water region whose outer contour is the map border makes the LAND a hole in the water, so a
		// naive `pointInRing` on the outer ring alone calls every land point "sea". Water membership is the
		// even-odd rule across ALL the water rings — outer boundaries and holes together — which is exactly
		// what a renderer does with them.
		const inWater = (rings: ReadonlyArray<readonly Point[]>, p: Point): boolean => {
			let inside = 0;
			for (const ring of rings) if (pointInRing(ring, p)) inside += 1;
			return inside % 2 === 1;
		};

		// Several seeds AND a flooded coast AND a marsh — one lucky seed proves nothing.
		const cases: Array<Readonly<Record<string, unknown>>> = [
			{ ...REGION },
			{ ...REGION, regionType: 'coastal', waterLevel: 0.5 },
			{ ...REGION, regionType: 'marsh', waterLevel: 0.45 },
			{ ...REGION, regionType: 'inland', waterLevel: 0.4 },
		];
		for (const params of cases) {
			for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
				const output = run(wildernessGenerator, seed, params);
				const waterRings = layer(output, 'water')
					.content.filter((f) => f.props?.role === 'water')
					.map((f) => f.points);
				const settlements = (output.pois ?? []).filter((p) => p.category === 'settlement');
				expect(settlements.length).toBeGreaterThan(0);
				for (const settlement of settlements) {
					expect(inWater(waterRings, settlement.position)).toBe(false);
					// And not merely on the right side of the line: a settlement must be clear of the shore, or
					// the parity check above could pass on a coastline that a smoothing pass moved.
					const toShore = Math.min(
						...waterRings.map((ring) =>
							Math.min(
								...ring.map((_, i) =>
									pointToSegmentDistance(
										settlement.position,
										ring[i] as Point,
										ring[(i + 1) % ring.length] as Point,
									),
								),
							),
						),
					);
					expect(toShore).toBeGreaterThan(0.01);
				}
			}
		}
	});

	it('pushes the dangers away from the settlements (the danger gradient)', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', { ...REGION, separation: 0.08 });
		const settlements = (output.pois ?? []).filter((p) => p.category === 'settlement');
		const dangers = (output.pois ?? []).filter((p) => p.category === 'hazard');
		expect(settlements.length).toBeGreaterThan(0);
		expect(dangers.length).toBeGreaterThan(0);
		for (const danger of dangers) {
			const nearest = Math.min(...settlements.map((s) => dist(s.position, danger.position)));
			// The exclusion radius is `separation * 2`.
			expect(nearest).toBeGreaterThan(0.08 * 2 * 0.999);
		}
	});

	it('names every POI and gives every one of them a hook', () => {
		for (const preset of wildernessGenerator.presets) {
			const output = run(wildernessGenerator, 4, preset.values);
			expect((output.pois ?? []).length).toBeGreaterThan(0);
			for (const poi of output.pois ?? []) {
				expect(poi.label.trim().length).toBeGreaterThan(0);
				expect(poi.notes.trim().length).toBeGreaterThan(0);
			}
			for (const note of output.notes ?? []) {
				expect(note.title.trim().length).toBeGreaterThan(0);
				expect(note.body.trim().length).toBeGreaterThan(0);
			}
			// Every POI must be uniquely addressable.
			const ids = (output.pois ?? []).map((p) => p.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('never names two places in the region the same thing', () => {
		// Two villages called Ravenbury in one barony is not a charming coincidence, it is something the GM
		// has to work around at the table.
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
			const output = run(wildernessGenerator, seed, { ...REGION, settlements: 12, ruins: 10 });
			const names = (output.pois ?? [])
				.filter((p) => p.category === 'settlement' || p.category === 'dungeon')
				.map((p) => p.label);
			expect(names.length).toBeGreaterThan(2);
			expect(new Set(names).size).toBe(names.length);
		}
	});

	it('honours the requested settlement count and ranks the most habitable site as the city', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', { ...REGION, settlements: 6 });
		const settlements = (output.pois ?? []).filter((p) => p.category === 'settlement');
		expect(settlements.length).toBeGreaterThan(0);
		expect(settlements.length).toBeLessThanOrEqual(6);
		const cities = (output.graph?.nodes ?? []).filter((n) => n.role === 'city');
		expect(cities).toHaveLength(1);
	});

	it('connects the settlements: the road graph is one component', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', REGION);
		const graph = output.graph as NonNullable<typeof output.graph>;
		expect(graph.nodes.length).toBeGreaterThan(1);
		const adjacency = new Map<string, string[]>();
		for (const node of graph.nodes) adjacency.set(node.id, []);
		for (const edge of graph.edges) {
			adjacency.get(edge.from)?.push(edge.to);
			adjacency.get(edge.to)?.push(edge.from);
		}
		const start = (graph.nodes[0] as { id: string }).id;
		const seen = new Set<string>([start]);
		const queue = [start];
		while (queue.length > 0) {
			const current = queue.shift() as string;
			for (const next of adjacency.get(current) ?? []) {
				if (seen.has(next)) continue;
				seen.add(next);
				queue.push(next);
			}
		}
		// An MST over the settlements reaches every settlement, by construction.
		expect(seen.size).toBe(graph.nodes.length);
	});

	it('drops the roads when asked to', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', { ...REGION, roads: false });
		expect(layer(output, 'roads').content).toHaveLength(0);
	});

	it('emits terrain polygons and a summary', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', REGION);
		expect(layer(output, 'terrain').content.length).toBeGreaterThan(0);
		for (const f of layer(output, 'terrain').content) {
			expect(f.kind).toBe('polygon');
			expect(f.points.length).toBeGreaterThanOrEqual(3);
		}
		expect(output.summary).toMatch(/\d+ settlements · \d+ dangers · \d+ ruins/);
	});

	it('restricts hooks to the chosen flavours', () => {
		const output = run(wildernessGenerator, 'thornwood-barony', { ...REGION, hooks: ['undead'] });
		const undeadLines = [
			'The dead here do not stay buried, and the locals have stopped asking why.',
			'Something walks the barrows at night wearing a face people recognise.',
		];
		const keyed = (output.pois ?? []).filter((p) => p.category !== 'settlement');
		expect(keyed.length).toBeGreaterThan(0);
		for (const poi of keyed) {
			expect(undeadLines).toContain(poi.notes);
		}
	});
});

describe('region.wilderness — params fail closed', () => {
	it('rejects an out-of-range settlement count', () => {
		const result = resolveParams(wildernessGenerator, { settlements: 99 });
		expect('error' in result).toBe(true);
		if ('error' in result) expect(result.error.paramId).toBe('settlements');
	});

	it('rejects an unknown region type', () => {
		const result = resolveParams(wildernessGenerator, { regionType: 'lunar' });
		expect('error' in result).toBe(true);
	});

	it('rejects an unknown hook flavour', () => {
		const result = resolveParams(wildernessGenerator, { hooks: ['undead', 'aliens'] });
		expect('error' in result).toBe(true);
	});

	it('rejects a non-boolean roads flag', () => {
		const result = resolveParams(wildernessGenerator, { roads: 'yes' });
		expect('error' in result).toBe(true);
	});

	it('declares at most five primary params, all with help, and ships presets', () => {
		expect(wildernessGenerator.params.filter((p) => !p.advanced).length).toBeLessThanOrEqual(5);
		for (const param of wildernessGenerator.params) expect(param.help).toBeTruthy();
		expect(wildernessGenerator.presets.length).toBeGreaterThanOrEqual(4);
	});
});

// ---------------------------------------------------------------------------------------------
// region.hexcrawl
// ---------------------------------------------------------------------------------------------

const HEXCRAWL = { hexSize: 0.08, orientation: 'pointy', stocking: 0.35, coherence: 0.7 } as const;

describe('region.hexcrawl', () => {
	it('is deterministic and seed-sensitive', () => {
		const a = run(hexcrawlGenerator, 'the-march', HEXCRAWL);
		const b = run(hexcrawlGenerator, 'the-march', HEXCRAWL);
		const c = run(hexcrawlGenerator, 'the-fen', HEXCRAWL);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
	});

	it('is deterministic across every preset', () => {
		for (const preset of hexcrawlGenerator.presets) {
			const a = run(hexcrawlGenerator, 21, preset.values);
			const b = run(hexcrawlGenerator, 21, preset.values);
			expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		}
	});

	it('emits every coordinate inside [0,1]', () => {
		for (const preset of hexcrawlGenerator.presets) {
			for (const p of allPoints(run(hexcrawlGenerator, 6, preset.values))) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.x).toBeLessThanOrEqual(1);
				expect(p.y).toBeGreaterThanOrEqual(0);
				expect(p.y).toBeLessThanOrEqual(1);
			}
		}
	});

	it('lays real hexagons in both orientations', () => {
		for (const orientation of ['pointy', 'flat']) {
			const output = run(hexcrawlGenerator, 'the-march', { ...HEXCRAWL, orientation });
			const hexes = layer(output, 'hexes').content;
			expect(hexes.length).toBeGreaterThan(30);
			for (const hex of hexes) {
				expect(hex.kind).toBe('polygon');
				expect(hex.points).toHaveLength(6);
			}
		}
	});

	it('changing the stocking density does not redraw the terrain', () => {
		const sparse = run(hexcrawlGenerator, 'the-march', { ...HEXCRAWL, stocking: 0.1 });
		const dense = run(hexcrawlGenerator, 'the-march', { ...HEXCRAWL, stocking: 0.9 });
		expect(JSON.stringify(layer(sparse, 'hexes'))).toBe(JSON.stringify(layer(dense, 'hexes')));
		expect((dense.pois ?? []).length).toBeGreaterThan((sparse.pois ?? []).length);
	});

	it('stocks hexes with named, keyed content and never stocks open water', () => {
		const output = run(hexcrawlGenerator, 'the-march', { ...HEXCRAWL, stocking: 0.6 });
		expect((output.pois ?? []).length).toBeGreaterThan(0);
		const waterHexes = new Set(
			layer(output, 'hexes')
				.content.filter((f) => f.props?.role === 'water')
				.map((f) => String(f.props?.hex)),
		);
		for (const poi of output.pois ?? []) {
			expect(poi.label.trim().length).toBeGreaterThan(0);
			expect(poi.notes.trim().length).toBeGreaterThan(0);
			const ref = /^Hex ([A-Z]+\d+)/.exec(poi.notes)?.[1];
			expect(ref).toBeTruthy();
			expect(waterHexes.has(ref as string)).toBe(false);
		}
		// Every stocked hex is keyed by its hex reference, which is what a hex-crawl key is FOR.
		const keys = (output.notes ?? []).map((n) => n.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const key of keys) expect(key).toMatch(/^hex-[A-Z]+\d+$/);
	});

	it('labels every hex with its reference', () => {
		const output = run(hexcrawlGenerator, 'the-march', HEXCRAWL);
		const hexes = layer(output, 'hexes').content;
		const labels = layer(output, 'hex-labels').content;
		expect(labels).toHaveLength(hexes.length);
		for (const label of labels) {
			expect(String(label.props?.text ?? '')).toMatch(/^[A-Z]+\d+$/);
		}
	});

	it('honours the terrain mix', () => {
		const output = run(hexcrawlGenerator, 'the-march', {
			...HEXCRAWL,
			terrainMix: ['forest', 'plains'],
		});
		for (const hex of layer(output, 'hexes').content) {
			expect(['forest', 'plains']).toContain(String(hex.props?.role));
		}
		expect(output.summary).toMatch(/\d+ hexes · \d+ stocked · (pointy|flat)-top/);
	});

	it('fails closed on a bad orientation and an unknown terrain', () => {
		expect('error' in resolveParams(hexcrawlGenerator, { orientation: 'diagonal' })).toBe(true);
		expect('error' in resolveParams(hexcrawlGenerator, { terrainMix: ['lava'] })).toBe(true);
		expect('error' in resolveParams(hexcrawlGenerator, { hexSize: 5 })).toBe(true);
	});
});
