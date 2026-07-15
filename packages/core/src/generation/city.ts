import type { MapFeature, MapLayer } from '../state/map-state';
import type { MapPoiCategory } from '../state/map-annotations';
import type { SeededRng } from '../state/prng';
import type { Point, Ring } from '../geometry';
import {
	boundsOf,
	centroid,
	chaikin,
	clamp,
	clamp01,
	dist,
	dist2,
	isClockwise,
	lerpPoint,
	offsetPolyline,
	pointInRing,
	pointToSegmentDistance,
	poissonDisk,
	raySegmentHit,
	resample,
	ringArea,
	segmentIntersection,
	simplify,
	unionBoundary,
	voronoiCells,
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
 * MAP-021 — the settlement generators: `settlement.city` (MFCG-style medieval city) and
 * `settlement.village` (a small road-side settlement).
 *
 * The city follows Watabou's Medieval Fantasy City Generator pipeline, which is the one published
 * approach that produces a plan a GM can actually *read*: scatter sites, Voronoi them into WARDS, and
 * take the ward boundaries AS the street network. That last step is the whole trick — streets are not
 * generated, they are the dual of the districts, so every street necessarily leads somewhere and every
 * block is necessarily enclosed. A road-first generator has to work very hard to get that for free.
 *
 * The wall circuit is derived, not drawn: it is the union boundary of the wards that fall inside the
 * wall radius (see {@link unionBoundary}), so a wall can never cut a ward in half and gates always land
 * on a real boundary. Gates are ray/wall intersections, which is what lets the road network terminate
 * exactly ON the circuit rather than near it.
 *
 * A village is deliberately NOT "a city with three wards". A city fills a boundary; a village FOLLOWS A
 * ROAD. The two have different topology, so they get different code.
 */

// ---------------------------------------------------------------------------------------------
// Local polygon helpers. These COMPOSE the geometry package's primitives (they are not a second
// implementation of it): every one of them reduces to half-plane clipping, which the geometry API
// does not expose but which convex Voronoi cells make trivially correct.
// ---------------------------------------------------------------------------------------------

/**
 * Sutherland–Hodgman clip: keep the part of `ring` to the LEFT of the directed line a→b. Convexity of
 * the clip region (a single half-plane) is what makes this exact for any subject polygon.
 */
function clipToHalfPlane(ring: readonly Point[], a: Point, b: Point): Ring {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const side = (p: Point): number => dx * (p.y - a.y) - dy * (p.x - a.x);
	const out: Point[] = [];
	for (let i = 0; i < ring.length; i += 1) {
		const current = ring[i] as Point;
		const next = ring[(i + 1) % ring.length] as Point;
		const sc = side(current);
		const sn = side(next);
		if (sc >= 0) out.push(current);
		if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
			const t = sc / (sc - sn);
			out.push({
				x: current.x + (next.x - current.x) * t,
				y: current.y + (next.y - current.y) * t,
			});
		}
	}
	return out;
}

/** Normalize winding to CCW so "inward" is unambiguously "left of each edge". */
function toCcw(ring: readonly Point[]): Ring {
	return isClockwise(ring) ? [...ring].reverse() : [...ring];
}

/**
 * Exact convex inset: clip the ring by every edge's line pushed inward by `d`. This is the setback that
 * makes buildings FRONT the street instead of sitting on it — without it, footprints touch the ward
 * boundary and the street network disappears under them.
 */
function insetConvex(ring: readonly Point[], d: number): Ring {
	if (ring.length < 3 || d <= 0) return [...ring];
	let poly: Ring = toCcw(ring);
	const edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length] as Point] as const);
	for (const [a, b] of edges) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < 1e-9) continue;
		// Interior of a CCW ring lies to the left of a→b; the left-hand normal is (-dy, dx).
		const nx = (-dy / len) * d;
		const ny = (dx / len) * d;
		poly = clipToHalfPlane(poly, { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny });
		if (poly.length < 3) return [];
	}
	return poly;
}

/** Split a convex ring by the line through `p1`→`p2`. Returns the two halves (either may be empty). */
function splitByLine(ring: readonly Point[], p1: Point, p2: Point): [Ring, Ring] {
	return [clipToHalfPlane(ring, p1, p2), clipToHalfPlane(ring, p2, p1)];
}

/** Clip a ring to the unit square so no emitted coordinate can ever escape [0,1]. */
function clipToUnitSquare(ring: readonly Point[]): Ring {
	let poly = toCcw(ring);
	const corners: Array<[Point, Point]> = [
		[
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		],
		[
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
		],
		[
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
		],
		[
			{ x: 0, y: 1 },
			{ x: 0, y: 0 },
		],
	];
	for (const [a, b] of corners) {
		poly = clipToHalfPlane(poly, a, b);
		if (poly.length < 3) return [];
	}
	return poly;
}

/** Scale a ring about its own centroid — the cheap inset used where an exact one is not needed. */
function scaleRing(ring: readonly Point[], factor: number): Ring {
	const c = centroid(ring);
	return ring.map((p) => lerpPoint(c, p, factor));
}

/** Longest chord of a ring — a good enough stand-in for the OBB long axis on a convex cell. */
function longestAxis(ring: readonly Point[]): [Point, Point] {
	let best: [Point, Point] = [ring[0] as Point, ring[1] as Point];
	let bestD = -1;
	for (let i = 0; i < ring.length; i += 1) {
		for (let j = i + 1; j < ring.length; j += 1) {
			const d = dist2(ring[i] as Point, ring[j] as Point);
			if (d > bestD) {
				bestD = d;
				best = [ring[i] as Point, ring[j] as Point];
			}
		}
	}
	return best;
}

function aspectRatio(ring: readonly Point[]): number {
	const b = boundsOf(ring);
	const lo = Math.max(1e-9, Math.min(b.w, b.h));
	const hi = Math.max(b.w, b.h);
	return hi / lo;
}

/** Shortest distance from a point to a polyline. Used to keep buildings off the river. */
function distanceToPolyline(p: Point, line: readonly Point[]): number {
	if (line.length === 0) return Number.POSITIVE_INFINITY;
	if (line.length === 1) return dist(p, line[0] as Point);
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i + 1 < line.length; i += 1) {
		const d = pointToSegmentDistance(p, line[i] as Point, line[i + 1] as Point);
		if (d < best) best = d;
	}
	return best;
}

/** Farthest-point thinning: drop the tightest-packed sample until exactly `target` remain. */
function thinTo(points: readonly Point[], target: number): Point[] {
	const kept = [...points];
	while (kept.length > target) {
		let worst = 0;
		let worstD = Number.POSITIVE_INFINITY;
		for (let i = 0; i < kept.length; i += 1) {
			let nearest = Number.POSITIVE_INFINITY;
			for (let j = 0; j < kept.length; j += 1) {
				if (i === j) continue;
				const d = dist2(kept[i] as Point, kept[j] as Point);
				if (d < nearest) nearest = d;
			}
			if (nearest < worstD) {
				worstD = nearest;
				worst = i;
			}
		}
		kept.splice(worst, 1);
	}
	return kept;
}

/** Furthest `t` along a ray from `origin` that stays inside [lo, hi]² — keeps highways in bounds. */
function rayExitT(origin: Point, dir: Point, lo: number, hi: number): number {
	let t = Number.POSITIVE_INFINITY;
	const axes: Array<[number, number]> = [
		[origin.x, dir.x],
		[origin.y, dir.y],
	];
	for (const [o, d] of axes) {
		if (Math.abs(d) < 1e-9) continue;
		const tHi = (hi - o) / d;
		const tLo = (lo - o) / d;
		const tAxis = Math.max(tHi, tLo);
		if (tAxis > 0 && tAxis < t) t = tAxis;
	}
	return Number.isFinite(t) ? t : 0;
}

// ---------------------------------------------------------------------------------------------
// Street graph. Voronoi edges ARE the streets, so the graph is built from ward-ring segments with the
// vertices quantized — neighbouring cells' shared vertices agree to machine precision, but quantizing
// makes the merge robust against a clipped boundary vertex that does not.
// ---------------------------------------------------------------------------------------------

interface StreetGraph {
	nodes: Point[];
	adjacency: Array<Array<{ to: number; weight: number }>>;
	/** Undirected segments, deduped — these are drawn as the alley network. */
	segments: Array<[number, number]>;
}

function quantKey(p: Point): string {
	return `${Math.round(p.x * 10000)}|${Math.round(p.y * 10000)}`;
}

function buildStreetGraph(rings: readonly Ring[]): StreetGraph {
	const index = new Map<string, number>();
	const nodes: Point[] = [];
	const adjacency: Array<Array<{ to: number; weight: number }>> = [];
	const seen = new Set<string>();
	const segments: Array<[number, number]> = [];
	const nodeOf = (p: Point): number => {
		const key = quantKey(p);
		const existing = index.get(key);
		if (existing !== undefined) return existing;
		const id = nodes.length;
		index.set(key, id);
		nodes.push(p);
		adjacency.push([]);
		return id;
	};
	for (const ring of rings) {
		for (let i = 0; i < ring.length; i += 1) {
			const a = nodeOf(ring[i] as Point);
			const b = nodeOf(ring[(i + 1) % ring.length] as Point);
			if (a === b) continue;
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const weight = dist(nodes[a] as Point, nodes[b] as Point);
			(adjacency[a] as Array<{ to: number; weight: number }>).push({ to: b, weight });
			(adjacency[b] as Array<{ to: number; weight: number }>).push({ to: a, weight });
			segments.push([a, b]);
		}
	}
	return { nodes, adjacency, segments };
}

