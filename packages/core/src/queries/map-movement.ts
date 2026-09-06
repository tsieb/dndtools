import type { ActorId } from '../state/ids';
import type { MapEntity, MapFeature, MapState } from '../state/map-state';
import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SessionCombatState } from '../state/combat-tracker';
import type { SystemPackage, SystemsState } from '../state/system-package';
import { evaluateFormula, type FormulaScope } from '../state/system-package';
import type { Point } from '../geometry';
import { pointInRing, segmentsIntersect } from '../geometry';
import type { TemplateCell, TemplateGrid } from '../geometry/template';
import { isTemplateGrid, templateCellCenter } from '../geometry/template';
import { actorCanSeeCombatant } from './combat-tracker-view';
import { mapVisibleToActor } from './map-visibility';

/**
 * RC-MAP-1.3 — MOVEMENT RANGE AND PATH: "how far can this creature get, and by which route?"
 *
 * This is a pure Dijkstra search over the map's grid cells. It answers the two questions a DM asks
 * every single turn — highlight where the creature may end up, and draw the cheapest way there —
 * from the map content that is ALREADY authored: the wall and door polylines the generator derived
 * (`generation/derive.ts`) and any feature marked `props.terrain = 'difficult'`.
 *
 * Three rules carry the whole module:
 *
 *   1. **Walls block EDGES, not cells.** A step is legal when the segment between the two cell
 *      CENTRES crosses no blocking feature. That is the same segment-soup model line-of-sight uses
 *      (`map-los.ts`), so a wall you cannot see through is a wall you cannot walk through — unless
 *      the author said otherwise, which is the next rule.
 *   2. **Sight and movement are DIFFERENT predicates.** A window (`blocksSight: false`) still stops
 *      a body; an OPEN door stops neither. Reusing `blocksSight` here would let creatures walk
 *      through glass, so movement gets its own {@link blocksMovement}, fail-closed on walls.
 *   3. **Difficult terrain doubles the cost of ENTERING a cell**, never of leaving it, so a route
 *      that clips one corner of a bog pays for one cell of bog and no more.
 *
 * The budget is in TABLE UNITS (feet), the same units `MapOverlaySettings.unitsPerCell` and the AoE
 * templates use, so a speed of 30 means 30 feet whatever the grid resolution is.
 *
 * NOT implemented, deliberately: the DMG's alternating-diagonal variant (every second diagonal costs
 * double). Its cost depends on how many diagonals a path has already spent, which is per-PATH state
 * a plain Dijkstra over cells cannot carry, and encoding the parity into the search would double the
 * node count for a variant most tables do not use. The PHB rule (every step costs one cell) is the
 * default; {@link MovementOptions.diagonals} can turn diagonal movement off entirely instead.
 *
 * Pure and deterministic: no RNG, no clock, no storage. Safe to recompute on every pointer move.
 */

// --- The model ------------------------------------------------------------------------------------

/** A cell in the movement grid. Square: column/row. Hex: pointy-top axial. Same as {@link TemplateCell}. */
export type MovementCell = TemplateCell;

/** How diagonal steps are treated on a SQUARE grid. Ignored on a hex grid, which has no diagonals. */
export type MovementDiagonalRule = 'phb' | 'orthogonal';

/** One reachable cell: what it costs to stand there, and which cell you came from to do it. */
export interface MovementReach {
	cell: MovementCell;
	/** Total cost from the origin, in TABLE UNITS. The origin itself costs 0. */
	cost: number;
	/** How many steps the cheapest route takes. Ties on cost break toward fewer steps. */
	steps: number;
	/** The previous cell on the cheapest route, or `null` for the origin. */
	from: MovementCell | null;
}

/** The result of a range search: every cell reachable within the budget, cheapest-first. */
export interface MovementRange {
	origin: MovementCell;
	/** The movement budget in table units this range was computed for. */
	budget: number;
	/** Table units per cell, carried so a caller can label distances without re-deriving them. */
	unitsPerCell: number;
	/**
	 * The reachable cells INCLUDING the origin, ordered by cost then by cell (row-major) so two
	 * devices computing the same range produce byte-identical output.
	 */
	cells: MovementReach[];
	/** True when the search hit {@link MAX_MOVEMENT_CELLS_SCANNED} and stopped early. */
	truncated: boolean;
}

