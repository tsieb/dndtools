import { describe, expect, it } from 'vitest';

import { pointInRing, ringArea, type Point } from '../src/geometry';
import { createWorldElevation, worldContinent } from '../src/generation/world';
import { numberParam, resolveParams } from '../src/generation/types';
import type { GeneratorContext, GeneratorOutput, ParamValue } from '../src/generation/types';
import type { MapFeature, MapLayer } from '../src/state/map-state';
import { createRngStreams } from '../src/state/prng';

/**
 * MAP-021 — `world.continent`.
 *
 * The load-bearing assertions here are the two that separate a tool from a slot machine:
 *
 *   - STREAM ISOLATION: changing the kingdom count leaves the coastline and the rivers BYTE-identical.
 *   - RIVERS RUN DOWNHILL: every river vertex is lower than the one before it, and every river ends in
 *     water. These are re-derived from the generator's own elevation field, not asserted against a
 *     snapshot, so they hold for any seed rather than for the one seed someone happened to record.
 */

const STAMP = { actorId: 'dm-1', now: '2026-07-14T00:00:00.000Z' };

function resolve(overrides: Readonly<Record<string, unknown>> = {}): Record<string, ParamValue> {
	const resolved = resolveParams(worldContinent, overrides);
	if ('error' in resolved) throw new Error(resolved.error.message);
	return resolved.params;
}

function contextFor(params: Record<string, ParamValue>, seed: number | string): GeneratorContext {
	return {
		params,
		rng: createRngStreams(seed),
		idPrefix: 'gen-world',
		visibility: 'dm-only',
		stamp: STAMP,
	};
}

function generate(
	overrides: Readonly<Record<string, unknown>> = {},
	seed: number | string = 'atlas',
): GeneratorOutput {
	return worldContinent.run(contextFor(resolve(overrides), seed));
}

/** The exact elevation field the run saw: same seed ⇒ same 'elevation' stream ⇒ same draws. */
function elevationFor(
	overrides: Readonly<Record<string, unknown>> = {},
	seed: number | string = 'atlas',
): (p: Point) => number {
	const params = resolve(overrides);
	const field = createWorldElevation(params, createRngStreams(seed).stream('elevation'));
	return (p: Point) => field.at(p.x, p.y);
}

function layer(output: GeneratorOutput, suffix: string): MapLayer {
	const found = output.layers.find((l) => l.id === `gen-world-${suffix}`);
	if (!found) throw new Error(`No layer "${suffix}" in [${output.layers.map((l) => l.id).join(', ')}]`);
	return found;
}

function features(output: GeneratorOutput, suffix: string): MapFeature[] {
	return layer(output, suffix).content;
}

// Coordinates round-trip through norm() (six decimals), and the elevation field has a real gradient, so
// two samples of "the same" point can differ in the last few digits. Everything asserted below is a
// structural property, not a float identity, so it is checked with a tolerance that is orders of
// magnitude smaller than any feature on the map.
const EPSILON = 1e-4;

describe('world.continent — contract', () => {
	it('is deterministic: the same seed and params produce deep-equal output', () => {
		expect(generate({}, 'shared-seed')).toEqual(generate({}, 'shared-seed'));
	});

	it('produces a different world for a different seed', () => {
		const a = generate({}, 'seed-a');
		const b = generate({}, 'seed-b');
		expect(a).not.toEqual(b);
		expect(features(a, 'coastline')).not.toEqual(features(b, 'coastline'));
	});

	it('emits every coordinate inside the normalized 0..1 map space', () => {
		const output = generate({ landShape: 'archipelago' }, 'bounds');
		for (const mapLayer of output.layers) {
			for (const item of mapLayer.content) {
				for (const point of item.points) {
					expect(point.x).toBeGreaterThanOrEqual(0);
					expect(point.x).toBeLessThanOrEqual(1);
					expect(point.y).toBeGreaterThanOrEqual(0);
					expect(point.y).toBeLessThanOrEqual(1);
				}
			}
		}
		for (const poi of output.pois ?? []) {
			expect(poi.position.x).toBeGreaterThanOrEqual(0);
			expect(poi.position.x).toBeLessThanOrEqual(1);
			expect(poi.position.y).toBeGreaterThanOrEqual(0);
			expect(poi.position.y).toBeLessThanOrEqual(1);
		}
	});

	it('emits the eight toggleable layers in their declared categories', () => {
		const output = generate();
		expect(output.layers.map((l) => [l.id, l.category])).toEqual([
			['gen-world-ocean', 'terrain'],
			['gen-world-landmass', 'base'],
			['gen-world-biomes', 'terrain'],
			['gen-world-rivers', 'terrain'],
			['gen-world-coastline', 'base'],
			['gen-world-realms', 'dm-annotations'],
			['gen-world-roads', 'roads'],
			['gen-world-settlements', 'poi'],
		]);
		expect(output.summary).toMatch(/continent · \d+ kingdoms? · \d+ settlements? · \d+ rivers?/);
	});
});