function nearestNode(graph: StreetGraph, p: Point): number {
	let best = -1;
	let bestD = Number.POSITIVE_INFINITY;
	for (let i = 0; i < graph.nodes.length; i += 1) {
		const d = dist2(graph.nodes[i] as Point, p);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

/** Dijkstra over the street graph. Returns the node path, or null when unreachable. */
function shortestPath(graph: StreetGraph, from: number, to: number): number[] | null {
	if (from < 0 || to < 0) return null;
	const n = graph.nodes.length;
	const distances = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
	const previous = new Int32Array(n).fill(-1);
	const visited = new Uint8Array(n);
	distances[from] = 0;
	for (;;) {
		let current = -1;
		let currentD = Number.POSITIVE_INFINITY;
		for (let i = 0; i < n; i += 1) {
			if (visited[i]) continue;
			const d = distances[i] as number;
			if (d < currentD) {
				currentD = d;
				current = i;
			}
		}
		if (current < 0) break;
		if (current === to) break;
		visited[current] = 1;
		for (const edge of graph.adjacency[current] as Array<{ to: number; weight: number }>) {
			const candidate = currentD + edge.weight;
			if (candidate < (distances[edge.to] as number)) {
				distances[edge.to] = candidate;
				previous[edge.to] = current;
			}
		}
	}
	if (!Number.isFinite(distances[to] as number)) return null;
	const path: number[] = [];
	for (let at = to; at >= 0; at = previous[at] as number) {
		path.push(at);
		if (at === from) break;
	}
	path.reverse();
	return path[0] === from ? path : null;
}

// ---------------------------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------------------------

type WardType =
	| 'market'
	| 'citadel'
	| 'temple'
	| 'noble'
	| 'merchant'
	| 'craftsmen'
	| 'slum'
	| 'docks'
	| 'barracks'
	| 'graveyard'
	| 'park'
	| 'administration';

const ZONED_WARD_TYPES: readonly WardType[] = [
	'temple',
	'noble',
	'merchant',
	'craftsmen',
	'slum',
	'docks',
	'barracks',
	'graveyard',
	'park',
	'administration',
];

/** Types a city may have at most one of. Two cathedrals is a city with a story; two of everything is noise. */
const UNIQUE_WARD_TYPES: ReadonlySet<WardType> = new Set<WardType>([
	'market',
	'citadel',
	'temple',
	'administration',
]);

interface WardShape {
	/** Building footprint area target, before the Density knob scales it. */
	lot: number;
	/** Fraction of subdivided lots that actually get a building — the rest are yards, alleys, middens. */
	keep: number;
	/** How far a footprint sits back inside its lot (fraction of the lot's own inset budget). */
	coverage: number;
	/** Split-position jitter: a slum's lots are ragged, a planned quarter's are not. */
	jitter: number;
}

const WARD_SHAPES: Readonly<Record<WardType, WardShape>> = {
	market: { lot: 0.00022, keep: 0.3, coverage: 0.72, jitter: 0.3 },
	citadel: { lot: 0.0016, keep: 0.55, coverage: 0.86, jitter: 0.12 },
	temple: { lot: 0.0012, keep: 0.5, coverage: 0.84, jitter: 0.16 },
	noble: { lot: 0.0011, keep: 0.6, coverage: 0.7, jitter: 0.2 },
	merchant: { lot: 0.00028, keep: 0.88, coverage: 0.86, jitter: 0.3 },
	craftsmen: { lot: 0.00034, keep: 0.84, coverage: 0.84, jitter: 0.36 },
	slum: { lot: 0.00016, keep: 0.92, coverage: 0.9, jitter: 0.5 },
	docks: { lot: 0.0006, keep: 0.72, coverage: 0.88, jitter: 0.28 },
	barracks: { lot: 0.0013, keep: 0.5, coverage: 0.82, jitter: 0.12 },
	graveyard: { lot: 0.0009, keep: 0.14, coverage: 0.4, jitter: 0.44 },
	park: { lot: 0.0016, keep: 0.06, coverage: 0.5, jitter: 0.4 },
	administration: { lot: 0.0011, keep: 0.62, coverage: 0.82, jitter: 0.14 },
};

const WARD_POI_CATEGORY: Readonly<Record<WardType, MapPoiCategory>> = {
	market: 'shop',
	citadel: 'landmark',
	temple: 'landmark',
	noble: 'landmark',
	merchant: 'shop',
	craftsmen: 'shop',
	slum: 'hazard',
	docks: 'landmark',
	barracks: 'landmark',
	graveyard: 'hazard',
	park: 'landmark',
	administration: 'landmark',
};

const WARD_LABEL: Readonly<Record<WardType, string>> = {
	market: 'Market',
	citadel: 'Citadel',
	temple: 'Temple',
	noble: 'Noble quarter',
	merchant: 'Merchant quarter',
	craftsmen: 'Craftsmen',
	slum: 'Slum',
	docks: 'Docks',
	barracks: 'Barracks',
	graveyard: 'Graveyard',
	park: 'Gardens',
	administration: 'Administration',
};

const WARD_BLURB: Readonly<Record<WardType, string>> = {
	market:
		'Stalls crowd a cobbled plaza; the criers start before dawn and the pickpockets before them.',
	citadel: 'The seat of whoever currently holds the city. Its garrison answers to no ward council.',
	temple: 'Bells, incense, and a standing feud between two rival orders over the same altar.',
	noble:
		'Walled manors and long gardens. Servants use the back lanes; strangers are noticed at once.',
	merchant: 'Counting-houses and warehouses. Every door has a lock and every lock has a rival key.',
	craftsmen:
		'Forge-smoke and hammering from before first light. The guilds settle disputes themselves.',
	slum: 'Leaning tenements over an open drain. The watch enters in fours or not at all.',
	docks: 'Tar, salt and shouting. Cargo goes missing here in quantities nobody writes down.',
	graveyard:
		'Crowded ground and older ground beneath it. The gravediggers charge extra after dark.',
	barracks:
		'Drill yards and a stockade. The soldiers are underpaid and know exactly who owes them.',
	park: 'Green ground kept for the city, or kept from it, depending on who you ask.',
	administration: 'Ledgers, seals and queues. Anything can be arranged here for the correct fee.',
};

/** Ward names — evocative, per type, drawn without replacement so a city never has two Shambles. */
const WARD_NAME_POOL: Readonly<Record<WardType, readonly string[]>> = {
	market: ['The Great Market', 'Cheapside', 'The Weighing Yard', 'Scalesquare'],
	citadel: ['The Citadel', 'High Keep', 'The Stronghold', 'Wardenhold'],
	temple: ['Temple Hill', 'The Sanctum', 'Bellrow', 'Cloister End'],
	noble: ['The Heights', 'Silvergate', 'Highmantle', 'The Crescent', 'Old Coronet'],
	merchant: ['Coinrow', 'The Counting Quarter', 'Ledger Street', 'The Exchange', 'Guildmarch'],
	craftsmen: ['The Forgeworks', 'Hammerfall', 'Tanner’s Reach', 'Loomgate', 'Smokerow'],
	slum: ['The Shambles', 'Ratwarren', 'The Middens', 'Gallowsfoot', 'The Drownings'],
	docks: ['The Wharves', 'Saltgate', 'Tarhouse', 'The Quays', 'Netmenders’ Row'],
	barracks: ['The Muster', 'Shieldyard', 'The Stockade', 'Watchmarch'],
	graveyard: ['The Boneyard', 'Quietfield', 'The Long Rest', 'Ashen Ground'],
	park: ['The Green', 'Kingsgarden', 'The Orchards', 'Willowmead'],
	administration: ['The Chancery', 'Sealgate', 'The Rolls', 'Magistrate’s Row'],
};

interface Ward {
	index: number;
	site: Point;
	ring: Ring;
	center: Point;
	/** Distance from the city centre, normalized by the city radius. */
	radial: number;
	walled: boolean;
	waterfront: boolean;
	type: WardType;
	name: string;
}

// ---------------------------------------------------------------------------------------------
// settlement.city
// ---------------------------------------------------------------------------------------------

const CITY_CENTER: Point = { x: 0.5, y: 0.5 };
const CITY_RADIUS = 0.3;
const FARM_OUTER = 0.45;
const ALLEY_WIDTH = 0.0022;
const STREET_WIDTH = 0.006;
const RIVER_WIDTH = 0.024;

function runCity(ctx: GeneratorContext): GeneratorOutput {
	const size = numberParam(ctx.params, 'size');
	const wallStyle = stringParam(ctx.params, 'walls');
	const water = stringParam(ctx.params, 'water');
	const density = numberParam(ctx.params, 'density');
	const age = stringParam(ctx.params, 'age');
	const wantCitadel = boolParam(ctx.params, 'citadel');
	const plazaSize = numberParam(ctx.params, 'plazaSize');
	const gateCount = numberParam(ctx.params, 'gateCount');
	const towerSpacing = numberParam(ctx.params, 'towerSpacing');
	const buildingSetback = numberParam(ctx.params, 'buildingSetback');
	const wantFarmland = boolParam(ctx.params, 'farmland');
	const allowedTypes = tagsParam(ctx.params, 'wardTypes');

	const rngWards = ctx.rng.stream('wards');
	const rngWater = ctx.rng.stream('water');
	const rngWalls = ctx.rng.stream('walls');
	const rngRoads = ctx.rng.stream('roads');
	const rngBuildings = ctx.rng.stream('buildings');
	const rngTerrain = ctx.rng.stream('terrain');
	const rngNames = ctx.rng.stream('names');
	const rngStocking = ctx.rng.stream('stocking');

	const walled = wallStyle !== 'none';
	const planned = age === 'planned';

	// --- 1. Ward sites -------------------------------------------------------------------------
	// Deliberately oversample and thin: Poisson-disk gives no exact count, and a GM who asked for
	// twelve wards should get twelve.
	const cityArea = Math.PI * CITY_RADIUS * CITY_RADIUS;
	const seedRadius = Math.sqrt(cityArea / size) * 0.78;
	const raw = poissonDisk(rngWards, {
		radius: seedRadius,
		bounds: {
			x: CITY_CENTER.x - CITY_RADIUS,
			y: CITY_CENTER.y - CITY_RADIUS,
			w: CITY_RADIUS * 2,
			h: CITY_RADIUS * 2,
		},
		maxSamples: size * 6,
		accept: (p) => dist(p, CITY_CENTER) <= CITY_RADIUS,
	});
	let sites = thinTo(raw, size);
	if (sites.length === 0) sites = [CITY_CENTER];

	// Ghost sites on an outer circle bound the real cells into a city-shaped blob. Without them the
	// peripheral Voronoi cells would run out to the corners of the clip rect.
	const ghostCount = Math.max(20, size * 2);
	const ghosts: Point[] = [];
	for (let i = 0; i < ghostCount; i += 1) {
		const angle = (i / ghostCount) * Math.PI * 2;
		const r = CITY_RADIUS * 1.5;
		ghosts.push({ x: CITY_CENTER.x + Math.cos(angle) * r, y: CITY_CENTER.y + Math.sin(angle) * r });
	}
	const bounds = { x: 0, y: 0, w: 1, h: 1 };

	// Lloyd relaxation with the ghosts held FIXED — relaxing them too would collapse the blob inward.
	// A planned city gets a second pass: more relaxation means more regular cells, which is exactly the
	// difference between a Roman grid and a town that grew around its cowpaths.
	const relaxIterations = planned ? 3 : 1;
	for (let iter = 0; iter < relaxIterations; iter += 1) {
		const cells = voronoiCells([...sites, ...ghosts], bounds);
		sites = sites.map((site, i) => {
			const cell = cells[i];
			if (!cell || cell.length < 3) return site;
			return centroid(cell);
		});
	}

	const cells = voronoiCells([...sites, ...ghosts], bounds);

	// --- 2. Water ------------------------------------------------------------------------------
	let seaRing: Ring = [];
	/** The shoreline, oriented so the LAND lies to the left of each segment — see `clipToHalfPlane`. */
	let shoreLine: Point[] = [];
	let river: Point[] = [];
	let riverName = '';
	if (water === 'coastal') {
		const angle = rngWater.next() * Math.PI * 2;
		const seaDir: Point = { x: Math.cos(angle), y: Math.sin(angle) };
		const perp: Point = { x: -seaDir.y, y: seaDir.x };
		const coastDistance = CITY_RADIUS * 0.9;
		const shore: Point[] = [];
		const steps = 18;
		for (let i = 0; i <= steps; i += 1) {
			const t = -0.85 + (1.7 * i) / steps;
			const wobble = (rngWater.next() - 0.5) * CITY_RADIUS * 0.22;
			const d = coastDistance + wobble;
			shore.push({
				x: CITY_CENTER.x + seaDir.x * d + perp.x * t,
				y: CITY_CENTER.y + seaDir.y * d + perp.y * t,
			});
		}
		// Walking the shore in +perp order puts the land (−seaDir) on the LEFT of every segment, which is
		// the half-plane `clipToHalfPlane` keeps. That invariant is what lets a ward be trimmed to the
		// water's edge below with no polygon-boolean library.
		shoreLine = chaikin(shore, 2, false);
		const far = 1.6;
		const seaPolygon = [
			...shoreLine,
			{
				x: CITY_CENTER.x + seaDir.x * far + perp.x * 0.85,
				y: CITY_CENTER.y + seaDir.y * far + perp.y * 0.85,
			},
			{
				x: CITY_CENTER.x + seaDir.x * far - perp.x * 0.85,
				y: CITY_CENTER.y + seaDir.y * far - perp.y * 0.85,
			},
		];
		seaRing = clipToUnitSquare(seaPolygon);
	} else if (water === 'river') {
		const angle = rngWater.next() * Math.PI * 2;
		const entry: Point = {
			x: CITY_CENTER.x + Math.cos(angle) * 0.47,
			y: CITY_CENTER.y + Math.sin(angle) * 0.47,
		};
		const exitAngle = angle + Math.PI + (rngWater.next() - 0.5) * 0.9;
		const exit: Point = {
			x: CITY_CENTER.x + Math.cos(exitAngle) * 0.47,
			y: CITY_CENTER.y + Math.sin(exitAngle) * 0.47,
		};
		const control: Point[] = [entry];
		const steps = 6;
		for (let i = 1; i < steps; i += 1) {
			const base = lerpPoint(entry, exit, i / steps);
			const dx = exit.x - entry.x;
			const dy = exit.y - entry.y;
			const len = Math.max(1e-6, Math.hypot(dx, dy));
			const nx = -dy / len;
			const ny = dx / len;
			const sway = (rngWater.next() - 0.5) * 0.16;
			control.push({ x: clamp01(base.x + nx * sway), y: clamp01(base.y + ny * sway) });
		}
		control.push(exit);
		river = chaikin(control, 2, false).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
		riverName = generateName(rngNames, 'river');
	}

	const inSea = (p: Point): boolean => seaRing.length >= 3 && pointInRing(seaRing, p);

	// --- 3. Wards ------------------------------------------------------------------------------
	const wards: Ward[] = [];
	for (let i = 0; i < sites.length; i += 1) {
		const cell = cells[i];
		if (!cell || cell.length < 3) continue;
		const site = sites[i] as Point;
		if (inSea(site)) continue; // an offshore ward is not a ward, it is a shipwreck.
		let ring = toCcw(cell);
		// Trim the shoreline wards back to the water's edge rather than letting them float on it. Clipping
		// by every shore segment's land-side half-plane is exact for a straight coast and a slight
		// over-trim on a convex headland — which is a far better failure than a ward in the sea.
		for (let s = 0; s + 1 < shoreLine.length && ring.length >= 3; s += 1) {
			ring = clipToHalfPlane(ring, shoreLine[s] as Point, shoreLine[s + 1] as Point);
		}
		if (ring.length < 3) continue;
		const center = centroid(ring);
		const radial = dist(center, CITY_CENTER) / CITY_RADIUS;
		wards.push({
			index: wards.length,
			site,
			ring,
			center,
			radial,
			walled: false,
			waterfront: false,
			type: 'craftsmen',
			name: '',
		});
	}

	// Shoreline / riverside adjacency drives the docks zoning rule (and nothing else may claim docks).
	for (const ward of wards) {
		if (seaRing.length >= 3) {
			const touching = ward.ring.some((p) => pointInRing(seaRing, p));
			if (touching) ward.waterfront = true;
		}
		if (river.length >= 2) {
			const near = ward.ring.some((p) => distanceToPolyline(p, river) < RIVER_WIDTH * 1.5);
			if (near || distanceToPolyline(ward.center, river) < RIVER_WIDTH * 3) ward.waterfront = true;
		}
	}

	// Wards inside the wall radius form the walled city; the rest are suburbs (this is where the
	// shantytown and the boneyard end up, which is historically exactly where they were put).
	const wallRadius = walled ? CITY_RADIUS * 0.82 : CITY_RADIUS * 2;
	const byRadial = [...wards].sort((a, b) => a.radial - b.radial || a.index - b.index);
	const minWalled = Math.max(1, Math.ceil(wards.length * 0.55));
	for (let i = 0; i < byRadial.length; i += 1) {
		const ward = byRadial[i] as Ward;
		ward.walled = !walled || ward.radial <= wallRadius / CITY_RADIUS || i < minWalled;
	}

	// --- 4. Wall circuit, towers, gates --------------------------------------------------------
	const walledRings = wards.filter((w) => w.walled).map((w) => w.ring);
	const boundaryRings = unionBoundary(
		{ rings: walledRings.length > 0 ? walledRings : wards.map((w) => w.ring) },
		{ resolution: 512, smoothIterations: planned ? 1 : 2, simplifyEpsilon: 0.7 },
	);
	const outerRings = boundaryRings
		.filter((r) => ringArea(r) > 0)
		.sort((a, b) => ringArea(b) - ringArea(a));
	const wallRing: Ring = (outerRings[0] ?? []).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));

	// The full city footprint (walled + suburbs) — road entries use it when there is no wall.
	const allRings = unionBoundary(
		{ rings: wards.map((w) => w.ring) },
		{ resolution: 512, smoothIterations: 2 },
	);
	const outline = (
		allRings.filter((r) => ringArea(r) > 0).sort((a, b) => ringArea(b) - ringArea(a))[0] ?? wallRing
	).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));

	/** Cast a ray from the city centre and return where it crosses `ring` — a gate lands exactly ON it. */
	const rayHit = (ring: Ring, dir: Point): Point | null => {
		let bestT = Number.POSITIVE_INFINITY;
		for (let i = 0; i < ring.length; i += 1) {
			const a = ring[i] as Point;
			const b = ring[(i + 1) % ring.length] as Point;
			const t = raySegmentHit(CITY_CENTER, dir, a, b);
			if (t !== null && t > 1e-6 && t < bestT) bestT = t;
		}
		if (!Number.isFinite(bestT)) return null;
		return { x: CITY_CENTER.x + dir.x * bestT, y: CITY_CENTER.y + dir.y * bestT };
	};

	// An unwalled city still has roads in — they just are not gates. `gateCount` doubles as the entry count.
	const entryTarget = walled ? Math.round(gateCount) : Math.max(2, Math.round(gateCount));
	const entryRing = walled && wallRing.length >= 3 ? wallRing : outline;
	const gates: Point[] = [];
	const baseAngle = rngRoads.next() * Math.PI * 2;
	for (let i = 0; i < entryTarget; i += 1) {
		const jitter = (rngRoads.next() - 0.5) * (Math.PI / entryTarget) * 0.7;
		const angle = baseAngle + (i / Math.max(1, entryTarget)) * Math.PI * 2 + jitter;
		const dir: Point = { x: Math.cos(angle), y: Math.sin(angle) };
		const hit = entryRing.length >= 3 ? rayHit(entryRing, dir) : null;
		if (!hit) continue;
		if (inSea(hit)) continue; // a gate opening onto open water is a pier, not a gate.
		gates.push(hit);
	}

	const towers: Point[] = [];
	if (walled && wallRing.length >= 3) {
		const closed = [...wallRing, wallRing[0] as Point];
		const spaced = resample(closed, Math.max(0.01, towerSpacing));
		for (const p of spaced) {
			if (towers.some((t) => dist(t, p) < towerSpacing * 0.5)) continue;
			towers.push(p);
		}
	}

	// --- 5. Ward roles -------------------------------------------------------------------------
	const wardsByIndex = [...wards].sort((a, b) => a.index - b.index);
	const assigned = new Set<WardType>();

	// The market is the most central ward — a plaza is where the roads already meet.
	const marketWard = [...wardsByIndex].sort((a, b) => a.radial - b.radial || a.index - b.index)[0];
	if (marketWard) {
		marketWard.type = 'market';
		assigned.add('market');
	}

	// The citadel takes high, defensible, EDGE ground inside the wall — never the middle of the market.
	let citadelWard: Ward | undefined;
	if (wantCitadel) {
		const candidates = wardsByIndex.filter(
			(w) => w !== marketWard && (w.walled || !walled) && !w.waterfront,
		);
		const pool = candidates.length > 0 ? candidates : wardsByIndex.filter((w) => w !== marketWard);
		if (pool.length > 0) {
			const weights = pool.map((w) => 0.05 + w.radial * w.radial * 3);
			citadelWard = rngWards.weighted(pool, weights);
			citadelWard.type = 'citadel';
			assigned.add('citadel');
		}
	}

	// A city of any size has somewhere to pray, and leaving it to a weighted roll means one city in three
	// has no temple at all. MFCG treats the temple as a FEATURE, not a die roll; so do we.
	let templeWard: Ward | undefined;
	if (allowedTypes.includes('temple') && wardsByIndex.length >= 4) {
		const candidates = wardsByIndex
			.filter((w) => w.type !== 'market' && w.type !== 'citadel')
			.sort((a, b) => a.radial - b.radial || a.index - b.index);
		templeWard = candidates[0];
		if (templeWard) {
			templeWard.type = 'temple';
			assigned.add('temple');
		}
	}

	const nearGate = (ward: Ward): boolean =>
		gates.some((g) => dist(g, ward.center) < CITY_RADIUS * 0.35);
	const nearCitadel = (ward: Ward): boolean =>
		citadelWard !== undefined && dist(citadelWard.center, ward.center) < CITY_RADIUS * 0.42;

	const zonable = ZONED_WARD_TYPES.filter((t) => allowedTypes.includes(t));
	const wardWeight = (type: WardType, ward: Ward): number => {
		const d = clamp01(ward.radial);
		switch (type) {
			case 'temple':
				return 0.5 + (1 - d) * 1.6;
			case 'administration':
				return 0.2 + (1 - d) * 2.4;
			case 'noble':
				return 0.2 + (1 - d) * 1.8 + (nearCitadel(ward) ? 1.4 : 0) + (ward.walled ? 0.6 : -0.6);
			case 'merchant':
				return 0.4 + (1 - d) * 1.6 + (ward.waterfront ? 0.5 : 0);
			case 'craftsmen':
				// Craftsmen are the DEFAULT ward — a medieval city is mostly workshops, not slums. Weighting
				// them as the filler is what stops the roll producing a city that is one-third shantytown.
				return 2.2;
			case 'slum':
				return 0.1 + d * 0.9 + (ward.walled ? 0 : 1.5) + (nearCitadel(ward) ? -0.8 : 0);
			case 'docks':
				return ward.waterfront ? 3.4 : 0;
			case 'barracks':
				return nearCitadel(ward) || nearGate(ward) ? 1.6 : 0.15;
			case 'graveyard':
				return 0.2 + d * 1.0 + (ward.walled ? 0 : 0.9);
			case 'park':
				return 0.5 + (nearCitadel(ward) ? 0.5 : 0);
			default:
				return 0.3;
		}
	};

	for (const ward of wardsByIndex) {
		if (ward.type === 'market' || ward.type === 'citadel' || ward.type === 'temple') continue;
		const pool = zonable.filter((t) => !(UNIQUE_WARD_TYPES.has(t) && assigned.has(t)));
		if (pool.length === 0) {
			ward.type = 'craftsmen';
			continue;
		}
		const weights = pool.map((t) => Math.max(0, wardWeight(t, ward)));
		const chosen = rngWards.weighted(pool, weights);
		ward.type = chosen;
		if (UNIQUE_WARD_TYPES.has(chosen)) assigned.add(chosen);
	}

	// --- 6. Names ------------------------------------------------------------------------------
	const cityName = generateName(rngNames, 'settlement');
	const pools = new Map<WardType, string[]>();
	for (const type of Object.keys(WARD_NAME_POOL) as WardType[]) {
		pools.set(type, rngNames.shuffle(WARD_NAME_POOL[type]));
	}
	const usedNames = new Set<string>();
	for (const ward of wardsByIndex) {
		const pool = pools.get(ward.type) ?? [];
		let name = pool.shift() ?? WARD_LABEL[ward.type];
		if (usedNames.has(name)) name = `${name} (Lower)`;
		usedNames.add(name);
		ward.name = name;
	}

	// --- 7. Streets and main roads --------------------------------------------------------------
	const graph = buildStreetGraph(wards.map((w) => w.ring));
	const plazaCenter = marketWard ? marketWard.center : CITY_CENTER;
	const plazaNode = nearestNode(graph, plazaCenter);

	const streetFeatures: MapFeature[] = [];
	const mainRoadKeys = new Set<string>();
	const mainRoads: Array<{ gate: Point; path: Point[] }> = [];

	for (let g = 0; g < gates.length; g += 1) {
		const gate = gates[g] as Point;
		const start = nearestNode(graph, gate);
		const nodePath = shortestPath(graph, start, plazaNode);
		let path: Point[];
		if (nodePath && nodePath.length >= 1) {
			for (let i = 0; i + 1 < nodePath.length; i += 1) {
				const a = nodePath[i] as number;
				const b = nodePath[i + 1] as number;
				mainRoadKeys.add(a < b ? `${a}-${b}` : `${b}-${a}`);
			}
			path = [gate, ...nodePath.map((n) => graph.nodes[n] as Point), plazaCenter];
		} else {
			path = [gate, plazaCenter];
		}
		// A planned city's arteries are straightened; an organic one's wander with the old cowpaths.
		let shaped = planned ? simplify(path, 0.012) : chaikin(path, 1, false);
		if (shaped.length < 2) shaped = path;
		shaped = [gate, ...shaped.slice(1, -1), plazaCenter];
		mainRoads.push({ gate, path: shaped });
		streetFeatures.push(
			feature(`${ctx.idPrefix}-road-main-${g}`, 'road', shaped, 'road:street', {
				width: norm(STREET_WIDTH),
				role: 'artery',
			}),
		);
	}

	// Every remaining ward boundary is an alley — the street network you get FOR FREE from the Voronoi.
	for (let i = 0; i < graph.segments.length; i += 1) {
		const [a, b] = graph.segments[i] as [number, number];
		const key = a < b ? `${a}-${b}` : `${b}-${a}`;
		if (mainRoadKeys.has(key)) continue;
		streetFeatures.push(
			feature(
				`${ctx.idPrefix}-alley-${i}`,
				'road',
				[graph.nodes[a] as Point, graph.nodes[b] as Point],
				'road:alley',
				{ width: norm(ALLEY_WIDTH), role: 'alley' },
			),
		);
	}

	// Highways: outside the wall, a gate road becomes the road to the next town.
	for (let g = 0; g < gates.length; g += 1) {
		const gate = gates[g] as Point;
		const dx = gate.x - CITY_CENTER.x;
		const dy = gate.y - CITY_CENTER.y;
		const len = Math.max(1e-6, Math.hypot(dx, dy));
		const dir: Point = { x: dx / len, y: dy / len };
		const maxT = rayExitT(gate, dir, 0.012, 0.988);
		const reach = Math.min(maxT, FARM_OUTER * 1.05);
		if (reach <= 1e-3) continue;
		const end: Point = { x: gate.x + dir.x * reach, y: gate.y + dir.y * reach };
		if (inSea(end)) continue;
		const wander = (rngRoads.next() - 0.5) * 0.05;
		const mid: Point = {
			x: clamp01(gate.x + dir.x * reach * 0.5 - dir.y * wander),
			y: clamp01(gate.y + dir.y * reach * 0.5 + dir.x * wander),
		};
		streetFeatures.push(
			feature(`${ctx.idPrefix}-highway-${g}`, 'road', [gate, mid, end], 'road:highway', {
				width: norm(STREET_WIDTH * 0.9),
				role: 'highway',
			}),
		);
	}

	// Bridges: wherever a road crosses the river, somebody had to build one — and a bridge is a place.
	const bridges: Point[] = [];
	if (river.length >= 2) {
		const crossings: Array<{ point: Point; dir: Point }> = [];
		for (const road of mainRoads) {
			for (let i = 0; i + 1 < road.path.length; i += 1) {
				const a = road.path[i] as Point;
				const b = road.path[i + 1] as Point;
				for (let j = 0; j + 1 < river.length; j += 1) {
					const r1 = river[j] as Point;
					const r2 = river[j + 1] as Point;
					const hit = segmentIntersection(a, b, r1, r2);
					if (!hit) continue;
					if (crossings.some((c) => dist(c.point, hit) < RIVER_WIDTH * 2)) continue;
					const len = Math.max(1e-6, dist(a, b));
					crossings.push({ point: hit, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } });
				}
			}
		}
		for (let i = 0; i < crossings.length; i += 1) {
			const c = crossings[i] as { point: Point; dir: Point };
			const half = RIVER_WIDTH * 0.9;
			const span: Point[] = [
				{ x: clamp01(c.point.x - c.dir.x * half), y: clamp01(c.point.y - c.dir.y * half) },
				{ x: clamp01(c.point.x + c.dir.x * half), y: clamp01(c.point.y + c.dir.y * half) },
			];
			streetFeatures.push(
				feature(`${ctx.idPrefix}-bridge-${i}`, 'road', span, 'road:bridge', {
					width: norm(STREET_WIDTH * 1.4),
					role: 'bridge',
				}),
			);
			bridges.push(c.point);
		}
	}

	// --- 8. Buildings ---------------------------------------------------------------------------
	const buildingFeatures: MapFeature[] = [];
	const buildingsByWard = new Map<number, Ring[]>();
	const plazaRing = marketWard ? scaleRing(marketWard.ring, clamp(plazaSize, 0.1, 1) * 0.9) : [];

	for (const ward of wardsByIndex) {
		const shape = WARD_SHAPES[ward.type];
		const wardArea = Math.abs(ringArea(ward.ring));
		const wardRadius = Math.sqrt(Math.max(wardArea, 1e-9) / Math.PI);
		// The street setback is an ABSOLUTE floor as well as a fraction: a tiny ward must still leave its
		// street clear, or the footprints land on top of the road network.
		const setback = Math.max(0.009, buildingSetback * wardRadius);
		const buildable = insetConvex(ward.ring, setback);
		buildingsByWard.set(ward.index, []);
		if (buildable.length < 3) continue;

		const lotTarget = shape.lot * (2.1 - density * 1.5);
		const lots = subdivide(buildable, Math.max(lotTarget, 0.00006), shape.jitter, rngBuildings, 0);
		const kept = buildingsByWard.get(ward.index) as Ring[];

		for (const lot of lots) {
			if (rngBuildings.next() > shape.keep) continue;
			const lotArea = Math.abs(ringArea(lot));
			if (lotArea < 0.00004) continue;
			if (aspectRatio(lot) > 5.5) continue;
			const lotRadius = Math.sqrt(lotArea / Math.PI);
			const footprint = insetConvex(lot, lotRadius * (1 - shape.coverage) + 0.0012);
			if (footprint.length < 3) continue;
			const fArea = Math.abs(ringArea(footprint));
			if (fArea < 0.00002) continue;
			const c = centroid(footprint);
			// Nobody builds in the plaza, and nobody builds in the river.
			if (plazaRing.length >= 3 && ward.type === 'market' && pointInRing(plazaRing, c)) continue;
			if (river.length >= 2 && distanceToPolyline(c, river) < RIVER_WIDTH * 1.1) continue;
			if (inSea(c)) continue;
			// The ward setback already clears the alleys (which ARE the ward boundaries), but an artery cuts
			// ACROSS the market ward to reach the plaza. Test every vertex, not the centroid: a manor is wide
			// enough that its centre can clear a road its corner does not.
			const onArtery = footprint.some((p) =>
				mainRoads.some((road) => distanceToPolyline(p, road.path) < STREET_WIDTH * 0.9),
			);
			if (onArtery) continue;
			kept.push(footprint);
		}
	}

	let buildingCount = 0;
	for (const ward of wardsByIndex) {
		const rings = buildingsByWard.get(ward.index) ?? [];
		for (let i = 0; i < rings.length; i += 1) {
			buildingFeatures.push(
				feature(
					`${ctx.idPrefix}-building-${ward.index}-${i}`,
					'polygon',
					rings[i] as Ring,
					`building:${ward.type}`,
					{ ward: ward.index, role: ward.type },
				),
			);
			buildingCount += 1;
		}
	}

	// --- 9. Farmland ----------------------------------------------------------------------------
	const terrainFeatures: MapFeature[] = [];
	if (wantFarmland) {
		const farmSites = poissonDisk(rngTerrain, {
			radius: 0.055,
			bounds: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
			maxSamples: 220,
			accept: (p) => {
				const d = dist(p, CITY_CENTER);
				return d > CITY_RADIUS * 1.04 && d < FARM_OUTER && !inSea(p);
			},
		});
		if (farmSites.length > 0) {
			// The city outline doubles as the inner ghost fence, so fields stop at the city edge instead
			// of growing over it.
			const fence = outline.length >= 3 ? resample([...outline, outline[0] as Point], 0.03) : [];
			const outerGhosts: Point[] = [];
			for (let i = 0; i < 48; i += 1) {
				const angle = (i / 48) * Math.PI * 2;
				outerGhosts.push({
					x: CITY_CENTER.x + Math.cos(angle) * (FARM_OUTER + 0.045),
					y: CITY_CENTER.y + Math.sin(angle) * (FARM_OUTER + 0.045),
				});
			}
			const farmCells = voronoiCells([...farmSites, ...fence, ...outerGhosts], bounds);
			for (let i = 0; i < farmSites.length; i += 1) {
				const cell = farmCells[i];
				if (!cell || cell.length < 3) continue;
				const clipped = clipToUnitSquare(cell);
				if (clipped.length < 3) continue;
				const c = centroid(clipped);
				if (inSea(c)) continue;
				const field = scaleRing(clipped, 0.9);
				if (field.length < 3 || Math.abs(ringArea(field)) < 0.0004) continue;
				terrainFeatures.push(
					feature(`${ctx.idPrefix}-field-${i}`, 'polygon', field, 'terrain:farmland', {
						role: 'farmland',
					}),
				);
			}
		}
	}

	// --- 10. Features: water, wards, walls, labels ----------------------------------------------
	const waterFeatures: MapFeature[] = [];
	if (seaRing.length >= 3) {
		waterFeatures.push(
			feature(`${ctx.idPrefix}-sea`, 'water', seaRing, 'water:sea', { role: 'sea' }),
		);
	}
	if (river.length >= 2) {
		waterFeatures.push(
			feature(`${ctx.idPrefix}-river`, 'water', river, 'water:river', {
				width: norm(RIVER_WIDTH),
				role: 'river',
				name: riverName,
			}),
		);
	}

	const wardFeatures: MapFeature[] = wardsByIndex.map((ward) =>
		feature(`${ctx.idPrefix}-ward-${ward.index}`, 'polygon', ward.ring, `ward:${ward.type}`, {
			role: ward.type,
			name: ward.name,
			walled: ward.walled,
		}),
	);
	if (plazaRing.length >= 3) {
		wardFeatures.push(
			feature(`${ctx.idPrefix}-plaza`, 'polygon', plazaRing, 'city:plaza', { role: 'plaza' }),
		);
	}

	const wallFeatures: MapFeature[] = [];
	if (walled && wallRing.length >= 3) {
		const closed = [...wallRing, wallRing[0] as Point];
		if (wallStyle === 'ruined') {
			// A ruined circuit is the same ring with holes punched in it — the gates still stand, which is
			// exactly the story a ruined city wants to tell.
			let run: Point[] = [];
			let segment = 0;
			for (let i = 0; i < closed.length; i += 1) {
				const standing = rngWalls.next() > 0.32;
				if (standing) {
					run.push(closed[i] as Point);
				} else if (run.length >= 2) {
					wallFeatures.push(
						feature(`${ctx.idPrefix}-wall-${segment}`, 'wall', run, 'wall:ruined', {
							role: 'wall',
						}),
					);
					segment += 1;
					run = [];
				} else {
					run = [];
				}
			}
			if (run.length >= 2) {
				wallFeatures.push(
					feature(`${ctx.idPrefix}-wall-${segment}`, 'wall', run, 'wall:ruined', { role: 'wall' }),
				);
			}
		} else {
			wallFeatures.push(
				feature(`${ctx.idPrefix}-wall`, 'wall', closed, 'wall:city', {
					role: 'wall',
					closed: true,
				}),
			);
		}
		for (let i = 0; i < towers.length; i += 1) {
			wallFeatures.push(
				feature(`${ctx.idPrefix}-tower-${i}`, 'marker', [towers[i] as Point], 'wall:tower', {
					role: 'tower',
				}),
			);
		}
		for (let i = 0; i < gates.length; i += 1) {
			const gate = gates[i] as Point;
			const dx = gate.x - CITY_CENTER.x;
			const dy = gate.y - CITY_CENTER.y;
			const len = Math.max(1e-6, Math.hypot(dx, dy));
			const half = 0.011;
			const span: Point[] = [
				{ x: clamp01(gate.x - (-dy / len) * half), y: clamp01(gate.y - (dx / len) * half) },
				{ x: clamp01(gate.x + (-dy / len) * half), y: clamp01(gate.y + (dx / len) * half) },
			];
			wallFeatures.push(
				feature(`${ctx.idPrefix}-gate-${i}`, 'door', span, 'wall:gate', {
					portal: 'portcullis',
					state: 'open',
					role: 'gate',
				}),
			);
		}
		if (wallStyle === 'moat') {
			const moatLine = scaleRingAbout(wallRing, CITY_CENTER, 1.05);
			const band = offsetPolyline([...moatLine, moatLine[0] as Point], 0.011);
			const clipped = clipToUnitSquare(band);
			if (clipped.length >= 3) {
				waterFeatures.push(
					feature(`${ctx.idPrefix}-moat`, 'water', clipped, 'water:moat', { role: 'moat' }),
				);
			}
		}
	}
	if (citadelWard) {
		const keepRing = insetConvex(citadelWard.ring, 0.012);
		if (keepRing.length >= 3) {
			wallFeatures.push(
				feature(
					`${ctx.idPrefix}-citadel-wall`,
					'wall',
					[...keepRing, keepRing[0] as Point],
					'wall:citadel',
					{
						role: 'citadel',
					},
				),
			);
		}
	}

	const labelFeatures: MapFeature[] = [
		feature(`${ctx.idPrefix}-label-city`, 'text', [CITY_CENTER], 'label:city', {
			text: cityName,
			size: 2,
		}),
	];
	for (const ward of wardsByIndex) {
		labelFeatures.push(
			feature(`${ctx.idPrefix}-label-ward-${ward.index}`, 'text', [ward.center], 'label:ward', {
				text: ward.name,
				size: 1,
			}),
		);
	}
	if (river.length >= 2 && riverName) {
		labelFeatures.push(
			feature(
				`${ctx.idPrefix}-label-river`,
				'text',
				[river[Math.floor(river.length / 2)] as Point],
				'label:water',
				{
					text: riverName,
					size: 1,
				},
			),
		);
	}

	// --- 11. POIs, notes, graph -----------------------------------------------------------------
	const pois: GeneratedPoi[] = [];
	const notes: Array<{ key: string; title: string; body: string }> = [];

	for (const ward of wardsByIndex) {
		const tavern = generateName(rngNames, 'tavern');
		pois.push({
			id: `${ctx.idPrefix}-poi-ward-${ward.index}`,
			label: ward.name,
			category: WARD_POI_CATEGORY[ward.type],
			position: normPoint(ward.center.x, ward.center.y),
			notes: `${WARD_LABEL[ward.type]} of ${cityName}. ${WARD_BLURB[ward.type]}`,
		});
		notes.push({
			key: `ward-${ward.index}`,
			title: `${ward.name} — ${WARD_LABEL[ward.type]}`,
			body: `${WARD_BLURB[ward.type]} Local landmark: ${tavern}.${ward.walled ? '' : ' Lies outside the walls.'}`,
		});
	}

	// An unwalled city has road ENTRIES, not gates — and calling them gates would be a lie the POI list
	// then tells at the table.
	for (let i = 0; i < gates.length; i += 1) {
		const gate = gates[i] as Point;
		const compass = ['North', 'East', 'South', 'West', 'Old', 'Low', 'High', 'Sally'][
			i % 8
		] as string;
		pois.push({
			id: `${ctx.idPrefix}-poi-${walled ? 'gate' : 'entry'}-${i}`,
			label: walled ? `${compass} Gate` : `${compass} Road`,
			category: 'landmark',
			position: normPoint(gate.x, gate.y),
			notes: walled
				? `A gate in the walls of ${cityName}. Tolls are collected here, and the guard remembers faces.`
				: `The road into ${cityName} from the ${compass.toLowerCase()}. There is no wall to stop anyone using it.`,
		});
	}

	for (let i = 0; i < bridges.length; i += 1) {
		const bridge = bridges[i] as Point;
		pois.push({
			id: `${ctx.idPrefix}-poi-bridge-${i}`,
			label: `Bridge over the ${riverName}`,
			category: 'landmark',
			position: normPoint(bridge.x, bridge.y),
			notes: `A stone span across the ${riverName}. Beggars work the crossing; so does someone else.`,
		});
	}

	if (citadelWard) {
		pois.push({
			id: `${ctx.idPrefix}-poi-citadel`,
			label: citadelWard.name,
			category: 'landmark',
			position: normPoint(citadelWard.center.x, citadelWard.center.y),
			notes: `The citadel of ${cityName}. ${WARD_BLURB.citadel}`,
		});
	}
	if (marketWard) {
		pois.push({
			id: `${ctx.idPrefix}-poi-market`,
			label: `${marketWard.name}`,
			category: 'shop',
			position: normPoint(plazaCenter.x, plazaCenter.y),
			notes: `The central plaza of ${cityName}. ${WARD_BLURB.market}`,
		});
	}

	// Ward adjacency, computed geometrically rather than from shared vertices — a robust adjacency test
	// survives a clipped cell whose boundary vertex does not exactly coincide with its neighbour's.
	const graphNodes: GeneratedGraph['nodes'] = wardsByIndex.map((ward) => ({
		id: `ward-${ward.index}`,
		position: normPoint(ward.center.x, ward.center.y),
		role: ward.type,
		featureId: `${ctx.idPrefix}-ward-${ward.index}`,
	}));
	const graphEdges: GeneratedGraph['edges'] = [];
	for (let i = 0; i < wardsByIndex.length; i += 1) {
		for (let j = i + 1; j < wardsByIndex.length; j += 1) {
			const a = wardsByIndex[i] as Ward;
			const b = wardsByIndex[j] as Ward;
			if (dist(a.center, b.center) > CITY_RADIUS * 1.2) continue;
			if (!ringsTouch(a.ring, b.ring, 0.004)) continue;
			graphEdges.push({ from: `ward-${a.index}`, to: `ward-${b.index}`, kind: 'corridor' });
		}
	}
	for (let i = 0; i < gates.length; i += 1) {
		const gate = gates[i] as Point;
		graphNodes.push({
			id: `gate-${i}`,
			position: normPoint(gate.x, gate.y),
			role: walled ? 'gate' : 'entry',
		});
		let nearest = wardsByIndex[0] as Ward | undefined;
		let nearestD = Number.POSITIVE_INFINITY;
		for (const ward of wardsByIndex) {
			const d = dist(ward.center, gate);
			if (d < nearestD) {
				nearestD = d;
				nearest = ward;
			}
		}
		if (nearest)
			graphEdges.push({ from: `gate-${i}`, to: `ward-${nearest.index}`, kind: 'corridor' });
	}

	// Anything the roads could not reach is not a city — stitch orphan wards to their nearest neighbour
	// so "every gate reaches the plaza" is a promise the graph actually keeps.
	stitchGraph(graphNodes, graphEdges, wardsByIndex);

	// One-line stocking flavour: which ward the trouble is in this week.
	if (wardsByIndex.length > 0) {
		const trouble = rngStocking.pick(wardsByIndex);
		notes.push({
			key: 'city',
			title: cityName,
			body: `${cityName} — ${wardsByIndex.length} wards${walled ? `, ${gates.length} gates` : ', unwalled'}${
				riverName ? `, astride the ${riverName}` : ''
			}. Current trouble: something is very wrong in ${trouble.name}.`,
		});
	}

	const layers: MapLayer[] = [];
	if (terrainFeatures.length > 0) {
		layers.push(buildLayer(ctx, 'farmland', 'Farmland', 'terrain', terrainFeatures, 0));
	}
	layers.push(buildLayer(ctx, 'wards', 'Wards', 'base', wardFeatures, 1));
	if (waterFeatures.length > 0) {
		layers.push(buildLayer(ctx, 'water', 'Water', 'terrain', waterFeatures, 2));
	}
	layers.push(buildLayer(ctx, 'streets', 'Streets', 'roads', streetFeatures, 3));
	layers.push(buildLayer(ctx, 'buildings', 'Buildings', 'base', buildingFeatures, 4));
	layers.push(buildLayer(ctx, 'walls', 'Walls', 'base', wallFeatures, 5));
	layers.push(buildLayer(ctx, 'labels', 'Labels', 'poi', labelFeatures, 6));

	const summaryParts = [
		`${wardsByIndex.length} ward${wardsByIndex.length === 1 ? '' : 's'}`,
		`${buildingCount} buildings`,
	];
	if (walled) summaryParts.push(`${gates.length} gate${gates.length === 1 ? '' : 's'}`);
	if (river.length >= 2) summaryParts.push('1 river');
	if (seaRing.length >= 3) summaryParts.push('coastal');

	return {
		layers,
		pois,
		notes,
		graph: { nodes: graphNodes, edges: graphEdges },
		summary: `${cityName} · ${summaryParts.join(' · ')}`,
	};
}

