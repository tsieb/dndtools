import {
	chaikin,
	clamp,
	clamp01,
	createValueNoise,
	delaunay,
	dist,
	dist2,
	domainWarp,
	fbm,
	lloydRelax,
	minimumSpanningTree,
	poissonDisk,
	ringArea,
	unionBoundary,
	voronoiCells,
	type Point,
	type Rect,
	type Ring,
} from '../geometry';
import type { SeededRng } from '../state/prng';
import { generateName } from './names';
import {
	boolParam,
	buildLayer,
	feature,
	norm,
	numberParam,
	stringParam,
	type GeneratedPoi,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
	type ParamSpec,
	type ParamValue,
} from './types';
import type { MapFeature, MapLayer } from '../state/map-state';

/**
 * MAP-021 — `world.continent`: the overworld generator. An Azgaar/mapgen2 pipeline expressed natively
 * in our vector model.
 *
 * The backbone is a Voronoi cell mesh, not a raster heightmap. That is the whole reason this generator
 * can exist at all in a normalized-vector data model: a cell is a polygon, a coastline is a ring, a
 * river is a polyline, and a biome or a kingdom is a union of cells. Everything the pipeline computes —
 * elevation, moisture, temperature, flow, ownership — is a per-cell ATTRIBUTE over that one mesh, so the
 * eight emitted layers are eight different readings of the same substrate rather than eight unrelated
 * drawings.
 *
 * The pipeline, in order (each stage depends only on the ones above it):
 *
 *   1. mesh      — Poisson-disk sites (blue noise ⇒ even cells with zero Lloyd passes) → Delaunay
 *                  (the adjacency graph) → Voronoi (the polygons).
 *   2. elevation — domain-warped fbm × an island mask (Azgaar's `heightmapTemplate`), redistributed by
 *                  an exponent. The mask buys 90% of a tectonic sim for 5% of the work.
 *   3. hydrology — priority-flood depression filling. Every land cell ends up with a strictly-downhill
 *                  path to the sea, and the cells that had to be raised to get there ARE the lakes.
 *                  Rivers then fall out of a single high→low flow-accumulation sweep.
 *   4. climate   — moisture (noise + distance-to-water + a rain-shadow term) × temperature (latitude +
 *                  lapse rate) → a Whittaker lookup → one biome per cell.
 *   5. society   — habitability scoring → settlements (Poisson-spaced) → roads (Dijkstra over the cell
 *                  graph, so bridges and fords fall out where a road meets a river) → kingdoms
 *                  (cost-weighted flood fill, so rivers and mountains become natural borders).
 *
 * WHY NOTHING IS `applies: 'immediate'`: in this codebase `'immediate'` means the caller may patch the
 * EXISTING output in place without re-running `run()`. Every knob here — sea level included — is read
 * upstream of the coastline, so no knob can be honoured without re-deriving the map. Sea level is the
 * one that hurts: dragging it is the best moment in the whole tool. It is still safe to drag, and its
 * `help` says so, because sea level perturbs no RNG draw: the noise fields, the mesh, and every per-cell
 * jitter are drawn before it is consulted. Re-running with a new sea level therefore moves the waterline
 * across the SAME terrain instead of rerolling the world — the map does not change, the sea does.
 *
 * `world.archipelago` and `world.region` are PRESETS of this generator, not siblings. They are the same
 * pipeline with a different mask, cell count, and settlement density; splitting them into separate
 * `GeneratorDefinition`s would triple the surface area of the picker while duplicating every line of the
 * algorithm, which is the definition of a fake generator.
 */

const BOUNDS: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Cheapest guard against a pathological mesh: below this the Delaunay/Voronoi stage is meaningless. */
const MIN_CELLS = 3;

/** A cell is "on the border" when its Voronoi ring touches the map edge — such cells drain OFF-MAP. */
const EDGE_EPSILON = 1e-6;

/** Depression-fill increment. Small enough to be invisible, large enough to survive float noise. */
const FILL_EPSILON = 1e-5;

type LandShape = 'island' | 'continent' | 'archipelago' | 'peninsula' | 'inland-sea';

type Biome =
	| 'ocean'
	| 'lake'
	| 'beach'
	| 'snow'
	| 'alpine'
	| 'tundra'
	| 'taiga'
	| 'temperate-forest'
	| 'temperate-rainforest'
	| 'grassland'
	| 'shrubland'
	| 'temperate-desert'
	| 'savanna'
	| 'tropical-forest'
	| 'tropical-rainforest'
	| 'subtropical-desert'
	| 'marsh';

/** How pleasant a biome is to live in (drives settlement scoring) and how hard it is to cross (drives
 *  road cost and how far a kingdom's writ runs). Azgaar carries exactly these two numbers per biome. */
const BIOME_TRAITS: Readonly<
	Record<Biome, { habitability: number; movement: number; label: string }>
> = {
	ocean: { habitability: 0, movement: 99, label: 'Ocean' },
	lake: { habitability: 0, movement: 99, label: 'Lake' },
	beach: { habitability: 0.5, movement: 1.1, label: 'Coast' },
	snow: { habitability: 0.02, movement: 4, label: 'Snowfield' },
	alpine: { habitability: 0.05, movement: 5, label: 'Mountains' },
	tundra: { habitability: 0.12, movement: 2.2, label: 'Tundra' },
	taiga: { habitability: 0.3, movement: 2, label: 'Taiga' },
	'temperate-forest': { habitability: 0.75, movement: 1.6, label: 'Temperate forest' },
	'temperate-rainforest': { habitability: 0.6, movement: 2, label: 'Temperate rainforest' },
	grassland: { habitability: 0.95, movement: 1, label: 'Grassland' },
	shrubland: { habitability: 0.5, movement: 1.2, label: 'Shrubland' },
	'temperate-desert': { habitability: 0.12, movement: 1.6, label: 'Cold desert' },
	savanna: { habitability: 0.6, movement: 1.1, label: 'Savanna' },
	'tropical-forest': { habitability: 0.5, movement: 2.2, label: 'Tropical forest' },
	'tropical-rainforest': { habitability: 0.35, movement: 2.8, label: 'Jungle' },
	'subtropical-desert': { habitability: 0.08, movement: 1.8, label: 'Desert' },
	marsh: { habitability: 0.25, movement: 3, label: 'Marshland' },
};

/** Painting order for the biome layer: broad biomes first, enclaves last, so a renderer that ignores
 *  ring holes still shows the small inclusions instead of burying them. */
const BIOME_PAINT_ORDER: readonly Biome[] = [
	'beach',
	'grassland',
	'savanna',
	'shrubland',
	'temperate-desert',
	'subtropical-desert',
	'tundra',
	'taiga',
	'temperate-forest',
	'temperate-rainforest',
	'tropical-forest',
	'tropical-rainforest',
	'marsh',
	'alpine',
	'snow',
];

/** Mask shape ⇒ the four numbers that turn raw fbm into a landmass. `lift` raises the whole field
 *  (more land), `falloff`/`power` decide how hard the edges are pushed under water, `scale` retunes the
 *  base noise frequency so an archipelago is not just a continent with holes in it. */
const SHAPE_PROFILES: Readonly<
	Record<
		LandShape,
		{ lift: number; falloff: number; power: number; scale: number; noun: string; plural: string }
	>
