import {
	chaikin,
	clamp,
	clamp01,
	contourGrid,
	createGrid,
	createValueNoise,
	dist2,
	fbm,
	floodRegions,
	gridCount,
	gridGet,
	gridSet,
	offsetPolyline,
	rasterizePolyline,
	rasterizeRing,
	resample,
	ringArea,
	type CellGrid,
	type Point,
	type Ring,
} from '../geometry';
import type { SeededRng } from '../state/prng';
import type { MapFeature, MapLayer } from '../state/map-state';
import {
	boolParam,
	buildLayer,
	feature,
	numberParam,
	stringParam,
	type GeneratedPoi,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
} from './types';

/**
 * MAP-021 — the CAVE generator family: cellular-automata caverns, drunkard's-walk tunnel systems, and
 * pure mazes.
 *
 * Three things in here are load-bearing and are the reason this file is not just "run a CA and draw it":
 *
 *   - **A grid is a scratch buffer, never a model.** Every generator here rasterizes into a
 *     {@link CellGrid}, works there, and then leaves through marching squares (`contourGrid`) or a
 *     stroke offset (`offsetPolyline`) back into NORMALIZED (0..1) vector space. Nothing raster is ever
 *     emitted, because the persisted map model is vector and a persisted grid would pin the map to one
 *     resolution forever.
 *
 *   - **Connectivity is a guarantee, not a hope.** Cellular automata's one fatal flaw is that it
 *     cheerfully produces caves you cannot walk across: a scatter of sealed pockets that *look* like a
 *     cave until a party tries to cross one. So `cave.cellular` flood-fills, culls the specks, and
 *     STITCHES the survivors together with drunken tunnels (a straight Bresenham cut leaves a visible
 *     machine-made seam; a drunk one reads as a natural crawlway), and then re-checks — with a
 *     keep-largest fail-safe so a single connected region is unconditionally true of the output rather
 *     than probably true. `cave.tunnels` and `cave.maze` get the same property for free by construction
 *     (one walker's trail is always one component; a spanning tree is always one component).
 *
 *   - **The walk is captured as a POLYLINE, not painted into cells.** A drunkard's walk is usually
 *     rasterized and then re-vectorized, which throws away the smooth path and hands back a staircase.
 *     Here the walker's trail IS the geometry: resample → Chaikin → `offsetPolyline` by half the tunnel
 *     width. The output is a clean capsule chain with none of the round-trip damage.
 *
 * Walls, doors and lights are NOT emitted. Floors are. A separate derivation pass unions the emitted
 * floor polygons and computes the wall shell from their boundary, so a generator that also drew walls
 * would be publishing a second, divergent source of truth for the same edge.
 */

/**
 * A normalized map is nominally a 100 ft × 100 ft battle map (20 five-foot squares). Only used to put a
 * human-readable area in the summary line — no geometry depends on it.
 */
const NOMINAL_MAP_FEET = 100;

/** Resolution of the throwaway grid used to measure floor area. Independent of any generator's grid. */
const AREA_RESOLUTION = 128;

/** Cells of solid rock kept around the grid edge, so a cave is always sealed and never clipped. */
const BORDER_CELLS = 2;

const CAVE_ADJECTIVES = [
	'Weeping',
	'Whispering',
	'Sunken',
	'Blackwater',
	'Drowned',
	'Silent',
	'Gnawed',
	'Rimefrost',
	'Emberlit',
	'Hollow',
	'Crooked',
	'Toadstool',
];

const CAVE_NOUNS = [
	'Hollow',
	'Warren',
	'Grotto',
	'Deeps',
	'Delve',
	'Burrow',
	'Cavern',
	'Sink',
	'Chasm',
	'Gullet',
	'Undercroft',
	'Maw',
];

/** Group digits without `toLocaleString` — locale is ambient state, and ambient state is not replayable. */
function groupThousands(value: number): string {
	const text = String(Math.max(0, Math.round(value)));
	let out = '';
	for (let i = 0; i < text.length; i += 1) {
		if (i > 0 && (text.length - i) % 3 === 0) out += ',';
		out += text[i];
	}
	return out;
}

function caveName(rng: SeededRng): string {
	const adjective = rng.pick(CAVE_ADJECTIVES);
	const noun = rng.pick(CAVE_NOUNS);
	return `${adjective} ${noun}`;
}

/** A seed for a noise field, drawn from a named stream so the field is deterministic but isolated. */
function noiseSeed(rng: SeededRng): number {
	return Math.floor(rng.next() * 0x7fffffff);
}

/** Measure the true floor area of the emitted geometry: overlapping capsules must not be double-counted,
 *  and pillars must be subtracted, so the only honest way is to burn it and count. */
function floorSquareFeet(floors: readonly Ring[], holes: readonly Ring[]): number {
	if (floors.length === 0) return 0;
	const grid = createGrid(AREA_RESOLUTION, AREA_RESOLUTION, 0);
	for (const ring of floors) rasterizeRing(grid, ring, 1);
	for (const ring of holes) rasterizeRing(grid, ring, 0);
	const filled = gridCount(grid, 1);
	return Math.round(
		(filled / (AREA_RESOLUTION * AREA_RESOLUTION)) * NOMINAL_MAP_FEET * NOMINAL_MAP_FEET,
	);
}

/** Clamp a ring into the unit square. A belt-and-braces guard: every generator here already keeps its
 *  geometry inside a margin, but a coordinate outside 0..1 would be silently unrenderable. */
function boundRing(ring: readonly Point[]): Point[] {
	return ring.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

function polygonFeatures(
	ctx: GeneratorContext,
	rings: readonly Ring[],
	prefix: string,
	style: string,
	props?: MapFeature['props'],
): MapFeature[] {
	const features: MapFeature[] = [];
	for (const ring of rings) {
		// A ring with fewer than 3 vertices is a degenerate sliver, not a polygon.
		if (ring.length < 3) continue;
		features.push(
			feature(
				`${ctx.idPrefix}-${prefix}-${features.length}`,
				'polygon',
				boundRing(ring),
				style,
				props,
			),
		);
	}
	return features;
}

/** Split a contour set into outer boundaries (CCW, positive area) and holes (CW, negative area). */
function splitRings(rings: readonly Ring[]): { outer: Ring[]; holes: Ring[] } {
	const outer: Ring[] = [];
	const holes: Ring[] = [];
	for (const ring of rings) {
		if (ringArea(ring) >= 0) outer.push(ring);
		else holes.push([...ring].reverse()); // re-wind holes CCW: they are emitted as standalone polygons
	}
	return { outer, holes };
}

/** One stroked span of tunnel: a segment of centreline plus the half-width to stroke it with. */
interface TunnelSegment {
	a: Point;
	b: Point;
	radius: number;
}

// ---------------------------------------------------------------------------------------------------
// cave.cellular — cellular automata + flood-fill connectivity
// ---------------------------------------------------------------------------------------------------

/** One generation of the 4-5 rule. `1` is FLOOR here, not wall: out-of-bounds reads as 0 from `gridGet`,
 *  which then means "rock", so the world outside the grid is automatically solid and the cave is sealed. */
function cellularStep(grid: CellGrid, birth: number, survival: number): CellGrid {
	const next = createGrid(grid.w, grid.h, 0);
	for (let y = 0; y < grid.h; y += 1) {
		for (let x = 0; x < grid.w; x += 1) {
			if (
				x < BORDER_CELLS ||
				y < BORDER_CELLS ||
				x >= grid.w - BORDER_CELLS ||
				y >= grid.h - BORDER_CELLS
			) {
				continue; // border stays rock
			}
			let rock = 0;
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					if (gridGet(grid, x + dx, y + dy) === 0) rock += 1;
				}
			}
			const isRock = gridGet(grid, x, y) === 0;
			const staysRock = isRock ? rock >= survival : rock >= birth;
			gridSet(next, x, y, staysRock ? 0 : 1);
		}
	}
	return next;
}

