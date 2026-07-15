import { describe, expect, it } from 'vitest';
import { createGrid, floodRegions, rasterizeRing } from '../src/geometry';
import {
	caveCellularGenerator,
	caveMazeGenerator,
	caveTunnelsGenerator,
} from '../src/generation/cave';
import { scatterForestGenerator, scatterPropsGenerator } from '../src/generation/scatter';
import {
	resolveParams,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
} from '../src/generation/types';
import { createRngStreams } from '../src/state/prng';

/**
 * MAP-021 — cave/maze/scatter generator contract tests.
 *
 * The load-bearing assertion in this file is CONNECTIVITY. Determinism and bounds are hygiene; a cave
 * that is secretly two caves is a map a party physically cannot cross, and it is exactly the failure
 * mode cellular automata produces by default. So the emitted vector polygons are rasterized BACK into a
 * grid and flood-filled: whatever the algorithm believed about its own grid, the geometry that actually
 * ships has to be one region.
 */

const STAMP = { actorId: 'actor-dm', now: '2026-07-14T00:00:00.000Z' };

function makeContext(
	definition: GeneratorDefinition,
	raw: Readonly<Record<string, unknown>>,
	seed: number | string,
): GeneratorContext {
	const resolved = resolveParams(definition, raw);
	if ('error' in resolved) throw new Error(`unexpected param error: ${resolved.error.message}`);
	return {
		params: resolved.params,
		rng: createRngStreams(seed),
		idPrefix: 'gen1',
		visibility: 'dm-only',
		stamp: STAMP,
	};
}

function run(
	definition: GeneratorDefinition,
	raw: Readonly<Record<string, unknown>> = {},
	seed: number | string = 7,
): GeneratorOutput {
	return definition.run(makeContext(definition, raw, seed));
}

/** Rasterize the emitted BASE-layer floor polygons and count 4-connected regions. */
function floorRegionCount(output: GeneratorOutput, resolution = 256): number {
	const grid = createGrid(resolution, resolution, 0);
	for (const layer of output.layers) {
		if (layer.category !== 'base') continue;
		for (const item of layer.content) {
			if (item.kind !== 'polygon') continue;
			rasterizeRing(grid, item.points, 1);
		}
	}
	return floodRegions(grid, 1).length;
}

function allPoints(output: GeneratorOutput): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	for (const layer of output.layers) {
		for (const item of layer.content) points.push(...item.points);
	}
	for (const poi of output.pois ?? []) points.push(poi.position);
	return points;
}

function polygons(output: GeneratorOutput) {
	return output.layers.flatMap((layer) => layer.content.filter((item) => item.kind === 'polygon'));
}

const CAVES = [
	{ name: 'cave.cellular', definition: caveCellularGenerator },
	{ name: 'cave.tunnels', definition: caveTunnelsGenerator },
	{ name: 'cave.maze', definition: caveMazeGenerator },
] as const;

const SCATTERS = [
	{ name: 'scatter.props', definition: scatterPropsGenerator },
	{ name: 'scatter.forest', definition: scatterForestGenerator },
] as const;

const ALL = [...CAVES, ...SCATTERS];

describe('generator registry shape', () => {
	it.each(ALL)('$name declares a usable, self-consistent contract', ({ definition }) => {
		expect(definition.params.length).toBeGreaterThan(0);
		expect(definition.presets.length).toBeGreaterThanOrEqual(4);
		expect(definition.presets.length).toBeLessThanOrEqual(6);
		// 3–5 primary knobs: everything past that must be behind the Advanced disclosure.
		const primary = definition.params.filter((param) => !param.advanced);
		expect(primary.length).toBeGreaterThanOrEqual(3);
		expect(primary.length).toBeLessThanOrEqual(6);
		for (const param of definition.params) expect(param.help).toBeTruthy();
	});

	it.each(ALL)('$name presets all resolve against the declared params', ({ definition }) => {
		for (const preset of definition.presets) {
			const resolved = resolveParams(definition, preset.values);
			expect('error' in resolved ? resolved.error : null).toBeNull();
		}
	});

	it.each(ALL)('$name produces a summary line', ({ definition }) => {
		expect(run(definition).summary).toBeTruthy();
	});
});