/** What the search needs to know. All geometry is normalized (0..1); all costs are table units. */
export interface MovementInput {
	grid: TemplateGrid;
	/** Every feature that could block or slow movement. Order does not affect the result. */
	features: readonly MapFeature[];
	origin: MovementCell;
	/** The movement budget in TABLE UNITS (e.g. 30 feet). */
	budget: number;
	options?: MovementOptions;
}

export interface MovementOptions {
	diagonals?: MovementDiagonalRule;
	/** Multiplier applied when ENTERING a difficult cell. 5e says 2; a system may say otherwise. */
	difficultTerrainMultiplier?: number;
}

/**
 * The ceiling on cells the search will settle. A 60×60 battle map is 3,600 cells; a pathological
 * grid is a bad input, not a reason to lock the thread, so the search stops and says it stopped.
 */
export const MAX_MOVEMENT_CELLS_SCANNED = 20000;

/** 5e's difficult terrain: entering costs twice as much. */
export const DEFAULT_DIFFICULT_TERRAIN_MULTIPLIER = 2;

/** The feature prop that marks difficult terrain, and the value that turns it on. */
export const DIFFICULT_TERRAIN_PROP = 'terrain';
export const DIFFICULT_TERRAIN_VALUE = 'difficult';

const EMPTY_RANGE_CELLS: MovementReach[] = [];

// --- Feature predicates ---------------------------------------------------------------------------

/**
 * Whether a feature stops a body RIGHT NOW.
 *
 * `props.blocksMovement` is the explicit author override in both directions (the generator sets it
 * on every wall and door it derives). Everything else falls back to the kind: a wall blocks, a
 * closed or locked door blocks, an open door does not, and nothing else does — a road, a text label
 * or a light is not an obstacle. Fail-CLOSED on an unrecognized wall-ish feature.
 */
export function blocksMovement(feature: MapFeature): boolean {
	const declared = feature.props?.blocksMovement;
	if (declared === false) return false;
	if (declared === true) return true;
	if (feature.kind === 'door') return feature.props?.state !== 'open';
	return feature.kind === 'wall';
}

/** Whether a feature marks the ground it covers as difficult terrain. */
export function isDifficultTerrain(feature: MapFeature): boolean {
	return feature.props?.[DIFFICULT_TERRAIN_PROP] === DIFFICULT_TERRAIN_VALUE;
}

/** The centre of a cell in NORMALIZED (0..1) map space. Pure. */
export function movementCellCenter(grid: TemplateGrid, cell: MovementCell): Point {
	const extent = grid.size * grid.unitsPerCell;
	const center = templateCellCenter(grid, cell);
	return { x: center.x / extent, y: center.y / extent };
}

/**
 * The cell a normalized point falls in — how a token's `{x, y}` becomes a search origin.
 *
 * Square is exact. Hex inverts the axial layout approximately and then picks the nearest of the
 * candidate hex and its six neighbours, which is deterministic and always lands on the hex whose
 * centre is closest to the point.
 */
export function movementCellAt(grid: TemplateGrid, point: Point): MovementCell {
	if (grid.kind === 'square') {
		return { q: Math.floor(point.x * grid.size), r: Math.floor(point.y * grid.size) };
	}
	const extent = grid.size * grid.unitsPerCell;
	const radius = grid.unitsPerCell / Math.sqrt(3);
	const ux = point.x * extent;
	const uy = point.y * extent;
	const r = Math.round((uy - radius) / (1.5 * radius));
	const q = Math.round((ux - grid.unitsPerCell / 2) / grid.unitsPerCell - r / 2);
	let best: MovementCell = { q, r };
	let bestDistance = Infinity;
	for (const [dq, dr] of HEX_NEIGHBOURS_WITH_SELF) {
		const candidate: MovementCell = { q: q + dq, r: r + dr };
		const center = templateCellCenter(grid, candidate);
		const distance = (center.x - ux) ** 2 + (center.y - uy) ** 2;
		if (distance < bestDistance - 1e-12) {
			bestDistance = distance;
			best = candidate;
		}
	}
	return best;
}