function inPlayableArea(grid: CellGrid, x: number, y: number): boolean {
	return (
		x >= BORDER_CELLS && y >= BORDER_CELLS && x < grid.w - BORDER_CELLS && y < grid.h - BORDER_CELLS
	);
}

function carveDisc(grid: CellGrid, cx: number, cy: number, radius: number): void {
	const r = Math.max(0, Math.ceil(radius));
	for (let dy = -r; dy <= r; dy += 1) {
		for (let dx = -r; dx <= r; dx += 1) {
			if (dx * dx + dy * dy > radius * radius) continue;
			const x = cx + dx;
			const y = cy + dy;
			if (!inPlayableArea(grid, x, y)) continue;
			gridSet(grid, x, y, 1);
		}
	}
}

/**
 * Carve a wandering tunnel from `a` to `b`. The walk is drunk — it takes a sideways step a quarter of
 * the time — because a straight Bresenham cut between two blobs reads instantly as a machine-made
 * corridor bolted onto an organic cave. The bias hardens to 1.0 in the last stretch of the step budget,
 * which is what makes arrival at `b` a guarantee rather than a probability.
 */
function carveDrunkenTunnel(
	grid: CellGrid,
	a: { x: number; y: number },
	b: { x: number; y: number },
	radius: number,
	rng: SeededRng,
): void {
	let x = a.x;
	let y = a.y;
	const manhattan = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
	const maxSteps = manhattan * 4 + 32;
	const lo = BORDER_CELLS;
	const hiX = grid.w - 1 - BORDER_CELLS;
	const hiY = grid.h - 1 - BORDER_CELLS;
	for (let step = 0; step < maxSteps && (x !== b.x || y !== b.y); step += 1) {
		carveDisc(grid, x, y, radius);
		const towardBias = step > maxSteps * 0.6 ? 1 : 0.75;
		const dx = Math.sign(b.x - x);
		const dy = Math.sign(b.y - y);
		if (rng.chance(towardBias)) {
			if (dx !== 0 && dy !== 0) {
				if (rng.chance(0.5)) x += dx;
				else y += dy;
			} else {
				x += dx;
				y += dy;
			}
		} else if (rng.chance(0.5)) {
			x += rng.chance(0.5) ? 1 : -1;
		} else {
			y += rng.chance(0.5) ? 1 : -1;
		}
		x = clamp(x, lo, hiX);
		y = clamp(y, lo, hiY);
	}
	carveDisc(grid, b.x, b.y, radius);
}

/** Cells of a region that touch rock — the only candidates a stitch tunnel should start or end on. */
function edgeCells(grid: CellGrid, region: readonly number[]): Array<{ x: number; y: number }> {
	const edges: Array<{ x: number; y: number }> = [];
	for (const index of region) {
		const x = index % grid.w;
		const y = Math.floor(index / grid.w);
		if (
			gridGet(grid, x - 1, y) === 0 ||
			gridGet(grid, x + 1, y) === 0 ||
			gridGet(grid, x, y - 1) === 0 ||
			gridGet(grid, x, y + 1) === 0
		) {
			edges.push({ x, y });
		}
	}
	// Bound the pairwise search: a 96² grid can yield a thousand edge cells per region, and the stitch
	// only needs a representative sample of the perimeter to find a near-shortest crossing.
	if (edges.length <= 256) return edges;
	const stride = Math.ceil(edges.length / 256);
	return edges.filter((_, i) => i % stride === 0);
}

/**
 * Dissolve checkerboard pinches: two floor cells touching only at a corner. They are a lie in both
 * directions — a 4-connected flood fill calls them disconnected while marching squares draws them as
 * joined by a zero-width pinch, so whichever answer you trust, the other one is wrong. Opening one of
 * the two rock cells makes the raster and the vector agree.
 */
function dissolveDiagonalPinches(grid: CellGrid): void {
	for (let pass = 0; pass < 2; pass += 1) {
		for (let y = 0; y < grid.h - 1; y += 1) {
			for (let x = 0; x < grid.w - 1; x += 1) {
				const a = gridGet(grid, x, y);
				const b = gridGet(grid, x + 1, y);
				const c = gridGet(grid, x, y + 1);
				const d = gridGet(grid, x + 1, y + 1);
				if (a === 1 && d === 1 && b === 0 && c === 0 && inPlayableArea(grid, x + 1, y)) {
					gridSet(grid, x + 1, y, 1);
				} else if (b === 1 && c === 1 && a === 0 && d === 0 && inPlayableArea(grid, x, y)) {
					gridSet(grid, x, y, 1);
				}
			}
		}
	}
}

function keepOnlyRegion(grid: CellGrid, keep: readonly number[]): void {
	const survivors = new Set(keep);
	for (let i = 0; i < grid.cells.length; i += 1) {
		if (grid.cells[i] === 1 && !survivors.has(i)) grid.cells[i] = 0;
	}
}

/** Sort regions largest-first, tie-broken by their lowest cell index. Explicit and total: a comparator
 *  that leaned on the flood-fill's emission order would make the output depend on an implementation
 *  detail of another module. */
function sortRegions(regions: number[][]): number[][] {
	return [...regions].sort((a, b) => {
		if (b.length !== a.length) return b.length - a.length;
		return (a[0] ?? 0) - (b[0] ?? 0);
	});
}

