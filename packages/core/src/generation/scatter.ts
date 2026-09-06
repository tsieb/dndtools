import {
	clamp,
	clamp01,
	createValueNoise,
	domainWarp,
	fbm,
	poissonDisk,
	type NoiseField,
	type Point,
	type Rect,
} from '../geometry';
import type { SeededRng } from '../state/prng';
import type { MapFeature } from '../state/map-state';
import {
	buildLayer,
	feature,
	numberParam,
	stringParam,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
} from './types';

/**
 * MAP-021 — the SCATTER generator family: prop dressing and woodland.
 *
 * Scatter is the workhorse. A map is not finished when its walls are drawn; it is finished when there is
 * something to hide behind. Both generators here rest on the same two ideas:
 *
 *   - **Poisson-disk, never uniform random.** A uniform `random()` scatter clumps and gaps by accident,
 *     and the eye reads the clumps as intent — as if the generator meant something by them. Blue noise
 *     (Bridson) is random in the way people actually mean when they say random: no two objects closer
 *     than `r`, and no visible lattice either.
 *
 *   - **Variable radius, driven by a noise field.** A single global `r` gives an even lawn of trees, and
 *     nothing in nature is an even lawn. Feeding `radiusAt` from a coherent noise field makes the same
 *     sampler produce thickets and glades in one pass — the density itself varies over the map instead of
 *     being constant. This is the single change that makes procedural scatter stop looking procedural,
 *     and it costs one extra field lookup per candidate.
 *
 * Density is exposed as DENSITY, not as the Poisson radius it actually drives — they run in opposite
 * directions, and a slider you drag right to get less of something is a slider nobody trusts.
 */

/**
 * RC-MAP-3.1 — the prop CATALOGUE (what a prop IS: category, glyph, default scale) lives in `./props`;
 * this file owns the SAMPLERS (where props go). It is re-exported here because scatter is the module
 * every consumer of props already imports, and because `OBJECT_KINDS` below may only stock ids the
 * catalogue stocks — `tests/generation-props.test.ts` holds the two sides together.
 */
export type { PropCatalogEntry, PropCategoryId } from './props';
export { getProp, PROP_CATALOG, PROP_CATEGORIES, propsInCategory, searchProps } from './props';

/** Absolute ceiling on emitted props, whatever the params say. A map is dressing, not a particle system. */
const MAX_SCATTER = 3000;

interface ObjectKind {
	/** Plural noun for the summary line. */
	noun: string;
	/** Style token for the emitted feature. */
	style: string;
	/** Asset tokens, with weights: variety, but with a dominant species rather than an even mix. */
	assets: readonly string[];
	weights: readonly number[];
	/** Baseline scale for this object class before per-instance variation. */
	scale: number;
}

const OBJECT_KINDS: Readonly<Record<string, ObjectKind>> = {
	trees: {
		noun: 'trees',
		style: 'prop:tree',
		assets: ['tree.oak', 'tree.pine', 'tree.birch', 'tree.dead'],
		weights: [5, 4, 2, 1],
		scale: 1,
	},
	rocks: {
		noun: 'rocks',
		style: 'prop:rock',
		assets: ['rock.boulder', 'rock.slab', 'rock.cluster', 'rock.spire'],
		weights: [4, 3, 3, 1],
		scale: 0.9,
	},
	rubble: {
		noun: 'piles of rubble',
		style: 'prop:rubble',
		assets: ['rubble.pile', 'rubble.scatter', 'rubble.chunk', 'rubble.column'],
		weights: [4, 4, 2, 1],
		scale: 0.8,
	},
	crates: {
		noun: 'crates',
		style: 'prop:crate',
		assets: ['crate.large', 'crate.small', 'crate.stack', 'sack.pile'],
		weights: [3, 4, 2, 2],
		scale: 0.8,
	},
	graves: {
		noun: 'graves',
		style: 'prop:grave',
		assets: ['grave.headstone', 'grave.cross', 'grave.tomb', 'grave.mound'],
		weights: [5, 3, 1, 2],
		scale: 0.9,
	},
	mushrooms: {
		noun: 'mushrooms',
		style: 'prop:mushroom',
		assets: ['mushroom.cap', 'mushroom.cluster', 'mushroom.glowing', 'mushroom.giant'],
		weights: [5, 4, 2, 1],
		scale: 0.7,
	},
	bones: {
		noun: 'bones',
		style: 'prop:bone',
		assets: ['bone.skull', 'bone.ribcage', 'bone.pile', 'bone.horns'],
		weights: [4, 2, 4, 1],
		scale: 0.7,
	},
	barrels: {
		noun: 'barrels',
		style: 'prop:barrel',
		assets: ['barrel.upright', 'barrel.tipped', 'barrel.stack', 'barrel.broken'],
		weights: [5, 2, 2, 1],
		scale: 0.8,
	},
};