describe('determinism (Contract 2)', () => {
	it.each(ALL)('$name — same seed + params ⇒ deep-equal output', ({ definition }) => {
		const first = run(definition, {}, 'anvil');
		const second = run(definition, {}, 'anvil');
		expect(second).toEqual(first);
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it.each(ALL)('$name — a different seed produces different output', ({ definition }) => {
		const a = JSON.stringify(run(definition, {}, 'anvil'));
		const b = JSON.stringify(run(definition, {}, 'basilisk'));
		expect(b).not.toBe(a);
	});

	it.each(ALL)('$name — every preset is deterministic too', ({ definition }) => {
		for (const preset of definition.presets) {
			const first = run(definition, preset.values, 42);
			const second = run(definition, preset.values, 42);
			expect(second).toEqual(first);
		}
	});
});

/** Collect the out-of-range coordinates rather than asserting per point: a cave carries tens of thousands
 *  of vertices, and one `expect()` each turns a 50 ms check into a 20-second one. */
function outOfBounds(output: GeneratorOutput): Array<{ x: number; y: number }> {
	return allPoints(output).filter(
		(point) =>
			!(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) ||
			!Number.isFinite(point.x) ||
			!Number.isFinite(point.y),
	);
}

describe('bounds — every emitted coordinate is normalized 0..1', () => {
	it.each(ALL)('$name (defaults)', ({ definition }) => {
		const output = run(definition);
		expect(allPoints(output).length).toBeGreaterThan(0);
		expect(outOfBounds(output)).toEqual([]);
	});

	it.each(ALL)('$name (every preset, several seeds)', ({ definition }) => {
		const strays: Array<{ x: number; y: number }> = [];
		for (const preset of definition.presets) {
			for (const seed of [1, 2, 3]) {
				strays.push(...outOfBounds(run(definition, preset.values, seed)));
			}
		}
		expect(strays).toEqual([]);
	});
});

describe('polygon well-formedness', () => {
	it.each(CAVES)('$name emits closed rings with no repeated closing vertex', ({ definition }) => {
		const rings = polygons(run(definition));
		expect(rings.length).toBeGreaterThan(0);
		for (const ring of rings) {
			expect(ring.points.length).toBeGreaterThanOrEqual(3);
			const first = ring.points[0]!;
			const last = ring.points[ring.points.length - 1]!;
			// A ring is implicitly closed; a repeated final vertex is a zero-length edge.
			expect(first.x === last.x && first.y === last.y).toBe(false);
		}
	});

	it.each(CAVES)('$name emits floor on the base layer and no walls', ({ definition }) => {
		const output = run(definition);
		const base = output.layers.filter((layer) => layer.category === 'base');
		expect(base.length).toBe(1);
		expect(base[0]!.content.length).toBeGreaterThan(0);
		for (const layer of output.layers) {
			for (const item of layer.content) {
				// Wall/door/light derivation is a separate pass over the floor geometry; a generator that
				// also emitted walls would be a second source of truth for the same edge.
				expect(item.kind).not.toBe('wall');
				expect(item.kind).not.toBe('door');
				expect(item.kind).not.toBe('light');
			}
		}
	});
});

describe('CONNECTIVITY — the cave that ships is one region', () => {
	it('cave.cellular is a single connected region across seeds', () => {
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			expect(floorRegionCount(run(caveCellularGenerator, {}, seed))).toBe(1);
		}
	});

	it('cave.cellular stays connected at the extremes of its openness range', () => {
		for (const openness of [0, 0.25, 0.5, 0.75, 1]) {
			for (const seed of [11, 12, 13]) {
				const output = run(caveCellularGenerator, { openness, smoothing: 4 }, seed);
				expect(floorRegionCount(output)).toBe(1);
			}
		}
	});

	it('cave.cellular stays connected under every preset', () => {
		for (const preset of caveCellularGenerator.presets) {
			for (const seed of [21, 22]) {
				expect(floorRegionCount(run(caveCellularGenerator, preset.values, seed))).toBe(1);
			}
		}
	});

	it('cave.tunnels is a single connected region across seeds', () => {
		for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
			expect(floorRegionCount(run(caveTunnelsGenerator, {}, seed))).toBe(1);
		}
	});

	it('cave.tunnels repairs connectivity even when diggers start anywhere', () => {
		for (const seed of [31, 32, 33, 34]) {
			const output = run(caveTunnelsGenerator, { spawnMode: 'random', branches: 6 }, seed);
			expect(floorRegionCount(output)).toBe(1);
		}
	});

	it('cave.tunnels stays connected under every preset', () => {
		for (const preset of caveTunnelsGenerator.presets) {
			for (const seed of [41, 42]) {
				expect(floorRegionCount(run(caveTunnelsGenerator, preset.values, seed))).toBe(1);
			}
		}
	});

	it('cave.maze is fully walkable (a spanning tree has one component)', () => {
		for (const seed of [1, 2, 3, 4]) {
			expect(floorRegionCount(run(caveMazeGenerator, {}, seed))).toBe(1);
		}
		for (const preset of caveMazeGenerator.presets) {
			expect(floorRegionCount(run(caveMazeGenerator, preset.values, 51))).toBe(1);
		}
	});
});