function runCellular(ctx: GeneratorContext): GeneratorOutput {
	const openness = numberParam(ctx.params, 'openness');
	const smoothing = numberParam(ctx.params, 'smoothing');
	const chamberSize = numberParam(ctx.params, 'chamberSize');
	const keepPillars = boolParam(ctx.params, 'pillars');
	const birth = numberParam(ctx.params, 'birthThreshold');
	const survival = numberParam(ctx.params, 'survivalThreshold');
	const resolution = numberParam(ctx.params, 'resolution');
	const contourSmoothing = numberParam(ctx.params, 'contourSmoothing');
	const connectStrategy = stringParam(ctx.params, 'connect');
	const stitchWidth = numberParam(ctx.params, 'stitchWidth');

	const rng = ctx.rng.stream('cave');
	const stitchRng = ctx.rng.stream('stitch');
	const nameRng = ctx.rng.stream('names');

	// "Openness" is the knob a GM turns; `fillProbability` is the knob the algorithm has. They point in
	// OPPOSITE directions (more initial rock ⇒ a tighter cave), so the mapping is inverted here, once,
	// rather than being pushed onto the user as a slider that gets emptier as you drag it right.
	// The 0.40–0.50 band is the whole usable range of the 4-5 rule: below it the cave is one open blob,
	// above it the rock never breaks open.
	const fillProbability = 0.5 - openness * 0.1;

	let grid = createGrid(resolution, resolution, 0);
	for (let y = 0; y < resolution; y += 1) {
		for (let x = 0; x < resolution; x += 1) {
			// Draw for EVERY cell, border included, so the PRNG call order is a function of the grid size
			// alone and never of the border thickness.
			const open = rng.next() >= fillProbability;
			if (!inPlayableArea(grid, x, y)) continue;
			gridSet(grid, x, y, open ? 1 : 0);
		}
	}

	for (let i = 0; i < smoothing; i += 1) {
		grid = cellularStep(grid, birth, survival);
	}

	const totalCells = resolution * resolution;
	const minRegionCells = Math.max(6, Math.round((chamberSize / 100) * totalCells));

	let regions = sortRegions(floodRegions(grid, 1));
	if (regions.length === 0) {
		// Every cell closed up. Fail soft with an empty (but well-formed) result rather than throwing:
		// a generator that throws on a legal param set is a generator the UI cannot preview.
		return {
			layers: [buildLayer(ctx, 'cave-floor', 'Cave Floor', 'base', [], 0)],
			summary: 'No cave — the rock never opened. Raise Cave openness or Smoothing.',
		};
	}

	// Cull the specks first, so the stitch pass is not asked to run a corridor out to a four-cell hole.
	const doomed = regions.filter((r) => r.length < minRegionCells);
	if (doomed.length < regions.length) {
		for (const region of doomed) {
			for (const index of region) grid.cells[index] = 0;
		}
		regions = regions.filter((r) => r.length >= minRegionCells);
	} else {
		regions = [regions[0] as number[]]; // everything is below the floor: keep the biggest anyway
	}

	let stitched = 0;
	if (connectStrategy === 'largest' || regions.length === 1) {
		keepOnlyRegion(grid, regions[0] as number[]);
	} else {
		// Two-pass accessibility: grow the main region outward, each time bridging to whichever surviving
		// pocket is currently closest to it. Every bridge merges one region, so the loop terminates in
		// exactly `regions.length - 1` steps and ends with a single component.
		let mainEdges = edgeCells(grid, regions[0] as number[]);
		const pending = regions.slice(1).map((region) => ({ region, edges: edgeCells(grid, region) }));
		while (pending.length > 0) {
			let bestIndex = 0;
			let bestFrom: { x: number; y: number } | null = null;
			let bestTo: { x: number; y: number } | null = null;
			let bestDistance = Infinity;
			for (let i = 0; i < pending.length; i += 1) {
				const candidate = pending[i] as {
					region: number[];
					edges: Array<{ x: number; y: number }>;
				};
				for (const from of mainEdges) {
					for (const to of candidate.edges) {
						const d = dist2(from, to);
						if (d < bestDistance) {
							bestDistance = d;
							bestIndex = i;
							bestFrom = from;
							bestTo = to;
						}
					}
				}
			}
			const chosen = pending.splice(bestIndex, 1)[0] as {
				region: number[];
				edges: Array<{ x: number; y: number }>;
			};
			if (bestFrom && bestTo) {
				carveDrunkenTunnel(grid, bestFrom, bestTo, stitchWidth / 2, stitchRng);
				stitched += 1;
			}
			mainEdges = mainEdges.concat(chosen.edges);
		}
	}

	// Pillars. Any rock region that does not touch the border is a free-standing column; the tiny ones are
	// speckle noise rather than architecture, so they dissolve regardless of what the user asked for.
	const minPillarCells = Math.max(4, Math.round(minRegionCells * 0.3));
	const rockRegions = floodRegions(grid, 0);
	let pillarCount = 0;
	for (const region of rockRegions) {
		let touchesBorder = false;
		for (const index of region) {
			const x = index % grid.w;
			const y = Math.floor(index / grid.w);
			if (!inPlayableArea(grid, x, y)) {
				touchesBorder = true;
				break;
			}
		}
		if (touchesBorder) continue;
		if (!keepPillars || region.length < minPillarCells) {
			for (const index of region) grid.cells[index] = 1;
		} else {
			pillarCount += 1;
		}
	}

	dissolveDiagonalPinches(grid);

	// Dissolving pillars and pinches only ADDS floor, so it can merge components but never split one.
	// The re-check is therefore belt-and-braces — but it is what turns "one connected region" from a
	// property of the happy path into a property of the output.
	const finalRegions = sortRegions(floodRegions(grid, 1));
	if (finalRegions.length > 1) keepOnlyRegion(grid, finalRegions[0] as number[]);

	const rings = contourGrid(grid, {
		interpolate: true,
		simplifyEpsilon: 0.75,
		smoothIterations: contourSmoothing,
		minRingArea: 6,
	});
	const { outer, holes } = splitRings(rings);

	const floorFeatures = polygonFeatures(ctx, outer, 'cave-floor', 'cave:floor');
	// A pillar is a HOLE in the floor, and a MapFeature is a single ring with no hole list — so a pillar
	// emitted onto the base layer would read as more floor and the wall derivation would union it in.
	// It ships instead as rock dressing on the terrain layer, flagged `hole` for anything that can use it.
	const pillarFeatures = polygonFeatures(ctx, holes, 'cave-pillar', 'cave:pillar', { hole: true });

	const layers: MapLayer[] = [
		buildLayer(ctx, 'cave-floor', 'Cave Floor', 'base', floorFeatures, 0),
	];
	if (pillarFeatures.length > 0) {
		layers.push(buildLayer(ctx, 'cave-pillars', 'Cave Pillars', 'terrain', pillarFeatures, 1));
	}

	const pois: GeneratedPoi[] = [];
	const name = caveName(nameRng);
	const mainRing = outer[0];
	if (mainRing && mainRing.length >= 3) {
		let cx = 0;
		let cy = 0;
		for (const p of mainRing) {
			cx += p.x;
			cy += p.y;
		}
		cx /= mainRing.length;
		cy /= mainRing.length;
		pois.push({
			id: `${ctx.idPrefix}-poi-cave`,
			label: name,
			category: 'dungeon',
			position: { x: clamp01(cx), y: clamp01(cy) },
			notes: 'Cellular cavern. The chamber system is a single connected space.',
		});
		// The mouth is the floor vertex closest to the map edge — the natural place a party walks in.
		let mouth = mainRing[0] as Point;
		let bestEdgeDistance = Infinity;
		for (const p of mainRing) {
			const d = Math.min(p.x, p.y, 1 - p.x, 1 - p.y);
			if (d < bestEdgeDistance) {
				bestEdgeDistance = d;
				mouth = p;
			}
		}
		pois.push({
			id: `${ctx.idPrefix}-poi-mouth`,
			label: `Mouth of the ${name}`,
			category: 'landmark',
			position: { x: clamp01(mouth.x), y: clamp01(mouth.y) },
			notes: 'The cave entrance: the point of the cavern wall nearest the surface.',
		});
	}

	const area = floorSquareFeet(outer, holes);
	const parts = [
		'1 chamber system',
		`${groupThousands(area)} sq ft`,
		stitched > 0 ? `${stitched} side pocket${stitched === 1 ? '' : 's'}` : null,
		pillarCount > 0 ? `${pillarCount} pillar${pillarCount === 1 ? '' : 's'}` : null,
	].filter((part): part is string => part !== null);

	return { layers, pois, summary: parts.join(' · ') };
}