const HEX_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = Object.freeze([
	[1, 0],
	[1, -1],
	[0, -1],
	[-1, 0],
	[-1, 1],
	[0, 1],
]);

const HEX_NEIGHBOURS_WITH_SELF: ReadonlyArray<readonly [number, number]> = Object.freeze([
	[0, 0],
	...HEX_NEIGHBOURS,
]);

const SQUARE_ORTHOGONAL: ReadonlyArray<readonly [number, number]> = Object.freeze([
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
]);

const SQUARE_PHB: ReadonlyArray<readonly [number, number]> = Object.freeze([
	...SQUARE_ORTHOGONAL,
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
]);

// --- The search -----------------------------------------------------------------------------------

/** A blocking edge, flattened from a wall polyline or a door span, in normalized space. */
interface Occluder {
	a: Point;
	b: Point;
}

/**
 * A uniform bucket index over the grid, so an edge test only examines the occluders near it.
 *
 * Without this, a 60×60 grid with a few hundred wall segments is millions of segment intersections
 * and the range visibly lags a drag. With it, each edge looks at a handful. The index is built once
 * per search and thrown away — nothing here is persisted.
 */
class OccluderIndex {
	private readonly buckets = new Map<number, number[]>();
	private readonly stamps: Int32Array;
	private stamp = 0;

	constructor(
		private readonly occluders: readonly Occluder[],
		private readonly size: number,
	) {
		this.stamps = new Int32Array(occluders.length);
		for (let i = 0; i < occluders.length; i += 1) {
			const o = occluders[i] as Occluder;
			const minX = this.bucketOf(Math.min(o.a.x, o.b.x)) - 1;
			const maxX = this.bucketOf(Math.max(o.a.x, o.b.x)) + 1;
			const minY = this.bucketOf(Math.min(o.a.y, o.b.y)) - 1;
			const maxY = this.bucketOf(Math.max(o.a.y, o.b.y)) + 1;
			for (let by = minY; by <= maxY; by += 1) {
				for (let bx = minX; bx <= maxX; bx += 1) {
					const key = by * (this.size + 4) + bx;
					const bucket = this.buckets.get(key);
					if (bucket) bucket.push(i);
					else this.buckets.set(key, [i]);
				}
			}
		}
	}

	private bucketOf(normalized: number): number {
		return Math.max(-1, Math.min(this.size, Math.floor(normalized * this.size)));
	}

	/** Whether the segment `a`→`b` crosses any blocking feature. */
	crosses(a: Point, b: Point): boolean {
		if (this.occluders.length === 0) return false;
		this.stamp += 1;
		const minX = this.bucketOf(Math.min(a.x, b.x));
		const maxX = this.bucketOf(Math.max(a.x, b.x));
		const minY = this.bucketOf(Math.min(a.y, b.y));
		const maxY = this.bucketOf(Math.max(a.y, b.y));
		for (let by = minY; by <= maxY; by += 1) {
			for (let bx = minX; bx <= maxX; bx += 1) {
				const bucket = this.buckets.get(by * (this.size + 4) + bx);
				if (!bucket) continue;
				for (const index of bucket) {
					if (this.stamps[index] === this.stamp) continue;
					this.stamps[index] = this.stamp;
					const o = this.occluders[index] as Occluder;
					if (segmentsIntersect(a, b, o.a, o.b)) return true;
				}
			}
		}
		return false;
	}
}

/** Flatten the movement-blocking features into a segment soup. */
function occludersOf(features: readonly MapFeature[]): Occluder[] {
	const occluders: Occluder[] = [];
	for (const feature of features) {
		if (!blocksMovement(feature)) continue;
		for (let i = 0; i + 1 < feature.points.length; i += 1) {
			const a = feature.points[i] as Point;
			const b = feature.points[i + 1] as Point;
			if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) continue;
			occluders.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
		}
	}
	return occluders;
}