> = {
	island: { lift: 0.12, falloff: 1, power: 2, scale: 1.1, noun: 'island', plural: 'islands' },
	continent: {
		lift: 0.24,
		falloff: 0.94,
		power: 3,
		scale: 0.9,
		noun: 'continent',
		plural: 'landmasses',
	},
	archipelago: {
		lift: 0.09,
		falloff: 1,
		power: 1.3,
		scale: 1.7,
		noun: 'island',
		plural: 'islands',
	},
	peninsula: {
		lift: 0.2,
		falloff: 1,
		power: 2.2,
		scale: 1.15,
		noun: 'peninsula',
		plural: 'landmasses',
	},
	'inland-sea': {
		lift: 0.26,
		falloff: 0.95,
		power: 2.2,
		scale: 1,
		noun: 'basin',
		plural: 'landmasses',
	},
};

// ---------------------------------------------------------------------------------------------------
// Elevation — exported because it is also the ONLY honest way to assert "rivers flow downhill": a test
// rebuilds the exact field the generator saw (same seed ⇒ same stream ⇒ same draws) and samples it at
// every river vertex. `run()` calls this once and never touches the 'elevation' stream again, so the
// draw sequence is identical from a fresh context.
// ---------------------------------------------------------------------------------------------------

export interface WorldElevation {
	/** Terrain height at a normalized point: 0 = abyss, 1 = peak. Sea level is a threshold on this. */
	at(x: number, y: number): number;
}

export function createWorldElevation(
	params: Readonly<Record<string, ParamValue>>,
	rng: SeededRng,
): WorldElevation {
	const shape = stringParam(params, 'landShape') as LandShape;
	const profile = SHAPE_PROFILES[shape];
	const drama = numberParam(params, 'terrainDrama');
	const scale = numberParam(params, 'terrainScale') * profile.scale;

	// Draw the field seeds FIRST and unconditionally, so that shape-specific draws below can never shift
	// the noise itself. Two seeds: the terrain, and the field that warps it.
	const terrainSeed = rng.nextInt(1, 0x3fffffff);
	const warpSeed = rng.nextInt(1, 0x3fffffff);
	const base = fbm(createValueNoise(terrainSeed), {
		octaves: numberParam(params, 'octaves'),
		frequency: scale,
		lacunarity: numberParam(params, 'lacunarity'),
		persistence: numberParam(params, 'persistence'),
	});
	const warp = fbm(createValueNoise(warpSeed), { octaves: 2, frequency: scale * 0.5 });
	const field = domainWarp(base, warp, numberParam(params, 'warpStrength'));

	// Archipelago is the one mask that needs randomness: it is the min over several island bumps, and a
	// fixed set of bump centres would make every archipelago the same archipelago. The centres are spread
	// around a jittered ring rather than drawn uniformly — uniform centres cluster, and a cluster of
	// overlapping bumps is not an archipelago, it is a continent with a ragged edge.
	const blobs: Array<{ c: Point; r: number }> = [];
	if (shape === 'archipelago') {
		const count = rng.nextInt(5, 8);
		const step = (Math.PI * 2) / count;
		for (let i = 0; i < count; i += 1) {
			const angle = i * step + (rng.next() - 0.5) * step * 0.6;
			const radius = 0.2 + rng.next() * 0.14;
			blobs.push({
				c: { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius },
				r: 0.11 + rng.next() * 0.09,
			});
		}
	}
	// A peninsula has to hang off SOME edge; which one is part of the world's identity.
	const anchor: Point =
		shape === 'peninsula'
			? rng.pick([
					{ x: 0.5, y: 0.95 },
					{ x: 0.5, y: 0.05 },
					{ x: 0.95, y: 0.5 },
					{ x: 0.05, y: 0.5 },
				])
			: { x: 0.5, y: 0.5 };

	/** 0 where the mask wants land, 1 where it wants open ocean. */
	const maskDistance = (x: number, y: number): number => {
		const nx = (x - 0.5) * 2;
		const ny = (y - 0.5) * 2;
		switch (shape) {
			case 'island':
				return clamp01(Math.hypot(nx, ny));
			case 'continent':
				// squareBump: a boxier falloff, so the land fills the frame the way a continent does.
				return clamp01(1 - (1 - nx * nx) * (1 - ny * ny));
			case 'archipelago': {
				let best = 1;
				for (const blob of blobs) best = Math.min(best, dist({ x, y }, blob.c) / blob.r);
				return clamp01(best);
			}
			case 'peninsula':
				return clamp01(Math.hypot((x - anchor.x) / 0.46, (y - anchor.y) / 0.9));
			case 'inland-sea':
				// Inverted radial: the sea is in the middle and the land runs off the edges of the map.
				return clamp01(1.08 - Math.hypot(nx, ny) * 1.25);
		}
	};

	return {
		at(x: number, y: number): number {
			const raw = clamp01((field.at(x, y) + 1) / 2);
			const d = maskDistance(x, y);
			const shaped = clamp01(
				(raw + profile.lift) * (1 - profile.falloff * Math.pow(d, profile.power)),
			);
			// Redistribution: >1 drops the midtones into lowland and leaves the peaks standing. It is the
			// single best "look" dial in terrain generation, which is why it is a primary param.
			return clamp01(Math.pow(shaped, drama));
		},
	};
}

// ---------------------------------------------------------------------------------------------------
// A deterministic min-heap. Priority flood and both Dijkstras run on it, and every one of them feeds a
// downstream RNG consumer, so ties MUST break the same way on every machine: lower cost first, then
// lower cell index. A JS sort is not stable across engines for this; an explicit tiebreak is.
// ---------------------------------------------------------------------------------------------------

interface MinHeap {
	push(cell: number, cost: number): void;
	pop(): { cell: number; cost: number } | null;
	size(): number;
}

function createMinHeap(): MinHeap {
	const costs: number[] = [];
	const cells: number[] = [];
	const before = (a: number, b: number): boolean => {
		const ca = costs[a] as number;
		const cb = costs[b] as number;
		if (ca !== cb) return ca < cb;
		return (cells[a] as number) < (cells[b] as number);
	};
	const swap = (a: number, b: number): void => {
		const c = costs[a] as number;
		costs[a] = costs[b] as number;
		costs[b] = c;
		const i = cells[a] as number;
		cells[a] = cells[b] as number;
		cells[b] = i;
	};
	return {
		push(cell: number, cost: number): void {
			costs.push(cost);
			cells.push(cell);
			let i = costs.length - 1;
			while (i > 0) {
				const parent = (i - 1) >> 1;
				if (!before(i, parent)) break;
				swap(i, parent);
				i = parent;
			}
		},
		pop(): { cell: number; cost: number } | null {
			if (costs.length === 0) return null;
			const top = { cell: cells[0] as number, cost: costs[0] as number };
			const lastCost = costs.pop() as number;
			const lastCell = cells.pop() as number;
			if (costs.length > 0) {
				costs[0] = lastCost;
				cells[0] = lastCell;
				let i = 0;
				for (;;) {
					const left = i * 2 + 1;
					const right = left + 1;
					let best = i;
					if (left < costs.length && before(left, best)) best = left;
					if (right < costs.length && before(right, best)) best = right;
					if (best === i) break;
					swap(i, best);
					i = best;
				}
			}
			return top;
		},
		size(): number {
			return costs.length;
		},
	};
}