export const caveCellularGenerator: GeneratorDefinition = {
	id: 'cave.cellular',
	group: 'cave',
	scale: 'battle',
	label: 'Natural cavern',
	description:
		'A blobby, organic cavern grown with cellular automata, then flood-filled so the whole cave is one walkable space.',
	bestFor:
		'Rounded natural caves with wide chambers and rock pillars. Reach for cave.tunnels instead when you want narrow, winding passages.',
	version: 1,
	params: [
		{
			kind: 'number',
			id: 'openness',
			label: 'Cave openness',
			help: 'Left: cramped rock with narrow crawls. Right: broad, airy chambers.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.5,
		},
		{
			kind: 'int',
			id: 'smoothing',
			label: 'Smoothing',
			help: 'How many times the rock is allowed to settle. Low is jagged and speckled, high is rounded and clean.',
			min: 1,
			max: 8,
			step: 1,
			default: 4,
		},
		{
			kind: 'number',
			id: 'chamberSize',
			label: 'Smallest chamber',
			help: 'Pockets smaller than this are rubble, not rooms — they get filled in. Given as a share of the map.',
			min: 0.1,
			max: 8,
			step: 0.1,
			default: 1.2,
			unit: '%',
		},
		{
			kind: 'boolean',
			id: 'pillars',
			label: 'Rock pillars',
			help: 'Keep free-standing columns of rock inside the chambers. Great cover; turn off for clean open floor.',
			default: true,
		},
		{
			kind: 'select',
			id: 'connect',
			label: 'Stray pockets',
			help: 'What to do with caves that ended up sealed off from the main system.',
			options: [
				{
					value: 'stitch',
					label: 'Tunnel to them',
					help: 'Carve a winding crawlway through to each one. More cave, more to explore.',
				},
				{
					value: 'largest',
					label: 'Discard them',
					help: 'Keep only the biggest cavern. Tighter, more compact result.',
				},
			],
			default: 'stitch',
		},
		{
			kind: 'int',
			id: 'birthThreshold',
			label: 'Rock birth threshold',
			help: 'Open floor turns to rock when it has at least this many rock neighbours. 5 is the classic rule.',
			min: 3,
			max: 6,
			step: 1,
			default: 5,
			advanced: true,
			group: 'Rock rules',
		},
		{
			kind: 'int',
			id: 'survivalThreshold',
			label: 'Rock survival threshold',
			help: 'Rock survives when it has at least this many rock neighbours. 4 is the classic rule.',
			min: 2,
			max: 6,
			step: 1,
			default: 4,
			advanced: true,
			group: 'Rock rules',
		},
		{
			kind: 'int',
			id: 'resolution',
			label: 'Detail',
			help: 'Working grid size. Higher gives finer rock detail and more vertices in the result.',
			min: 48,
			max: 192,
			step: 8,
			default: 96,
			advanced: true,
			group: 'Detail',
		},
		{
			kind: 'int',
			id: 'contourSmoothing',
			label: 'Wall smoothing',
			help: 'Corner-rounding passes on the cave outline. 0 is crisp and blocky, 3 is soft and water-worn.',
			min: 0,
			max: 4,
			step: 1,
			default: 2,
			advanced: true,
			group: 'Detail',
		},
		{
			kind: 'number',
			id: 'stitchWidth',
			label: 'Crawlway width',
			help: 'How wide the tunnels dug out to stray pockets are.',
			min: 1,
			max: 6,
			step: 0.5,
			default: 3,
			advanced: true,
			group: 'Detail',
		},
	],
	presets: [
		{
			id: 'vast-cavern',
			label: 'Vast cavern',
			description: 'One enormous open hall, smooth-walled, studded with columns.',
			values: {
				openness: 0.9,
				smoothing: 6,
				chamberSize: 2.5,
				pillars: true,
				connect: 'stitch',
				contourSmoothing: 3,
			},
		},
		{
			id: 'tight-warren',
			label: 'Tight warren',
			description: 'Cramped, twisting rock with barely room to swing a sword.',
			values: {
				openness: 0.1,
				smoothing: 3,
				chamberSize: 0.4,
				pillars: true,
				connect: 'stitch',
				stitchWidth: 2,
				contourSmoothing: 1,
			},
		},
		{
			id: 'flooded-grotto',
			label: 'Flooded grotto',
			description: 'Wide, water-worn chambers with soft, rounded walls and no clutter.',
			values: {
				openness: 0.75,
				smoothing: 7,
				chamberSize: 3,
				pillars: false,
				connect: 'stitch',
				contourSmoothing: 4,
				stitchWidth: 4,
			},
		},
		{
			id: 'pillared-hall',
			label: 'Pillared hall',
			description: 'An open floor broken up by a forest of stone columns.',
			values: {
				openness: 0.85,
				smoothing: 3,
				chamberSize: 2,
				pillars: true,
				birthThreshold: 5,
				survivalThreshold: 5,
				contourSmoothing: 2,
			},
		},
		{
			id: 'crumbling-sinkhole',
			label: 'Crumbling sinkhole',
			description: 'A single collapsed chamber; the side caves have all caved in.',
			values: {
				openness: 0.6,
				smoothing: 5,
				chamberSize: 4,
				pillars: true,
				connect: 'largest',
				contourSmoothing: 2,
			},
		},
	],
	run: runCellular,
};

// ---------------------------------------------------------------------------------------------------
// cave.tunnels — a pure-vector drunkard's walk
// ---------------------------------------------------------------------------------------------------