describe('world.continent — stream isolation', () => {
	it('changing the kingdom count leaves the coastline and the rivers byte-identical', () => {
		const four = generate({ kingdoms: 4 }, 'isolation');
		const nine = generate({ kingdoms: 9 }, 'isolation');

		// The headline property: politics is downstream of terrain, and its RNG stream is its own, so a
		// realm count is not allowed to move one metre of coast or rename one river.
		expect(features(nine, 'coastline')).toEqual(features(four, 'coastline'));
		expect(features(nine, 'landmass')).toEqual(features(four, 'landmass'));
		expect(features(nine, 'rivers')).toEqual(features(four, 'rivers'));
		expect(features(nine, 'biomes')).toEqual(features(four, 'biomes'));
		expect(features(nine, 'ocean')).toEqual(features(four, 'ocean'));

		// …and it DID change the thing it was supposed to change.
		expect(features(nine, 'realms').length).toBeGreaterThan(features(four, 'realms').length);
	});

	it('river names survive a change to the kingdom count', () => {
		const before = features(generate({ kingdoms: 2 }, 'isolation'), 'rivers').map((f) => f.props?.name);
		const after = features(generate({ kingdoms: 8 }, 'isolation'), 'rivers').map((f) => f.props?.name);
		expect(before.length).toBeGreaterThan(0);
		expect(after).toEqual(before);
	});

	it('changing the settlement count leaves the terrain and the rivers byte-identical', () => {
		const few = generate({ settlements: 6 }, 'isolation');
		const many = generate({ settlements: 22 }, 'isolation');
		expect(features(many, 'coastline')).toEqual(features(few, 'coastline'));
		expect(features(many, 'rivers')).toEqual(features(few, 'rivers'));
		expect(features(many, 'biomes')).toEqual(features(few, 'biomes'));
		expect(features(many, 'settlements').length).toBeGreaterThan(features(few, 'settlements').length);
	});

	it('dragging the sea level moves the waterline without rerolling the terrain', () => {
		// Sea level draws nothing, so the mesh and the elevation field beneath it are invariant: the same
		// world, with more of it under water. This is why the knob is safe to drag even though (per the
		// module header) it cannot be `applies: 'immediate'`.
		const shallow = generate({ seaLevel: 0.3 }, 'waterline');
		const deep = generate({ seaLevel: 0.5 }, 'waterline');
		const at = elevationFor({}, 'waterline');
		for (const mark of features(deep, 'settlements').filter((f) => f.kind === 'marker')) {
			expect(at(mark.points[0] as Point)).toBeGreaterThan(0.5);
		}
		const shallowArea = totalArea(features(shallow, 'landmass'));
		const deepArea = totalArea(features(deep, 'landmass'));
		expect(deepArea).toBeLessThan(shallowArea);
	});
});

function totalArea(items: readonly MapFeature[]): number {
	return items.reduce((sum, item) => sum + Math.abs(ringArea(item.points)), 0);
}

