import { describe, expect, it } from 'vitest';
import {
	createRngStreams,
	getGenerator,
	measureMapPanZoom,
	resolveParams,
	type GeneratorOutput,
	type MapFeature,
	type MapLayerQueryEntry,
	type MapRenderComplexity,
	type ParamValue,
} from '@dndtools/core';
import { BAKE_FEATURE_THRESHOLD, bakeOps, isBakeable, planBake, type BakeGroup } from './BakeLayer';

/**
 * RC-MAP-3.3 — the perf sample.
 *
 * The acceptance is "under the pan/zoom budgets on the world generator's max output", so the sample
 * is exactly that: a real `world.continent` run at its densest parameters, projected into the core's
 * own `MapRenderComplexity` and graded by the core's own `measureMapPanZoom` against the
 * `map-pan-zoom-desktop` (50 fps) and `map-pan-zoom-slim` (30 fps) budgets. No parallel grader and no
 * invented numbers — this file only decides what counts as a drawn element.
 *
 * One drawn SVG feature is charged as one `visiblePois` unit, because `perPoiMs` is the model's
 * per-drawn-element cost and it has no per-feature term of its own. The bake canvas is charged as one
 * element too, so baking is never free in the model.
 */

const STAMP = { actorId: 'dm-1', now: '2026-09-06T00:00:00.000Z' };

/** The densest world the `world.continent` knobs can produce: every knob turned toward more geometry. */
const DENSEST_WORLD: Readonly<Record<string, ParamValue>> = {
	detail: 4000,
	seaLevel: 0.12,
	octaves: 8,
	terrainDrama: 3.5,
	rivers: 1,
	kingdoms: 12,
	settlements: 40,
	settlementSpacing: 0.02,
	labels: true,
};

function generateDensestWorld(): GeneratorOutput {
	const definition = getGenerator('world.continent');
	if (!definition) throw new Error('world.continent is not in the generator registry');
	const resolved = resolveParams(definition, DENSEST_WORLD);
	if ('error' in resolved) throw new Error(resolved.error.message);
	return definition.run({
		params: resolved.params,
		rng: createRngStreams('rc-map-3.3'),
		idPrefix: 'gen-world',
		visibility: 'dm-only',
		stamp: STAMP,
	});
}

/** The generator's layers as the actor-filtered layer query would hand them to `MapCanvas`. */
function groupsOf(output: GeneratorOutput): BakeGroup[] {
	return output.layers.map((layer, order) => ({
		layer: {
			mapId: 'map-1',
			layerId: layer.id,
			name: layer.name,
			category: layer.category,
			visibility: layer.visibility,
			enabled: true,
			opacity: layer.opacity,
			tags: [],
			query: {},
			locked: false,
			order,
			content: layer.content,
		} satisfies MapLayerQueryEntry,
		features: layer.content,
	}));
}

function complexityOf(groups: readonly BakeGroup[], bakeCanvases: number): MapRenderComplexity {
	const drawn = groups.reduce((n, g) => n + g.features.length, 0) + bakeCanvases;
	return {
		visibleLayers: groups.length,
		visiblePois: drawn,
		visibleFogRegions: 0,
		visibleRoutes: 0,
		visibleTokens: 0,
	};
}

const world = generateDensestWorld();
const worldGroups = groupsOf(world);

describe('planBake on the world generator max output', () => {
	it('the sample really is the dense case the story is about', () => {
		const features = worldGroups.reduce((n, g) => n + g.features.length, 0);
		const vertices = worldGroups.reduce(
			(n, g) => n + g.features.reduce((m, f) => m + f.points.length, 0),
			0,
		);
		expect(features).toBeGreaterThan(300);
		expect(vertices).toBeGreaterThan(15000);
	});

	it('bakes the static fills and leaves everything interactive on the SVG', () => {
		const plan = planBake(worldGroups);
		expect(plan.active).toBe(true);
		expect(plan.bakedFeatures).toBeGreaterThan(150);
		// Nothing is lost or duplicated in the split.
		expect(plan.bakedFeatures + plan.svgFeatures).toBe(
			worldGroups.reduce((n, g) => n + g.features.length, 0),
		);
		for (const g of plan.baked) for (const f of g.features) expect(isBakeable(f)).toBe(true);
		// Markers, text, roads and every other pointable/announceable kind stay where hit-testing and
		// the screen-reader inventory live.
		for (const g of plan.svg) for (const f of g.features) expect(isBakeable(f)).toBe(false);
		const svgKinds = new Set(plan.svg.flatMap((g) => g.features.map((f) => f.kind)));
		expect(svgKinds.has('marker')).toBe(true);
		expect(svgKinds.has('text')).toBe(true);
	});

	it('the baked half really is most of the map geometry', () => {
		const plan = planBake(worldGroups);
		expect(plan.bakedVertices).toBeGreaterThan(plan.svgVertices * 3);
	});
});