/** How far a walker may turn in one step when it loses its momentum. ~126°: enough to double back on
 *  itself, which is what makes a drunkard's walk sinuous rather than merely noisy. */
const MAX_TURN = 2.2;

const COVERAGE_RESOLUTION = 128;

/** How often, in steps, a digger stops to look at how much of the map is already floor. */
const COVERAGE_CHECK_INTERVAL = 24;

/** Hard cap on walkers, so a coverage target the walk cannot physically reach terminates anyway. */
const MAX_WALKERS = 64;

/** Coverage is accumulated into ONE grid across the whole dig. Re-burning every path after every walker
 *  is O(walkers²) work for an answer that only ever grows — and with a coverage target the walk cannot
 *  reach, it is O(walkers²) work done sixty-four times. */
function accumulateCoverage(grid: CellGrid, path: readonly Point[], width: number): number {
	if (path.length >= 2) rasterizePolyline(grid, path, width, 1);
	return gridCount(grid, 1) / (grid.w * grid.h);
}

/**
 * Walk one drunkard. The trail is kept as a POLYLINE — the walker never touches a cell — so the tunnel
 * that comes out the far end is a smooth curve rather than a staircase that has to be re-vectorized.
 * Momentum (`inertia`) is the whole character dial: at 1 the walker bores straight lava tubes, at 0.1 it
 * staggers into a knotted warren.
 */
function walkDrunkard(
	rng: SeededRng,
	start: Point,
	heading: number,
	steps: number,
	stepLength: number,
	inertia: number,
	margin: number,
	/** Called with each newly-dug stretch. Return true to down tools. Checked mid-walk, not just between
	 *  walkers, or a single long-lived digger blows straight past the coverage target it was given. */
	onProgress: (segment: readonly Point[]) => boolean,
): Point[] {
	const path: Point[] = [start];
	let x = start.x;
	let y = start.y;
	let angle = heading;
	let reported = 0;
	const lo = margin;
	const hi = 1 - margin;
	for (let i = 0; i < steps; i += 1) {
		if (!rng.chance(inertia)) angle += (rng.next() * 2 - 1) * MAX_TURN;
		let nx = x + Math.cos(angle) * stepLength;
		let ny = y + Math.sin(angle) * stepLength;
		// Reflect off the margin rather than clamping: a clamped walker smears along the boundary and
		// leaves a dead-straight tunnel down the edge of the map, which reads as a wall, not a cave.
		if (nx < lo || nx > hi) {
			angle = Math.PI - angle;
			nx = x + Math.cos(angle) * stepLength;
			ny = y + Math.sin(angle) * stepLength;
		}
		if (ny < lo || ny > hi) {
			angle = -angle;
			nx = x + Math.cos(angle) * stepLength;
			ny = y + Math.sin(angle) * stepLength;
		}
		x = clamp(nx, lo, hi);
		y = clamp(ny, lo, hi);
		path.push({ x, y });
		if ((i + 1) % COVERAGE_CHECK_INTERVAL === 0) {
			// Hand over the stretch since the last check, with its first vertex shared, so the caller's
			// running coverage grid sees one continuous tunnel rather than a dotted line.
			if (onProgress(path.slice(reported))) return path;
			reported = path.length - 1;
		}
	}
	if (path.length - 1 > reported) onProgress(path.slice(reported));
	return path;
}

const CONNECT_RESOLUTION = 192;

/**
 * Force the tunnel network into one component — measured on the geometry that actually SHIPS, not on the
 * walkers' raw routes.
 *
 * The distinction is the whole point. The raw routes can be comfortably connected while the emitted cave
 * is not: Chaikin pulls the centreline off its corners, and the width field can pinch a passage to a
 * third of its nominal bore exactly where two branches were only just brushing past each other. Checking
 * the routes would therefore certify a cave that has a wall across it. So the check runs over the stroked
 * segments at their real radii, and any stray cluster is bridged with a connector run at full bore.
 */
function connectSegments(segments: TunnelSegment[], baseRadius: number): TunnelSegment[] {
	if (segments.length < 2) return segments;
	const resolution = CONNECT_RESOLUTION;
	const grid = createGrid(resolution, resolution, 0);
	for (const segment of segments) {
		rasterizePolyline(grid, [segment.a, segment.b], segment.radius * 2, 1);
	}
	const regions = sortRegions(floodRegions(grid, 1));
	if (regions.length <= 1) return segments;

	const label = new Int32Array(resolution * resolution).fill(-1);
	for (let r = 0; r < regions.length; r += 1) {
		for (const index of regions[r] as number[]) label[index] = r;
	}
	const regionOf = (p: Point): number => {
		const cx = clamp(Math.floor(p.x * resolution), 0, resolution - 1);
		const cy = clamp(Math.floor(p.y * resolution), 0, resolution - 1);
		for (let dy = -1; dy <= 1; dy += 1) {
			for (let dx = -1; dx <= 1; dx += 1) {
				const x = cx + dx;
				const y = cy + dy;
				if (x < 0 || y < 0 || x >= resolution || y >= resolution) continue;
				const found = label[y * resolution + x] as number;
				if (found >= 0) return found;
			}
		}
		return -1;
	};

	const buckets: Point[][] = regions.map(() => []);
	for (const segment of segments) {
		const region = regionOf(segment.a);
		if (region >= 0) (buckets[region] as Point[]).push(segment.a);
	}

	const connectors: TunnelSegment[] = [];
	const main: Point[] = [...(buckets[0] as Point[])];
	for (let r = 1; r < buckets.length; r += 1) {
		const bucket = buckets[r] as Point[];
		if (bucket.length === 0 || main.length === 0) continue;
		let bestFrom = main[0] as Point;
		let bestTo = bucket[0] as Point;
		let best = Infinity;
		for (const from of main) {
			for (const to of bucket) {
				const d = dist2(from, to);
				if (d < best) {
					best = d;
					bestFrom = from;
					bestTo = to;
				}
			}
		}
		connectors.push({ a: bestFrom, b: bestTo, radius: baseRadius });
		main.push(...bucket);
	}
	return [...segments, ...connectors];
}

