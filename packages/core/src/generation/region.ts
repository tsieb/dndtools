import type { MapFeature, MapLayer } from '../state/map-state';
import type { MapPoiCategory } from '../state/map-annotations';
import type { SeededRng } from '../state/prng';
import type { CellGrid, NoiseField, Point, Ring } from '../geometry';
import {
	chaikin,
	clamp,
	clamp01,
	contourGrid,
	createGrid,
	createValueNoise,
	delaunay,
	dist,
	distanceField,
	domainWarp,
	fbm,
	floodRegions,
	gridGet,
	gridSet,
	minimumSpanningTree,
	poissonDisk,
	ringArea,
} from '../geometry';
import { generateName } from './names';
import type {
	GeneratedGraph,
	GeneratedPoi,
	GeneratorContext,
	GeneratorDefinition,
	GeneratorOutput,
} from './types';
import {
	boolParam,
	buildLayer,
	feature,
	norm,
	normPoint,
	numberParam,
	stringParam,
	tagsParam,
} from './types';

/**
 * MAP-021 — the regional generators: `region.wilderness` (a Perilous-Shores-style barony) and
 * `region.hexcrawl` (a stocked hex overlay).
 *
 * This is the scale a GM actually runs — "the barony around Thornwood" — and it is the scale where the
 * GEOMETRY IS THE EASY HALF. A regional map's value is its CONTENT: a coastline nobody has a hook for is
 * wallpaper. So the pipeline spends its effort on the seeding rules rather than the terrain: settlements
 * are Poisson-scattered against a HABITABILITY field (flat, near water, on the mainland), ruins land in
 * the wilds, and lairs are pushed away from settlements by a danger gradient — which is Watabou's
 * observation that danger should be a function of distance from civilization, and is the single knob that
 * makes a generated region feel like somewhere people live rather than a noise field with pins in it.
 *
 * Terrain itself is fbm + domain warp, rasterized into a scratch `CellGrid` and vectorized back out
 * through `contourGrid`. The grid never persists; only the rings do.
 */

/** The scratch raster resolution. Fine enough for a shoreline, coarse enough to stay instant. */
const GRID = 128;

type Biome = 'water' | 'mountains' | 'hills' | 'forest' | 'swamp' | 'plains' | 'desert';

const BIOME_STYLE: Readonly<Record<Biome, string>> = {
	water: 'water:sea',
	mountains: 'terrain:mountains',
	hills: 'terrain:hills',
	forest: 'terrain:forest',
	swamp: 'terrain:swamp',
	plains: 'terrain:plains',
	desert: 'terrain:desert',
};

const BIOME_LABEL: Readonly<Record<Biome, string>> = {
	water: 'Water',
	mountains: 'Mountains',
	hills: 'Hills',
	forest: 'Forest',
	swamp: 'Marsh',
	plains: 'Plains',
	desert: 'Barrens',
};

/** Grid index → normalized centre of that cell. */
function cellPoint(x: number, y: number): Point {
	return { x: (x + 0.5) / GRID, y: (y + 0.5) / GRID };
}

function sampleAt(field: NoiseField, x: number, y: number): number {
	// fbm returns roughly -1..1; fold to 0..1 so every threshold below reads as an ELEVATION.
	return clamp01((field.at((x + 0.5) / GRID, (y + 0.5) / GRID) + 1) / 2);
}

/** Bilinear-ish read of a per-cell field at a normalized point. */
function fieldAt(values: Float32Array, p: Point): number {
	const x = clamp(Math.floor(p.x * GRID), 0, GRID - 1);
	const y = clamp(Math.floor(p.y * GRID), 0, GRID - 1);
	return values[y * GRID + x] as number;
}

// ---------------------------------------------------------------------------------------------
// region.wilderness
// ---------------------------------------------------------------------------------------------

interface RegionTerrain {
	elevation: Float32Array;
	moisture: Float32Array;
	/** 1 = water. */
	waterGrid: CellGrid;
	/** Per-cell distance to the nearest water cell, in CELL units. */
	waterDistance: Float32Array;
	/** 1 = a cell of the largest contiguous landmass. Settlements only ever go here. */
	mainland: CellGrid;
	biome: Biome[];
}

interface RegionTypeShape {
	/** Added to elevation before thresholding. Negative = wetter, lower, more water. */
	lift: number;
	/** Multiplies the fbm amplitude. High = jagged. */
	relief: number;
	moisture: number;
	/** A directional sea gradient (coastal) rather than a radial island one. */
	sea: 'edge' | 'none';
}

const REGION_SHAPES: Readonly<Record<string, RegionTypeShape>> = {
	coastal: { lift: 0.06, relief: 1, moisture: 0.1, sea: 'edge' },
	inland: { lift: 0.16, relief: 0.95, moisture: 0, sea: 'none' },
	mountainous: { lift: 0.22, relief: 1.45, moisture: -0.08, sea: 'none' },
	marsh: { lift: -0.06, relief: 0.6, moisture: 0.3, sea: 'none' },
	forest: { lift: 0.12, relief: 0.85, moisture: 0.26, sea: 'none' },
};