/**
 * Whether a normalized point lies on a feature's ground.
 *
 * A two-point `fill`/`room` is the rectangle between its corners; anything with three or more points
 * is treated as a closed ring. A one-point marker covers no ground and so can never be terrain.
 */
function featureCoversPoint(feature: MapFeature, point: Point): boolean {
	const points = feature.points;
	if (points.length < 2) return false;
	if (points.length === 2) {
		const [a, b] = points as [Point, Point];
		return (
			point.x >= Math.min(a.x, b.x) &&
			point.x <= Math.max(a.x, b.x) &&
			point.y >= Math.min(a.y, b.y) &&
			point.y <= Math.max(a.y, b.y)
		);
	}
	return pointInRing(points, point);
}

/** A tiny binary min-heap over `[cost, steps, cellIndex]`, ordered cost → steps → index. */
class CellHeap {
	private readonly items: Array<[number, number, number]> = [];

	get size(): number {
		return this.items.length;
	}

	push(item: [number, number, number]): void {
		this.items.push(item);
		let i = this.items.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (this.less(i, parent)) {
				this.swap(i, parent);
				i = parent;
			} else break;
		}
	}

	pop(): [number, number, number] | undefined {
		const items = this.items;
		if (items.length === 0) return undefined;
		const top = items[0] as [number, number, number];
		const last = items.pop() as [number, number, number];
		if (items.length > 0) {
			items[0] = last;
			let i = 0;
			for (;;) {
				const left = i * 2 + 1;
				const right = left + 1;
				let smallest = i;
				if (left < items.length && this.less(left, smallest)) smallest = left;
				if (right < items.length && this.less(right, smallest)) smallest = right;
				if (smallest === i) break;
				this.swap(i, smallest);
				i = smallest;
			}
		}
		return top;
	}

	private less(a: number, b: number): boolean {
		const x = this.items[a] as [number, number, number];
		const y = this.items[b] as [number, number, number];
		if (x[0] !== y[0]) return x[0] < y[0];
		if (x[1] !== y[1]) return x[1] < y[1];
		return x[2] < y[2];
	}

	private swap(a: number, b: number): void {
		const tmp = this.items[a] as [number, number, number];
		this.items[a] = this.items[b] as [number, number, number];
		this.items[b] = tmp;
	}
}

/** An empty range, for every fail-closed path. Pure. */
function emptyRange(input: MovementInput): MovementRange {
	return {
		origin: { q: input.origin.q, r: input.origin.r },
		budget: Math.max(0, input.budget),
		unitsPerCell: input.grid.unitsPerCell,
		cells: EMPTY_RANGE_CELLS.slice(),
		truncated: false,
	};
}

/**
 * Compute every cell reachable from `origin` within `budget` table units, and the cheapest route to
 * each. Dijkstra rather than plain BFS because difficult terrain makes steps cost different amounts;
 * with uniform terrain it degenerates to exactly the BFS the story asked for.
 *
 * Returns an empty range (never a throw) for a malformed grid, a negative budget, or an origin off
 * the map — a bad input is a range of nothing, not a crash mid-drag.
 */