function runTunnels(ctx: GeneratorContext): GeneratorOutput {
	const coverage = numberParam(ctx.params, 'coverage') / 100;
	const wander = numberParam(ctx.params, 'wander');
	const widthFeet = numberParam(ctx.params, 'tunnelWidth');
	const walkerCount = numberParam(ctx.params, 'branches');
	const lifetime = numberParam(ctx.params, 'lifetime');
	const spawnMode = stringParam(ctx.params, 'spawnMode');
	const stepFeet = numberParam(ctx.params, 'stepLength');
	const widthVariation = numberParam(ctx.params, 'widthVariation');
	const pathSmoothing = numberParam(ctx.params, 'pathSmoothing');

	const rng = ctx.rng.stream('tunnels');
	const widthRng = ctx.rng.stream('width');
	const nameRng = ctx.rng.stream('names');

	// "Wandering" is the knob; momentum is the mechanism, and it runs backwards (high momentum ⇒ straight
	// tunnels ⇒ LESS wander). Inverted here so the slider does what its label says.
	const inertia = clamp(1 - wander * 0.92, 0.05, 1);
	const baseRadius = widthFeet / NOMINAL_MAP_FEET / 2;
	const stepLength = Math.max(stepFeet / NOMINAL_MAP_FEET, baseRadius * 0.5);
	const maxRadius = baseRadius * (1 + widthVariation * 0.6);
	// The margin is budgeted against the WIDEST tunnel this width could ever swell to, not the widest it
	// actually will. Sizing it to the real maximum would make the walkers' reflection boundary — and so
	// their entire route — a function of `widthVariation`, quietly coupling two subsystems that have no
	// business knowing about each other: widening the passages would re-dig the cave.
	const margin = baseRadius * 1.6 + 0.006;

	const coverGrid = createGrid(COVERAGE_RESOLUTION, COVERAGE_RESOLUTION, 0);
	const paths: Point[][] = [];
	let covered = 0;
	let spawned = 0;
	while (covered < coverage && spawned < MAX_WALKERS) {
		for (let i = 0; i < walkerCount && covered < coverage && spawned < MAX_WALKERS; i += 1) {
			let start: Point;
			if (paths.length === 0) {
				start = spawnMode === 'random' ? randomPoint(rng, margin) : { x: 0.5, y: 0.5 };
			} else if (spawnMode === 'center') {
				start = { x: 0.5, y: 0.5 };
			} else if (spawnMode === 'random') {
				start = randomPoint(rng, margin);
			} else {
				// on-existing-floor: every later walker starts ON a tunnel that already exists, which is what
				// makes the whole network one component without a repair pass.
				const host = rng.pick(paths);
				start = rng.pick(host);
			}
			const heading = rng.next() * Math.PI * 2;
			const path = walkDrunkard(
				rng,
				start,
				heading,
				lifetime,
				stepLength,
				inertia,
				margin,
				(segment) => {
					covered = accumulateCoverage(coverGrid, segment, baseRadius * 2);
					return covered >= coverage;
				},
			);
			paths.push(path);
			spawned += 1;
		}
	}

	// Width variation comes from a NOISE field rather than per-vertex jitter: jitter gives a lumpy sausage,
	// a coherent field gives passages that swell into chambers and pinch into crawlways over a distance.
	const widthField = fbm(createValueNoise(noiseSeed(widthRng)), { octaves: 2, frequency: 3.5 });

	// One capsule per SEGMENT, not per run of segments. A capsule stroked along a multi-vertex polyline
	// self-intersects wherever the path turns tighter than the offset radius — and the even-odd fill of a
	// self-intersecting ring pinches to zero width at the crossing, which is a wall through the middle of
	// a tunnel that the vector geometry insists isn't there. A two-point capsule is convex and cannot do
	// this; consecutive capsules share an endpoint, so their end discs always overlap and the chain is
	// connected at any resolution.
	// Vertices are spaced at least a radius apart for the same reason: it keeps the discs meaningful.
	const spacing = Math.max(stepLength, baseRadius * 1.2);
	const segments: TunnelSegment[] = [];
	for (const path of paths) {
		if (path.length < 2) continue;
		// Resample AFTER smoothing as well as before: Chaikin doubles the vertex count on every pass, so
		// smoothing an unresampled path would multiply the emitted polygon count by 16 without adding a
		// single square foot of cave.
		const smoothed = resample(chaikin(resample(path, stepLength), pathSmoothing, false), spacing);
		for (let i = 0; i + 1 < smoothed.length; i += 1) {
			const a = smoothed[i] as Point;
			const b = smoothed[i + 1] as Point;
			const wobble = clamp(widthField.at((a.x + b.x) / 2, (a.y + b.y) / 2), -1, 1);
			const radius = clamp(
				baseRadius * (1 + widthVariation * 0.6 * wobble),
				baseRadius * 0.35,
				maxRadius,
			);
			segments.push({ a, b, radius });
		}
	}

	const connected = connectSegments(segments, baseRadius);
	const floorRings: Ring[] = [];
	for (const segment of connected) {
		const ring = offsetPolyline([segment.a, segment.b], segment.radius);
		if (ring.length >= 3) floorRings.push(ring);
	}

	const floorFeatures = polygonFeatures(ctx, floorRings, 'tunnel', 'cave:floor');
	const layers: MapLayer[] = [
		buildLayer(ctx, 'cave-floor', 'Tunnel Floor', 'base', floorFeatures, 0),
	];

	const pois: GeneratedPoi[] = [];
	const name = caveName(nameRng);
	const first = paths[0];
	if (first && first.length > 0) {
		const entrance = first[0] as Point;
		pois.push({
			id: `${ctx.idPrefix}-poi-entrance`,
			label: `Mouth of the ${name}`,
			category: 'landmark',
			position: { x: clamp01(entrance.x), y: clamp01(entrance.y) },
			notes: 'Where the first passage was bored. The natural way in.',
		});
		// The deepest point is the one furthest from the entrance along the walk — the end of the road, and
		// therefore the only place in a tunnel system that a party cannot be flanked.
		let deepest = entrance;
		let best = -1;
		for (const path of paths) {
			for (const p of path) {
				const d = dist2(entrance, p);
				if (d > best) {
					best = d;
					deepest = p;
				}
			}
		}
		pois.push({
			id: `${ctx.idPrefix}-poi-deep`,
			label: `The Deep End`,
			category: 'dungeon',
			position: { x: clamp01(deepest.x), y: clamp01(deepest.y) },
			notes: 'The furthest point from the mouth: a dead end, and the natural lair.',
		});
	}

	const area = floorSquareFeet(floorRings, []);
	const summary = [
		`${paths.length} tunnel branch${paths.length === 1 ? '' : 'es'}`,
		`${groupThousands(area)} sq ft`,
		`${Math.round(covered * 100)}% floor`,
	].join(' · ');

	return { layers, pois, summary };
}

function randomPoint(rng: SeededRng, margin: number): Point {
	const span = 1 - margin * 2;
	return { x: margin + rng.next() * span, y: margin + rng.next() * span };
}