function buildTerrain(
	rng: SeededRng,
	regionType: string,
	roughness: number,
	waterLevel: number,
): RegionTerrain {
	const shape = REGION_SHAPES[regionType] ?? (REGION_SHAPES.inland as RegionTypeShape);

	// The noise seeds are drawn from the terrain stream, so the terrain is reproducible and — crucially —
	// unaffected by how many settlements or ruins the GM asked for.
	const baseNoise = createValueNoise(rng.nextInt(1, 1_000_000_000));
	const warpNoise = createValueNoise(rng.nextInt(1, 1_000_000_000));
	const moistNoise = createValueNoise(rng.nextInt(1, 1_000_000_000));

	const octaves = Math.round(3 + roughness * 3);
	const elevationField = domainWarp(
		fbm(baseNoise, {
			octaves,
			frequency: 2.6,
			lacunarity: 2,
			persistence: 0.42 + roughness * 0.22,
		}),
		fbm(warpNoise, { octaves: 2, frequency: 1.6 }),
		0.28,
	);
	const moistureField = fbm(moistNoise, { octaves: 3, frequency: 2, persistence: 0.5 });

	// The sea direction is a draw, not a constant — otherwise every coastal barony has its sea to the west.
	const seaAngle = rng.next() * Math.PI * 2;
	const seaDir: Point = { x: Math.cos(seaAngle), y: Math.sin(seaAngle) };

	const elevation = new Float32Array(GRID * GRID);
	const moisture = new Float32Array(GRID * GRID);
	const waterGrid = createGrid(GRID, GRID, 0);

	for (let y = 0; y < GRID; y += 1) {
		for (let x = 0; x < GRID; x += 1) {
			const i = y * GRID + x;
			const p = cellPoint(x, y);
			let e = (sampleAt(elevationField, x, y) - 0.5) * shape.relief + 0.5 + shape.lift;
			if (shape.sea === 'edge') {
				// A linear gradient toward the sea side: land ramps down into the water rather than ending
				// at a cliff, which is what puts the harbours and the estuaries where they belong.
				const along = (p.x - 0.5) * seaDir.x + (p.y - 0.5) * seaDir.y;
				e -= clamp01((along + 0.15) / 0.75) * 0.55;
			} else {
				// An inland region still needs an edge: fall away gently at the map border so rivers have
				// somewhere to go and the region reads as a piece of a larger world.
				const edge = Math.min(p.x, p.y, 1 - p.x, 1 - p.y);
				e -= clamp01((0.1 - edge) / 0.1) * 0.18;
			}
			elevation[i] = clamp01(e);
			moisture[i] = clamp01(sampleAt(moistureField, x, y) + shape.moisture);
			if ((elevation[i] as number) < waterLevel) gridSet(waterGrid, x, y, 1);
		}
	}

	const waterDistance = distanceField(waterGrid, 1);

	// The largest land region is the MAINLAND. Islands are lovely and get ruins; they do not get the
	// barony's market town, and pinning settlements to the mainland is also what makes "no settlement is
	// in the ocean" a claim we can actually keep.
	const landGrid = createGrid(GRID, GRID, 0);
	for (let i = 0; i < GRID * GRID; i += 1) {
		if (waterGrid.cells[i] === 0) landGrid.cells[i] = 1;
	}
	const landRegions = floodRegions(landGrid, 1);
	const mainland = createGrid(GRID, GRID, 0);
	let biggest: number[] = [];
	for (const region of landRegions) {
		if (region.length > biggest.length) biggest = region;
	}
	for (const index of biggest) mainland.cells[index] = 1;

	// Biome from the Whittaker pair (elevation × moisture) — the cheapest classifier that still produces
	// a map somebody can read at a glance.
	const biome: Biome[] = new Array<Biome>(GRID * GRID);
	for (let i = 0; i < GRID * GRID; i += 1) {
		const e = elevation[i] as number;
		const m = moisture[i] as number;
		if (waterGrid.cells[i] === 1) {
			biome[i] = 'water';
		} else if (e > waterLevel + 0.36) {
			biome[i] = 'mountains';
		} else if (e > waterLevel + 0.22) {
			biome[i] = 'hills';
		} else if (e < waterLevel + 0.06 && m > 0.5) {
			biome[i] = 'swamp';
		} else if (m > 0.58) {
			biome[i] = 'forest';
		} else if (m < 0.32) {
			biome[i] = 'desert';
		} else {
			biome[i] = 'plains';
		}
	}

	return { elevation, moisture, waterGrid, waterDistance, mainland, biome };
}

/** Vectorize one biome's cells into polygon rings via marching squares. */
function biomeRings(terrain: RegionTerrain, biome: Biome): Ring[] {
	const grid = createGrid(GRID, GRID, 0);
	for (let i = 0; i < GRID * GRID; i += 1) {
		if (terrain.biome[i] === biome) grid.cells[i] = 1;
	}
	return contourGrid(grid, { smoothIterations: 2, simplifyEpsilon: 0.9, minRingArea: 12 });
}

/**
 * Rivers by downhill walk. Not a full flow-accumulation model — at this scale a river's job is to give
 * the map a spine and the settlements a reason to exist, and a gradient descent from high ground to the
 * sea does that for a fraction of the cost.
 */