// ---------------------------------------------------------------------------------------------------
// The mesh + its per-cell attribute tables. One struct-of-arrays, indexed by cell.
// ---------------------------------------------------------------------------------------------------

interface WorldMesh {
	sites: Point[];
	rings: Ring[];
	neighbors: number[][];
	border: boolean[];
}

function buildMesh(rng: SeededRng, cellTarget: number, lloydIterations: number): WorldMesh {
	// Blue noise, not white: Poisson sites give even cells with ZERO Lloyd passes, which is why Lloyd is
	// an advanced knob here rather than the mandatory step it is in mapgen2. Bridson packs roughly
	// 0.8/r² points into the unit square, so invert that for the requested cell count. `maxSamples` is a
	// safety cap, not a target — the radius is what actually decides the count.
	const radius = Math.sqrt(0.8 / cellTarget);
	const sampled = poissonDisk(rng, {
		radius,
		maxSamples: Math.ceil(cellTarget * 1.5),
		bounds: BOUNDS,
	});
	const sites = lloydIterations > 0 ? lloydRelax(sampled, BOUNDS, lloydIterations) : sampled;

	const triangulation = delaunay(sites);
	const neighbors: number[][] = sites.map(() => []);
	for (const [a, b] of triangulation.edges) {
		(neighbors[a] as number[]).push(b);
		(neighbors[b] as number[]).push(a);
	}
	// Sorted adjacency: neighbour order comes out of the triangulator's internals, and every sweep below
	// scans it. Sorting makes the scan order a property of the mesh, not of the triangulator.
	for (const list of neighbors) list.sort((x, y) => x - y);

	const rings = voronoiCells(sites, BOUNDS);
	const border = rings.map((ring) =>
		ring.some(
			(p) =>
				p.x <= EDGE_EPSILON ||
				p.x >= 1 - EDGE_EPSILON ||
				p.y <= EDGE_EPSILON ||
				p.y >= 1 - EDGE_EPSILON,
		),
	);
	return { sites, rings, neighbors, border };
}

// ---------------------------------------------------------------------------------------------------
// Hydrology
// ---------------------------------------------------------------------------------------------------

interface Hydrology {
	/** Depression-filled elevation. Guarantees every non-seed cell has a strictly lower neighbour. */
	filled: number[];
	/** Index of the lowest-filled neighbour, or -1 for a sink (ocean, or a cell that drains off-map). */
	downhill: number[];
	ocean: boolean[];
	/** A cell that had to be RAISED to give the map a drainage — i.e. the floor of a filled basin. */
	lake: boolean[];
}

function computeHydrology(mesh: WorldMesh, raw: number[], seaLevel: number): Hydrology {
	const count = mesh.sites.length;
	const ocean = raw.map((h) => h <= seaLevel);
	const filled = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
	const closed = new Array<boolean>(count).fill(false);
	const heap = createMinHeap();

	// Priority flood (Planchon–Darboux / Barnes): seed from every cell water already reaches — the ocean,
	// and the map border (a border land cell drains off the edge of the world, so it is not a pit).
	for (let i = 0; i < count; i += 1) {
		if (ocean[i] || mesh.border[i]) {
			filled[i] = raw[i] as number;
			heap.push(i, filled[i] as number);
		}
	}
	while (heap.size() > 0) {
		const top = heap.pop();
		if (!top) break;
		const cell = top.cell;
		if (closed[cell]) continue;
		closed[cell] = true;
		for (const next of mesh.neighbors[cell] as number[]) {
			if (closed[next]) continue;
			// Raise the neighbour just above the water that reached it: the sweep therefore leaves NO local
			// minimum behind, which is the whole point — every downhill walk now terminates in the sea.
			const level = Math.max(raw[next] as number, (filled[cell] as number) + FILL_EPSILON);
			if (level < (filled[next] as number)) {
				filled[next] = level;
				heap.push(next, level);
			}
		}
	}
	// An island cell unreachable from any seed (a degenerate mesh) keeps its raw height rather than
	// Infinity, so nothing downstream has to reason about a non-finite elevation.
	for (let i = 0; i < count; i += 1) {
		if (!Number.isFinite(filled[i] as number)) filled[i] = raw[i] as number;
	}

	// A cell the flood had to raise is under water it cannot shed: that is a lake, and it is free.
	const lake = filled.map(
		(f, i) => !(ocean[i] as boolean) && f > (raw[i] as number) + FILL_EPSILON * 0.5,
	);

	const downhill = new Array<number>(count).fill(-1);
	for (let i = 0; i < count; i += 1) {
		let best = -1;
		let bestHeight = filled[i] as number;
		for (const next of mesh.neighbors[i] as number[]) {
			const height = filled[next] as number;
			if (height < bestHeight) {
				best = next;
				bestHeight = height;
			}
		}
		downhill[i] = best;
	}
	return { filled, downhill, ocean, lake };
}

interface RiverPath {
	cells: number[];
	/** The cell the river empties into, if any: an ocean cell, a lake cell, or another river's cell. */
	mouthCell: number;
	mouth: 'ocean' | 'lake' | 'confluence' | 'edge';
	flow: number;
}

function traceRivers(
	mesh: WorldMesh,
	hydro: Hydrology,
	flow: number[],
	isRiver: boolean[],
): RiverPath[] {
	const count = mesh.sites.length;
	// A headwater is a river cell nothing upstream feeds. Lake outflows qualify (their upstream is the
	// lake, which is water, not a river), which is exactly right: a river leaving a lake IS a new river.
	const upstream = new Array<number>(count).fill(0);
	for (let i = 0; i < count; i += 1) {
		if (!isRiver[i]) continue;
		const down = hydro.downhill[i] as number;
		if (down >= 0 && isRiver[down]) upstream[down] = (upstream[down] as number) + 1;
	}
	const heads: number[] = [];
	for (let i = 0; i < count; i += 1) {
		if (isRiver[i] && (upstream[i] as number) === 0) heads.push(i);
	}
	// Biggest first, so the trunk is traced before its tributaries and the tributaries end ON it.
	heads.sort((a, b) => (flow[b] as number) - (flow[a] as number) || a - b);

	const claimed = new Array<boolean>(count).fill(false);
	const rivers: RiverPath[] = [];
	for (const head of heads) {
		const cells: number[] = [];
		let cell = head;
		let mouthCell = -1;
		let mouth: RiverPath['mouth'];
		for (;;) {
			cells.push(cell);
			claimed[cell] = true;
			const down = hydro.downhill[cell] as number;
			if (down < 0) {
				// No lower neighbour and not water: the cell sits on the border, so the river runs off-map.
				mouth = 'edge';
				break;
			}
			if (hydro.ocean[down]) {
				mouthCell = down;
				mouth = 'ocean';
				break;
			}
			if (hydro.lake[down]) {
				mouthCell = down;
				mouth = 'lake';
				break;
			}
			if (claimed[down]) {
				mouthCell = down;
				mouth = 'confluence';
				break;
			}
			cell = down;
		}
		rivers.push({
			cells,
			mouthCell,
			mouth,
			flow: flow[cells[cells.length - 1] as number] as number,
		});
	}
	return rivers;
}

// ---------------------------------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------------------------------

const TEMP_EQUATOR = 27;
const TEMP_POLE = -25;