export function computeMovementRange(input: MovementInput): MovementRange {
	const { grid, origin } = input;
	if (!isTemplateGrid(grid)) return emptyRange(input);
	if (!Number.isFinite(input.budget) || input.budget < 0) return emptyRange(input);
	if (!Number.isInteger(origin.q) || !Number.isInteger(origin.r)) return emptyRange(input);

	const size = Math.floor(grid.size);
	// Hex axial columns skew left as rows descend, so the addressable q range is wider than `size`.
	const minQ = grid.kind === 'hex' ? -Math.ceil(size / 2) : 0;
	const maxQ = size - 1;
	const width = maxQ - minQ + 1;
	const indexOf = (cell: MovementCell): number => {
		if (cell.r < 0 || cell.r >= size || cell.q < minQ || cell.q > maxQ) return -1;
		return cell.r * width + (cell.q - minQ);
	};
	const cellOf = (index: number): MovementCell => ({
		q: (index % width) + minQ,
		r: Math.floor(index / width),
	});

	const originIndex = indexOf(origin);
	if (originIndex < 0) return emptyRange(input);

	const budget = input.budget;
	const multiplier =
		input.options?.difficultTerrainMultiplier ?? DEFAULT_DIFFICULT_TERRAIN_MULTIPLIER;
	const neighbours =
		grid.kind === 'hex'
			? HEX_NEIGHBOURS
			: input.options?.diagonals === 'orthogonal'
				? SQUARE_ORTHOGONAL
				: SQUARE_PHB;

	const total = width * size;
	const difficult = difficultCells(input.features, grid, total, indexOf, cellOf);
	const index = new OccluderIndex(occludersOf(input.features), size);

	const cost = new Float64Array(total).fill(Infinity);
	const steps = new Int32Array(total).fill(-1);
	const from = new Int32Array(total).fill(-1);
	const settled = new Uint8Array(total);
	cost[originIndex] = 0;
	steps[originIndex] = 0;

	const heap = new CellHeap();
	heap.push([0, 0, originIndex]);
	const reached: number[] = [];
	let truncated = false;

	while (heap.size > 0) {
		const top = heap.pop() as [number, number, number];
		const current = top[2];
		if (settled[current] === 1) continue;
		settled[current] = 1;
		reached.push(current);
		if (reached.length >= MAX_MOVEMENT_CELLS_SCANNED) {
			truncated = heap.size > 0;
			break;
		}
		const currentCost = cost[current] as number;
		const currentCell = cellOf(current);
		const currentCenter = movementCellCenter(grid, currentCell);
		for (const [dq, dr] of neighbours) {
			const nextCell: MovementCell = { q: currentCell.q + dq, r: currentCell.r + dr };
			const next = indexOf(nextCell);
			if (next < 0 || settled[next] === 1) continue;
			const entry = grid.unitsPerCell * (difficult[next] === 1 ? multiplier : 1);
			const candidate = currentCost + entry;
			// Floating-point slack: a budget of exactly 30 must admit a 30-foot route.
			if (candidate > budget + 1e-9) continue;
			const nextSteps = (steps[current] as number) + 1;
			const known = cost[next] as number;
			if (candidate > known + 1e-9) continue;
			if (Math.abs(candidate - known) <= 1e-9 && nextSteps >= (steps[next] as number)) continue;
			if (index.crosses(currentCenter, movementCellCenter(grid, nextCell))) continue;
			cost[next] = candidate;
			steps[next] = nextSteps;
			from[next] = current;
			heap.push([candidate, nextSteps, next]);
		}
	}

	reached.sort((a, b) => {
		const ca = cost[a] as number;
		const cb = cost[b] as number;
		if (ca !== cb) return ca - cb;
		return a - b;
	});

	const cells: MovementReach[] = reached.map((i) => ({
		cell: cellOf(i),
		cost: cost[i] as number,
		steps: steps[i] as number,
		from: from[i] === -1 ? null : cellOf(from[i] as number),
	}));

	return {
		origin: { q: origin.q, r: origin.r },
		budget,
		unitsPerCell: grid.unitsPerCell,
		cells,
		truncated,
	};
}

/** Mark which cells are difficult terrain, scanning each feature only over its own bounding box. */
function difficultCells(
	features: readonly MapFeature[],
	grid: TemplateGrid,
	total: number,
	indexOf: (cell: MovementCell) => number,
	cellOf: (index: number) => MovementCell,
): Uint8Array {
	const marks = new Uint8Array(total);
	const terrain = features.filter(isDifficultTerrain);
	if (terrain.length === 0) return marks;
	for (const feature of terrain) {
		if (feature.points.length < 2) continue;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const p of feature.points) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}
		// The box in cells, widened by one so a cell whose centre sits just inside is not missed.
		const lo = movementCellAt(grid, { x: clampUnit(minX), y: clampUnit(minY) });
		const hi = movementCellAt(grid, { x: clampUnit(maxX), y: clampUnit(maxY) });
		for (let r = lo.r - 1; r <= hi.r + 1; r += 1) {
			for (let q = lo.q - 1; q <= hi.q + 1; q += 1) {
				const i = indexOf({ q, r });
				if (i < 0 || marks[i] === 1) continue;
				if (featureCoversPoint(feature, movementCellCenter(grid, cellOf(i)))) marks[i] = 1;
			}
		}
	}
	return marks;
}