/**
 * The object kinds the `object` param accepts, in menu order. Exported so a test can run every one of
 * them and check the styles they emit against the prop catalogue (RC-MAP-3.1).
 */
export const OBJECT_KIND_IDS: readonly string[] = Object.freeze(Object.keys(OBJECT_KINDS));

const TREE_MIXES: Readonly<
	Record<string, { canopy: readonly string[]; weights: readonly number[] }>
> = {
	broadleaf: { canopy: ['tree.oak', 'tree.beech', 'tree.birch'], weights: [5, 3, 2] },
	conifer: { canopy: ['tree.pine', 'tree.fir', 'tree.spruce'], weights: [5, 3, 2] },
	mixed: { canopy: ['tree.oak', 'tree.pine', 'tree.birch', 'tree.beech'], weights: [4, 4, 2, 2] },
	dead: { canopy: ['tree.dead', 'tree.snag', 'tree.stump'], weights: [5, 3, 2] },
};

const UNDERGROWTH_ASSETS = [
	'shrub.bush',
	'shrub.fern',
	'shrub.bramble',
	'tree.sapling',
	'rock.small',
];
const UNDERGROWTH_WEIGHTS = [4, 4, 3, 3, 1];

/** A seed for a noise field, drawn from a named stream so the field is deterministic but isolated. */
function noiseSeed(rng: SeededRng): number {
	return Math.floor(rng.next() * 0x7fffffff);
}

/**
 * The clustering field, in 0..1. A plain fbm reads as "noise" the moment you look at more than one map
 * of it; warping its own sample coordinates by a second field breaks the tell-tale blobby regularity for
 * the price of one extra lookup, and the result reads as terrain instead.
 */
function densityField(seed: number, frequency: number): NoiseField {
	const base = fbm(createValueNoise(seed), { octaves: 3, frequency, persistence: 0.55 });
	const warp = fbm(createValueNoise((seed ^ 0x9e3779b9) >>> 0), {
		octaves: 2,
		frequency: frequency * 0.5,
	});
	const warped = domainWarp(base, warp, 0.3);
	return { at: (x: number, y: number) => clamp01((warped.at(x, y) + 1) / 2) };
}

/**
 * Turn the density field into a Poisson RADIUS function. `clustering` is the amplitude: at 0 the radius
 * is flat and the scatter is even blue noise; at 1 the sampler packs objects almost twice as tight in the
 * field's peaks as in its troughs, which is what produces thickets and clearings rather than a lawn.
 */
function clusteredRadius(
	base: number,
	clustering: number,
	field: NoiseField,
): (p: Point) => number {
	if (clustering <= 0) return () => base;
	return (p: Point) => {
		const t = field.at(p.x, p.y);
		const factor = 1 + clustering * (0.9 - 1.8 * t);
		return base * Math.max(0.25, factor);
	};
}

function insetBounds(margin: number): Rect {
	const m = clamp(margin, 0, 0.45);
	return { x: m, y: m, w: 1 - m * 2, h: 1 - m * 2 };
}

/** Rotation, by intent rather than by number: props that face anywhere, props that all face the same way
 *  (a stacked storeroom), and props on a 45° lattice (worked stone, graves in rows). */