/**
 * Temperature at a cell. `mapLatitude` is where on the globe this map SITS (0 = the equator runs through
 * the middle of it, 1 = it is polar) and `gradient` is how much latitude changes from the top of the map
 * to the bottom. Together they are Azgaar's `mapLatitude` band, which the research singles out as the
 * one climate knob that changes everything: at 0 you get a world map with tropics in the middle and ice
 * at both edges, and at 0.8 you get the frozen north, where the top of the map is simply colder than the
 * bottom of it.
 */
function temperatureAt(
	y: number,
	zone: number,
	mapLatitude: number,
	gradient: number,
	lapseRate: number,
): number {
	const latitude = clamp01(Math.abs(mapLatitude + (0.5 - y) * 2 * gradient));
	const surface = TEMP_EQUATOR + (TEMP_POLE - TEMP_EQUATOR) * latitude;
	// Lapse rate: ~6.5 °C per km, and the tallest peak on the map stands in for ~4 km of relief.
	return surface - lapseRate * zone * 28;
}

/** The Whittaker lookup. Temperature in °C, moisture 0..1. Elevation only overrides the very top. */
function whittaker(tempC: number, moisture: number, zone: number): Biome {
	if (zone > 0.82) return tempC < -2 ? 'snow' : 'alpine';
	if (tempC < -8) return moisture < 0.35 ? 'snow' : 'tundra';
	if (tempC < 0) return moisture < 0.28 ? 'tundra' : 'taiga';
	if (tempC < 8) {
		if (moisture < 0.2) return 'temperate-desert';
		if (moisture < 0.5) return 'shrubland';
		return 'taiga';
	}
	if (tempC < 19) {
		if (moisture < 0.18) return 'temperate-desert';
		if (moisture < 0.38) return 'grassland';
		if (moisture < 0.72) return 'temperate-forest';
		return 'temperate-rainforest';
	}
	if (moisture < 0.2) return 'subtropical-desert';
	if (moisture < 0.42) return 'savanna';
	if (moisture < 0.7) return 'tropical-forest';
	return 'tropical-rainforest';
}

// ---------------------------------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------------------------------

const PARAMS: readonly ParamSpec[] = [
	{
		kind: 'select',
		id: 'landShape',
		label: 'Land shape',
		help: 'The mask the terrain is poured into — the single choice that decides what kind of world this is.',
		applies: 'regenerate',
		options: [
			{
				value: 'continent',
				label: 'Continent',
				help: 'One broad landmass filling most of the frame.',
			},
			{ value: 'island', label: 'Island', help: 'A single round landmass ringed by open sea.' },
			{
				value: 'archipelago',
				label: 'Archipelago',
				help: 'A scatter of islands — expect few roads.',
			},
			{ value: 'peninsula', label: 'Peninsula', help: 'Land hanging off one edge of the map.' },
			{ value: 'inland-sea', label: 'Inland sea', help: 'Land at the edges, a sea in the middle.' },
		],
		default: 'continent',
	},
	{
		kind: 'number',
		id: 'seaLevel',
		label: 'Sea level',
		help: 'More ocean or less. Safe to drag: the terrain underneath does not change, only the waterline.',
		applies: 'regenerate',
		min: 0.12,
		max: 0.72,
		step: 0.01,
		default: 0.36,
	},
	{
		kind: 'number',
		id: 'terrainDrama',
		label: 'Terrain drama',
		help: 'Low = rolling hills and wide plains. High = deep valleys and jagged peaks.',
		applies: 'regenerate',
		min: 0.6,
		max: 3.5,
		step: 0.05,
		default: 1.5,
	},
	{
		kind: 'number',
		id: 'rivers',
		label: 'Rivers',
		help: 'Low = a few mighty rivers. High = a countryside laced with streams.',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.5,
	},
	{
		kind: 'int',
		id: 'detail',
		label: 'Detail',
		help: 'Number of terrain cells. The cell size IS the smallest feature the map can hold. Above ~2500 a run stops being instant.',
		applies: 'regenerate',
		min: 300,
		max: 4000,
		step: 100,
		default: 1400,
		unit: 'cells',
	},

	{
		kind: 'int',
		id: 'octaves',
		label: 'Noise layers',
		help: 'More layers = finer detail, at a linear cost.',
		advanced: true,
		group: 'Terrain',
		applies: 'regenerate',
		min: 1,
		max: 8,
		step: 1,
		default: 5,
	},
	{
		kind: 'number',
		id: 'terrainScale',
		label: 'Feature scale',
		help: 'Base noise frequency. Higher = smaller, busier landforms.',
		advanced: true,
		group: 'Terrain',
		applies: 'regenerate',
		min: 1,
		max: 8,
		step: 0.25,
		default: 3,
	},
	{
		kind: 'number',
		id: 'lacunarity',
		label: 'Detail spacing',
		help: 'How much finer each successive noise layer is.',
		advanced: true,
		group: 'Terrain',
		applies: 'regenerate',
		min: 1.5,
		max: 3,
		step: 0.1,
		default: 2,
	},
	{
		kind: 'number',
		id: 'persistence',
		label: 'Roughness',
		help: 'How loud each successive noise layer is. High = craggy; low = smooth.',
		advanced: true,
		group: 'Terrain',
		applies: 'regenerate',
		min: 0.3,
		max: 0.7,
		step: 0.02,
		default: 0.5,
	},
	{
		kind: 'number',
		id: 'warpStrength',
		label: 'Coast wander',
		help: 'Domain warp. Bends the terrain so coastlines meander instead of reading as noise.',
		advanced: true,
		group: 'Terrain',
		applies: 'regenerate',
		min: 0,
		max: 0.6,
		step: 0.02,
		default: 0.18,
	},

	{
		kind: 'int',
		id: 'lloyd',
		label: 'Cell evenness',
		help: 'Lloyd relaxation passes. Blue-noise cells are already even, so 0–1 is plenty; 3 looks unnaturally hexagonal and re-triangulates the mesh each pass.',
		advanced: true,
		group: 'Mesh',
		applies: 'regenerate',
		min: 0,
		max: 3,
		step: 1,
		default: 1,
	},

	{
		kind: 'number',
		id: 'moistureBias',
		label: 'Rainfall',
		help: 'Shifts the whole world wetter or drier. Negative turns the interior to desert.',
		advanced: true,
		group: 'Climate',
		applies: 'regenerate',
		min: -0.35,
		max: 0.35,
		step: 0.05,
		default: 0,
	},
	{
		kind: 'number',
		id: 'mapLatitude',
		label: 'Latitude',
		help: 'Where on the globe this map sits. 0 = the equator runs through the middle of it. 1 = the frozen pole.',
		advanced: true,
		group: 'Climate',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0,
	},
	{
		kind: 'number',
		id: 'latitudeGradient',
		label: 'Climate bands',
		help: '0 = one climate everywhere. 1 = the map spans a whole hemisphere, tropics to ice.',
		advanced: true,
		group: 'Climate',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.75,
	},
	{
		kind: 'number',
		id: 'lapseRate',
		label: 'Altitude chill',
		help: 'How fast it gets cold with height — the dial that puts snow on the peaks.',
		advanced: true,
		group: 'Climate',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.45,
	},

	{
		kind: 'int',
		id: 'kingdoms',
		label: 'Kingdoms',
		help: 'Realms grown out from the biggest settlements. 0 draws no borders at all.',
		advanced: true,
		group: 'Politics',
		applies: 'regenerate',
		min: 0,
		max: 12,
		step: 1,
		default: 4,
	},
	{
		kind: 'number',
		id: 'borderBias',
		label: 'Natural borders',
		help: 'How strongly rivers and mountains stop a realm expanding. High = borders follow the terrain.',
		advanced: true,
		group: 'Politics',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.6,
	},
	{
		kind: 'number',
		id: 'territorySpread',
		label: 'Claimed land',
		help: 'How far a realm reaches before it gives up. Low leaves a lot of the map as wilderness.',
		advanced: true,
		group: 'Politics',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.55,
	},

	{
		kind: 'int',
		id: 'settlements',
		label: 'Settlements',
		help: 'Upper bound: a world with little habitable land will place fewer. 0 also removes the roads.',
		advanced: true,
		group: 'Settlements',
		applies: 'regenerate',
		min: 0,
		max: 40,
		step: 1,
		default: 14,
	},
	{
		kind: 'number',
		id: 'settlementSpacing',
		label: 'Settlement spacing',
		help: 'Minimum distance between two towns, as a fraction of the map.',
		advanced: true,
		group: 'Settlements',
		applies: 'regenerate',
		min: 0.02,
		max: 0.25,
		step: 0.01,
		default: 0.08,
	},
	{
		kind: 'number',
		id: 'roadTerrainCost',
		label: 'Road realism',
		help: '0 = roads run straight. 1 = roads detour around mountains and forests, and bridge rivers where they must.',
		advanced: true,
		group: 'Settlements',
		applies: 'regenerate',
		min: 0,
		max: 1,
		step: 0.05,
		default: 0.6,
	},
	{
		kind: 'boolean',
		id: 'labels',
		label: 'Place names',
		help: 'Draw the generated name beside each settlement.',
		advanced: true,
		group: 'Settlements',
		applies: 'regenerate',
		default: true,
	},
];