function clampUnit(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The cost of standing on `target`, or `null` when it is out of range. Pure lookup. */
export function movementCostTo(range: MovementRange, target: MovementCell): number | null {
	const reach = range.cells.find((c) => c.cell.q === target.q && c.cell.r === target.r);
	return reach ? reach.cost : null;
}

/** Whether `target` is inside the range. Pure lookup. */
export function isCellReachable(range: MovementRange, target: MovementCell): boolean {
	return movementCostTo(range, target) !== null;
}

/**
 * The cheapest route to `target`, from the origin inclusive to the target inclusive. An empty list
 * when the target is unreachable — an honest "there is no way there", not a partial route that ends
 * in a wall.
 */
export function movementPathTo(range: MovementRange, target: MovementCell): MovementCell[] {
	const byKey = new Map<string, MovementReach>();
	for (const reach of range.cells) byKey.set(`${reach.cell.q},${reach.cell.r}`, reach);
	let cursor = byKey.get(`${target.q},${target.r}`);
	if (!cursor) return [];
	const path: MovementCell[] = [];
	// Bounded by the reachable set: every `from` strictly decreases cost, so this cannot loop.
	for (let guard = 0; guard <= range.cells.length; guard += 1) {
		path.push({ q: cursor.cell.q, r: cursor.cell.r });
		if (!cursor.from) break;
		const next = byKey.get(`${cursor.from.q},${cursor.from.r}`);
		if (!next) return [];
		cursor = next;
	}
	return path.reverse();
}

// --- Speed, from the system package ---------------------------------------------------------------

/** The walking speed assumed when the active system says nothing about speed at all. */
export const DEFAULT_MOVEMENT_SPEED_UNITS = 30;

/** Where a resolved speed came from, so the interface can say so rather than assert a number. */
export type MovementSpeedSource = 'derived' | 'creature-field' | 'default';

export interface MovementSpeed {
	/** The speed in table units per turn. */
	units: number;
	source: MovementSpeedSource;
}

/**
 * Resolve a creature's speed FROM THE ACTIVE SYSTEM PACKAGE, in the order a system author would
 * expect: a `speed` derived value (a formula the package owns) beats a `speed` creature-schema field
 * (a value the creature carries), which beats the built-in default.
 *
 * The default is stated, not hidden: the returned {@link MovementSpeed.source} tells the caller the
 * package had nothing to say, so a UI can label the range "assumed 30 feet" rather than implying the
 * system decided it.
 */
export function resolveMovementSpeed(
	pkg: SystemPackage | undefined,
	creature: Readonly<Record<string, unknown>> = {},
	scope: FormulaScope = {},
): MovementSpeed {
	const derived = pkg?.derived.find((value) => value.key === 'speed');
	if (derived) {
		const result = evaluateFormula(derived.formula, scope);
		if (result.ok && result.value > 0) return { units: result.value, source: 'derived' };
	}
	const field = pkg?.creatureSchema.find((f) => f.key === 'speed');
	if (field) {
		const parsed = parseSpeedValue(creature['speed']);
		if (parsed !== null) return { units: parsed, source: 'creature-field' };
	}
	return { units: DEFAULT_MOVEMENT_SPEED_UNITS, source: 'default' };
}

/** Parse a creature's speed value. A number is taken as-is; a string yields its leading number
 *  ("30 ft." → 30), because that is how every stat block in print writes it. */
function parseSpeedValue(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
	if (typeof value !== 'string') return null;
	const match = /-?\d+(?:\.\d+)?/.exec(value);
	if (!match) return null;
	const parsed = Number(match[0]);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// --- The actor-scoped read ------------------------------------------------------------------------

/** What an actor is allowed to know about a combatant's movement. Fail-closed and indistinguishable
 *  from "no such combatant" when the actor may not see it. */
export type CombatantMovementResult =
	| { kind: 'unavailable' }
	| {
			kind: 'range';
			combatantId: string;
			mapId: string;
			speed: MovementSpeed;
			range: MovementRange;
	  };

export interface CombatantMovementInput {
	maps: MapState;
	permissions: PermissionState;
	combat: SessionCombatState | undefined;
	systems?: SystemsState;
	actorId: ActorId;
	combatantId: string;
	/** Overrides the package-resolved speed (a dash, a mount, a DM's call). Table units. */
	speedUnits?: number;
	/** `env.clock()` — required for an expiring combat-participant grant to be judged correctly. */
	now?: string;
	/** Map ids this actor has an explicit `shared`-delivery for, exactly as `MapQueryOptions` means
	 *  it. A `shared` map or layer is only readable once it has been delivered. */
	deliveredMapIds?: ReadonlySet<string> | string[];
	options?: MovementOptions;
}

/**
 * RC-MAP-1.3 — the ONE actor-filtered movement read. A player may ask for the range of a combatant
 * they can see, on a map they can see; anything else is `unavailable`, indistinguishable from a
 * combatant that does not exist. The core decides, never the UI (Contract 3).
 */
export function getCombatantMovementForActor(
	input: CombatantMovementInput,
): CombatantMovementResult {
	const actor: Actor | undefined = input.permissions.actors[input.actorId];
	if (!actor) return { kind: 'unavailable' };
	const combat = input.combat;
	if (!combat || combat.status !== 'running') return { kind: 'unavailable' };
	const combatant = combat.combatants[input.combatantId];
	const token = combat.tokens[input.combatantId];
	if (!combatant || !token) return { kind: 'unavailable' };
	if (!actorCanSeeCombatant(input.permissions, actor, combatant, input.now)) {
		return { kind: 'unavailable' };
	}
	const map = input.maps.maps[token.mapId];
	if (!map) return { kind: 'unavailable' };
	const delivery = input.deliveredMapIds;
	const delivered = !delivery
		? false
		: Array.isArray(delivery)
			? delivery.includes(map.id)
			: delivery.has(map.id);
	if (!mapVisibleToActor(map, actor, delivered)) return { kind: 'unavailable' };

	const pkg = input.systems ? input.systems.packages[input.systems.activePackageId] : undefined;
	const speed =
		input.speedUnits !== undefined && Number.isFinite(input.speedUnits) && input.speedUnits >= 0
			? { units: input.speedUnits, source: 'default' as const }
			: resolveMovementSpeed(pkg);

	const grid: TemplateGrid = {
		kind: 'square',
		size: map.overlay.gridSize,
		unitsPerCell: map.overlay.unitsPerCell,
	};
	const range = computeMovementRange({
		grid,
		features: movementFeaturesOf(map, actor, delivered),
		origin: movementCellAt(grid, { x: token.x, y: token.y }),
		budget: speed.units,
		options: input.options,
	});
	return { kind: 'range', combatantId: input.combatantId, mapId: map.id, speed, range };
}

/**
 * The features a movement search may consider for this actor.
 *
 * A DM sees every layer. A player sees only the layers they may read — which is the conservative
 * choice in both directions: a wall on a dm-only layer still stops them (it is a wall), but its
 * geometry never reaches a player's client through this read, so a range cannot be used to trace the
 * outline of a hidden room. Layers a player cannot read are therefore folded in as BLOCKING ONLY:
 * their difficult-terrain marks are dropped, their obstacles are kept.
 */
function movementFeaturesOf(map: MapEntity, actor: Actor, delivered: boolean): MapFeature[] {
	const isDm = hasDmAuthority(actor.role);
	const features: MapFeature[] = [];
	for (const layer of map.layers) {
		const readable =
			isDm || layer.visibility === 'player-visible' || (layer.visibility === 'shared' && delivered);
		for (const feature of layer.content) {
			if (readable || blocksMovement(feature)) features.push(feature);
		}
	}
	return features;
}