export const caveTunnelsGenerator: GeneratorDefinition = {
	id: 'cave.tunnels',
	group: 'cave',
	scale: 'battle',
	label: 'Tunnel system',
	description:
		"A winding warren bored out by drunken walkers. Connected by construction — a walker's trail is always one piece.",
	bestFor:
		'Sinuous, narrow passages: worm burrows, lava tubes, mine workings. Use cave.cellular when you want big open chambers instead.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'coverage',
			label: 'Tunnel coverage',
			help: 'How much of the map ends up as floor. Low is a lonely passage; high is a honeycombed undercave.',
			min: 10,
			max: 60,
			step: 1,
			default: 32,
			unit: '%',
		},
		{
			kind: 'number',
			id: 'wander',
			label: 'Wandering',
			help: 'Low bores straight, purposeful runs. High staggers and doubles back into a knot.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.6,
		},
		{
			kind: 'int',
			id: 'tunnelWidth',
			label: 'Tunnel width',
			help: 'How wide a passage is at its typical point. 5 ft is a crawl; 20 ft is a gallery.',
			min: 5,
			max: 24,
			step: 1,
			default: 9,
			unit: 'ft',
		},
		{
			kind: 'int',
			id: 'branches',
			label: 'Branches',
			help: 'How many diggers are at work. More diggers means more forks and side passages.',
			min: 1,
			max: 8,
			step: 1,
			default: 3,
		},
		{
			kind: 'number',
			id: 'widthVariation',
			label: 'Chambers & crawls',
			help: 'How much a passage swells and pinches along its length. 0 is a uniform pipe.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.4,
		},
		{
			kind: 'int',
			id: 'lifetime',
			label: 'Digger stamina',
			help: 'Steps one digger takes before the next takes over. Long: one snaking passage. Short: many local pockets.',
			min: 40,
			max: 600,
			step: 10,
			default: 200,
			advanced: true,
			group: 'Diggers',
		},
		{
			kind: 'select',
			id: 'spawnMode',
			label: 'Where diggers start',
			help: 'Starting on existing floor is what keeps every branch reachable from every other.',
			options: [
				{
					value: 'existing',
					label: 'On existing tunnel',
					help: 'Guarantees one connected system.',
				},
				{ value: 'center', label: 'At the centre', help: 'A radial, spider-shaped network.' },
				{
					value: 'random',
					label: 'Anywhere',
					help: 'Scattered pockets, joined afterwards by connecting shafts.',
				},
			],
			default: 'existing',
			advanced: true,
			group: 'Diggers',
		},
		{
			kind: 'number',
			id: 'stepLength',
			label: 'Stride',
			help: 'Distance a digger covers per step. Shorter strides give tighter, more detailed curves.',
			min: 1,
			max: 12,
			step: 0.5,
			default: 3,
			unit: 'ft',
			advanced: true,
			group: 'Diggers',
		},
		{
			kind: 'int',
			id: 'pathSmoothing',
			label: 'Wall smoothing',
			help: 'Corner-rounding passes on the passage centreline. 0 keeps the raw stagger of the walk.',
			min: 0,
			max: 4,
			step: 1,
			default: 2,
			advanced: true,
			group: 'Detail',
		},
	],
	presets: [
		{
			id: 'volcanic-tube',
			label: 'Volcanic tube',
			description: 'One long, wide, near-straight lava tube with barely a bend in it.',
			values: {
				coverage: 20,
				wander: 0.15,
				tunnelWidth: 16,
				branches: 1,
				widthVariation: 0.25,
				lifetime: 500,
				pathSmoothing: 3,
			},
		},
		{
			id: 'twisting-warren',
			label: 'Twisting warren',
			description: 'Cramped, knotted crawlways that fold back on themselves.',
			values: {
				coverage: 30,
				wander: 0.95,
				tunnelWidth: 6,
				branches: 4,
				widthVariation: 0.5,
				lifetime: 160,
			},
		},
		{
			id: 'sprawling-undercave',
			label: 'Sprawling undercave',
			description: 'A honeycombed system of passages that swell into chambers.',
			values: {
				coverage: 50,
				wander: 0.6,
				tunnelWidth: 12,
				branches: 6,
				widthVariation: 0.7,
				lifetime: 240,
			},
		},
		{
			id: 'flooded-siphon',
			label: 'Flooded siphon',
			description: 'A single sinuous water-carved passage, smooth-walled and pinching.',
			values: {
				coverage: 22,
				wander: 0.75,
				tunnelWidth: 10,
				branches: 1,
				widthVariation: 0.8,
				lifetime: 600,
				pathSmoothing: 4,
			},
		},
		{
			id: 'goblin-burrow',
			label: 'Goblin burrow',
			description: 'A dense mess of narrow tunnels dug by too many hands at once.',
			values: {
				coverage: 40,
				wander: 0.8,
				tunnelWidth: 5,
				branches: 8,
				widthVariation: 0.3,
				lifetime: 120,
				stepLength: 2,
			},
		},
	],
	run: runTunnels,
};

// ---------------------------------------------------------------------------------------------------
// cave.maze — growing-tree labyrinth
// ---------------------------------------------------------------------------------------------------