const PRESETS: GeneratorDefinition['presets'] = [
	{
		id: 'sword-coast',
		label: 'Sword coast',
		description:
			'A broad continent with a long habitable coastline, four realms, and heavy river country.',
		values: {
			landShape: 'continent',
			seaLevel: 0.36,
			terrainDrama: 1.5,
			rivers: 0.55,
			detail: 1400,
		},
	},
	{
		id: 'lone-island',
		label: 'Lone island',
		description: 'One island in an empty sea. A single kingdom, if that.',
		values: {
			landShape: 'island',
			seaLevel: 0.4,
			terrainDrama: 1.7,
			rivers: 0.45,
			detail: 1200,
			kingdoms: 1,
			settlements: 8,
		},
	},
	{
		id: 'scattered-isles',
		label: 'Scattered isles',
		description: 'An archipelago — many small landmasses, few roads, everything reached by sea.',
		values: {
			landShape: 'archipelago',
			seaLevel: 0.34,
			terrainDrama: 1.3,
			rivers: 0.4,
			detail: 1600,
			kingdoms: 3,
			settlements: 12,
			settlementSpacing: 0.06,
		},
	},
	{
		id: 'jagged-north',
		label: 'Jagged north',
		description:
			'A cold, mountainous continent: deep valleys, ice on the peaks, few and mighty rivers.',
		values: {
			landShape: 'continent',
			seaLevel: 0.42,
			terrainDrama: 2.6,
			rivers: 0.2,
			detail: 1600,
			mapLatitude: 0.8,
			latitudeGradient: 0.3,
			lapseRate: 0.8,
			moistureBias: -0.1,
			kingdoms: 3,
		},
	},
	{
		id: 'inland-sea',
		label: 'Cradle of the inland sea',
		description:
			'Land all around a central sea — the classic cradle-of-civilisation map. Many realms, many towns.',
		values: {
			landShape: 'inland-sea',
			seaLevel: 0.34,
			terrainDrama: 1.3,
			rivers: 0.6,
			detail: 1600,
			kingdoms: 6,
			settlements: 20,
			moistureBias: 0.05,
		},
	},
	{
		id: 'borderlands',
		label: 'Borderlands region',
		description:
			'Zoomed in: one stretch of frontier at region scale. Dense detail, dense towns, one contested realm.',
		values: {
			landShape: 'peninsula',
			seaLevel: 0.3,
			terrainDrama: 1.4,
			rivers: 0.75,
			detail: 2000,
			kingdoms: 2,
			settlements: 18,
			settlementSpacing: 0.05,
			territorySpread: 0.8,
		},
	},
];

// ---------------------------------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------------------------------

function outerRings(rings: Ring[]): Ring[] {
	// contourGrid hands back outer boundaries CCW and holes CW. We drop the holes: lakes and enclaves are
	// emitted as their own features, painted after the region that contains them.
	return rings.filter((ring) => ring.length >= 3 && ringArea(ring) > 0);
}

/** Dissolve a set of cells into polygons. No polygon-boolean library: rasterize the cell rings and
 *  contour the union, which is the sanctioned primitive and gives an organically smoothed boundary. */
function dissolve(
	mesh: WorldMesh,
	cells: readonly number[],
	resolution: number,
	smooth: number,
): Ring[] {
	const rings: Ring[] = [];
	for (const cell of cells) {
		const ring = mesh.rings[cell] as Ring;
		if (ring && ring.length >= 3) rings.push(ring);
	}
	if (rings.length === 0) return [];
	return outerRings(
		unionBoundary(
			{ rings },
			{ resolution, smoothIterations: smooth, simplifyEpsilon: 0.7, minRingArea: 5 },
		),
	);
}

function ringToStroke(ring: Ring): Point[] {
	// A coastline is the same geometry as the landmass, read as a line. Close it explicitly so a renderer
	// that treats a stroke as an open polyline still draws the last edge.
	return [...ring, ring[0] as Point];
}