function rotationFor(mode: string, rng: SeededRng): number {
	if (mode === 'aligned') return 0;
	if (mode === 'snap45') return rng.nextInt(0, 7) * 45;
	return Math.round(rng.next() * 3600) / 10;
}

function scaleFor(rng: SeededRng, base: number, variation: number): number {
	if (variation <= 0) return base;
	return clamp(base * (1 + rng.gaussian(0, variation * 0.3)), base * 0.35, base * 2.2);
}

/**
 * A coarse uniform hash grid. The undergrowth pass has to reject candidates that land on top of a trunk,
 * and doing that with a linear scan over every canopy tree turns an O(N) sampler into an O(N²) one for no
 * reason.
 */
function pointIndex(points: readonly Point[], cellSize: number) {
	const size = Math.max(cellSize, 1e-4);
	const cells = new Map<string, Point[]>();
	const keyOf = (x: number, y: number): string => `${Math.floor(x / size)}:${Math.floor(y / size)}`;
	for (const p of points) {
		const key = keyOf(p.x, p.y);
		const bucket = cells.get(key);
		if (bucket) bucket.push(p);
		else cells.set(key, [p]);
	}
	return {
		/** True when some indexed point lies within `radius` of `p`. */
		near(p: Point, radius: number): boolean {
			const r2 = radius * radius;
			const cx = Math.floor(p.x / size);
			const cy = Math.floor(p.y / size);
			const span = Math.ceil(radius / size);
			for (let dy = -span; dy <= span; dy += 1) {
				for (let dx = -span; dx <= span; dx += 1) {
					const bucket = cells.get(`${cx + dx}:${cy + dy}`);
					if (!bucket) continue;
					for (const q of bucket) {
						const ex = q.x - p.x;
						const ey = q.y - p.y;
						if (ex * ex + ey * ey <= r2) return true;
					}
				}
			}
			return false;
		},
	};
}

// ---------------------------------------------------------------------------------------------------
// scatter.props
// ---------------------------------------------------------------------------------------------------

function runProps(ctx: GeneratorContext): GeneratorOutput {
	const density = numberParam(ctx.params, 'density');
	const objectId = stringParam(ctx.params, 'object');
	const sizeVariation = numberParam(ctx.params, 'sizeVariation');
	const rotationMode = stringParam(ctx.params, 'rotation');
	const clustering = numberParam(ctx.params, 'clustering');
	const margin = numberParam(ctx.params, 'margin');
	const maxObjects = numberParam(ctx.params, 'maxObjects');
	const candidates = numberParam(ctx.params, 'candidates');
	const patchScale = numberParam(ctx.params, 'patchScale');

	// Placement and appearance draw from SEPARATE streams. Recolouring the scatter — a different object, a
	// different rotation rule — must not move a single object, because the whole point of a stream per
	// subsystem is that a GM can nudge one knob without rerolling the map they just approved.
	const placeRng = ctx.rng.stream('props');
	const varyRng = ctx.rng.stream('variation');
	const fieldRng = ctx.rng.stream('field');

	const kind = OBJECT_KINDS[objectId] ?? (OBJECT_KINDS['rocks'] as ObjectKind);
	// Density reads left-to-right as "more stuff"; the sampler wants a minimum spacing, which is the exact
	// opposite. Invert once, here.
	const radius = 0.1 - density * 0.086;
	const field = densityField(noiseSeed(fieldRng), patchScale);

	const points = poissonDisk(placeRng, {
		radius,
		k: candidates,
		maxSamples: Math.min(maxObjects, MAX_SCATTER),
		bounds: insetBounds(margin),
		radiusAt: clusteredRadius(radius, clustering, field),
	});

	const features: MapFeature[] = [];
	for (let i = 0; i < points.length; i += 1) {
		const p = points[i] as Point;
		// Fixed draw order per object: asset, then rotation, then scale. Reordering these silently changes
		// every map ever generated with this generator.
		const asset = varyRng.weighted(kind.assets, kind.weights);
		const rotation = rotationFor(rotationMode, varyRng);
		const scale = scaleFor(varyRng, kind.scale, sizeVariation);
		features.push(
			feature(
				`${ctx.idPrefix}-prop-${i}`,
				'prop',
				[{ x: clamp01(p.x), y: clamp01(p.y) }],
				kind.style,
				{ asset, rotation, scale: Math.round(scale * 1000) / 1000 },
			),
		);
	}

	const layers = [buildLayer(ctx, 'scatter', `Scattered ${kind.noun}`, 'terrain', features, 0)];
	const texture =
		clustering >= 0.6 ? 'clumped' : clustering >= 0.25 ? 'loosely clumped' : 'evenly spread';
	return {
		layers,
		summary: `${features.length} ${kind.noun} · ${texture}`,
	};
}