function runMaze(ctx: GeneratorContext): GeneratorOutput {
	const cellSize = numberParam(ctx.params, 'cellSize');
	const wander = numberParam(ctx.params, 'wander');
	const braiding = numberParam(ctx.params, 'braiding') / 100;
	const wallThickness = numberParam(ctx.params, 'wallThickness');

	const rng = ctx.rng.stream('maze');
	const nameRng = ctx.rng.stream('names');

	const cols = clamp(Math.round(1 / cellSize), 4, 40);
	const rows = cols;

	// Solve the margin against the corridor radius rather than exposing both: a corridor wider than the
	// margin would push geometry outside the unit square, which is unrenderable and unpersistable.
	const provisionalPitch = 1 / cols;
	const margin = (provisionalPitch * (1 - wallThickness)) / 2 + 0.01;
	const pitch = (1 - margin * 2) / cols;
	const radius = (pitch * (1 - wallThickness)) / 2;

	const cellCount = cols * rows;
	const centerOf = (cell: number): Point => ({
		x: margin + ((cell % cols) + 0.5) * pitch,
		y: margin + (Math.floor(cell / cols) + 0.5) * pitch,
	});
	const neighboursOf = (cell: number): number[] => {
		const cx = cell % cols;
		const cy = Math.floor(cell / cols);
		const out: number[] = [];
		// Fixed order (N, E, S, W). The set a `pick` draws from must have a defined order, or the draw is
		// only as deterministic as the container's iteration order.
		if (cy > 0) out.push(cell - cols);
		if (cx < cols - 1) out.push(cell + 1);
		if (cy < rows - 1) out.push(cell + cols);
		if (cx > 0) out.push(cell - 1);
		return out;
	};

	// Growing tree. The bias between "take the newest cell" and "take a random one" is the entire
	// character of the maze: newest is a recursive backtracker (long, snaking, few junctions); random is
	// Prim-like (short, bushy, junction-heavy). Everything in between is a real, usable maze.
	const visited = new Uint8Array(cellCount);
	const edges: Array<[number, number]> = [];
	const start = rng.nextInt(0, cellCount - 1);
	visited[start] = 1;
	const active: number[] = [start];
	while (active.length > 0) {
		const index = rng.chance(wander) ? active.length - 1 : rng.nextInt(0, active.length - 1);
		const cell = active[index] as number;
		const options = neighboursOf(cell).filter((n) => visited[n] === 0);
		if (options.length === 0) {
			active.splice(index, 1);
			continue;
		}
		const next = rng.pick(options);
		visited[next] = 1;
		edges.push([cell, next]);
		active.push(next);
	}

	// Braiding: knock a hole in the back of a dead end so it loops back into the maze. A perfect maze has
	// exactly one route between any two points, which is a *puzzle*; a braided one has choices, which is
	// a *place*. Dead ends are visited in ascending index order — an unordered pass would draw from the
	// RNG in a container-dependent order.
	const linked = new Set<string>();
	const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
	const degree = new Int32Array(cellCount);
	for (const [a, b] of edges) {
		degree[a] = (degree[a] as number) + 1;
		degree[b] = (degree[b] as number) + 1;
		linked.add(key(a, b));
	}
	let loops = 0;
	for (let cell = 0; cell < cellCount; cell += 1) {
		if (degree[cell] !== 1) continue;
		if (!rng.chance(braiding)) continue;
		const options = neighboursOf(cell).filter((n) => !linked.has(key(cell, n)));
		if (options.length === 0) continue;
		const next = rng.pick(options);
		edges.push([cell, next]);
		linked.add(key(cell, next));
		loops += 1;
	}

	// Every corridor is a capsule laid down the segment between two cell centres. Adjacent corridors share
	// a centre, so their capsules always overlap: the floor is one connected region for the same reason a
	// spanning tree is one component.
	const floorRings: Ring[] = [];
	for (const [a, b] of edges) {
		const ring = offsetPolyline([centerOf(a), centerOf(b)], radius);
		if (ring.length >= 3) floorRings.push(ring);
	}

	const floorFeatures = polygonFeatures(ctx, floorRings, 'maze', 'cave:floor');
	const layers: MapLayer[] = [
		buildLayer(ctx, 'cave-floor', 'Maze Floor', 'base', floorFeatures, 0),
	];

	// Depth from the entrance: the deepest cell is the heart of the labyrinth, and it is where the thing
	// the maze exists to protect belongs.
	const adjacency: number[][] = Array.from({ length: cellCount }, () => []);
	for (const [a, b] of edges) {
		(adjacency[a] as number[]).push(b);
		(adjacency[b] as number[]).push(a);
	}
	const entrance = 0;
	const depth = new Int32Array(cellCount).fill(-1);
	depth[entrance] = 0;
	const queue: number[] = [entrance];
	let deepest = entrance;
	for (let head = 0; head < queue.length; head += 1) {
		const cell = queue[head] as number;
		if ((depth[cell] as number) > (depth[deepest] as number)) deepest = cell;
		for (const next of adjacency[cell] as number[]) {
			if (depth[next] !== -1) continue;
			depth[next] = (depth[cell] as number) + 1;
			queue.push(next);
		}
	}

	const name = caveName(nameRng);
	const pois: GeneratedPoi[] = [
		{
			id: `${ctx.idPrefix}-poi-entrance`,
			label: `Entrance to the ${name}`,
			category: 'landmark',
			position: centerOf(entrance),
			notes: 'The way in, at the outer corner of the labyrinth.',
		},
		{
			id: `${ctx.idPrefix}-poi-heart`,
			label: `Heart of the ${name}`,
			category: 'dungeon',
			position: centerOf(deepest),
			notes: `The cell furthest from the entrance (${depth[deepest] as number} turns deep). Put the prize here.`,
		},
	];

	const area = floorSquareFeet(floorRings, []);
	const summary = [
		`${cols}×${rows} labyrinth`,
		`${groupThousands(area)} sq ft`,
		loops > 0 ? `${loops} loop${loops === 1 ? '' : 's'}` : 'perfect maze (no loops)',
	].join(' · ');

	return { layers, pois, summary };
}

export const caveMazeGenerator: GeneratorDefinition = {
	id: 'cave.maze',
	group: 'cave',
	scale: 'battle',
	label: 'Labyrinth',
	description:
		'A true maze grown cell by cell, from long snaking corridors to a bushy braided warren, with loops knocked through on request.',
	bestFor:
		'Hedge mazes, sewer grids, labyrinth levels — anywhere the geometry itself is the obstacle. Always fully walkable.',
	version: 1,
	params: [
		{
			kind: 'number',
			id: 'cellSize',
			label: 'Cell size',
			help: 'How big one cell of the maze is. Big cells make a short, chunky maze; small cells make a fiddly one.',
			min: 0.025,
			max: 0.2,
			step: 0.005,
			default: 0.055,
		},
		{
			kind: 'number',
			id: 'wander',
			label: 'Wander',
			help: 'High: long, snaking corridors with few junctions. Low: a bushy tangle of short branches.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.8,
		},
		{
			kind: 'int',
			id: 'braiding',
			label: 'Braiding',
			help: 'Share of dead ends broken open into loops. 0 is a perfect maze; 100 leaves nowhere to be cornered.',
			min: 0,
			max: 100,
			step: 5,
			default: 20,
			unit: '%',
		},
		{
			kind: 'number',
			id: 'wallThickness',
			label: 'Wall thickness',
			help: 'How much of each cell is wall rather than corridor. Thick walls give narrow, oppressive passages.',
			min: 0.15,
			max: 0.75,
			step: 0.05,
			default: 0.45,
		},
	],
	presets: [
		{
			id: 'ancient-labyrinth',
			label: 'Ancient labyrinth',
			description: 'Long, solemn stone corridors and only one way through.',
			values: { cellSize: 0.06, wander: 0.95, braiding: 0, wallThickness: 0.5 },
		},
		{
			id: 'hedge-maze',
			label: 'Hedge maze',
			description: 'Broad garden walks with the odd shortcut cut through the hedge.',
			values: { cellSize: 0.09, wander: 0.7, braiding: 30, wallThickness: 0.35 },
		},
		{
			id: 'sewer-grid',
			label: 'Sewer grid',
			description:
				'A bushy, looping network of narrow culverts. Everything connects to everything.',
			values: { cellSize: 0.05, wander: 0.15, braiding: 80, wallThickness: 0.55 },
		},
		{
			id: 'braided-catacomb',
			label: 'Braided catacomb',
			description: 'Winding burial passages with loops enough to lose a pursuer.',
			values: { cellSize: 0.04, wander: 0.85, braiding: 50, wallThickness: 0.45 },
		},
		{
			id: 'cramped-crawlspace',
			label: 'Cramped crawlspace',
			description: 'A fine, fiddly tangle of dead ends in a very small space.',
			values: { cellSize: 0.03, wander: 0.5, braiding: 5, wallThickness: 0.65 },
		},
	],
	run: runMaze,
};

export const CAVE_GENERATORS: readonly GeneratorDefinition[] = Object.freeze([
	caveCellularGenerator,
	caveTunnelsGenerator,
	caveMazeGenerator,
]);