function run(ctx: GeneratorContext): GeneratorOutput {
	const params = ctx.params;
	const shape = stringParam(params, 'landShape') as LandShape;
	const seaLevel = numberParam(params, 'seaLevel');
	const detail = numberParam(params, 'detail');
	const riversDial = numberParam(params, 'rivers');
	const kingdomCount = numberParam(params, 'kingdoms');
	const settlementCap = numberParam(params, 'settlements');

	// --- 1. mesh -----------------------------------------------------------------------------------
	const mesh = buildMesh(ctx.rng.stream('mesh'), detail, numberParam(params, 'lloyd'));
	const count = mesh.sites.length;
	if (count < MIN_CELLS) {
		return { layers: [], summary: 'Not enough cells to build a world — raise Detail.' };
	}

	// --- 2. elevation ------------------------------------------------------------------------------
	const elevation = createWorldElevation(params, ctx.rng.stream('elevation'));
	const raw: number[] = mesh.sites.map((p) => elevation.at(p.x, p.y));

	// --- 3. hydrology ------------------------------------------------------------------------------
	const hydro = computeHydrology(mesh, raw, seaLevel);
	const land: number[] = [];
	for (let i = 0; i < count; i += 1) {
		if (!hydro.ocean[i] && !hydro.lake[i]) land.push(i);
	}
	const oceanCells: number[] = [];
	const lakeCells: number[] = [];
	for (let i = 0; i < count; i += 1) {
		if (hydro.ocean[i]) oceanCells.push(i);
		else if (hydro.lake[i]) lakeCells.push(i);
	}

	// Rain is drawn for EVERY cell in index order — including the ones under water. A per-cell draw that
	// skipped the ocean would make the draw sequence depend on the sea level, and dragging the sea level
	// would then silently reroll every river. This pattern repeats for every per-cell jitter below.
	const riverRng = ctx.rng.stream('rivers');
	const rain: number[] = [];
	for (let i = 0; i < count; i += 1) rain.push(0.85 + riverRng.next() * 0.3);

	const flow = new Array<number>(count).fill(0);
	const order = land.concat(lakeCells);
	order.sort((a, b) => (hydro.filled[b] as number) - (hydro.filled[a] as number) || a - b);
	for (const cell of order) flow[cell] = (flow[cell] as number) + (rain[cell] as number);
	for (const cell of order) {
		const down = hydro.downhill[cell] as number;
		if (down >= 0) flow[down] = (flow[down] as number) + (flow[cell] as number);
	}
	// The threshold is expressed in cells-drained so that it means the same thing at any Detail: at 0 a
	// river must gather ~5% of the landmass before it shows, at 1 a handful of cells is enough.
	const riverThreshold = Math.max(3, (0.055 - riversDial * 0.05) * Math.max(land.length, 1));
	const isRiver = new Array<boolean>(count).fill(false);
	for (const cell of land) {
		if ((flow[cell] as number) >= riverThreshold) isRiver[cell] = true;
	}
	const rivers = traceRivers(mesh, hydro, flow, isRiver);
	const maxFlow = rivers.reduce((best, river) => Math.max(best, river.flow), 1);

	// --- 4. climate --------------------------------------------------------------------------------
	const moistureRng = ctx.rng.stream('moisture');
	const moistureNoise = fbm(createValueNoise(moistureRng.nextInt(1, 0x3fffffff)), {
		octaves: 3,
		frequency: 2.5,
	});
	const moistureBias = numberParam(params, 'moistureBias');
	const gradient = numberParam(params, 'latitudeGradient');
	const lapseRate = numberParam(params, 'lapseRate');

	// Hops to the nearest water of any kind. Cheaper than diffusing moisture across the graph and reads
	// the same on the map: coasts and river valleys are green, the deep interior is not.
	const waterHops = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
	const queue: number[] = [];
	for (let i = 0; i < count; i += 1) {
		if (hydro.ocean[i] || hydro.lake[i] || isRiver[i]) {
			waterHops[i] = 0;
			queue.push(i);
		}
	}
	for (let head = 0; head < queue.length; head += 1) {
		const cell = queue[head] as number;
		for (const next of mesh.neighbors[cell] as number[]) {
			if ((waterHops[next] as number) <= (waterHops[cell] as number) + 1) continue;
			waterHops[next] = (waterHops[cell] as number) + 1;
			queue.push(next);
		}
	}

	// Elevation zone is relative to the world's OWN relief, not to the absolute ceiling of 1. A high
	// Terrain drama pushes every height down, so an absolute band would mean "more drama ⇒ no mountains",
	// which is precisely backwards. Normalizing against the tallest cell is the cheap stand-in for
	// mapgen2's elevation redistribution: whatever the terrain does, its high ground reads as high ground.
	let peak = seaLevel;
	for (const cell of land) peak = Math.max(peak, raw[cell] as number);
	const relief = Math.max(peak - seaLevel, 0.02);
	const zone: number[] = raw.map((h) => clamp01((h - seaLevel) / relief));
	const mapLatitude = numberParam(params, 'mapLatitude');
	const moisture: number[] = [];
	const temperature: number[] = [];
	const biomeRng = ctx.rng.stream('biomes');
	for (let i = 0; i < count; i += 1) {
		const site = mesh.sites[i] as Point;
		const wet = clamp01((moistureNoise.at(site.x, site.y) + 1) / 2);
		const proximity = Math.exp(-(waterHops[i] as number) * 0.22);
		// A one-sample rain shadow: air arrives from the west, so a cell that stands above the ground
		// upwind of it has already had the rain wrung out of it. This is the detail that makes a desert
		// land where a desert belongs, on the lee side of a range.
		const upwind = elevation.at(clamp01(site.x - 0.05), site.y);
		const shadow = clamp01(((raw[i] as number) - upwind) * 3) * 0.35;
		const jitterM = (biomeRng.next() - 0.5) * 0.06;
		const jitterT = (biomeRng.next() - 0.5) * 1.5;
		moisture.push(clamp01(0.45 * wet + 0.45 * proximity + 0.1 + moistureBias - shadow + jitterM));
		temperature.push(
			temperatureAt(site.y, zone[i] as number, mapLatitude, gradient, lapseRate) + jitterT,
		);
	}

	const biome: Biome[] = [];
	for (let i = 0; i < count; i += 1) {
		if (hydro.ocean[i]) {
			biome.push('ocean');
			continue;
		}
		if (hydro.lake[i]) {
			biome.push('lake');
			continue;
		}
		const coastal = (mesh.neighbors[i] as number[]).some((n) => hydro.ocean[n]);
		if (coastal && (zone[i] as number) < 0.06) {
			biome.push('beach');
			continue;
		}
		if ((moisture[i] as number) > 0.86 && (zone[i] as number) < 0.12) {
			biome.push('marsh');
			continue;
		}
		biome.push(whittaker(temperature[i] as number, moisture[i] as number, zone[i] as number));
	}

	// --- 5. settlements ----------------------------------------------------------------------------
	const settleRng = ctx.rng.stream('settlements');
	const score: number[] = [];
	for (let i = 0; i < count; i += 1) {
		const jitter = settleRng.next(); // Drawn for every cell — see the note on `rain` above.
		if (hydro.ocean[i] || hydro.lake[i]) {
			score.push(-1);
			continue;
		}
		const traits = BIOME_TRAITS[biome[i] as Biome];
		let slope = 0;
		const neighbors = mesh.neighbors[i] as number[];
		for (const n of neighbors) slope += Math.abs((raw[i] as number) - (raw[n] as number));
		slope = neighbors.length > 0 ? slope / neighbors.length : 0;
		const coastal = neighbors.some((n) => hydro.ocean[n]) ? 1 : 0;
		const freshwater = neighbors.some((n) => hydro.lake[n] || isRiver[n]) || isRiver[i] ? 1 : 0;
		const comfort = 1 - Math.min(1, Math.abs((temperature[i] as number) - 15) / 30);
		score.push(
			traits.habitability * 0.9 +
				coastal * 0.3 +
				freshwater * 0.35 +
				comfort * 0.25 -
				slope * 6 +
				jitter * 0.2,
		);
	}
	const spacing = numberParam(params, 'settlementSpacing');
	const candidates = land.filter((i) => (score[i] as number) > 0.2);
	candidates.sort((a, b) => (score[b] as number) - (score[a] as number) || a - b);
	const settlementCells: number[] = [];
	for (const cell of candidates) {
		if (settlementCells.length >= settlementCap) break;
		const site = mesh.sites[cell] as Point;
		const tooClose = settlementCells.some(
			(other) => dist2(site, mesh.sites[other] as Point) < spacing * spacing,
		);
		if (!tooClose) settlementCells.push(cell);
	}

	// --- 6. roads ----------------------------------------------------------------------------------
	const roadCost = numberParam(params, 'roadTerrainCost');
	const stepCost = (from: number, to: number): number => {
		if (hydro.ocean[to] || hydro.lake[to]) return Number.POSITIVE_INFINITY;
		const climb = Math.max(0, (raw[to] as number) - (raw[from] as number));
		const traits = BIOME_TRAITS[biome[to] as Biome];
		const crossing = isRiver[to] ? 0.35 * roadCost : 0;
		const terrain = 1 + roadCost * (traits.movement - 1 + climb * 9) + crossing;
		return dist(mesh.sites[from] as Point, mesh.sites[to] as Point) * terrain;
	};
	const roads: Array<{ cells: number[]; from: number; to: number }> = [];
	if (settlementCells.length > 1) {
		const points = settlementCells.map((cell) => mesh.sites[cell] as Point);
		const tri = delaunay(points);
		const spanning = minimumSpanningTree(points, tri.edges);
		// Sorted so the road set — and therefore the bridge POIs — is a property of the map, not of the
		// order the triangulator happened to emit its edges in.
		const edges = [...spanning].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		for (const [a, b] of edges) {
			const path = shortestPath(
				mesh,
				settlementCells[a] as number,
				settlementCells[b] as number,
				stepCost,
			);
			// No path means the two towns are on different islands. That is not an error, it is an
			// archipelago: they trade by sea and no road is drawn.
			if (path) roads.push({ cells: path, from: a, to: b });
		}
	}

	// --- 7. politics -------------------------------------------------------------------------------
	const politicsRng = ctx.rng.stream('politics');
	const realmCount = Math.min(kingdomCount, settlementCells.length);
	const borderBias = numberParam(params, 'borderBias');
	const spread = numberParam(params, 'territorySpread');
	const vigour: number[] = [];
	for (let k = 0; k < realmCount; k += 1) vigour.push(0.75 + politicsRng.next() * 0.5);
	const owner = new Array<number>(count).fill(-1);
	if (realmCount > 0) {
		const maxReach = 0.35 + spread * 2.2;
		const cost = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
		const heap = createMinHeap();
		for (let k = 0; k < realmCount; k += 1) {
			const seed = settlementCells[k] as number;
			cost[seed] = 0;
			owner[seed] = k;
			heap.push(seed, 0);
		}
		while (heap.size() > 0) {
			const top = heap.pop();
			if (!top) break;
			if (top.cost > (cost[top.cell] as number)) continue;
			const realm = owner[top.cell] as number;
			for (const next of mesh.neighbors[top.cell] as number[]) {
				if (hydro.ocean[next] || hydro.lake[next]) continue;
				const climb = Math.abs((raw[next] as number) - (raw[top.cell] as number));
				const traits = BIOME_TRAITS[biome[next] as Biome];
				// Rivers and ridges are what a border actually follows: make them expensive and the realms
				// stop where the map says they should, without any border logic of their own.
				const barrier = (isRiver[next] ? 1.2 : 0) + climb * 10;
				const step =
					(dist(mesh.sites[top.cell] as Point, mesh.sites[next] as Point) *
						(0.5 + traits.movement * 0.35 + barrier * borderBias)) /
					(vigour[realm] as number);
				const next_cost = top.cost + step;
				if (next_cost > maxReach || next_cost >= (cost[next] as number)) continue;
				cost[next] = next_cost;
				owner[next] = realm;
				heap.push(next, next_cost);
			}
		}
	}

	// --- 8. names ----------------------------------------------------------------------------------
	// One stream PER naming subsystem, not one shared 'names' stream. With a shared stream, changing the
	// river threshold would shift every settlement's name down the sequence — and "I added one river and
	// every town was renamed" is precisely the slot-machine behaviour named streams exist to prevent.
	const riverNameRng = ctx.rng.stream('names:rivers');
	const riverNames = rivers.map(() => generateName(riverNameRng, 'river'));
	const settlementNameRng = ctx.rng.stream('names:settlements');
	const settlementNames = settlementCells.map(() => generateName(settlementNameRng, 'settlement'));
	const regionNameRng = ctx.rng.stream('names:regions');
	const realmNames: string[] = [];
	for (let k = 0; k < realmCount; k += 1) realmNames.push(generateName(regionNameRng, 'region'));

	// --- 9. emit -----------------------------------------------------------------------------------
	const layers: MapLayer[] = [];
	const pois: GeneratedPoi[] = [];
	const notes: Array<{ key: string; title: string; body: string }> = [];
	const id = (suffix: string): string => `${ctx.idPrefix}-${suffix}`;

	// Ocean + lakes.
	const water: MapFeature[] = [
		feature(
			id('ocean'),
			'polygon',
			[
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 0, y: 1 },
			],
			'water:ocean',
			{ biome: 'ocean' },
		),
	];
	const lakeRings = dissolve(mesh, lakeCells, 256, 2);
	lakeRings.forEach((ring, index) => {
		water.push(feature(id(`lake-${index}`), 'water', ring, 'water:lake', { biome: 'lake' }));
	});
	layers.push(buildLayer(ctx, 'ocean', 'Ocean', 'terrain', water, 0));

	// Landmass + coastline: one dissolve, read twice.
	const landRings = dissolve(mesh, land.concat(lakeCells), 320, 2);
	layers.push(
		buildLayer(
			ctx,
			'landmass',
			'Landmass',
			'base',
			landRings.map((ring, index) => feature(id(`land-${index}`), 'polygon', ring, 'land:mass')),
			1,
		),
	);

	// Biomes, painted broad-to-narrow so enclaves land on top.
	const biomeFeatures: MapFeature[] = [];
	for (const kind of BIOME_PAINT_ORDER) {
		const cells = land.filter((i) => biome[i] === kind);
		if (cells.length === 0) continue;
		const regions = dissolve(mesh, cells, 224, 2);
		regions.forEach((ring, index) => {
			biomeFeatures.push(
				feature(id(`biome-${kind}-${index}`), 'polygon', ring, `biome:${kind}`, {
					biome: kind,
					label: BIOME_TRAITS[kind].label,
					cells: cells.length,
				}),
			);
		});
	}
	layers.push(buildLayer(ctx, 'biomes', 'Biomes', 'terrain', biomeFeatures, 2));

	// Rivers. The polyline is the chain of cell centroids, unsmoothed: every vertex is a real cell, and
	// the elevation therefore falls monotonically along it. Corner-cutting the chain would move vertices
	// off their cells and could push a vertex uphill, which is the one thing a river may not do.
	const riverFeatures: MapFeature[] = [];
	rivers.forEach((river, index) => {
		const points: Point[] = river.cells.map((cell) => mesh.sites[cell] as Point);
		if (river.mouthCell >= 0) points.push(mesh.sites[river.mouthCell] as Point);
		if (points.length < 2) return;
		const width = clamp(0.0015 * Math.sqrt(river.flow / maxFlow) * 4, 0.0012, 0.006);
		riverFeatures.push(
			feature(id(`river-${index}`), 'water', points, 'water:river', {
				width: norm(width),
				flow: norm(river.flow),
				mouth: river.mouth,
				name: riverNames[index] as string,
			}),
		);
	});
	layers.push(buildLayer(ctx, 'rivers', 'Rivers', 'terrain', riverFeatures, 3));

	layers.push(
		buildLayer(
			ctx,
			'coastline',
			'Coastline',
			'base',
			landRings.map((ring, index) =>
				feature(id(`coast-${index}`), 'stroke', ringToStroke(ring), 'ink:coastline'),
			),
			4,
		),
	);

	// Political regions.
	const realmFeatures: MapFeature[] = [];
	const realmCells: number[][] = [];
	for (let k = 0; k < realmCount; k += 1) realmCells.push([]);
	for (let i = 0; i < count; i += 1) {
		const realm = owner[i] as number;
		if (realm >= 0) (realmCells[realm] as number[]).push(i);
	}
	for (let k = 0; k < realmCount; k += 1) {
		const regions = dissolve(mesh, realmCells[k] as number[], 224, 2);
		regions.forEach((ring, index) => {
			realmFeatures.push(
				feature(id(`realm-${k}-${index}`), 'polygon', ring, `region:kingdom-${(k % 8) + 1}`, {
					kingdom: realmNames[k] as string,
					index: k,
				}),
			);
		});
	}
	layers.push(buildLayer(ctx, 'realms', 'Kingdoms', 'dm-annotations', realmFeatures, 5));

	// Roads, and the bridges that fall out of them.
	const roadFeatures: MapFeature[] = [];
	const bridgeCells: number[] = [];
	roads.forEach((road, index) => {
		const points = road.cells.map((cell) => mesh.sites[cell] as Point);
		// Roads MAY be smoothed: nothing downstream asserts an invariant about their vertices, and a
		// cart track that follows the cell centroids exactly reads as a machine-drawn zigzag.
		const smoothed = points.length > 2 ? chaikin(points, 1, false) : points;
		roadFeatures.push(
			feature(id(`road-${index}`), 'road', smoothed, 'road:highway', {
				from: settlementNames[road.from] as string,
				to: settlementNames[road.to] as string,
			}),
		);
		for (const cell of road.cells) {
			if (isRiver[cell] && !bridgeCells.includes(cell)) bridgeCells.push(cell);
		}
	});
	layers.push(buildLayer(ctx, 'roads', 'Roads', 'roads', roadFeatures, 6));

	// Settlements: markers, labels, and a POI each.
	const settlementFeatures: MapFeature[] = [];
	const showLabels = boolParam(params, 'labels');
	settlementCells.forEach((cell, index) => {
		const site = mesh.sites[cell] as Point;
		const realm = owner[cell] as number;
		const rank: 'capital' | 'city' | 'town' | 'village' =
			index < realmCount
				? 'capital'
				: index < realmCount + 3
					? 'city'
					: index < settlementCap / 2
						? 'town'
						: 'village';
		const name = settlementNames[index] as string;
		const onRiver = isRiver[cell];
		const coastal = (mesh.neighbors[cell] as number[]).some((n) => hydro.ocean[n]);
		settlementFeatures.push(
			feature(id(`settlement-${index}`), 'marker', [site], `settlement:${rank}`, {
				name,
				rank,
				biome: biome[cell] as string,
				kingdom: realm >= 0 ? (realmNames[realm] as string) : 'unclaimed',
			}),
		);
		if (showLabels) {
			settlementFeatures.push(
				feature(
					id(`label-${index}`),
					'text',
					[{ x: site.x, y: site.y - 0.012 }],
					'label:settlement',
					{
						text: name,
					},
				),
			);
		}
		const where = [
			BIOME_TRAITS[biome[cell] as Biome].label.toLowerCase(),
			coastal ? 'on the coast' : null,
			onRiver ? 'astride a river' : null,
		]
			.filter((part): part is string => part !== null)
			.join(', ');
		pois.push({
			id: id(`poi-settlement-${index}`),
			label: name,
			category: 'settlement',
			position: { x: norm(site.x), y: norm(site.y) },
			notes: `${rank[0]?.toUpperCase()}${rank.slice(1)} — ${where}. ${
				realm >= 0 ? `Sworn to ${realmNames[realm] as string}.` : 'Owes fealty to no one.'
			}`,
		});
	});
	bridgeCells.slice(0, 12).forEach((cell, index) => {
		const site = mesh.sites[cell] as Point;
		pois.push({
			id: id(`poi-bridge-${index}`),
			label: (flow[cell] as number) > riverThreshold * 3 ? 'Bridge' : 'Ford',
			category: 'landmark',
			position: { x: norm(site.x), y: norm(site.y) },
			notes: 'A road crosses running water here — a toll, a troll, or an ambush.',
		});
	});
	layers.push(buildLayer(ctx, 'settlements', 'Settlements', 'poi', settlementFeatures, 7));

	// Notes: one per realm, so the DM opens the map with something to say about it.
	for (let k = 0; k < realmCount; k += 1) {
		const held = (realmCells[k] as number[]).length;
		const towns = settlementCells.filter((cell) => (owner[cell] as number) === k).length;
		const capital = settlementNames[k] as string;
		notes.push({
			key: `kingdom-${k + 1}`,
			title: realmNames[k] as string,
			body: `Seat of power: ${capital}. Holds ${held} of the world's ${land.length} land regions and ${towns} settlement${towns === 1 ? '' : 's'}.`,
		});
	}

	const landmasses = landRings.length;
	const profile = SHAPE_PROFILES[shape];
	const summary = [
		`${landmasses} ${landmasses === 1 ? profile.noun : profile.plural}`,
		`${realmCount} kingdom${realmCount === 1 ? '' : 's'}`,
		`${settlementCells.length} settlement${settlementCells.length === 1 ? '' : 's'}`,
		`${rivers.length} river${rivers.length === 1 ? '' : 's'}`,
	].join(' · ');

	return { layers, pois, notes, summary };
}