function traceRiver(terrain: RegionTerrain, start: Point, rng: SeededRng): Point[] {
	const path: Point[] = [start];
	let current = start;
	for (let step = 0; step < 220; step += 1) {
		const x = clamp(Math.floor(current.x * GRID), 1, GRID - 2);
		const y = clamp(Math.floor(current.y * GRID), 1, GRID - 2);
		if (gridGet(terrain.waterGrid, x, y) === 1) break;
		let best: Point | null = null;
		let bestE = terrain.elevation[y * GRID + x] as number;
		for (let dy = -1; dy <= 1; dy += 1) {
			for (let dx = -1; dx <= 1; dx += 1) {
				if (dx === 0 && dy === 0) continue;
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
				const e = terrain.elevation[ny * GRID + nx] as number;
				if (e < bestE) {
					bestE = e;
					best = cellPoint(nx, ny);
				}
			}
		}
		// A local minimum ends the river in a tarn rather than looping forever.
		if (!best) break;
		const jitter = (rng.next() - 0.5) * 0.004;
		current = { x: clamp01(best.x + jitter), y: clamp01(best.y - jitter) };
		path.push(current);
		if (current.x <= 0.01 || current.x >= 0.99 || current.y <= 0.01 || current.y >= 0.99) break;
	}
	if (path.length < 6) return [];
	return chaikin(path, 2, false).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

type PoiKind = 'settlement' | 'ruin' | 'dungeon' | 'lair' | 'landmark' | 'hazard';

interface SeededPoi {
	kind: PoiKind;
	point: Point;
	name: string;
	hook: string;
	category: MapPoiCategory;
	/** Settlement tier — 'city' | 'town' | 'village'. Empty for everything else. */
	tier: string;
}

const HOOK_TABLE: Readonly<Record<string, readonly string[]>> = {
	undead: [
		'The dead here do not stay buried, and the locals have stopped asking why.',
		'Something walks the barrows at night wearing a face people recognise.',
	],
	beasts: [
		'A predator has learned that people are easier prey than deer.',
		'The herds have been driven off by something that eats more than it needs.',
	],
	fey: [
		'A bargain was struck here a long time ago, and the other party has come to collect.',
		'Travellers lose a day here and cannot account for it.',
	],
	bandits: [
		'A company of deserters has made this their own, and they collect a toll.',
		'Caravans go in and their cargo comes out on the wrong side of the border.',
	],
	cult: [
		'A quiet congregation meets here, and its members are people you have already met.',
		'The offerings left here are fresh, and they are not food.',
	],
	dragon: [
		'The livestock losses follow a season, and the season is ending.',
		'Nothing has nested on that crag for a generation. Something is nesting there now.',
	],
	giants: [
		'The boundary stones have been moved, and they weigh a ton apiece.',
		'Something is taking the standing stones and stacking them somewhere else.',
	],
	elemental: [
		'The weather here obeys nothing, and it has begun to obey something.',
		'The water has turned, and everything that drinks it turns with it.',
	],
};

/**
 * Draw a name that is not already taken. Two villages called Ravenbury in one barony is not a charming
 * coincidence, it is a bug the GM has to work around at the table. Bounded retries keep it deterministic;
 * the fallback qualifier is what a real map does when two places genuinely share a name.
 */
function uniqueName(
	rng: SeededRng,
	kind: 'settlement' | 'region' | 'river' | 'dungeon',
	used: Set<string>,
): string {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		const candidate = generateName(rng, kind);
		if (!used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
	const base = generateName(rng, kind);
	for (const qualifier of ['Little', 'Nether', 'Far', 'Old', 'West']) {
		const candidate = `${qualifier} ${base}`;
		if (!used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
	used.add(base);
	return base;
}

function runWilderness(ctx: GeneratorContext): GeneratorOutput {
	const regionType = stringParam(ctx.params, 'regionType');
	const settlementCount = numberParam(ctx.params, 'settlements');
	const dangerCount = numberParam(ctx.params, 'dangers');
	const ruinCount = numberParam(ctx.params, 'ruins');
	const wantRoads = boolParam(ctx.params, 'roads');
	const roughness = numberParam(ctx.params, 'roughness');
	const waterLevel = numberParam(ctx.params, 'waterLevel');
	const separation = numberParam(ctx.params, 'separation');
	const landmarkCount = numberParam(ctx.params, 'landmarks');
	const hooks = tagsParam(ctx.params, 'hooks');

	const rngTerrain = ctx.rng.stream('terrain');
	const rngStocking = ctx.rng.stream('stocking');
	const rngRoads = ctx.rng.stream('roads');
	const rngNames = ctx.rng.stream('names');

	// The region is named FIRST, before a single POI is drawn. Otherwise adding one more bandit lair
	// consumes another draw from the names stream and silently renames the entire barony — which is the
	// exact slot-machine behaviour the sub-stream model exists to prevent.
	const regionName = generateName(rngNames, 'region');
	// Every place name in the region is drawn against one registry, so no two of them collide.
	const usedNames = new Set<string>([regionName]);

	const terrain = buildTerrain(rngTerrain, regionType, roughness, waterLevel);

	// --- Rivers ---------------------------------------------------------------------------------
	const rivers: Array<{ path: Point[]; name: string }> = [];
	const riverTarget = regionType === 'marsh' ? 1 : 3;
	{
		// Springs start on the highest ground we can find, so a river runs the length of the map instead
		// of trickling twenty cells and stopping.
		const highs: Point[] = [];
		for (let y = 3; y < GRID - 3; y += 4) {
			for (let x = 3; x < GRID - 3; x += 4) {
				if (terrain.waterGrid.cells[y * GRID + x] === 1) continue;
				highs.push(cellPoint(x, y));
			}
		}
		highs.sort((a, b) => {
			const ea = fieldAt(terrain.elevation, b) - fieldAt(terrain.elevation, a);
			if (ea !== 0) return ea;
			return a.x - b.x || a.y - b.y;
		});
		const springs = highs.slice(0, Math.max(1, riverTarget * 6));
		const chosen: Point[] = [];
		for (const spring of springs) {
			if (chosen.length >= riverTarget) break;
			if (chosen.some((c) => dist(c, spring) < 0.22)) continue;
			chosen.push(spring);
		}
		for (const spring of chosen) {
			const path = traceRiver(terrain, spring, rngTerrain);
			if (path.length < 4) continue;
			rivers.push({ path, name: uniqueName(rngNames, 'river', usedNames) });
		}
	}

	// --- Suitability: where would a person actually LIVE? -----------------------------------------
	const habitability = new Float32Array(GRID * GRID);
	for (let y = 0; y < GRID; y += 1) {
		for (let x = 0; x < GRID; x += 1) {
			const i = y * GRID + x;
			if (terrain.mainland.cells[i] === 0) {
				habitability[i] = 0;
				continue;
			}
			const e = terrain.elevation[i] as number;
			// Slope from the 4-neighbour elevation spread — people build on flat ground.
			const ex = Math.abs(
				(terrain.elevation[y * GRID + Math.min(GRID - 1, x + 1)] as number) -
					(terrain.elevation[y * GRID + Math.max(0, x - 1)] as number),
			);
			const ey = Math.abs(
				(terrain.elevation[Math.min(GRID - 1, y + 1) * GRID + x] as number) -
					(terrain.elevation[Math.max(0, y - 1) * GRID + x] as number),
			);
			const flat = clamp01(1 - Math.hypot(ex, ey) * 14);
			const waterCells = terrain.waterDistance[i] as number;
			// Near water is good; ON the water is not, and a three-cell margin is what keeps a settlement
			// out of the sea once marching squares has smoothed the coastline.
			const nearWater = waterCells < 3 ? 0 : clamp01(1.15 - waterCells / 26);
			const swamp = terrain.biome[i] === 'swamp' ? 0.35 : 1;
			const mountain = terrain.biome[i] === 'mountains' ? 0.2 : 1;
			habitability[i] = clamp01(
				flat * (0.35 + nearWater * 0.8) * swamp * mountain * (e > 0.9 ? 0.3 : 1),
			);
		}
	}

	const onMainland = (p: Point): boolean => {
		const x = clamp(Math.floor(p.x * GRID), 0, GRID - 1);
		const y = clamp(Math.floor(p.y * GRID), 0, GRID - 1);
		return terrain.mainland.cells[y * GRID + x] === 1;
	};
	const onLand = (p: Point): boolean => {
		const x = clamp(Math.floor(p.x * GRID), 0, GRID - 1);
		const y = clamp(Math.floor(p.y * GRID), 0, GRID - 1);
		return terrain.waterGrid.cells[y * GRID + x] === 0;
	};
	const waterMargin = (p: Point): number => fieldAt(terrain.waterDistance, p);

	// --- Settlements: Poisson with a habitability-driven variable radius ---------------------------
	const settlementSites = poissonDisk(rngStocking, {
		radius: separation * 1.6,
		radiusAt: (p) => {
			const h = fieldAt(habitability, p);
			// Dense where people want to live, sparse where they do not. This is the whole trick.
			return separation * (1.3 + (1 - h) * 2.6);
		},
		bounds: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
		maxSamples: 400,
		accept: (p) => onMainland(p) && waterMargin(p) >= 3 && fieldAt(habitability, p) > 0.16,
	});
	const rankedSettlements = [...settlementSites]
		.sort((a, b) => {
			const d = fieldAt(habitability, b) - fieldAt(habitability, a);
			if (d !== 0) return d;
			return a.x - b.x || a.y - b.y;
		})
		.slice(0, Math.round(settlementCount));

	const pois: SeededPoi[] = [];
	const settlements: SeededPoi[] = [];
	for (let i = 0; i < rankedSettlements.length; i += 1) {
		const point = rankedSettlements[i] as Point;
		const tier = i === 0 ? 'city' : i < 3 ? 'town' : 'village';
		const name = uniqueName(rngNames, 'settlement', usedNames);
		const poi: SeededPoi = {
			kind: 'settlement',
			point,
			name,
			hook:
				tier === 'city'
					? `The seat of the region. Everything that happens here is watched by somebody, and reported to somebody else.`
					: tier === 'town'
						? `A market town. It has a garrison, a moneylender, and a grudge against its neighbour.`
						: `A village. They have not seen a tax collector in two years and they would like to keep it that way.`,
			category: 'settlement',
			tier,
		};
		pois.push(poi);
		settlements.push(poi);
	}

	const farFromSettlements = (p: Point, radius: number): boolean =>
		settlements.every((s) => dist(s.point, p) > radius);

	const rollHook = (): string => {
		const table = hooks.length > 0 ? hooks : Object.keys(HOOK_TABLE);
		const flavour = rngStocking.pick([...table].sort());
		const lines = HOOK_TABLE[flavour] ?? HOOK_TABLE.beasts;
		return rngStocking.pick(lines as readonly string[]);
	};

	// --- Ruins: in the wilds, and never where anyone is watching -----------------------------------
	const ruinSites = poissonDisk(rngStocking, {
		radius: separation * 1.2,
		bounds: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
		maxSamples: 300,
		accept: (p) => onLand(p) && waterMargin(p) >= 2 && farFromSettlements(p, separation * 1.4),
	});
	const ruins = rngStocking.shuffle(ruinSites).slice(0, Math.round(ruinCount));
	for (let i = 0; i < ruins.length; i += 1) {
		const point = ruins[i] as Point;
		// A third of the ruins go deep — a ruin with a way down is a dungeon.
		const deep = rngStocking.chance(0.4);
		pois.push({
			kind: deep ? 'dungeon' : 'ruin',
			point,
			name: deep
				? uniqueName(rngNames, 'dungeon', usedNames)
				: `Ruins of ${uniqueName(rngNames, 'settlement', usedNames)}`,
			hook: rollHook(),
			category: deep ? 'dungeon' : 'landmark',
			tier: '',
		});
	}

	// --- Dangers: the danger gradient. Far from people is where the teeth are. -----------------------
	const dangerSites = poissonDisk(rngStocking, {
		radius: separation * 1.1,
		bounds: { x: 0.03, y: 0.03, w: 0.94, h: 0.94 },
		maxSamples: 400,
		accept: (p) => onLand(p) && farFromSettlements(p, separation * 2),
	});
	const rankedDangers = [...dangerSites]
		.sort((a, b) => {
			const da = settlements.length > 0 ? Math.min(...settlements.map((s) => dist(s.point, a))) : 1;
			const db = settlements.length > 0 ? Math.min(...settlements.map((s) => dist(s.point, b))) : 1;
			if (db !== da) return db - da;
			return a.x - b.x || a.y - b.y;
		})
		.slice(0, Math.round(dangerCount));
	for (const point of rankedDangers) {
		const lair = rngStocking.chance(0.6);
		pois.push({
			kind: lair ? 'lair' : 'hazard',
			point,
			name: lair
				? `${rngStocking.pick(['Lair', 'Den', 'Nest', 'Warren', 'Hollow'])} of ${generateName(rngNames, 'person')}`
				: `${rngStocking.pick(['The Sinking Mire', 'The Screaming Cut', 'Widow’s Fall', 'The Blighted Reach', 'Coldwater Gorge'])}`,
			hook: rollHook(),
			category: lair ? 'hazard' : 'hazard',
			tier: '',
		});
	}

	// --- Landmarks --------------------------------------------------------------------------------
	const landmarkSites = poissonDisk(rngStocking, {
		radius: separation * 1.3,
		bounds: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
		maxSamples: 260,
		accept: (p) => onLand(p) && farFromSettlements(p, separation * 0.8),
	});
	const landmarks = rngStocking.shuffle(landmarkSites).slice(0, Math.round(landmarkCount));
	for (const point of landmarks) {
		const kindName = rngStocking.pick([
			'Standing Stones',
			'Watchtower',
			'Shrine',
			'Waystone',
			'Old Bridge',
			'Hermit’s Hut',
			'Gallows Tree',
			'Barrow',
		]);
		pois.push({
			kind: 'landmark',
			point,
			name: `${kindName} of ${generateName(rngNames, 'region')}`,
			hook: rollHook(),
			category: 'landmark',
			tier: '',
		});
	}

	// --- Roads: MST over the settlements, plus a few loops -------------------------------------------
	const roadFeatures: MapFeature[] = [];
	const graphNodes: GeneratedGraph['nodes'] = [];
	const graphEdges: GeneratedGraph['edges'] = [];
	for (let i = 0; i < settlements.length; i += 1) {
		const s = settlements[i] as SeededPoi;
		graphNodes.push({
			id: `settlement-${i}`,
			position: normPoint(s.point.x, s.point.y),
			role: s.tier,
		});
	}

	if (wantRoads && settlements.length >= 2) {
		const points = settlements.map((s) => s.point);
		const triangulation = delaunay(points);
		const tree = minimumSpanningTree(points, triangulation.edges);
		const treeKeys = new Set(tree.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));

		// Loop reintroduction — the same trick as the dungeon generators. A pure tree of roads means one
		// bandit ambush cuts the region in half, which is dramatic exactly once.
		const extras: Array<[number, number]> = [];
		for (const [a, b] of triangulation.edges) {
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (treeKeys.has(key)) continue;
			if (rngRoads.chance(0.22)) extras.push([a, b]);
		}

		const drawRoute = (a: number, b: number, tier: 'road' | 'trail', index: number): void => {
			const from = points[a] as Point;
			const to = points[b] as Point;
			const steps = 7;
			const path: Point[] = [from];
			for (let i = 1; i < steps; i += 1) {
				const t = i / steps;
				const base: Point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
				const dx = to.x - from.x;
				const dy = to.y - from.y;
				const len = Math.max(1e-6, Math.hypot(dx, dy));
				const nx = -dy / len;
				const ny = dx / len;
				// Roads hug the dry, gentle ground: try a few lateral offsets and take the best one. This is
				// a cheap stand-in for a cost-field A*, and at this scale it reads the same.
				let best = base;
				let bestScore = Number.NEGATIVE_INFINITY;
				for (let k = -2; k <= 2; k += 1) {
					const sway = k * 0.035 + (rngRoads.next() - 0.5) * 0.02;
					const candidate: Point = {
						x: clamp01(base.x + nx * sway),
						y: clamp01(base.y + ny * sway),
					};
					const land = onLand(candidate) ? 1 : 0;
					const gentle = 1 - Math.abs(fieldAt(terrain.elevation, candidate) - waterLevel - 0.14);
					const score = land * 3 + gentle - Math.abs(sway) * 1.5;
					if (score > bestScore) {
						bestScore = score;
						best = candidate;
					}
				}
				path.push(best);
			}
			path.push(to);
			const smooth = chaikin(path, 1, false).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
			roadFeatures.push(
				feature(
					`${ctx.idPrefix}-${tier}-${index}`,
					'road',
					[from, ...smooth.slice(1, -1), to],
					tier === 'road' ? 'road:road' : 'road:trail',
					{ width: norm(tier === 'road' ? 0.005 : 0.003), role: tier },
				),
			);
			graphEdges.push({
				from: `settlement-${a}`,
				to: `settlement-${b}`,
				kind: 'corridor',
				...(tier === 'road' ? { chokepoint: true } : {}),
			});
		};

		let index = 0;
		for (const [a, b] of tree) {
			drawRoute(a, b, 'road', index);
			index += 1;
		}
		for (const [a, b] of extras) {
			drawRoute(a, b, 'trail', index);
			index += 1;
		}
	}

	// --- Emit ----------------------------------------------------------------------------------------
	const terrainFeatures: MapFeature[] = [];
	const waterFeatures: MapFeature[] = [];
	const orderedBiomes: Biome[] = ['plains', 'desert', 'forest', 'swamp', 'hills', 'mountains'];
	for (const b of orderedBiomes) {
		const rings = biomeRings(terrain, b);
		for (let i = 0; i < rings.length; i += 1) {
			const ring = rings[i] as Ring;
			if (ring.length < 3) continue;
			terrainFeatures.push(
				feature(
					`${ctx.idPrefix}-${b}-${i}`,
					'polygon',
					ring.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })),
					BIOME_STYLE[b],
					{ role: b, hole: ringArea(ring) < 0 },
				),
			);
		}
	}
	const waterRings = biomeRings(terrain, 'water');
	for (let i = 0; i < waterRings.length; i += 1) {
		const ring = waterRings[i] as Ring;
		if (ring.length < 3) continue;
		waterFeatures.push(
			feature(
				`${ctx.idPrefix}-water-${i}`,
				'water',
				ring.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })),
				'water:sea',
				{ role: 'water', hole: ringArea(ring) < 0 },
			),
		);
	}
	for (let i = 0; i < rivers.length; i += 1) {
		const river = rivers[i] as { path: Point[]; name: string };
		waterFeatures.push(
			feature(`${ctx.idPrefix}-river-${i}`, 'water', river.path, 'water:river', {
				width: norm(0.005),
				role: 'river',
				name: river.name,
			}),
		);
	}

	const labelFeatures: MapFeature[] = [
		feature(`${ctx.idPrefix}-label-region`, 'text', [{ x: 0.5, y: 0.06 }], 'label:region', {
			text: regionName,
			size: 2,
		}),
	];
	for (let i = 0; i < pois.length; i += 1) {
		const poi = pois[i] as SeededPoi;
		labelFeatures.push(
			feature(`${ctx.idPrefix}-label-${i}`, 'text', [poi.point], `label:${poi.kind}`, {
				text: poi.name,
				size: poi.kind === 'settlement' ? 1 : 0,
			}),
		);
	}
	for (let i = 0; i < rivers.length; i += 1) {
		const river = rivers[i] as { path: Point[]; name: string };
		const at = river.path[Math.floor(river.path.length / 2)] as Point;
		labelFeatures.push(
			feature(`${ctx.idPrefix}-label-river-${i}`, 'text', [at], 'label:water', {
				text: river.name,
				size: 0,
			}),
		);
	}

	const poiFeatures: MapFeature[] = pois.map((poi, i) =>
		feature(`${ctx.idPrefix}-poi-${i}`, 'marker', [poi.point], `poi:${poi.kind}`, {
			role: poi.kind,
			name: poi.name,
		}),
	);

	const generatedPois: GeneratedPoi[] = pois.map((poi, i) => ({
		id: `${ctx.idPrefix}-poi-${i}`,
		label: poi.name,
		category: poi.category,
		position: normPoint(poi.point.x, poi.point.y),
		notes: poi.hook,
	}));

	const notes: Array<{ key: string; title: string; body: string }> = pois.map((poi, i) => ({
		key: `poi-${i}`,
		title: poi.name,
		body: `${poi.tier ? `${poi.tier.charAt(0).toUpperCase()}${poi.tier.slice(1)}. ` : ''}${poi.hook}`,
	}));
	notes.unshift({
		key: 'region',
		title: regionName,
		body: `${regionName} — a ${regionType} region: ${settlements.length} settlements, ${
			rankedDangers.length
		} dangers, ${ruins.length} ruins${rivers.length > 0 ? `, and the ${(rivers[0] as { name: string }).name}` : ''}.`,
	});

	const layers: MapLayer[] = [
		buildLayer(ctx, 'terrain', 'Terrain', 'terrain', terrainFeatures, 0),
		buildLayer(ctx, 'water', 'Water', 'terrain', waterFeatures, 1),
		buildLayer(ctx, 'roads', 'Roads', 'roads', roadFeatures, 2),
		buildLayer(ctx, 'pois', 'Points of interest', 'poi', poiFeatures, 3),
		buildLayer(ctx, 'labels', 'Labels', 'poi', labelFeatures, 4),
	];

	const dungeonCount = pois.filter((p) => p.kind === 'dungeon').length;
	return {
		layers,
		pois: generatedPois,
		notes,
		graph: { nodes: graphNodes, edges: graphEdges },
		summary: `${regionName} · ${settlements.length} settlements · ${rankedDangers.length} dangers · ${
			ruins.length
		} ruins${dungeonCount > 0 ? ` (${dungeonCount} delvable)` : ''} · ${rivers.length} river${
			rivers.length === 1 ? '' : 's'
		}`,
	};
}