describe('world.continent — hydrology', () => {
	const SEEDS = ['hydro-1', 'hydro-2', 'hydro-3'];

	it('every river runs downhill from its source to its mouth', () => {
		for (const seed of SEEDS) {
			const output = generate({}, seed);
			const at = elevationFor({}, seed);
			const rivers = features(output, 'rivers');
			expect(rivers.length).toBeGreaterThan(0);
			for (const river of rivers) {
				expect(river.points.length).toBeGreaterThanOrEqual(2);
				let previous = at(river.points[0] as Point);
				for (const point of river.points.slice(1)) {
					const height = at(point);
					expect(height).toBeLessThanOrEqual(previous + EPSILON);
					previous = height;
				}
			}
		}
	});

	it('every river ends in water — an ocean, a lake, or another river that reaches one', () => {
		for (const seed of SEEDS) {
			const output = generate({}, seed);
			const at = elevationFor({}, seed);
			const seaLevel = numberParam(resolve(), 'seaLevel');
			const rivers = features(output, 'rivers');
			const lakes = features(output, 'ocean').filter((f) => f.style === 'water:lake');

			// A confluence is only honest if the river it joins actually exists AND itself gets to water,
			// so resolve every mouth down the chain rather than trusting the label on the tin.
			// A river OWNS the cells it runs through, but its last vertex is BORROWED from whatever it flows
			// into (the sea, a lake, or the trunk it joins), so ownership is keyed on the body only.
			const vertexOwner = new Map<string, number>();
			rivers.forEach((river, index) => {
				for (const point of river.points.slice(0, -1)) vertexOwner.set(`${point.x},${point.y}`, index);
			});

			rivers.forEach((river, index) => {
				const mouth = river.props?.mouth;
				expect(['ocean', 'lake', 'confluence', 'edge']).toContain(mouth);
				const end = river.points[river.points.length - 1] as Point;
				if (mouth === 'ocean') {
					expect(at(end)).toBeLessThanOrEqual(seaLevel + EPSILON);
				} else if (mouth === 'lake') {
					expect(lakes.some((lake) => pointInRing(lake.points, end))).toBe(true);
				} else if (mouth === 'edge') {
					expect(Math.min(end.x, end.y, 1 - end.x, 1 - end.y)).toBeLessThan(0.06);
				} else {
					// Joins another river — and following that river downstream must terminate in water.
					const joined = vertexOwner.get(`${end.x},${end.y}`);
					expect(joined).toBeDefined();
					expect(joined).not.toBe(index);
					const seen = new Set<number>([index]);
					let cursor = joined as number;
					for (;;) {
						expect(seen.has(cursor)).toBe(false); // No cycles: a river cannot flow into itself.
						seen.add(cursor);
						const next = rivers[cursor] as MapFeature;
						if (next.props?.mouth !== 'confluence') {
							expect(['ocean', 'lake', 'edge']).toContain(next.props?.mouth);
							break;
						}
						const tail = next.points[next.points.length - 1] as Point;
						cursor = vertexOwner.get(`${tail.x},${tail.y}`) as number;
						expect(cursor).toBeDefined();
					}
				}
			});
		}
	});

	it('rivers widen downstream: the width carried in props scales with accumulated flow', () => {
		const rivers = features(generate({}, 'hydro-1'), 'rivers');
		const sorted = [...rivers].sort((a, b) => Number(a.props?.flow) - Number(b.props?.flow));
		const smallest = sorted[0] as MapFeature;
		const largest = sorted[sorted.length - 1] as MapFeature;
		expect(Number(largest.props?.width)).toBeGreaterThanOrEqual(Number(smallest.props?.width));
		for (const river of rivers) expect(Number(river.props?.width)).toBeGreaterThan(0);
	});

	it('turning the river dial up produces more rivers than turning it down', () => {
		const few = features(generate({ rivers: 0.1 }, 'hydro-1'), 'rivers');
		const many = features(generate({ rivers: 0.9 }, 'hydro-1'), 'rivers');
		expect(many.length).toBeGreaterThan(few.length);
	});
});