/** Recursive convex subdivision — the building-footprint half of the MFCG pipeline. */
function subdivide(
	ring: Ring,
	targetArea: number,
	jitter: number,
	rng: SeededRng,
	depth: number,
): Ring[] {
	if (ring.length < 3 || depth > 8) return ring.length >= 3 ? [ring] : [];
	const area = Math.abs(ringArea(ring));
	if (area <= targetArea) return [ring];
	const [a, b] = longestAxis(ring);
	const axisLength = dist(a, b);
	if (axisLength < 1e-6) return [ring];
	const t = 0.5 + (rng.next() - 0.5) * jitter;
	const cut = lerpPoint(a, b, clamp(t, 0.2, 0.8));
	const nx = -(b.y - a.y) / axisLength;
	const ny = (b.x - a.x) / axisLength;
	const p1: Point = { x: cut.x - nx * 2, y: cut.y - ny * 2 };
	const p2: Point = { x: cut.x + nx * 2, y: cut.y + ny * 2 };
	const [left, right] = splitByLine(ring, p1, p2);
	if (left.length < 3 || right.length < 3) return [ring];
	return [
		...subdivide(left, targetArea, jitter, rng, depth + 1),
		...subdivide(right, targetArea, jitter, rng, depth + 1),
	];
}

/** Do two rings share a boundary (within `tolerance`)? The Voronoi adjacency test, done robustly. */
function ringsTouch(a: readonly Point[], b: readonly Point[], tolerance: number): boolean {
	let shared = 0;
	for (const p of a) {
		for (let i = 0; i < b.length; i += 1) {
			const d = pointToSegmentDistance(p, b[i] as Point, b[(i + 1) % b.length] as Point);
			if (d < tolerance) {
				shared += 1;
				if (shared >= 2) return true;
				break;
			}
		}
	}
	return false;
}