export const wildernessGenerator: GeneratorDefinition = {
	id: 'region.wilderness',
	group: 'region',
	scale: 'region',
	label: 'Wilderness region',
	description:
		'A regional map with noise-driven terrain, rivers and coast, then seeded settlements, ruins, lairs and landmarks — each named, each with a hook.',
	bestFor:
		'The barony the campaign happens in. Reach for this when you need somewhere to travel THROUGH, with content already keyed.',
	version: 1,
	params: [
		{
			kind: 'select',
			id: 'regionType',
			label: 'Region type',
			help: 'The shape of the land, which decides everything else.',
			options: [
				{
					value: 'coastal',
					label: 'Coastal',
					help: 'A shoreline, harbours, and the sea on one side.',
				},
				{ value: 'inland', label: 'Inland', help: 'Rolling country, rivers, and no sea at all.' },
				{
					value: 'mountainous',
					label: 'Mountainous',
					help: 'High, broken ground. Few roads, and they matter.',
				},
				{
					value: 'marsh',
					label: 'Marshland',
					help: 'Low, wet, and slow to cross. Everything hides here.',
				},
				{
					value: 'forest',
					label: 'Deep forest',
					help: 'Heavy woodland with clearings and long dark roads.',
				},
			],
			default: 'coastal',
		},
		{
			kind: 'int',
			id: 'settlements',
			label: 'Settlements',
			help: 'How settled the region is. The most habitable site becomes the region’s city.',
			min: 0,
			max: 16,
			step: 1,
			default: 6,
		},
		{
			kind: 'int',
			id: 'dangers',
			label: 'Dangers',
			help: 'Lairs and hazards, pushed away from the settlements — the further from people, the worse it gets.',
			min: 0,
			max: 24,
			step: 1,
			default: 6,
		},
		{
			kind: 'int',
			id: 'ruins',
			label: 'Ruins',
			help: 'Abandoned places in the wilds. Some of them have a way down.',
			min: 0,
			max: 16,
			step: 1,
			default: 4,
		},
		{
			kind: 'boolean',
			id: 'roads',
			label: 'Roads',
			help: 'Connect the settlements with roads and trails. Without them, everything is a wilderness crossing.',
			default: true,
		},
		{
			kind: 'number',
			id: 'roughness',
			label: 'Terrain roughness',
			help: 'Smooth downs at the low end; jagged, broken country at the high end.',
			advanced: true,
			group: 'Terrain',
			min: 0.2,
			max: 1,
			step: 0.05,
			default: 0.55,
		},
		{
			kind: 'number',
			id: 'waterLevel',
			label: 'Water level',
			help: 'How much of the region is under water. Raise it for archipelago, lower it for a dry interior.',
			advanced: true,
			group: 'Terrain',
			min: 0.05,
			max: 0.6,
			step: 0.01,
			default: 0.3,
		},
		{
			kind: 'number',
			id: 'separation',
			label: 'POI separation',
			help: 'Minimum distance between keyed locations. Wide separation gives a lonelier map.',
			advanced: true,
			group: 'Content',
			min: 0.03,
			max: 0.2,
			step: 0.005,
			default: 0.07,
		},
		{
			kind: 'int',
			id: 'landmarks',
			label: 'Landmarks',
			help: 'Standing stones, waystones, gallows trees — the things a road passes and a GM describes.',
			advanced: true,
			group: 'Content',
			min: 0,
			max: 14,
			step: 1,
			default: 5,
		},
		{
			kind: 'tags',
			id: 'hooks',
			label: 'Hook table',
			help: 'Which flavours of trouble the region draws its hooks from.',
			advanced: true,
			group: 'Content',
			options: [
				{ value: 'undead', label: 'Undead' },
				{ value: 'beasts', label: 'Beasts' },
				{ value: 'fey', label: 'Fey' },
				{ value: 'bandits', label: 'Bandits' },
				{ value: 'cult', label: 'Cults' },
				{ value: 'dragon', label: 'Dragons' },
				{ value: 'giants', label: 'Giants' },
				{ value: 'elemental', label: 'Elementals' },
			],
			default: ['bandits', 'beasts', 'cult', 'dragon', 'elemental', 'fey', 'giants', 'undead'],
		},
	],
	presets: [
		{
			id: 'coastal-barony',
			label: 'Coastal barony',
			description:
				'A settled shoreline with harbours, roads, and a handful of things in the hills.',
			values: { regionType: 'coastal', settlements: 7, dangers: 5, ruins: 4, roads: true },
		},
		{
			id: 'haunted-moor',
			label: 'Haunted moor',
			description: 'Empty, wet, and full of barrows. Two villages and a great deal of trouble.',
			values: {
				regionType: 'marsh',
				settlements: 2,
				dangers: 14,
				ruins: 8,
				roads: true,
				roughness: 0.3,
				waterLevel: 0.38,
				hooks: ['cult', 'fey', 'undead'],
			},
		},
		{
			id: 'frontier-march',
			label: 'Frontier march',
			description: 'Deep forest at the edge of the map. Few roads and a long way between them.',
			values: {
				regionType: 'forest',
				settlements: 4,
				dangers: 10,
				ruins: 6,
				roads: true,
				separation: 0.1,
				hooks: ['bandits', 'beasts', 'fey'],
			},
		},
		{
			id: 'high-passes',
			label: 'The high passes',
			description: 'Mountainous, sparse, and dangerous. The roads are the whole story.',
			values: {
				regionType: 'mountainous',
				settlements: 3,
				dangers: 9,
				ruins: 5,
				roads: true,
				roughness: 0.9,
				waterLevel: 0.2,
				hooks: ['dragon', 'giants'],
			},
		},
		{
			id: 'settled-heartland',
			label: 'Settled heartland',
			description: 'Prosperous, roaded, and quiet. The trouble is old and buried.',
			values: {
				regionType: 'inland',
				settlements: 11,
				dangers: 3,
				ruins: 3,
				roads: true,
				separation: 0.055,
			},
		},
	],
	run: runWilderness,
};