describe('stream isolation — nudging one subsystem does not reroll another', () => {
	it('scatter.props: changing rotation or size does not move a single object', () => {
		const base = run(scatterPropsGenerator, { rotation: 'random', sizeVariation: 0.4 }, 'oak');
		const rotated = run(scatterPropsGenerator, { rotation: 'snap45', sizeVariation: 0.9 }, 'oak');
		const positions = (output: GeneratorOutput) =>
			output.layers[0]!.content.map((item) => item.points[0]!);
		expect(positions(rotated)).toEqual(positions(base));
		// …and the appearance genuinely did change, so the test is not vacuous.
		expect(JSON.stringify(rotated)).not.toBe(JSON.stringify(base));
	});

	it('scatter.forest: thinning the undergrowth leaves every canopy tree untouched', () => {
		const canopyOf = (output: GeneratorOutput) =>
			output.layers[0]!.content.filter((item) => item.props?.tier === 'canopy');
		const thick = run(scatterForestGenerator, { undergrowth: 0.9 }, 'grove');
		const thin = run(scatterForestGenerator, { undergrowth: 0.15 }, 'grove');
		expect(canopyOf(thin)).toEqual(canopyOf(thick));
		expect(canopyOf(thin).length).toBeGreaterThan(0);
		const underOf = (output: GeneratorOutput) =>
			output.layers[0]!.content.filter((item) => item.props?.tier === 'undergrowth');
		expect(underOf(thin).length).toBeLessThan(underOf(thick).length);
	});

	it('cave.cellular: re-smoothing the rock does not rename the cave', () => {
		const labels = (output: GeneratorOutput) => (output.pois ?? []).map((poi) => poi.label);
		const rough = run(caveCellularGenerator, { smoothing: 2 }, 'delve');
		const smooth = run(caveCellularGenerator, { smoothing: 7 }, 'delve');
		expect(labels(smooth)).toEqual(labels(rough));
		expect(labels(smooth).length).toBe(2);
		// The geometry did change — the name stream is isolated, not the whole generator.
		expect(JSON.stringify(smooth.layers)).not.toBe(JSON.stringify(rough.layers));
	});

	it('cave.tunnels: re-cutting the tunnel width does not re-walk the diggers', () => {
		const names = (output: GeneratorOutput) => (output.pois ?? []).map((poi) => poi.label);
		const narrow = run(caveTunnelsGenerator, { widthVariation: 0 }, 'burrow');
		const varied = run(caveTunnelsGenerator, { widthVariation: 1 }, 'burrow');
		expect(names(varied)).toEqual(names(narrow));
		// The diggers walked the same route: the entrance and the deep end are unmoved.
		expect((varied.pois ?? []).map((poi) => poi.position)).toEqual(
			(narrow.pois ?? []).map((poi) => poi.position),
		);
		expect(JSON.stringify(varied.layers)).not.toBe(JSON.stringify(narrow.layers));
	});
});