/** Scale a ring about an arbitrary origin (the moat is the wall, pushed outward from the city centre). */
function scaleRingAbout(ring: readonly Point[], origin: Point, factor: number): Ring {
	return ring.map((p) => ({
		x: clamp01(origin.x + (p.x - origin.x) * factor),
		y: clamp01(origin.y + (p.y - origin.y) * factor),
	}));
}

/** Union-find over the ward graph; connect any disconnected component to its nearest neighbour. */
function stitchGraph(
	nodes: GeneratedGraph['nodes'],
	edges: GeneratedGraph['edges'],
	wards: readonly Ward[],
): void {
	if (wards.length < 2) return;
	const parent = new Map<string, string>();
	const find = (id: string): string => {
		let root = id;
		for (;;) {
			const next = parent.get(root);
			if (next === undefined || next === root) break;
			root = next;
		}
		return root;
	};
	const union = (x: string, y: string): void => {
		const rx = find(x);
		const ry = find(y);
		if (rx !== ry) parent.set(rx, ry);
	};
	for (const node of nodes) parent.set(node.id, node.id);
	for (const edge of edges) union(edge.from, edge.to);

	for (;;) {
		const roots = new Set<string>();
		for (const ward of wards) roots.add(find(`ward-${ward.index}`));
		if (roots.size <= 1) break;
		// Join the two closest wards that are in different components.
		let bestA: Ward | undefined;
		let bestB: Ward | undefined;
		let bestD = Number.POSITIVE_INFINITY;
		for (let i = 0; i < wards.length; i += 1) {
			for (let j = i + 1; j < wards.length; j += 1) {
				const a = wards[i] as Ward;
				const b = wards[j] as Ward;
				if (find(`ward-${a.index}`) === find(`ward-${b.index}`)) continue;
				const d = dist(a.center, b.center);
				if (d < bestD) {
					bestD = d;
					bestA = a;
					bestB = b;
				}
			}
		}
		if (!bestA || !bestB) break;
		edges.push({ from: `ward-${bestA.index}`, to: `ward-${bestB.index}`, kind: 'corridor' });
		union(`ward-${bestA.index}`, `ward-${bestB.index}`);
	}
}