describe('pan/zoom budgets', () => {
	it('the unbaked world breaches the slim pan/zoom floor', () => {
		const unbaked = complexityOf(worldGroups, 0);
		expect(measureMapPanZoom(unbaked, 'slim').measurement.result).toBe('breach');
	});

	it('the baked world passes both device-class pan/zoom budgets', () => {
		const plan = planBake(worldGroups);
		const baked = complexityOf(plan.svg, plan.baked.length > 0 ? 1 : 0);
		for (const deviceClass of ['desktop', 'slim'] as const) {
			const { measurement, estimate } = measureMapPanZoom(baked, deviceClass);
			expect(measurement.result, `${deviceClass}: ${estimate.estimatedFps.toFixed(1)} fps`).toBe(
				'pass',
			);
		}
	});

	it('the desktop budget passes either way — the slim floor is what baking buys', () => {
		// Stated so a later change that only ever checks desktop cannot silently lose the win.
		expect(measureMapPanZoom(complexityOf(worldGroups, 0), 'desktop').measurement.result).toBe(
			'pass',
		);
	});
});

describe('planBake below the threshold', () => {
	const smallGroups: BakeGroup[] = [
		{
			layer: {
				mapId: 'map-1',
				layerId: 'l1',
				name: 'Terrain',
				category: 'terrain',
				visibility: 'shared',
				enabled: true,
				opacity: 1,
				tags: [],
				query: {},
				locked: false,
				order: 0,
				content: [],
			},
			features: Array.from({ length: 8 }, (_, i) => ({
				id: `f${i}`,
				kind: 'polygon' as const,
				style: 'terrain:grass',
				points: [
					{ x: 0.1, y: 0.1 },
					{ x: 0.2, y: 0.1 },
					{ x: 0.2, y: 0.2 },
				],
			})) as MapFeature[],
		},
	];

	it('leaves a hand-painted map on the identical SVG path', () => {
		const plan = planBake(smallGroups);
		expect(plan.active).toBe(false);
		expect(plan.baked).toEqual([]);
		// The SAME array, not a copy: a rebuilt array identity would defeat the renderer's memoization
		// on every small map for a feature that map never uses.
		expect(plan.svg).toBe(smallGroups);
	});

	it('fires on count alone once the threshold is crossed', () => {
		const many = [
			{
				layer: smallGroups[0]!.layer,
				features: Array.from({ length: BAKE_FEATURE_THRESHOLD + 1 }, (_, i) => ({
					...smallGroups[0]!.features[0]!,
					id: `f${i}`,
				})),
			},
		];
		expect(planBake(many).active).toBe(true);
	});
});

describe('bakeOps', () => {
	it('emits one op per baked feature, all in token colours', () => {
		const plan = planBake(worldGroups);
		const ops = bakeOps(plan.baked);
		expect(ops.length).toBe(plan.bakedFeatures);
		for (const op of ops) {
			for (const paint of [op.fill, op.stroke]) {
				if (!paint) continue;
				// No raw hex, no literal colour: the canvas resolves semantic tokens at paint time so a
				// theme switch repaints exactly as the SVG's `var(--…)` references do.
				expect(paint.token.startsWith('--'), paint.token).toBe(true);
				expect(paint.alpha).toBeGreaterThan(0);
				expect(paint.alpha).toBeLessThanOrEqual(1);
			}
		}
	});

	it('draws a river as a scaled stroke and a lake as a fill', () => {
		const layer = smallLayer();
		const ops = bakeOps([
			{
				layer,
				features: [
					{
						id: 'river',
						kind: 'water',
						style: 'water:river',
						points: [
							{ x: 0.1, y: 0.1 },
							{ x: 0.5, y: 0.5 },
						],
						props: { width: 0.02 },
					},
					{
						id: 'lake',
						kind: 'water',
						style: 'water:lake',
						points: [
							{ x: 0.1, y: 0.1 },
							{ x: 0.3, y: 0.1 },
							{ x: 0.3, y: 0.3 },
						],
					},
				] as MapFeature[],
			},
		]);
		expect(ops[0]).toMatchObject({ shape: 'polyline', scaledStroke: true, strokeWidth: 2 });
		expect(ops[0]!.fill).toBeUndefined();
		expect(ops[1]).toMatchObject({ shape: 'polygon', scaledStroke: false });
		expect(ops[1]!.fill?.token).toBe('--layer-water');
	});

	it('multiplies the layer opacity into every alpha, as the SVG group does', () => {
		const ops = bakeOps([
			{
				layer: { ...smallLayer(), opacity: 0.5 },
				features: [
					{
						id: 'p',
						kind: 'polygon',
						style: '',
						points: [
							{ x: 0, y: 0 },
							{ x: 1, y: 0 },
							{ x: 1, y: 1 },
						],
					} as MapFeature,
				],
			},
		]);
		expect(ops[0]!.fill?.alpha).toBeCloseTo(0.16);
		expect(ops[0]!.stroke?.alpha).toBeCloseTo(0.5);
	});
});

function smallLayer(): MapLayerQueryEntry {
	return {
		mapId: 'map-1',
		layerId: 'l1',
		name: 'Terrain',
		category: 'terrain',
		visibility: 'shared',
		enabled: true,
		opacity: 1,
		tags: [],
		query: {},
		locked: false,
		order: 0,
		content: [],
	};
}