describe('world.continent — regions and settlements', () => {
	it('biome polygons are closed rings with a real area', () => {
		const biomes = features(generate({}, 'biomes'), 'biomes');
		expect(biomes.length).toBeGreaterThan(0);
		for (const region of biomes) {
			expect(region.kind).toBe('polygon');
			expect(region.style).toMatch(/^biome:/);
			expect(region.points.length).toBeGreaterThanOrEqual(3);
			// A ring's first point is NOT repeated at the end (the geometry contract) — being closed is a
			// property of the winding, not of a duplicated vertex.
			expect(region.points[0]).not.toEqual(region.points[region.points.length - 1]);
			expect(Math.abs(ringArea(region.points))).toBeGreaterThan(0);
		}
	});

	it('places every settlement on dry land, never in the ocean or a lake', () => {
		for (const seed of ['towns-1', 'towns-2']) {
			const output = generate({}, seed);
			const at = elevationFor({}, seed);
			const seaLevel = numberParam(resolve(), 'seaLevel');
			const lakes = features(output, 'ocean').filter((f) => f.style === 'water:lake');
			const markers = features(output, 'settlements').filter((f) => f.kind === 'marker');
			expect(markers.length).toBeGreaterThan(0);
			for (const marker of markers) {
				const site = marker.points[0] as Point;
				expect(at(site)).toBeGreaterThan(seaLevel);
				expect(lakes.some((lake) => pointInRing(lake.points, site))).toBe(false);
			}
			// Every settlement is also seeded as a POI, so the DM gets a pin, not just a dot.
			const settlementPois = (output.pois ?? []).filter((p) => p.category === 'settlement');
			expect(settlementPois).toHaveLength(markers.length);
			for (const poi of settlementPois) expect(poi.label.length).toBeGreaterThan(0);
		}
	});

	it('names every settlement, river and kingdom, and notes every kingdom', () => {
		const output = generate({ kingdoms: 3 }, 'names');
		for (const river of features(output, 'rivers')) {
			expect(String(river.props?.name).length).toBeGreaterThan(1);
		}
		for (const marker of features(output, 'settlements').filter((f) => f.kind === 'marker')) {
			expect(String(marker.props?.name).length).toBeGreaterThan(1);
		}
		expect(output.notes).toHaveLength(3);
		for (const note of output.notes ?? []) {
			expect(note.title.length).toBeGreaterThan(1);
			expect(note.body.length).toBeGreaterThan(10);
		}
	});

	it('draws no borders at all when the kingdom count is zero', () => {
		const output = generate({ kingdoms: 0 }, 'no-politics');
		expect(features(output, 'realms')).toHaveLength(0);
		expect(output.notes).toHaveLength(0);
		expect(features(output, 'settlements').length).toBeGreaterThan(0);
	});

	it('roads connect settlements and never run through water', () => {
		const seed = 'roads-1';
		const output = generate({}, seed);
		const at = elevationFor({}, seed);
		const seaLevel = numberParam(resolve(), 'seaLevel');
		const roads = features(output, 'roads');
		expect(roads.length).toBeGreaterThan(0);
		for (const road of roads) {
			expect(road.kind).toBe('road');
			expect(road.points.length).toBeGreaterThanOrEqual(2);
			for (const point of road.points) {
				// Chaikin rounds the corners, so a vertex can sit slightly off its cell; the tolerance keeps
				// the assertion about "roads do not cross open sea" rather than about float noise.
				expect(at(point)).toBeGreaterThan(seaLevel - 0.05);
			}
		}
	});
});

describe('world.continent — params', () => {
	it('declares 3–5 primary knobs and hides the rest behind Advanced', () => {
		const primary = worldContinent.params.filter((p) => !p.advanced);
		expect(primary.map((p) => p.id)).toEqual([
			'landShape',
			'seaLevel',
			'terrainDrama',
			'rivers',
			'detail',
		]);
		for (const spec of worldContinent.params) {
			expect(spec.help ?? '').not.toBe('');
			expect(spec.applies).toBeDefined();
			if (spec.advanced) expect(spec.group).toBeDefined();
		}
		expect(worldContinent.presets.length).toBeGreaterThanOrEqual(3);
	});

	it('accepts every preset and produces a world from each', () => {
		for (const preset of worldContinent.presets) {
			const output = generate(preset.values, `preset-${preset.id}`);
			expect(output.layers.length).toBe(8);
			expect(output.summary ?? '').not.toBe('');
		}
	});

	it('fails closed on an out-of-range or unknown param, with no partial output', () => {
		const tooDeep = resolveParams(worldContinent, { seaLevel: 5 });
		expect(tooDeep).toEqual({
			error: { kind: 'invalid-param', paramId: 'seaLevel', message: expect.any(String) },
		});
		const badShape = resolveParams(worldContinent, { landShape: 'donut' });
		expect('error' in badShape && badShape.error.paramId).toBe('landShape');
		const fractionalCells = resolveParams(worldContinent, { detail: 1400.5 });
		expect('error' in fractionalCells && fractionalCells.error.paramId).toBe('detail');
		// Unknown keys are ignored rather than rejected, so an old preset still loads.
		expect('params' in resolveParams(worldContinent, { legacyKnob: 3 })).toBe(true);
	});
});

describe('world.continent — performance', () => {
	it('generates the default world inside an interactive budget', () => {
		const started = performance.now();
		const output = generate({}, 'perf');
		const elapsed = performance.now() - started;
		expect(output.layers).toHaveLength(8);
		// The target is < 500 ms on a mid laptop; the ceiling here is loose enough not to flake on a
		// loaded CI box while still failing loudly if the pipeline stops being interactive.
		expect(elapsed).toBeLessThan(1500);
	});
});