export const cityGenerator: GeneratorDefinition = {
	id: 'settlement.city',
	group: 'settlement',
	scale: 'region',
	label: 'Medieval city',
	description:
		'A walled medieval city: Voronoi wards, a derived wall circuit with gates and towers, streets, and building footprints.',
	bestFor:
		'The city the campaign is set in. Pick this when you need a plan a party can navigate — districts, gates, and a street network — rather than a battle map.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'size',
			label: 'City size',
			help: 'How many districts the city is divided into. A market town is 6; a capital is 20+.',
			min: 3,
			max: 28,
			step: 1,
			default: 12,
		},
		{
			kind: 'select',
			id: 'walls',
			label: 'Walls',
			help: 'What stands between the city and the world.',
			options: [
				{
					value: 'none',
					label: 'Unwalled',
					help: 'An open town. Nothing stops an army — or a mob.',
				},
				{ value: 'wall', label: 'Walled', help: 'A stone circuit with gates and towers.' },
				{
					value: 'moat',
					label: 'Wall + moat',
					help: 'A wall with water around it. Sieges take longer.',
				},
				{
					value: 'ruined',
					label: 'Ruined wall',
					help: 'The circuit is broken. The gates still stand.',
				},
			],
			default: 'wall',
		},
		{
			kind: 'select',
			id: 'water',
			label: 'Water',
			help: 'Cities grow where goods can move. Water decides where the docks are.',
			options: [
				{ value: 'none', label: 'Dry', help: 'No river, no sea. Trade comes by road.' },
				{
					value: 'river',
					label: 'River',
					help: 'A river through the city, with bridges where roads cross it.',
				},
				{
					value: 'coastal',
					label: 'Coastal',
					help: 'The city sits on the sea. Expect a dockside ward.',
				},
			],
			default: 'river',
		},
		{
			kind: 'number',
			id: 'density',
			label: 'Density',
			help: 'How tightly the buildings are packed. Low is a spacious town; high is a crowded warren.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.6,
		},
		{
			kind: 'select',
			id: 'age',
			label: 'Street plan',
			help: 'Whether the city was laid out or simply grew.',
			options: [
				{
					value: 'organic',
					label: 'Grew organically',
					help: 'Winding lanes and irregular blocks.',
				},
				{ value: 'planned', label: 'Planned', help: 'Regular wards and straight arteries.' },
			],
			default: 'organic',
		},
		{
			kind: 'boolean',
			id: 'citadel',
			label: 'Citadel',
			help: 'A fortified seat of power on high ground inside the walls.',
			advanced: true,
			group: 'Landmarks',
			default: true,
		},
		{
			kind: 'number',
			id: 'plazaSize',
			label: 'Plaza size',
			help: 'How much of the market ward is left open as a public square.',
			advanced: true,
			group: 'Landmarks',
			min: 0.2,
			max: 1,
			step: 0.05,
			default: 0.75,
		},
		{
			kind: 'int',
			id: 'gateCount',
			label: 'Gates',
			help: 'How many roads pierce the wall. Fewer gates means a city that is easier to seal.',
			advanced: true,
			group: 'Walls',
			min: 0,
			max: 8,
			step: 1,
			default: 4,
		},
		{
			kind: 'number',
			id: 'towerSpacing',
			label: 'Tower spacing',
			help: 'Distance between wall towers. Tighter spacing reads as a wealthier, better-defended city.',
			advanced: true,
			group: 'Walls',
			min: 0.02,
			max: 0.2,
			step: 0.005,
			default: 0.06,
		},
		{
			kind: 'number',
			id: 'buildingSetback',
			label: 'Street setback',
			help: 'How far buildings sit back from the street. Low values give a claustrophobic medieval feel.',
			advanced: true,
			group: 'Buildings',
			min: 0.02,
			max: 0.4,
			step: 0.01,
			default: 0.14,
		},
		{
			kind: 'boolean',
			id: 'farmland',
			label: 'Farmland ring',
			help: 'Fields worked from the city, outside the walls. A city that cannot eat is not a city.',
			advanced: true,
			group: 'Outskirts',
			default: true,
		},
		{
			kind: 'tags',
			id: 'wardTypes',
			label: 'Districts',
			help: 'Which kinds of district may appear. The market and citadel are always present when enabled.',
			advanced: true,
			group: 'Districts',
			options: [
				{ value: 'temple', label: 'Temple' },
				{ value: 'noble', label: 'Noble quarter' },
				{ value: 'merchant', label: 'Merchant quarter' },
				{ value: 'craftsmen', label: 'Craftsmen' },
				{ value: 'slum', label: 'Slums' },
				{ value: 'docks', label: 'Docks', help: 'Only appears when the city has water.' },
				{ value: 'barracks', label: 'Barracks' },
				{ value: 'graveyard', label: 'Graveyard' },
				{ value: 'park', label: 'Gardens' },
				{ value: 'administration', label: 'Administration' },
			],
			default: [
				'administration',
				'barracks',
				'craftsmen',
				'docks',
				'graveyard',
				'merchant',
				'noble',
				'park',
				'slum',
				'temple',
			],
		},
	],
	presets: [
		{
			id: 'free-city',
			label: 'Free city',
			description: 'A prosperous, self-governing river city. The default fantasy metropolis.',
			values: {
				size: 14,
				walls: 'wall',
				water: 'river',
				density: 0.65,
				age: 'organic',
				gateCount: 4,
			},
		},
		{
			id: 'fortified-capital',
			label: 'Fortified capital',
			description: 'A planned seat of power: regular wards, a moat, and a citadel over everything.',
			values: {
				size: 20,
				walls: 'moat',
				water: 'river',
				density: 0.7,
				age: 'planned',
				citadel: true,
				gateCount: 5,
				towerSpacing: 0.045,
			},
		},
		{
			id: 'river-port',
			label: 'River port',
			description:
				'A trade town that lives off the water. Docks, warehouses, and a lot of missing cargo.',
			values: {
				size: 11,
				walls: 'wall',
				water: 'coastal',
				density: 0.75,
				age: 'organic',
				gateCount: 3,
			},
		},
		{
			id: 'ruined-metropolis',
			label: 'Ruined metropolis',
			description: 'A great city that fell. The walls are broken and the wards are a warren.',
			values: {
				size: 24,
				walls: 'ruined',
				water: 'river',
				density: 0.85,
				age: 'organic',
				citadel: true,
				farmland: false,
				gateCount: 6,
			},
		},
		{
			id: 'market-town',
			label: 'Market town',
			description: 'An unwalled town that grew around a crossroads market. Nothing to stop anyone.',
			values: {
				size: 7,
				walls: 'none',
				water: 'none',
				density: 0.45,
				age: 'organic',
				citadel: false,
			},
		},
		{
			id: 'mountain-hold',
			label: 'Mountain hold',
			description: 'A dense, dry, heavily-walled hold. No docks, no gardens, all garrison.',
			values: {
				size: 9,
				walls: 'wall',
				water: 'none',
				density: 0.9,
				age: 'planned',
				citadel: true,
				gateCount: 2,
				towerSpacing: 0.04,
				farmland: false,
				wardTypes: [
					'administration',
					'barracks',
					'craftsmen',
					'merchant',
					'noble',
					'slum',
					'temple',
				],
			},
		},
	],
	run: runCity,
};