describe('param validation is fail-closed', () => {
	it.each(ALL)('$name rejects an out-of-range number with no partial output', ({ definition }) => {
		const numeric = definition.params.find(
			(param) => param.kind === 'number' || param.kind === 'int',
		);
		expect(numeric).toBeDefined();
		const spec = numeric as Extract<(typeof definition.params)[number], { kind: 'number' | 'int' }>;
		const result = resolveParams(definition, { [spec.id]: spec.max + 1 });
		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.kind).toBe('invalid-param');
			expect(result.error.paramId).toBe(spec.id);
		}
	});

	it.each(ALL)('$name rejects an unknown select option', ({ definition }) => {
		const select = definition.params.find((param) => param.kind === 'select');
		if (!select) return;
		const result = resolveParams(definition, { [select.id]: 'not-a-real-option' });
		expect('error' in result).toBe(true);
	});

	it('cave.cellular rejects a non-integer smoothing count', () => {
		const result = resolveParams(caveCellularGenerator, { smoothing: 3.5 });
		expect('error' in result).toBe(true);
	});
});

describe('scatter output shape', () => {
	it('scatter.props emits props with asset, rotation and scale on a terrain layer', () => {
		const output = run(scatterPropsGenerator, { object: 'graves', rotation: 'snap45' }, 'yard');
		const layer = output.layers[0]!;
		expect(layer.category).toBe('terrain');
		expect(layer.content.length).toBeGreaterThan(0);
		for (const item of layer.content) {
			expect(item.kind).toBe('prop');
			expect(item.points.length).toBe(1);
			expect(typeof item.props?.asset).toBe('string');
			expect(typeof item.props?.rotation).toBe('number');
			expect(typeof item.props?.scale).toBe('number');
			expect((item.props?.rotation as number) % 45).toBe(0);
		}
	});

	it('scatter.props density reads in the direction it is labelled', () => {
		const sparse = run(scatterPropsGenerator, { density: 0.1, clustering: 0 }, 'field');
		const dense = run(scatterPropsGenerator, { density: 0.9, clustering: 0 }, 'field');
		expect(dense.layers[0]!.content.length).toBeGreaterThan(sparse.layers[0]!.content.length);
	});

	it('scatter.forest emits two tiers of prop on a terrain layer', () => {
		const output = run(scatterForestGenerator);
		const layer = output.layers[0]!;
		expect(layer.category).toBe('terrain');
		const tiers = new Set(layer.content.map((item) => item.props?.tier));
		expect(tiers.has('canopy')).toBe(true);
		expect(tiers.has('undergrowth')).toBe(true);
		for (const item of layer.content) expect(item.kind).toBe('prop');
	});

	it('scatter.forest glades carve real clearings rather than thinning everything evenly', () => {
		// The claim is NOT "fewer trees" — the density field redistributes trees, it does not delete them.
		// The claim is that bare ground appears: with glades off the wood is an even lawn that touches
		// every part of the map, and with glades on there are patches you can actually stand in.
		const bareCells = (output: GeneratorOutput, divisions = 12): number => {
			const occupied = new Set<number>();
			for (const item of output.layers[0]!.content) {
				const point = item.points[0]!;
				const cx = Math.min(divisions - 1, Math.floor(point.x * divisions));
				const cy = Math.min(divisions - 1, Math.floor(point.y * divisions));
				occupied.add(cy * divisions + cx);
			}
			return divisions * divisions - occupied.size;
		};
		const even = run(scatterForestGenerator, { glades: 0, density: 0.6 }, 'wood');
		const gladed = run(scatterForestGenerator, { glades: 1, density: 0.6 }, 'wood');
		expect(bareCells(gladed)).toBeGreaterThan(bareCells(even));
	});
});