export const scatterPropsGenerator: GeneratorDefinition = {
	id: 'scatter.props',
	group: 'scatter',
	scale: 'battle',
	label: 'Scatter objects',
	description:
		'Strews an object — rocks, rubble, crates, graves, mushrooms — across the map as blue noise, optionally clumped into drifts and bare patches.',
	bestFor:
		'Dressing a finished map: cover to hide behind, clutter to search, a graveyard to desecrate. Run it more than once with different objects.',
	version: 1,
	params: [
		{
			kind: 'number',
			id: 'density',
			label: 'Density',
			help: 'How much stuff there is. Right is more, and packed tighter together.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.45,
		},
		{
			kind: 'select',
			id: 'object',
			label: 'Object',
			help: 'What gets scattered.',
			options: [
				{ value: 'trees', label: 'Trees' },
				{ value: 'rocks', label: 'Rocks & boulders' },
				{ value: 'rubble', label: 'Rubble' },
				{ value: 'crates', label: 'Crates & sacks' },
				{ value: 'graves', label: 'Graves' },
				{ value: 'mushrooms', label: 'Mushrooms' },
				{ value: 'bones', label: 'Bones' },
				{ value: 'barrels', label: 'Barrels' },
			],
			default: 'rocks',
		},
		{
			kind: 'number',
			id: 'clustering',
			label: 'Clustering',
			help: 'Left: evenly spread, nothing touching. Right: drifts and heaps with bare ground between them.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.4,
		},
		{
			kind: 'number',
			id: 'sizeVariation',
			label: 'Size variation',
			help: 'How much the objects differ in size. 0 makes them identical, which reads as manufactured.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.4,
			applies: 'immediate',
		},
		{
			kind: 'select',
			id: 'rotation',
			label: 'Rotation',
			help: 'Which way the objects face.',
			options: [
				{ value: 'random', label: 'Any angle', help: 'Natural clutter.' },
				{ value: 'aligned', label: 'All the same way', help: 'Stacked and stowed — a storeroom.' },
				{ value: 'snap45', label: 'Snapped to 45°', help: 'Worked stone, ranks of graves.' },
			],
			default: 'random',
			applies: 'immediate',
		},
		{
			kind: 'number',
			id: 'patchScale',
			label: 'Patch size',
			help: 'How large the clumps and bare patches are. Low is a few broad drifts; high is a fine speckle.',
			min: 1,
			max: 10,
			step: 0.5,
			default: 3.5,
			advanced: true,
			group: 'Clustering',
		},
		{
			kind: 'number',
			id: 'margin',
			label: 'Edge margin',
			help: 'Keeps objects this far back from the edge of the map.',
			min: 0,
			max: 0.2,
			step: 0.01,
			default: 0.02,
			advanced: true,
			group: 'Placement',
		},
		{
			kind: 'int',
			id: 'maxObjects',
			label: 'Object limit',
			help: 'A hard cap, so a very high density cannot bury the map in ten thousand rocks.',
			min: 10,
			max: 3000,
			step: 10,
			default: 800,
			advanced: true,
			group: 'Placement',
		},
		{
			kind: 'int',
			id: 'candidates',
			label: 'Packing effort',
			help: 'Attempts per object before the sampler gives up on that spot. Higher packs tighter, slower.',
			min: 6,
			max: 40,
			step: 1,
			default: 30,
			advanced: true,
			group: 'Placement',
		},
	],
	presets: [
		{
			id: 'rubble-field',
			label: 'Rubble field',
			description: 'A collapsed hall, strewn with drifts of broken stone.',
			values: {
				density: 0.6,
				object: 'rubble',
				clustering: 0.7,
				sizeVariation: 0.6,
				rotation: 'random',
			},
		},
		{
			id: 'boulder-field',
			label: 'Boulder field',
			description: 'Sparse, huge boulders with clear ground between them.',
			values: {
				density: 0.2,
				object: 'rocks',
				clustering: 0.25,
				sizeVariation: 0.8,
				rotation: 'random',
				patchScale: 2,
			},
		},
		{
			id: 'graveyard',
			label: 'Graveyard',
			description: 'Ranks of headstones, evenly spaced and squarely aligned.',
			values: {
				density: 0.55,
				object: 'graves',
				clustering: 0.1,
				sizeVariation: 0.15,
				rotation: 'snap45',
			},
		},
		{
			id: 'fungal-bloom',
			label: 'Fungal bloom',
			description: 'Thick colonies of mushrooms with bare, dead stretches between.',
			values: {
				density: 0.85,
				object: 'mushrooms',
				clustering: 0.95,
				sizeVariation: 0.7,
				rotation: 'random',
				patchScale: 5,
			},
		},
		{
			id: 'storeroom-clutter',
			label: 'Storeroom clutter',
			description: 'Crates stacked in orderly rows, all facing the same way.',
			values: {
				density: 0.7,
				object: 'crates',
				clustering: 0.15,
				sizeVariation: 0.2,
				rotation: 'aligned',
				margin: 0.08,
			},
		},
		{
			id: 'bone-yard',
			label: 'Bone yard',
			description: 'Heaps of bones piled where something has been feeding.',
			values: {
				density: 0.5,
				object: 'bones',
				clustering: 0.85,
				sizeVariation: 0.5,
				rotation: 'random',
			},
		},
	],
	run: runProps,
};