// ---------------------------------------------------------------------------------------------
// settlement.village
//
// A village is NOT a small city. A city fills a boundary and its streets are the dual of its districts;
// a village FOLLOWS A ROAD. Everything below hangs off that one structural difference: the road comes
// first, the buildings queue along it with a setback, and the fields radiate out from what is left.
// ---------------------------------------------------------------------------------------------

interface VillageBuilding {
	ring: Ring;
	center: Point;
	role: string;
}

function runVillage(ctx: GeneratorContext): GeneratorOutput {
	const buildingTarget = numberParam(ctx.params, 'buildings');
	const layout = stringParam(ctx.params, 'layout');
	const wantPalisade = boolParam(ctx.params, 'palisade');
	const wantFields = boolParam(ctx.params, 'fields');
	const water = stringParam(ctx.params, 'water');
	const wander = numberParam(ctx.params, 'wander');
	const setbackParam = numberParam(ctx.params, 'setback');
	const wantWell = boolParam(ctx.params, 'well');

	const rngRoads = ctx.rng.stream('roads');
	const rngBuildings = ctx.rng.stream('buildings');
	const rngWater = ctx.rng.stream('water');
	const rngTerrain = ctx.rng.stream('terrain');
	const rngNames = ctx.rng.stream('names');
	const rngStocking = ctx.rng.stream('stocking');

	const center: Point = { x: 0.5, y: 0.5 };

	// --- Roads: the village's skeleton ----------------------------------------------------------
	const roads: Point[][] = [];
	const makeRoad = (angle: number, length: number): Point[] => {
		const dir: Point = { x: Math.cos(angle), y: Math.sin(angle) };
		const perp: Point = { x: -dir.y, y: dir.x };
		const pts: Point[] = [];
		const steps = 8;
		for (let i = 0; i <= steps; i += 1) {
			const t = -0.5 + i / steps;
			const sway = Math.sin(t * Math.PI) * (rngRoads.next() - 0.5) * wander;
			pts.push({
				x: clamp01(center.x + dir.x * t * length + perp.x * sway),
				y: clamp01(center.y + dir.y * t * length + perp.y * sway),
			});
		}
		return chaikin(pts, 1, false).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
	};

	const spineAngle = rngRoads.next() * Math.PI * 2;
	let greenRing: Ring = [];
	if (layout === 'crossroads') {
		roads.push(makeRoad(spineAngle, 0.92));
		roads.push(makeRoad(spineAngle + Math.PI / 2 + (rngRoads.next() - 0.5) * 0.5, 0.86));
	} else if (layout === 'linear') {
		roads.push(makeRoad(spineAngle, 0.94));
	} else if (layout === 'green') {
		// A loop road around a common. The buildings face inward onto the green — the classic English
		// green village, and the reason the well and the stocks are always in the middle of it.
		const greenRadius = 0.1;
		const loop: Point[] = [];
		for (let i = 0; i < 14; i += 1) {
			const angle = (i / 14) * Math.PI * 2;
			const r = greenRadius * (1.35 + (rngRoads.next() - 0.5) * 0.22);
			loop.push({
				x: clamp01(center.x + Math.cos(angle) * r),
				y: clamp01(center.y + Math.sin(angle) * r * 0.85),
			});
		}
		const smooth = chaikin(loop, 2, true).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
		roads.push([...smooth, smooth[0] as Point]);
		roads.push(makeRoad(spineAngle, 0.9));
		greenRing = scaleRing(smooth, 0.72);
	} else {
		// cluster — a short road and a knot of houses around the well.
		roads.push(makeRoad(spineAngle, 0.7));
	}

	// --- Water / mill ---------------------------------------------------------------------------
	let stream: Point[] = [];
	let streamName = '';
	let millSite: Point | null = null;
	if (water !== 'none') {
		const angle = spineAngle + Math.PI / 2 + (rngWater.next() - 0.5) * 0.6;
		const dir: Point = { x: Math.cos(angle), y: Math.sin(angle) };
		const perp: Point = { x: -dir.y, y: dir.x };
		const offset = (rngWater.next() * 0.5 + 0.5) * 0.16 * (rngWater.chance(0.5) ? 1 : -1);
		const pts: Point[] = [];
		for (let i = 0; i <= 10; i += 1) {
			const t = -0.5 + i / 10;
			const sway = (rngWater.next() - 0.5) * 0.07;
			pts.push({
				x: clamp01(center.x + dir.x * t * 0.96 + perp.x * (offset + sway)),
				y: clamp01(center.y + dir.y * t * 0.96 + perp.y * (offset + sway)),
			});
		}
		stream = chaikin(pts, 2, false).map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
		streamName = generateName(rngNames, 'river');
		if (water === 'mill' && stream.length > 2) {
			millSite = stream[Math.floor(stream.length * 0.45)] as Point;
		}
	}

	// --- Buildings: they queue ALONG the road, alternating sides, set back from the verge ---------
	const villageName = generateName(rngNames, 'settlement');
	const buildings: VillageBuilding[] = [];
	const target = Math.round(buildingTarget);
	const minSeparation = 0.032;

	const placeRect = (at: Point, tangent: Point, w: number, h: number): Ring => {
		const len = Math.max(1e-6, Math.hypot(tangent.x, tangent.y));
		const ux = tangent.x / len;
		const uy = tangent.y / len;
		const vx = -uy;
		const vy = ux;
		return [
			{ x: at.x - ux * w - vx * h, y: at.y - uy * w - vy * h },
			{ x: at.x + ux * w - vx * h, y: at.y + uy * w - vy * h },
			{ x: at.x + ux * w + vx * h, y: at.y + uy * w + vy * h },
			{ x: at.x - ux * w + vx * h, y: at.y - uy * w + vy * h },
		];
	};

	const anchors: Array<{ point: Point; tangent: Point; side: number }> = [];
	for (const road of roads) {
		const walk = resample(road, 0.045);
		for (let i = 0; i < walk.length; i += 1) {
			const p = walk[i] as Point;
			const next = (walk[i + 1] ?? walk[i - 1] ?? p) as Point;
			const tx = next.x - p.x;
			const ty = next.y - p.y;
			if (Math.abs(tx) < 1e-9 && Math.abs(ty) < 1e-9) continue;
			anchors.push({ point: p, tangent: { x: tx, y: ty }, side: 1 });
			anchors.push({ point: p, tangent: { x: tx, y: ty }, side: -1 });
		}
	}

	const order = layout === 'cluster' ? rngBuildings.shuffle(anchors) : anchors;
	for (const anchor of order) {
		if (buildings.length >= target) break;
		const len = Math.max(1e-6, Math.hypot(anchor.tangent.x, anchor.tangent.y));
		const nx = (-anchor.tangent.y / len) * anchor.side;
		const ny = (anchor.tangent.x / len) * anchor.side;
		const setback = setbackParam * (0.75 + rngBuildings.next() * 0.6);
		const jitterAlong = (rngBuildings.next() - 0.5) * 0.018;
		const at: Point = {
			x: anchor.point.x + nx * setback + (anchor.tangent.x / len) * jitterAlong,
			y: anchor.point.y + ny * setback + (anchor.tangent.y / len) * jitterAlong,
		};
		if (at.x < 0.04 || at.x > 0.96 || at.y < 0.04 || at.y > 0.96) continue;
		if (buildings.some((b) => dist(b.center, at) < minSeparation)) continue;
		if (stream.length >= 2 && distanceToPolyline(at, stream) < 0.03) continue;
		if (greenRing.length >= 3 && pointInRing(greenRing, at)) continue;
		const w = 0.012 + rngBuildings.next() * 0.009;
		const h = 0.009 + rngBuildings.next() * 0.007;
		const ring = placeRect(at, anchor.tangent, w, h).map((p) => ({
			x: clamp01(p.x),
			y: clamp01(p.y),
		}));
		buildings.push({ ring, center: at, role: 'house' });
	}

	// A village that has more than a handful of houses has somewhere to drink and somewhere to pray.
	const tavernName = generateName(rngNames, 'tavern');
	if (buildings.length > 0) (buildings[0] as VillageBuilding).role = 'tavern';
	if (buildings.length > 3)
		(buildings[Math.floor(buildings.length / 2)] as VillageBuilding).role = 'shrine';
	if (buildings.length > 6) (buildings[buildings.length - 1] as VillageBuilding).role = 'smithy';

	if (millSite) {
		const ring = placeRect(millSite, { x: 1, y: 0 }, 0.018, 0.014).map((p) => ({
			x: clamp01(p.x),
			y: clamp01(p.y),
		}));
		buildings.push({ ring, center: millSite, role: 'mill' });
	}

	// --- Palisade: the union boundary of everything the village actually occupies ------------------
	let palisade: Ring = [];
	if (wantPalisade && buildings.length >= 3) {
		const rings = unionBoundary(
			{
				rings: buildings.map((b) => b.ring),
				strokes: roads.map((r) => ({ points: r, width: 0.02 })),
			},
			{ resolution: 384, smoothIterations: 2, simplifyEpsilon: 1 },
		);
		const outer = rings.filter((r) => ringArea(r) > 0).sort((a, b) => ringArea(b) - ringArea(a))[0];
		if (outer && outer.length >= 3) {
			palisade = scaleRingAbout(outer, centroid(outer), 1.16).map((p) => ({
				x: clamp01(p.x),
				y: clamp01(p.y),
			}));
		}
	}

	// --- Fields: medieval strip fields radiating out from the settlement --------------------------
	const terrainFeatures: MapFeature[] = [];
	if (wantFields) {
		const stripCount = 22;
		const baseAngle = rngTerrain.next() * Math.PI * 2;
		for (let i = 0; i < stripCount; i += 1) {
			const angle = baseAngle + (i / stripCount) * Math.PI * 2 + (rngTerrain.next() - 0.5) * 0.08;
			const inner = 0.19 + rngTerrain.next() * 0.05;
			const outer = inner + 0.14 + rngTerrain.next() * 0.13;
			const halfWidth = (Math.PI / stripCount) * 0.78;
			const ring: Point[] = [];
			for (const [r, sweep] of [
				[inner, -halfWidth],
				[outer, -halfWidth],
				[outer, halfWidth],
				[inner, halfWidth],
			] as Array<[number, number]>) {
				ring.push({
					x: center.x + Math.cos(angle + sweep) * r,
					y: center.y + Math.sin(angle + sweep) * r,
				});
			}
			const clipped = clipToUnitSquare(ring);
			if (clipped.length < 3) continue;
			if (Math.abs(ringArea(clipped)) < 0.0006) continue;
			terrainFeatures.push(
				feature(`${ctx.idPrefix}-field-${i}`, 'polygon', clipped, 'terrain:field', {
					role: 'field',
				}),
			);
		}
	}

	// --- Emit -------------------------------------------------------------------------------------
	const roadFeatures: MapFeature[] = roads.map((road, i) =>
		feature(`${ctx.idPrefix}-road-${i}`, 'road', road, i === 0 ? 'road:street' : 'road:lane', {
			width: norm(i === 0 ? 0.006 : 0.004),
		}),
	);

	// A ford or a bridge wherever the road meets the water — the reason the village is HERE.
	const crossings: Point[] = [];
	if (stream.length >= 2) {
		for (const road of roads) {
			for (let i = 0; i + 1 < road.length; i += 1) {
				for (let j = 0; j + 1 < stream.length; j += 1) {
					const hit = segmentIntersection(
						road[i] as Point,
						road[i + 1] as Point,
						stream[j] as Point,
						stream[j + 1] as Point,
					);
					if (!hit) continue;
					if (crossings.some((c) => dist(c, hit) < 0.04)) continue;
					crossings.push(hit);
				}
			}
		}
		for (let i = 0; i < crossings.length; i += 1) {
			const c = crossings[i] as Point;
			roadFeatures.push(
				feature(
					`${ctx.idPrefix}-ford-${i}`,
					'road',
					[
						{ x: clamp01(c.x - 0.014), y: clamp01(c.y) },
						{ x: clamp01(c.x + 0.014), y: clamp01(c.y) },
					],
					'road:bridge',
					{ width: norm(0.008), role: 'bridge' },
				),
			);
		}
	}

	const buildingFeatures: MapFeature[] = buildings.map((b, i) =>
		feature(`${ctx.idPrefix}-building-${i}`, 'polygon', b.ring, `building:${b.role}`, {
			role: b.role,
		}),
	);

	const waterFeatures: MapFeature[] = [];
	if (stream.length >= 2) {
		waterFeatures.push(
			feature(`${ctx.idPrefix}-stream`, 'water', stream, 'water:river', {
				width: norm(0.012),
				role: 'stream',
				name: streamName,
			}),
		);
	}

	const structureFeatures: MapFeature[] = [];
	if (greenRing.length >= 3) {
		structureFeatures.push(
			feature(`${ctx.idPrefix}-green`, 'polygon', greenRing, 'terrain:green', { role: 'green' }),
		);
	}
	const wellSite: Point = greenRing.length >= 3 ? centroid(greenRing) : center;
	if (wantWell) {
		structureFeatures.push(
			feature(`${ctx.idPrefix}-well`, 'prop', [wellSite], 'prop:well', {
				asset: 'well',
				role: 'well',
			}),
		);
	}
	if (palisade.length >= 3) {
		structureFeatures.push(
			feature(
				`${ctx.idPrefix}-palisade`,
				'wall',
				[...palisade, palisade[0] as Point],
				'wall:palisade',
				{
					role: 'palisade',
					closed: true,
				},
			),
		);
	}

	const labelFeatures: MapFeature[] = [
		feature(`${ctx.idPrefix}-label`, 'text', [center], 'label:settlement', {
			text: villageName,
			size: 2,
		}),
	];
	if (streamName) {
		labelFeatures.push(
			feature(
				`${ctx.idPrefix}-label-stream`,
				'text',
				[stream[Math.floor(stream.length * 0.8)] as Point],
				'label:water',
				{ text: streamName, size: 1 },
			),
		);
	}

	const pois: GeneratedPoi[] = [
		{
			id: `${ctx.idPrefix}-poi-village`,
			label: villageName,
			category: 'settlement',
			position: normPoint(center.x, center.y),
			notes: `${villageName} — a village of some ${buildings.length} households. ${
				wantPalisade ? 'A palisade rings it; they have needed one.' : 'It is not defended.'
			}`,
		},
	];
	if (wantWell) {
		pois.push({
			id: `${ctx.idPrefix}-poi-well`,
			label: `The ${villageName} Well`,
			category: 'landmark',
			position: normPoint(wellSite.x, wellSite.y),
			notes:
				'The village well, and the village noticeboard, and the village court. Everything happens here.',
		});
	}
	for (const [i, b] of buildings.entries()) {
		if (b.role === 'house') continue;
		const label =
			b.role === 'tavern'
				? tavernName
				: b.role === 'mill'
					? `${villageName} Mill`
					: b.role === 'shrine'
						? `Shrine of ${villageName}`
						: `${villageName} Smithy`;
		pois.push({
			id: `${ctx.idPrefix}-poi-b-${i}`,
			label,
			category: b.role === 'tavern' ? 'shop' : b.role === 'shrine' ? 'landmark' : 'shop',
			position: normPoint(b.center.x, b.center.y),
			notes:
				b.role === 'tavern'
					? `The only inn for a day's ride. The landlord hears everything and repeats most of it.`
					: b.role === 'mill'
						? `The mill on the ${streamName || 'stream'}. The miller is owed money by everyone.`
						: b.role === 'shrine'
							? 'A small shrine, tended by one elderly devotee who is not what they appear.'
							: 'The smithy. The only person in the village who can repair a blade.',
		});
	}

	const hook = rngStocking.pick([
		'Livestock have been going missing, and the tracks lead the wrong way.',
		'A stranger arrived last week and has not left, nor spoken.',
		'The elder is quietly paying someone off, and will not say who.',
		'Half the village will not go near the old boundary stone after dark.',
		'The last three travellers to take the road out never arrived anywhere.',
	]);
	const notes: Array<{ key: string; title: string; body: string }> = [
		{
			key: 'village',
			title: villageName,
			body: `${villageName} — ${buildings.length} buildings on a ${layout} plan.${
				streamName ? ` The ${streamName} runs past it.` : ''
			} ${hook}`,
		},
	];

	const layers: MapLayer[] = [];
	if (terrainFeatures.length > 0) {
		layers.push(buildLayer(ctx, 'fields', 'Fields', 'terrain', terrainFeatures, 0));
	}
	if (waterFeatures.length > 0) {
		layers.push(buildLayer(ctx, 'water', 'Water', 'terrain', waterFeatures, 1));
	}
	layers.push(buildLayer(ctx, 'roads', 'Roads', 'roads', roadFeatures, 2));
	layers.push(buildLayer(ctx, 'buildings', 'Buildings', 'base', buildingFeatures, 3));
	layers.push(buildLayer(ctx, 'structures', 'Village', 'base', structureFeatures, 4));
	layers.push(buildLayer(ctx, 'labels', 'Labels', 'poi', labelFeatures, 5));

	const summaryParts = [`${buildings.length} buildings`, `${layout} plan`];
	if (wantPalisade && palisade.length >= 3) summaryParts.push('palisade');
	if (stream.length >= 2) summaryParts.push(water === 'mill' ? 'mill' : 'stream');
	if (wantFields) summaryParts.push('fields');

	return {
		layers,
		pois,
		notes,
		summary: `${villageName} · ${summaryParts.join(' · ')}`,
	};
}