// ---------------------------------------------------------------------------------------------
// region.hexcrawl
//
// A hex overlay is not a map — it is an INDEX INTO one. Its whole job is to make "what is in hex D7?"
// a question with an answer, so the stocking table matters far more than the tessellation does.
// ---------------------------------------------------------------------------------------------

const HEX_TERRAIN_ENCOUNTERS: Readonly<Record<string, readonly string[]>> = {
	plains: [
		'a herd, and something following it',
		'a burnt-out waystation',
		'riders on the horizon, closing',
	],
	forest: [
		'a clearing that should not be here',
		'a charcoal-burner who will not look up',
		'wolves, and they are hunting',
	],
	hills: [
		'a shepherd missing half a flock',
		'an old watchtower, occupied',
		'a cairn, recently disturbed',
	],
	mountains: [
		'a pass that is snowed in a season early',
		'a mine-head with the winch still turning',
		'something circling, high up',
	],
	swamp: [
		'lights over the water that move away when followed',
		'a sunken causeway',
		'a body, and it is not old',
	],
	water: ['a wreck on the shoal', 'a ferryman who asks the wrong price', 'a sail with no colours'],
	desert: [
		'bones in a line, all facing the same way',
		'a dry well with a rope still in it',
		'a caravan, three days dead',
	],
};