// ---------------------------------------------------------------------------------------------------
// scatter.forest
// ---------------------------------------------------------------------------------------------------

function runForest(ctx: GeneratorContext): GeneratorOutput {
	const density = numberParam(ctx.params, 'density');
	const glades = numberParam(ctx.params, 'glades');
	const undergrowth = numberParam(ctx.params, 'undergrowth');
	const mixId = stringParam(ctx.params, 'treeMix');
	const sizeVariation = numberParam(ctx.params, 'sizeVariation');
	const patchScale = numberParam(ctx.params, 'patchScale');
	const margin = numberParam(ctx.params, 'margin');
	const maxTrees = numberParam(ctx.params, 'maxTrees');

	const canopyRng = ctx.rng.stream('scatter');
	const underRng = ctx.rng.stream('undergrowth');
	const varyRng = ctx.rng.stream('variation');
	const fieldRng = ctx.rng.stream('field');

	const mix =
		TREE_MIXES[mixId] ??
		(TREE_MIXES['mixed'] as { canopy: readonly string[]; weights: readonly number[] });
	const field = densityField(noiseSeed(fieldRng), patchScale);
	const bounds = insetBounds(margin);

	const canopyRadius = 0.075 - density * 0.056;
	// Thickets and glades are the SAME field read two ways: it varies the spacing (thickets) and it also
	// gates placement outright below a threshold (glades). A forest with uniform density is a plantation,
	// and a plantation is the one thing a woodland map must not look like.
	const gladeThreshold = glades * 0.4;
	const canopyPoints = poissonDisk(canopyRng, {
		radius: canopyRadius,
		maxSamples: Math.min(maxTrees, MAX_SCATTER),
		bounds,
		radiusAt: clusteredRadius(canopyRadius, clamp(glades * 0.9, 0, 1), field),
		accept: (p: Point) => field.at(p.x, p.y) > gladeThreshold,
	});

	// Undergrowth is a SECOND, finer Poisson pass over the same field, drawn from its own stream — so
	// thinning the brush leaves every tree exactly where it stood.
	const underRadius = canopyRadius * clamp(0.7 - undergrowth * 0.45, 0.12, 0.7);
	const canopyIndex = pointIndex(canopyPoints, Math.max(underRadius, 0.01));
	const trunkClearance = underRadius * 0.6;
	const underPoints =
		undergrowth <= 0
			? []
			: poissonDisk(underRng, {
					radius: underRadius,
					maxSamples: Math.min(maxTrees * 2, MAX_SCATTER),
					bounds,
					radiusAt: clusteredRadius(underRadius, clamp(glades * 0.9, 0, 1), field),
					accept: (p: Point) =>
						field.at(p.x, p.y) > gladeThreshold * 0.75 && !canopyIndex.near(p, trunkClearance),
				});

	const features: MapFeature[] = [];
	for (let i = 0; i < canopyPoints.length; i += 1) {
		const p = canopyPoints[i] as Point;
		const asset = varyRng.weighted(mix.canopy, mix.weights);
		const rotation = Math.round(varyRng.next() * 3600) / 10;
		// Canopy trees are drawn from a normal distribution, not a uniform one: a real stand has a few
		// giants among many ordinary trees, and a uniform draw gives the tell-tale "every tree is the same
		// size" look.
		const scale = clamp(1.15 + varyRng.gaussian(0, sizeVariation * 0.35), 0.6, 2.4);
		features.push(
			feature(
				`${ctx.idPrefix}-canopy-${i}`,
				'prop',
				[{ x: clamp01(p.x), y: clamp01(p.y) }],
				'prop:tree',
				{ asset, rotation, scale: Math.round(scale * 1000) / 1000, tier: 'canopy' },
			),
		);
	}
	for (let i = 0; i < underPoints.length; i += 1) {
		const p = underPoints[i] as Point;
		const asset = varyRng.weighted(UNDERGROWTH_ASSETS, UNDERGROWTH_WEIGHTS);
		const rotation = Math.round(varyRng.next() * 3600) / 10;
		const scale = clamp(0.5 + varyRng.gaussian(0, sizeVariation * 0.2), 0.2, 1);
		features.push(
			feature(
				`${ctx.idPrefix}-undergrowth-${i}`,
				'prop',
				[{ x: clamp01(p.x), y: clamp01(p.y) }],
				'prop:shrub',
				{ asset, rotation, scale: Math.round(scale * 1000) / 1000, tier: 'undergrowth' },
			),
		);
	}

	const layers = [buildLayer(ctx, 'forest', 'Woodland', 'terrain', features, 0)];
	const texture =
		glades >= 0.6 ? 'thickets and glades' : glades >= 0.3 ? 'uneven stands' : 'even cover';
	const summary = [
		`${canopyPoints.length} tree${canopyPoints.length === 1 ? '' : 's'}`,
		`${underPoints.length} undergrowth`,
		texture,
	].join(' · ');

	return { layers, summary };
}