/** Dijkstra over the cell adjacency graph. Returns the cell chain, or null when `to` is unreachable. */
function shortestPath(
	mesh: WorldMesh,
	from: number,
	to: number,
	stepCost: (a: number, b: number) => number,
): number[] | null {
	const count = mesh.sites.length;
	const cost = new Array<number>(count).fill(Number.POSITIVE_INFINITY);
	const prev = new Array<number>(count).fill(-1);
	const heap = createMinHeap();
	cost[from] = 0;
	heap.push(from, 0);
	while (heap.size() > 0) {
		const top = heap.pop();
		if (!top) break;
		if (top.cell === to) break;
		if (top.cost > (cost[top.cell] as number)) continue;
		for (const next of mesh.neighbors[top.cell] as number[]) {
			const step = stepCost(top.cell, next);
			if (!Number.isFinite(step)) continue;
			const total = top.cost + step;
			if (total >= (cost[next] as number)) continue;
			cost[next] = total;
			prev[next] = top.cell;
			heap.push(next, total);
		}
	}
	if (!Number.isFinite(cost[to] as number)) return null;
	const path: number[] = [];
	for (let cell = to; cell !== -1; cell = prev[cell] as number) {
		path.push(cell);
		if (cell === from) break;
	}
	path.reverse();
	return path[0] === from ? path : null;
}

export const worldContinent: GeneratorDefinition = {
	id: 'world.continent',
	group: 'world',
	scale: 'world',
	label: 'Continent',
	description:
		'A whole world on one page: coastlines, mountains, rivers, biomes, kingdoms, roads and named towns, grown from a Voronoi cell mesh.',
	bestFor:
		'The campaign map. Pick this whenever the party is going to travel between places rather than through one — the presets cover islands, archipelagos, peninsulas and inland seas.',
	version: 1,
	params: PARAMS,
	presets: PRESETS,
	run,
};

/** Everything this module contributes to the generator registry. */
export const worldGenerators: readonly GeneratorDefinition[] = [worldContinent];