const HEX_LANDMARKS: readonly string[] = [
	'Standing stones',
	'A ruined tower',
	'An abandoned shrine',
	'A wayside gallows',
	'A hermitage',
	'A collapsed barrow',
	'An old battlefield',
	'A stone bridge over nothing',
];

/** Column letter for a hex column index — A, B, … Z, AA. The classic hex-crawl reference. */
function columnLabel(index: number): string {
	let n = index;
	let out = '';
	do {
		out = String.fromCharCode(65 + (n % 26)) + out;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return out;
}

function runHexcrawl(ctx: GeneratorContext): GeneratorOutput {
	const hexSize = numberParam(ctx.params, 'hexSize');
	const orientation = stringParam(ctx.params, 'orientation');
	const stockingDensity = numberParam(ctx.params, 'stocking');
	const terrainMix = tagsParam(ctx.params, 'terrainMix');
	const coherence = numberParam(ctx.params, 'coherence');
	const wantEncounters = boolParam(ctx.params, 'encounters');

	const rngTerrain = ctx.rng.stream('terrain');
	const rngStocking = ctx.rng.stream('stocking');
	const rngNames = ctx.rng.stream('names');

	const pointy = orientation === 'pointy';
	const radius = clamp(hexSize, 0.02, 0.25) / 2;

	// Terrain coherence is just noise frequency: a low frequency gives one big forest, a high one gives a
	// checkerboard. Naming the knob "coherence" is the whole point of the param model.
	const frequency = 1.2 + (1 - coherence) * 9;
	const elevation = fbm(createValueNoise(rngTerrain.nextInt(1, 1_000_000_000)), {
		octaves: 3,
		frequency,
		persistence: 0.5,
	});
	const moisture = fbm(createValueNoise(rngTerrain.nextInt(1, 1_000_000_000)), {
		octaves: 3,
		frequency: frequency * 0.8,
		persistence: 0.5,
	});

	const mix = terrainMix.length > 0 ? [...terrainMix].sort() : ['plains'];
	const has = (t: string): boolean => mix.includes(t);

	const classify = (p: Point): string => {
		const e = clamp01((elevation.at(p.x, p.y) + 1) / 2);
		const m = clamp01((moisture.at(p.x, p.y) + 1) / 2);
		if (has('water') && e < 0.3) return 'water';
		if (has('mountains') && e > 0.76) return 'mountains';
		if (has('hills') && e > 0.62) return 'hills';
		if (has('swamp') && e < 0.42 && m > 0.55) return 'swamp';
		if (has('forest') && m > 0.56) return 'forest';
		if (has('desert') && m < 0.34) return 'desert';
		if (has('plains')) return 'plains';
		return mix[0] as string;
	};

	// Lay out the grid and CENTRE it, so the ragged edge is symmetric rather than all on one side.
	const width = pointy ? Math.sqrt(3) * radius : 2 * radius;
	const height = pointy ? 2 * radius : Math.sqrt(3) * radius;
	interface Hex {
		col: number;
		row: number;
		center: Point;
		ring: Ring;
		terrain: string;
	}

	const hexCenter = (col: number, row: number): Point => {
		if (pointy) {
			const x = width * (col + (row % 2 === 0 ? 0 : 0.5));
			const y = (3 / 4) * height * row;
			return { x, y };
		}
		const x = (3 / 4) * width * col;
		const y = height * (row + (col % 2 === 0 ? 0 : 0.5));
		return { x, y };
	};

	const hexRing = (center: Point): Ring => {
		const ring: Point[] = [];
		for (let i = 0; i < 6; i += 1) {
			const angle = pointy ? (Math.PI / 180) * (60 * i - 30) : (Math.PI / 180) * 60 * i;
			ring.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
		}
		return ring;
	};

	// Two passes: measure the raw lattice's extent, then offset it so the whole thing is centred in the
	// unit square and every emitted vertex is inside [0,1].
	const cols = Math.ceil(1 / Math.max(1e-6, pointy ? width : (3 / 4) * width)) + 2;
	const rows = Math.ceil(1 / Math.max(1e-6, pointy ? (3 / 4) * height : height)) + 2;
	const raw: Array<{ col: number; row: number; center: Point }> = [];
	for (let row = 0; row < rows; row += 1) {
		for (let col = 0; col < cols; col += 1) {
			raw.push({ col, row, center: hexCenter(col, row) });
		}
	}
	const halfW = pointy ? width / 2 : radius;
	const halfH = pointy ? radius : height / 2;
	const kept = raw.filter(
		(h) =>
			h.center.x - halfW >= -1e-9 &&
			h.center.x + halfW <= 1 + 1e-9 &&
			h.center.y - halfH >= -1e-9 &&
			h.center.y + halfH <= 1 + 1e-9,
	);
	// Recentre what fits, so the margin is split evenly.
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const h of kept) {
		minX = Math.min(minX, h.center.x - halfW);
		maxX = Math.max(maxX, h.center.x + halfW);
		minY = Math.min(minY, h.center.y - halfH);
		maxY = Math.max(maxY, h.center.y + halfH);
	}
	const shiftX = kept.length > 0 ? (1 - (maxX - minX)) / 2 - minX : 0;
	const shiftY = kept.length > 0 ? (1 - (maxY - minY)) / 2 - minY : 0;

	const hexes: Hex[] = [];
	for (const h of kept) {
		const center: Point = { x: h.center.x + shiftX, y: h.center.y + shiftY };
		const ring = hexRing(center).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
		hexes.push({ col: h.col, row: h.row, center, ring, terrain: classify(center) });
	}
	// A stable, explicit order — never draw randomness against an unspecified iteration order.
	hexes.sort((a, b) => a.row - b.row || a.col - b.col);

	// --- Stocking ------------------------------------------------------------------------------------
	const pois: GeneratedPoi[] = [];
	const notes: Array<{ key: string; title: string; body: string }> = [];
	const stockedFeatures: MapFeature[] = [];
	let stocked = 0;

	for (const hex of hexes) {
		const ref = `${columnLabel(hex.col)}${hex.row + 1}`;
		if (hex.terrain === 'water') continue;
		if (!rngStocking.chance(stockingDensity)) continue;
		stocked += 1;
		const isLandmark = rngStocking.chance(0.45);
		const encounters = HEX_TERRAIN_ENCOUNTERS[hex.terrain] ?? HEX_TERRAIN_ENCOUNTERS.plains;
		const label = isLandmark
			? `${rngStocking.pick(HEX_LANDMARKS)} — ${generateName(rngNames, 'region')}`
			: `${ref}: ${generateName(rngNames, 'dungeon')}`;
		const body = isLandmark
			? `A landmark, visible from the surrounding hexes. ${
					wantEncounters ? `Encounter: ${rngStocking.pick(encounters as readonly string[])}.` : ''
				}`.trim()
			: `${wantEncounters ? `Encounter: ${rngStocking.pick(encounters as readonly string[])}.` : 'Keyed location.'}`;

		pois.push({
			id: `${ctx.idPrefix}-poi-${ref}`,
			label,
			category: isLandmark ? 'landmark' : 'quest',
			position: normPoint(hex.center.x, hex.center.y),
			notes: `Hex ${ref} (${BIOME_LABEL[hex.terrain as Biome] ?? hex.terrain}). ${body}`,
		});
		notes.push({
			key: `hex-${ref}`,
			title: `${ref} — ${BIOME_LABEL[hex.terrain as Biome] ?? hex.terrain}`,
			body: `${label}. ${body}`,
		});
		stockedFeatures.push(
			feature(
				`${ctx.idPrefix}-stocked-${ref}`,
				'marker',
				[hex.center],
				`poi:${isLandmark ? 'landmark' : 'quest'}`,
				{
					role: isLandmark ? 'landmark' : 'keyed',
					hex: ref,
				},
			),
		);
	}

	const hexFeatures: MapFeature[] = hexes.map((hex) =>
		feature(
			`${ctx.idPrefix}-hex-${columnLabel(hex.col)}${hex.row + 1}`,
			'polygon',
			hex.ring,
			`hex:${hex.terrain}`,
			{ role: hex.terrain, hex: `${columnLabel(hex.col)}${hex.row + 1}` },
		),
	);

	const labelFeatures: MapFeature[] = hexes.map((hex) =>
		feature(
			`${ctx.idPrefix}-hexlabel-${columnLabel(hex.col)}${hex.row + 1}`,
			'text',
			[{ x: hex.center.x, y: clamp01(hex.center.y - radius * 0.55) }],
			'label:hex',
			{ text: `${columnLabel(hex.col)}${hex.row + 1}`, size: 0 },
		),
	);

	const layers: MapLayer[] = [
		buildLayer(ctx, 'hexes', 'Hexes', 'terrain', hexFeatures, 0),
		buildLayer(ctx, 'stocked', 'Keyed hexes', 'poi', stockedFeatures, 1),
		buildLayer(ctx, 'hex-labels', 'Hex references', 'poi', labelFeatures, 2),
	];

	return {
		layers,
		pois,
		notes,
		summary: `${hexes.length} hexes · ${stocked} stocked · ${pointy ? 'pointy' : 'flat'}-top`,
	};
}