export const scatterForestGenerator: GeneratorDefinition = {
	id: 'scatter.forest',
	group: 'scatter',
	scale: 'battle',
	label: 'Woodland',
	description:
		'A wood in two tiers — canopy trees over undergrowth — with density driven by a noise field so it breaks into thickets and glades.',
	bestFor:
		'Any outdoor encounter that needs cover and sightline breaks. Use scatter.props for a single object type on bare ground.',
	version: 1,
	params: [
		{
			kind: 'number',
			id: 'density',
			label: 'Tree density',
			help: 'How close the trees stand. Right is a wood you cannot see through.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.55,
		},
		{
			kind: 'number',
			id: 'glades',
			label: 'Glades & thickets',
			help: 'Left: an even, planted-looking cover. Right: dense thickets torn open by real clearings.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.5,
		},
		{
			kind: 'number',
			id: 'undergrowth',
			label: 'Undergrowth',
			help: 'Brush, ferns and saplings under the canopy. 0 clears the forest floor entirely.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.55,
		},
		{
			kind: 'select',
			id: 'treeMix',
			label: 'Trees',
			help: 'What kind of wood this is.',
			options: [
				{ value: 'mixed', label: 'Mixed wood' },
				{ value: 'broadleaf', label: 'Broadleaf', help: 'Oak, beech, birch — a temperate wood.' },
				{
					value: 'conifer',
					label: 'Conifer',
					help: 'Pine and fir — dark, upland, needle-floored.',
				},
				{ value: 'dead', label: 'Deadwood', help: 'Snags and stumps. Blighted, burnt, or worse.' },
			],
			default: 'mixed',
		},
		{
			kind: 'number',
			id: 'sizeVariation',
			label: 'Size variation',
			help: 'How much the trees differ. A few giants among many ordinary trees is what a real stand looks like.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.5,
			applies: 'immediate',
		},
		{
			kind: 'number',
			id: 'patchScale',
			label: 'Glade size',
			help: 'How large the thickets and clearings are. Low gives a few broad glades; high gives a fine mottle.',
			min: 1,
			max: 10,
			step: 0.5,
			default: 3,
			advanced: true,
			group: 'Clustering',
		},
		{
			kind: 'number',
			id: 'margin',
			label: 'Edge margin',
			help: 'Keeps the treeline this far back from the edge of the map.',
			min: 0,
			max: 0.2,
			step: 0.01,
			default: 0.02,
			advanced: true,
			group: 'Placement',
		},
		{
			kind: 'int',
			id: 'maxTrees',
			label: 'Tree limit',
			help: 'A hard cap on canopy trees, so a dense wood cannot run away with the map.',
			min: 20,
			max: 2000,
			step: 10,
			default: 700,
			advanced: true,
			group: 'Placement',
		},
	],
	presets: [
		{
			id: 'dense-woodland',
			label: 'Dense woodland',
			description: 'Close-packed mixed trees over thick brush. Sightlines die at thirty feet.',
			values: {
				density: 0.85,
				glades: 0.35,
				undergrowth: 0.8,
				treeMix: 'mixed',
				sizeVariation: 0.5,
			},
		},
		{
			id: 'sparse-copse',
			label: 'Sparse copse',
			description: 'A scattering of trees on open ground, with room to ride between them.',
			values: {
				density: 0.2,
				glades: 0.5,
				undergrowth: 0.2,
				treeMix: 'broadleaf',
				sizeVariation: 0.6,
				patchScale: 2,
			},
		},
		{
			id: 'ancient-grove',
			label: 'Ancient grove',
			description: 'A few enormous old trees, well spaced, standing over a clear floor.',
			values: {
				density: 0.15,
				glades: 0.25,
				undergrowth: 0.1,
				treeMix: 'broadleaf',
				sizeVariation: 0.95,
			},
		},
		{
			id: 'dark-pinewood',
			label: 'Dark pinewood',
			description: 'Uniform ranks of conifers with a dead, needle-covered floor.',
			values: {
				density: 0.9,
				glades: 0.1,
				undergrowth: 0.15,
				treeMix: 'conifer',
				sizeVariation: 0.25,
			},
		},
		{
			id: 'blighted-deadwood',
			label: 'Blighted deadwood',
			description: 'Snags and stumps in ragged clumps, with bare scorched ground between.',
			values: {
				density: 0.5,
				glades: 0.9,
				undergrowth: 0.35,
				treeMix: 'dead',
				sizeVariation: 0.7,
				patchScale: 4.5,
			},
		},
		{
			id: 'fey-glade',
			label: 'Fey glade',
			description: 'Thick woodland torn open by wide, deliberate clearings.',
			values: {
				density: 0.75,
				glades: 1,
				undergrowth: 0.9,
				treeMix: 'broadleaf',
				sizeVariation: 0.6,
				patchScale: 2,
			},
		},
	],
	run: runForest,
};

export const SCATTER_GENERATORS: readonly GeneratorDefinition[] = Object.freeze([
	scatterPropsGenerator,
	scatterForestGenerator,
]);