export const villageGenerator: GeneratorDefinition = {
	id: 'settlement.village',
	group: 'settlement',
	scale: 'region',
	label: 'Village',
	description:
		'A small settlement strung along a road: houses with a setback, a green and a well, optional palisade and fields.',
	bestFor:
		'The place the party actually stops at. Use this rather than a tiny city — a village follows a road, it does not fill a wall.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'buildings',
			label: 'Buildings',
			help: 'Roughly how many households. A hamlet is 6; a large village is 30.',
			min: 3,
			max: 45,
			step: 1,
			default: 14,
		},
		{
			kind: 'select',
			id: 'layout',
			label: 'Layout',
			help: 'The shape the village grew into.',
			options: [
				{
					value: 'crossroads',
					label: 'Crossroads',
					help: 'Two roads meet; the village grew at the junction.',
				},
				{ value: 'linear', label: 'Roadside', help: 'One street. Everything faces it.' },
				{
					value: 'green',
					label: 'Around a green',
					help: 'A loop road around a common, with a well at its heart.',
				},
				{ value: 'cluster', label: 'Cluster', help: 'A knot of houses with no plan at all.' },
			],
			default: 'crossroads',
		},
		{
			kind: 'boolean',
			id: 'palisade',
			label: 'Palisade',
			help: 'A timber wall around the village. They only build one if they have needed one.',
			default: false,
		},
		{
			kind: 'boolean',
			id: 'fields',
			label: 'Fields',
			help: 'Strip fields radiating outward. This is what the village is FOR.',
			default: true,
		},
		{
			kind: 'select',
			id: 'water',
			label: 'Water',
			help: 'A stream gives the village a reason to be here.',
			options: [
				{ value: 'none', label: 'None', help: 'They dig for water.' },
				{
					value: 'stream',
					label: 'Stream',
					help: 'A stream runs past, with a ford where the road crosses.',
				},
				{
					value: 'mill',
					label: 'Stream + mill',
					help: 'A watermill, and a miller everyone owes money to.',
				},
			],
			default: 'stream',
		},
		{
			kind: 'boolean',
			id: 'well',
			label: 'Well',
			help: 'The village well — noticeboard, court, and gossip exchange.',
			advanced: true,
			group: 'Detail',
			default: true,
		},
		{
			kind: 'number',
			id: 'wander',
			label: 'Road wander',
			help: 'How much the road bends. Straight roads were surveyed; bent ones were walked.',
			advanced: true,
			group: 'Detail',
			min: 0,
			max: 0.3,
			step: 0.01,
			default: 0.09,
		},
		{
			kind: 'number',
			id: 'setback',
			label: 'Street setback',
			help: 'How far the houses sit back from the road.',
			advanced: true,
			group: 'Detail',
			min: 0.02,
			max: 0.12,
			step: 0.005,
			default: 0.045,
		},
	],
	presets: [
		{
			id: 'hamlet',
			label: 'Hamlet',
			description: 'Six houses on a lane and a stream. Nobody has a name for it.',
			values: { buildings: 6, layout: 'linear', palisade: false, fields: true, water: 'stream' },
		},
		{
			id: 'frontier-village',
			label: 'Frontier village',
			description: 'A palisaded cluster at the edge of settled land. They have needed the wall.',
			values: {
				buildings: 12,
				layout: 'cluster',
				palisade: true,
				fields: true,
				water: 'stream',
				wander: 0.14,
			},
		},
		{
			id: 'mill-village',
			label: 'Mill village',
			description: 'A crossroads village built around its watermill.',
			values: { buildings: 18, layout: 'crossroads', palisade: false, fields: true, water: 'mill' },
		},
		{
			id: 'green-village',
			label: 'Village green',
			description: 'A prosperous village around a common, with the well at its heart.',
			values: {
				buildings: 22,
				layout: 'green',
				palisade: false,
				fields: true,
				water: 'stream',
				well: true,
			},
		},
		{
			id: 'waystation',
			label: 'Waystation',
			description: 'A handful of buildings on a long road. An inn, a smithy, and nothing else.',
			values: {
				buildings: 5,
				layout: 'linear',
				palisade: false,
				fields: false,
				water: 'none',
				wander: 0.03,
			},
		},
	],
	run: runVillage,
};