export const hexcrawlGenerator: GeneratorDefinition = {
	id: 'region.hexcrawl',
	group: 'region',
	scale: 'region',
	label: 'Hex crawl',
	description:
		'A hex grid over the region, each hex given a terrain and — where stocked — a keyed landmark or encounter.',
	bestFor:
		'Running overland travel by the hex. Lay this over a region map, or use it alone as an old-school wilderness key.',
	version: 1,
	params: [
		{
			kind: 'number',
			id: 'hexSize',
			label: 'Hex size',
			help: 'Width of one hex as a fraction of the map. Smaller hexes mean a finer-grained crawl.',
			min: 0.03,
			max: 0.2,
			step: 0.005,
			default: 0.08,
		},
		{
			kind: 'select',
			id: 'orientation',
			label: 'Orientation',
			help: 'Which way the hexes point. Pointy-top is the traditional wilderness grid.',
			options: [
				{ value: 'pointy', label: 'Pointy-top' },
				{ value: 'flat', label: 'Flat-top' },
			],
			default: 'pointy',
		},
		{
			kind: 'number',
			id: 'stocking',
			label: 'Stocking density',
			help: 'What fraction of hexes have something in them. A third is the classic rate.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.35,
		},
		{
			kind: 'tags',
			id: 'terrainMix',
			label: 'Terrain mix',
			help: 'Which terrains may appear. Drop water for a landlocked crawl.',
			options: [
				{ value: 'plains', label: 'Plains' },
				{ value: 'forest', label: 'Forest' },
				{ value: 'hills', label: 'Hills' },
				{ value: 'mountains', label: 'Mountains' },
				{ value: 'swamp', label: 'Marsh' },
				{ value: 'water', label: 'Water' },
				{ value: 'desert', label: 'Barrens' },
			],
			default: ['forest', 'hills', 'mountains', 'plains', 'water'],
		},
		{
			kind: 'number',
			id: 'coherence',
			label: 'Terrain coherence',
			help: 'High gives big contiguous biomes; low gives a patchwork you can cross in a day.',
			advanced: true,
			group: 'Terrain',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.7,
		},
		{
			kind: 'boolean',
			id: 'encounters',
			label: 'Encounters',
			help: 'Roll a terrain-appropriate encounter into every stocked hex.',
			advanced: true,
			group: 'Stocking',
			default: true,
		},
	],
	presets: [
		{
			id: 'classic-hexcrawl',
			label: 'Classic hex crawl',
			description: 'Pointy-top, mixed terrain, a third of the hexes keyed.',
			values: { hexSize: 0.08, orientation: 'pointy', stocking: 0.35, coherence: 0.7 },
		},
		{
			id: 'dense-wilderness',
			label: 'Dense wilderness',
			description: 'Small hexes, heavily stocked. Nothing is safe and nothing is empty.',
			values: { hexSize: 0.05, orientation: 'pointy', stocking: 0.6, coherence: 0.75 },
		},
		{
			id: 'sparse-frontier',
			label: 'Sparse frontier',
			description: 'Big hexes, little in them. Days of nothing, then something.',
			values: { hexSize: 0.14, orientation: 'flat', stocking: 0.2, coherence: 0.85 },
		},
		{
			id: 'landlocked-crawl',
			label: 'Landlocked crawl',
			description: 'No water at all — mountains, forest and barrens.',
			values: {
				hexSize: 0.09,
				orientation: 'pointy',
				stocking: 0.4,
				terrainMix: ['desert', 'forest', 'hills', 'mountains', 'plains'],
			},
		},
	],
	run: runHexcrawl,
};
