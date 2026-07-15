import {
	boundsOf,
	centroid,
	clamp,
	clamp01,
	createGrid,
	delaunay,
	dist,
	gridGet,
	gridSet,
	minimumSpanningTree,
	offsetPolyline,
	rectCenter,
	rectToRing,
	rectsOverlap,
	segmentsIntersect,
	type CellGrid,
	type Point,
	type Rect,
} from '../geometry';
import type { MapFeature } from '../state/map-state';
import type { SeededRng } from '../state/prng';
import {
	buildLayer,
	feature,
	normPoint,
	numberParam,
	stringParam,
	type GeneratedGraph,
	type GeneratedPoi,
	type GeneratorContext,
	type GeneratorDefinition,
	type GeneratorOutput,
} from './types';

/**
 * MAP-021 — the dungeon generators.
 *
 * Three siblings, deliberately different in FEEL rather than in quality:
 *
 *   - `dungeon.tinykeep`        — the flagship. Organic, non-grid-aligned, a real connectivity graph.
 *   - `dungeon.bsp`             — structured/architectural. The fortress and the wizard's tower.
 *   - `dungeon.rooms-and-mazes` — classic graph-paper. Rooms plus twisty hand-drawn passages.
 *
 * What separates these from a shape-spitter is that they RETAIN THE GRAPH. A generator that only draws
 * walls cannot tell you where a locked door belongs; one that keeps its own connectivity graph gets
 * key/lock placement, the boss room, the entrance, and secret doors for free — they are all graph
 * properties (a chokepoint is a bridge in the graph, the boss room is the eccentricity maximum from the
 * entrance, a secret door is a candidate edge that was considered and rejected). See
 * {@link GeneratedGraph}.
 *
 * Two invariants run through every function here and must not be relaxed:
 *
 *   - Determinism (Contract 2). Every draw comes from a NAMED sub-stream of the run's seed
 *     (`ctx.rng.stream('rooms' | 'corridors' | 'roles' | 'names' | 'secrets')`), never from ambient
 *     entropy, and the CALL ORDER inside each stream is part of the contract. The streams are what make
 *     "nudge the room count without rerolling every room's name and role" work: room names and roles are
 *     drawn from FIXED-SIZE pools indexed by a room's stable placement index, so a room that survives a
 *     param change keeps its identity.
 *   - Vector output. Grids appear only as a scratch buffer inside `rooms-and-mazes`, and are never
 *     persisted; what leaves this module is rooms, floor polygons and a graph in normalized 0..1 space.
 *
 * Walls, doors and lights are NOT emitted here. They are derived downstream from the floor geometry, so
 * that a hand-drawn floor and a generated one produce walls the same way.
 */

/* -------------------------------------------------------------------------------------------------
 * Shared vocabulary
 * ---------------------------------------------------------------------------------------------- */

/** Room roles the generators hand out to everything that is not the entrance or the boss. */
const SIDE_ROLES = ['treasure', 'guard', 'shrine', 'storage'] as const;
const SIDE_ROLE_WEIGHTS = [3, 5, 2, 4] as const;

/**
 * Names and role rolls are drawn into fixed-size pools, INDEPENDENT of any parameter, and then indexed
 * by a room's stable placement index. This is the whole point of the named sub-streams: raising the room
 * count must not re-letter the dungeon.
 */
const IDENTITY_POOL_SIZE = 256;

const NAME_ADJECTIVES = [
	'Sunken',
	'Shattered',
	'Hollow',
	'Gilded',
	'Weeping',
	'Ashen',
	'Iron',
	'Forgotten',
	'Whispering',
	'Bone',
	'Drowned',
	'Cracked',
	'Silent',
	'Rusted',
	'Black',
	'Pale',
] as const;

const NAME_NOUNS = [
	'Vault',
	'Gallery',
	'Cistern',
	'Reliquary',
	'Sanctum',
	'Crypt',
	'Hall',
	'Antechamber',
	'Larder',
	'Barracks',
	'Oratory',
	'Kiln',
	'Warren',
	'Undercroft',
	'Cell',
	'Rotunda',
] as const;

const ROLE_NOTE: Record<string, string> = {
	entrance: 'The way in. Light bleeds in from outside; the party arrives here.',
	boss: 'The deepest room — the furthest point from the entrance. Put the thing they came for here.',
	treasure: 'A hoard, a reliquary, or a locked strongbox. Reward for going off the critical path.',
	guard: 'Occupied. A patrol, a warden, or something that was told to stay put.',
	shrine: 'A altar, idol or font. A place to bargain with, deface, or be blessed by.',
	storage: 'Crates, casks, spoiled provisions. Mundane, and therefore where things hide.',
};

/** A corridor's plan shape. Named for what it looks like, because that is how a GM picks one. */
type CorridorStyle = 'elbow' | 'straight' | 'dogleg';

const CORRIDOR_STYLE_OPTIONS = [
	{
		value: 'elbow',
		label: 'Elbow',
		help: 'Right-angled halls that run straight where rooms line up.',
	},
	{
		value: 'straight',
		label: 'Straight',
		help: 'Direct diagonal runs. Cave-like, never orthogonal.',
	},
	{
		value: 'dogleg',
		label: 'Dogleg',
		help: 'A Z-jog halfway along. Longer, less legible sight-lines.',
	},
] as const;

/* -------------------------------------------------------------------------------------------------
 * Working space → normalized space
 * ---------------------------------------------------------------------------------------------- */

/**
 * The generators work in their own "tile" space (it is far easier to reason about a 3-tile-wide corridor
 * than about a 0.0234-wide one) and are fitted into the 0..1 map square at the end. The scale is UNIFORM
 * on both axes on purpose: stretching the result to fill the square would erase the aspect ratio that
 * `dungeonShape` exists to control.
 */
interface Fit {
	scale: number;
	ox: number;
	oy: number;
}

function fitToUnit(points: readonly Point[], padding: number): Fit {
	if (points.length === 0) return { scale: 1, ox: 0, oy: 0 };
	const bounds = boundsOf(points);
	const span = Math.max(bounds.w, bounds.h, 1e-6);
	const scale = (1 - 2 * padding) / span;
	const ox = padding + (1 - 2 * padding - bounds.w * scale) / 2 - bounds.x * scale;
	const oy = padding + (1 - 2 * padding - bounds.h * scale) / 2 - bounds.y * scale;
	return { scale, ox, oy };
}

function fitPoint(fit: Fit, p: Point): Point {
	// clamp01 is a belt-and-braces guard: `fitToUnit` already reserves the padding, but a coordinate
	// escaping 0..1 would corrupt every downstream consumer, so it is not left to arithmetic luck.
	return { x: clamp01(p.x * fit.scale + fit.ox), y: clamp01(p.y * fit.scale + fit.oy) };
}

function fitRect(fit: Fit, r: Rect): Rect {
	const tl = fitPoint(fit, { x: r.x, y: r.y });
	const br = fitPoint(fit, { x: r.x + r.w, y: r.y + r.h });
	return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

/** Every point that must survive the fit: room corners, plus corridor centrelines widened by their own
 *  half-width (otherwise a hall hugging the edge would be clipped by the clamp above). */
function extentPoints(
	rects: readonly Rect[],
	paths: ReadonlyArray<readonly Point[]>,
	halfWidth: number,
): Point[] {
	const points: Point[] = [];
	for (const r of rects) {
		points.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
	}
	for (const path of paths) {
		for (const p of path) {
			points.push(
				{ x: p.x - halfWidth, y: p.y - halfWidth },
				{ x: p.x + halfWidth, y: p.y + halfWidth },
			);
		}
	}
	return points;
}

/* -------------------------------------------------------------------------------------------------
 * Identity pools (names + role rolls)
 * ---------------------------------------------------------------------------------------------- */

function drawNamePool(rng: SeededRng): string[] {
	const pool: string[] = [];
	for (let i = 0; i < IDENTITY_POOL_SIZE; i += 1) {
		pool.push(`${rng.pick(NAME_ADJECTIVES)} ${rng.pick(NAME_NOUNS)}`);
	}
	return pool;
}

function drawRolePool(rng: SeededRng): string[] {
	const pool: string[] = [];
	for (let i = 0; i < IDENTITY_POOL_SIZE; i += 1) {
		pool.push(rng.weighted(SIDE_ROLES, SIDE_ROLE_WEIGHTS));
	}
	return pool;
}

/* -------------------------------------------------------------------------------------------------
 * Graph
 * ---------------------------------------------------------------------------------------------- */

/** A room that made it into the output, in NORMALIZED space, carrying its stable identity. */
interface GraphRoom {
	/** Placement index. The stable identity a name and a role hang off — NOT the position in the array. */
	index: number;
	rect: Rect;
	center: Point;
	featureId: string;
	nodeId: string;
	name: string;
	hub: boolean;
}

interface BuiltGraph {
	graph: GeneratedGraph;
	/** Role per room, indexed by POSITION in the rooms array. */
	roles: string[];
	loops: number;
	secrets: number;
}

/**
 * Lift a working-space room into normalized space. The centre is put through `normPoint` HERE rather
 * than at emit time because it escapes the geometry through three doors — the room feature, the graph
 * node and the POI — and only the first of those passes through `feature()`. A graph node carrying an
 * unrounded float would serialize differently on two devices and break replay for no visible reason.
 */
function toGraphRoom(
	ctx: GeneratorContext,
	fit: Fit,
	room: { index: number; rect: Rect },
	namePool: readonly string[],
	hub: boolean,
): GraphRoom {
	const rect = fitRect(fit, room.rect);
	const centre = rectCenter(rect);
	return {
		index: room.index,
		rect,
		center: normPoint(centre.x, centre.y),
		featureId: `${ctx.idPrefix}-room-${room.index}`,
		nodeId: `${ctx.idPrefix}-node-${room.index}`,
		name: namePool[room.index % IDENTITY_POOL_SIZE] ?? 'Chamber',
		hub,
	};
}

type Edge = [number, number];

/** Canonical, order-independent key for an undirected edge. */
function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function dedupeEdges(edges: ReadonlyArray<Edge>): Edge[] {
	const seen = new Set<string>();
	const out: Edge[] = [];
	for (const [a, b] of edges) {
		if (a === b) continue;
		const key = edgeKey(a, b);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push([a, b]);
	}
	return out;
}

function adjacencyOf(nodeCount: number, edges: ReadonlyArray<Edge>): number[][] {
	const adj: number[][] = Array.from({ length: nodeCount }, () => []);
	for (const [a, b] of edges) {
		adj[a]?.push(b);
		adj[b]?.push(a);
	}
	return adj;
}

/** BFS hop counts from `start`; unreachable nodes stay -1. */
function hopDistances(adj: readonly number[][], start: number): number[] {
	const hops = new Array<number>(adj.length).fill(-1);
	hops[start] = 0;
	const queue = [start];
	for (let head = 0; head < queue.length; head += 1) {
		const cur = queue[head] as number;
		for (const next of adj[cur] ?? []) {
			if (hops[next] !== -1) continue;
			hops[next] = (hops[cur] as number) + 1;
			queue.push(next);
		}
	}
	return hops;
}

/**
 * Chokepoints are graph BRIDGES: edges whose removal splits the dungeon in two. That is precisely where
 * a locked door is interesting (it gates everything beyond it) and where a door on a loop is not. The
 * graphs here are tens of nodes, so the honest O(E·(V+E)) removal test beats a Tarjan implementation
 * nobody will read again.
 */
function findBridges(nodeCount: number, edges: ReadonlyArray<Edge>): boolean[] {
	if (nodeCount === 0) return [];
	return edges.map((_, skip) => {
		const adj = adjacencyOf(
			nodeCount,
			edges.filter((__, i) => i !== skip),
		);
		const hops = hopDistances(adj, 0);
		return hops.some((h) => h === -1);
	});
}

/**
 * Assign roles and build the emitted graph. No RNG is drawn here beyond the pre-drawn role pool, so the
 * topology decides the story: the entrance is the leaf furthest from the middle (you enter a dungeon from
 * its edge), the boss is the eccentricity maximum from the entrance (the deepest room), and everything
 * else takes the role its stable index rolled.
 */
function buildGraph(
	rooms: readonly GraphRoom[],
	corridorEdges: ReadonlyArray<Edge>,
	secretEdges: ReadonlyArray<Edge>,
	rolePool: readonly string[],
): BuiltGraph {
	const n = rooms.length;
	const edges = dedupeEdges(corridorEdges);
	const adj = adjacencyOf(n, edges);
	const roles = new Array<string>(n).fill('storage');

	const middle = centroid(rooms.map((r) => r.center));
	const leaves: number[] = [];
	for (let i = 0; i < n; i += 1) {
		if ((adj[i] as number[]).length <= 1) leaves.push(i);
	}
	const entranceCandidates = leaves.length > 0 ? leaves : rooms.map((_, i) => i);
	let entrance = entranceCandidates[0] as number;
	let entranceScore = -1;
	for (const i of entranceCandidates) {
		const score = dist((rooms[i] as GraphRoom).center, middle);
		if (score > entranceScore + 1e-9) {
			entranceScore = score;
			entrance = i;
		}
	}

	const hops = hopDistances(adj, entrance);
	let boss = -1;
	let bossHops = -1;
	let bossFar = -1;
	for (let i = 0; i < n; i += 1) {
		if (i === entrance) continue;
		const far = dist((rooms[i] as GraphRoom).center, (rooms[entrance] as GraphRoom).center);
		const h = hops[i] as number;
		if (h > bossHops || (h === bossHops && far > bossFar + 1e-9)) {
			bossHops = h;
			bossFar = far;
			boss = i;
		}
	}

	for (let i = 0; i < n; i += 1) {
		const room = rooms[i] as GraphRoom;
		roles[i] = rolePool[room.index % IDENTITY_POOL_SIZE] ?? 'storage';
	}
	roles[entrance] = 'entrance';
	if (boss >= 0) roles[boss] = 'boss';

	const bridges = findBridges(n, edges);
	const graph: GeneratedGraph = {
		nodes: rooms.map((room, i) => ({
			id: room.nodeId,
			position: { x: room.center.x, y: room.center.y },
			role: roles[i] as string,
			featureId: room.featureId,
		})),
		edges: [
			...edges.map(([a, b], i) => {
				const edge: GeneratedGraph['edges'][number] = {
					from: (rooms[a] as GraphRoom).nodeId,
					to: (rooms[b] as GraphRoom).nodeId,
					kind: 'corridor' as const,
				};
				if (bridges[i]) edge.chokepoint = true;
				return edge;
			}),
			...dedupeEdges(secretEdges).map(([a, b]) => ({
				from: (rooms[a] as GraphRoom).nodeId,
				to: (rooms[b] as GraphRoom).nodeId,
				kind: 'secret' as const,
			})),
		],
	};

	// The cyclomatic number: how many independent loops the dungeon actually has. 0 = a pure tree, and a
	// pure tree is the "every fight is a corridor you already cleared" complaint.
	const loops = Math.max(0, edges.length - Math.max(0, n - 1));
	return { graph, roles, loops, secrets: graph.edges.length - edges.length };
}

/* -------------------------------------------------------------------------------------------------
 * Emission
 * ---------------------------------------------------------------------------------------------- */

interface EmitInput {
	ctx: GeneratorContext;
	rooms: readonly GraphRoom[];
	/** Corridor centrelines in NORMALIZED space. */
	corridors: ReadonlyArray<readonly Point[]>;
	/** Corridor half-width in NORMALIZED space. */
	halfWidth: number;
	/** Extra floor rings (used by rooms-and-mazes for single-cell junctions). */
	extraFloors?: ReadonlyArray<readonly Point[]>;
	built: BuiltGraph;
	label: string;
}

/**
 * Emit the two layers every dungeon generator produces.
 *
 * The FLOOR layer is the contract with the rest of the pipeline: rooms and corridors are both floor, so
 * the wall-derivation step can union them and take the boundary. That is why corridors are polygons here
 * and not `road` polylines — a road has no inside, and a corridor is a room you walk down.
 *
 * The DM layer carries the graph: it is annotation, not architecture, and it is `dm-annotations` so it
 * never leaks the boss room's location to a player-visible scene.
 */
function emitLayers(input: EmitInput): { layers: GeneratorOutput['layers']; pois: GeneratedPoi[] } {
	const { ctx, rooms, corridors, halfWidth, built } = input;
	const floor: MapFeature[] = [];
	const annotations: MapFeature[] = [];

	for (let i = 0; i < rooms.length; i += 1) {
		const room = rooms[i] as GraphRoom;
		const role = built.roles[i] as string;
		floor.push(
			feature(
				room.featureId,
				'room',
				[
					{ x: room.rect.x, y: room.rect.y },
					{ x: room.rect.x + room.rect.w, y: room.rect.y + room.rect.h },
				],
				room.hub ? 'dungeon:hall' : 'dungeon:room',
				{ role, name: room.name, index: room.index },
			),
		);
	}

	for (let i = 0; i < corridors.length; i += 1) {
		const path = corridors[i] as readonly Point[];
		if (path.length < 2) continue;
		floor.push(
			feature(
				`${ctx.idPrefix}-corridor-${i}`,
				'polygon',
				offsetPolyline(path, halfWidth),
				'dungeon:corridor',
			),
		);
		// The centreline is kept because it is the only cheap way back to "which way does this hall run"
		// — lighting, patrol routes and door placement all want it, and re-deriving it from the polygon
		// is a skeletonization problem.
		annotations.push(
			feature(`${ctx.idPrefix}-corridor-line-${i}`, 'stroke', path, 'dungeon:corridor-centreline'),
		);
	}

	for (const [i, ring] of (input.extraFloors ?? []).entries()) {
		floor.push(feature(`${ctx.idPrefix}-junction-${i}`, 'polygon', ring, 'dungeon:corridor'));
	}

	const nodeById = new Map(built.graph.nodes.map((node) => [node.id, node]));
	for (const node of built.graph.nodes) {
		annotations.push(
			feature(`${ctx.idPrefix}-graph-${node.id}`, 'marker', [node.position], `graph:${node.role}`, {
				role: node.role,
			}),
		);
	}
	for (let i = 0; i < built.graph.edges.length; i += 1) {
		const edge = built.graph.edges[i] as GeneratedGraph['edges'][number];
		const from = nodeById.get(edge.from);
		const to = nodeById.get(edge.to);
		if (!from || !to) continue;
		annotations.push(
			feature(
				`${ctx.idPrefix}-graph-edge-${i}`,
				'stroke',
				[from.position, to.position],
				edge.kind === 'secret' ? 'graph:secret' : 'graph:corridor',
				edge.chokepoint ? { link: edge.kind, chokepoint: true } : { link: edge.kind },
			),
		);
	}

	const pois: GeneratedPoi[] = [];
	let treasures = 0;
	for (let i = 0; i < rooms.length; i += 1) {
		const room = rooms[i] as GraphRoom;
		const role = built.roles[i] as string;
		if (role === 'entrance' || role === 'boss') {
			pois.push({
				id: `${ctx.idPrefix}-poi-${role}`,
				label: role === 'entrance' ? `Entrance — ${room.name}` : `Boss — ${room.name}`,
				category: role === 'entrance' ? 'dungeon' : 'hazard',
				position: { x: room.center.x, y: room.center.y },
				notes: ROLE_NOTE[role] ?? '',
			});
		} else if (role === 'treasure' && treasures < 3) {
			treasures += 1;
			pois.push({
				id: `${ctx.idPrefix}-poi-treasure-${room.index}`,
				label: `Treasure — ${room.name}`,
				category: 'quest',
				position: { x: room.center.x, y: room.center.y },
				notes: ROLE_NOTE.treasure ?? '',
			});
		}
	}

	return {
		layers: [
			buildLayer(ctx, 'floor', `${input.label} — Floor`, 'base', floor, 0),
			buildLayer(ctx, 'graph', `${input.label} — DM Graph`, 'dm-annotations', annotations, 1),
		],
		pois,
	};
}

function keyedNotes(
	rooms: readonly GraphRoom[],
	roles: readonly string[],
): GeneratorOutput['notes'] {
	return rooms.map((room, i) => {
		const role = roles[i] as string;
		return {
			key: `room-${i + 1}`,
			title: `${i + 1}. ${room.name}`,
			body: `${role[0]?.toUpperCase()}${role.slice(1)} — ${ROLE_NOTE[role] ?? ''}`.trim(),
		};
	});
}

function summarize(rooms: number, loops: number, secrets: number): string {
	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
	return `${plural(rooms, 'room')} · ${plural(loops, 'loop')} · ${plural(secrets, 'secret door')}`;
}

/* -------------------------------------------------------------------------------------------------
 * Corridor planning (shared by tinykeep + bsp)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Plan one corridor between two rooms in WORKING space.
 *
 * The elbow case earns its keep: when the two rooms share a band wide enough for the hall, it runs a
 * SINGLE straight hall through that band rather than an L through the centroids. Without it every
 * connection kinks, and a TinyKeep dungeon reads as plumbing rather than architecture.
 */
function corridorPath(
	a: Rect,
	b: Rect,
	style: CorridorStyle,
	width: number,
	rng: SeededRng,
): Point[] {
	const ac = rectCenter(a);
	const bc = rectCenter(b);
	if (style === 'straight') return [ac, bc];
	if (style === 'dogleg') {
		const mx = (ac.x + bc.x) / 2;
		return [ac, { x: mx, y: ac.y }, { x: mx, y: bc.y }, bc];
	}
	const x0 = Math.max(a.x, b.x);
	const x1 = Math.min(a.x + a.w, b.x + b.w);
	if (x1 - x0 >= width) {
		const x = (x0 + x1) / 2;
		return [
			{ x, y: ac.y },
			{ x, y: bc.y },
		];
	}
	const y0 = Math.max(a.y, b.y);
	const y1 = Math.min(a.y + a.h, b.y + b.h);
	if (y1 - y0 >= width) {
		const y = (y0 + y1) / 2;
		return [
			{ x: ac.x, y },
			{ x: bc.x, y },
		];
	}
	return rng.chance(0.5) ? [ac, { x: bc.x, y: ac.y }, bc] : [ac, { x: ac.x, y: bc.y }, bc];
}

function pointInRect(p: Point, r: Rect): boolean {
	return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
	if (pointInRect(a, r) || pointInRect(b, r)) return true;
	const ring = rectToRing(r);
	for (let i = 0; i < ring.length; i += 1) {
		const p = ring[i] as Point;
		const q = ring[(i + 1) % ring.length] as Point;
		if (segmentsIntersect(a, b, p, q)) return true;
	}
	return false;
}

function pathHitsRect(path: readonly Point[], r: Rect): boolean {
	for (let i = 1; i < path.length; i += 1) {
		if (segmentHitsRect(path[i - 1] as Point, path[i] as Point, r)) return true;
	}
	return false;
}

function inflate(r: Rect, by: number): Rect {
	return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

/**
 * Add the shortest cross-component edges until the graph is connected. Belt-and-braces: a Delaunay over
 * two rooms, or over three collinear ones, is degenerate and yields an edge set that a spanning tree
 * cannot span. A dungeon with an unreachable wing is a bug the player finds, not the developer.
 */
function ensureConnected(points: readonly Point[], edges: ReadonlyArray<Edge>): Edge[] {
	const n = points.length;
	const out = dedupeEdges(edges);
	if (n < 2) return out;
	const parent = Array.from({ length: n }, (_, i) => i);
	const find = (i: number): number => {
		let root = i;
		while ((parent[root] as number) !== root) root = parent[root] as number;
		let cur = i;
		while ((parent[cur] as number) !== cur) {
			const next = parent[cur] as number;
			parent[cur] = root;
			cur = next;
		}
		return root;
	};
	const union = (a: number, b: number): boolean => {
		const ra = find(a);
		const rb = find(b);
		if (ra === rb) return false;
		parent[rb] = ra;
		return true;
	};
	for (const [a, b] of out) union(a, b);
	for (;;) {
		let best: Edge | null = null;
		let bestD = Infinity;
		for (let i = 0; i < n; i += 1) {
			for (let j = i + 1; j < n; j += 1) {
				if (find(i) === find(j)) continue;
				const d = dist(points[i] as Point, points[j] as Point);
				if (d < bestD - 1e-12) {
					bestD = d;
					best = [i, j];
				}
			}
		}
		if (!best) break;
		union(best[0], best[1]);
		out.push(best);
	}
	return out;
}

/* -------------------------------------------------------------------------------------------------
 * 1 — dungeon.tinykeep
 * ---------------------------------------------------------------------------------------------- */

const SHAPE_ASPECT: Record<string, number> = {
	compact: 1,
	balanced: 1.7,
	sprawling: 3,
	linear: 5.5,
};

/**
 * How many chambers are scattered per room the GM asked for.
 *
 * TinyKeep scatters a crowd and promotes only the outliers, which means the scatter count is an
 * ALGORITHM number, not a GM number: ask for 45 and you get 7 rooms, because a normal distribution puts
 * few rooms 1.25σ above the mean. A knob that lies about its effect is worse than no knob, so
 * "Room count" means rooms, and the scatter is derived from it. The discarded majority still does its
 * job — it is what forces the survivors apart and gives the layout its organic spacing.
 */
const SCATTER_MULTIPLIER = 4;

/**
 * Separation steering. Rooms are scattered overlapping and then shoved apart along the axis of least
 * penetration until they settle — the flocking trick that gives TinyKeep its organic, non-grid look
 * without any of the search a packing algorithm would need. Deltas are accumulated against the CURRENT
 * positions and applied together, so one room's move cannot bias the next room's push within the same
 * pass.
 *
 * The pair search runs through a uniform-grid broadphase rather than the naive all-pairs loop. This is
 * not premature optimization: separation is THE bottleneck of the algorithm (O(n²) per iteration, up to
 * 500 iterations), and at the top of the room-count range the all-pairs version spends over half a
 * second — which, on the UI thread, is a visible freeze every time a GM drags the slider. Bucketing by a
 * cell the size of the largest room plus the gap means any pair that could possibly overlap lands in the
 * 3x3 neighbourhood, so nothing is missed.
 */
function separateRooms(rects: readonly Rect[], gap: number, iterations: number): Rect[] {
	const out = rects.map((r) => ({ ...r }));
	let cell = gap;
	for (const r of out) cell = Math.max(cell, r.w + gap, r.h + gap);
	const buckets = new Map<string, number[]>();

	for (let iter = 0; iter < iterations; iter += 1) {
		buckets.clear();
		for (let i = 0; i < out.length; i += 1) {
			const c = rectCenter(out[i] as Rect);
			const key = `${Math.floor(c.x / cell)}:${Math.floor(c.y / cell)}`;
			const existing = buckets.get(key);
			if (existing) existing.push(i);
			else buckets.set(key, [i]);
		}

		const dx = new Float64Array(out.length);
		const dy = new Float64Array(out.length);
		let overlapping = false;
		for (let i = 0; i < out.length; i += 1) {
			const a = out[i] as Rect;
			const ac = rectCenter(a);
			const gx = Math.floor(ac.x / cell);
			const gy = Math.floor(ac.y / cell);
			for (let oy = -1; oy <= 1; oy += 1) {
				for (let ox = -1; ox <= 1; ox += 1) {
					for (const j of buckets.get(`${gx + ox}:${gy + oy}`) ?? []) {
						if (j <= i) continue;
						const b = out[j] as Rect;
						if (!rectsOverlap(a, b, gap)) continue;
						const bc = rectCenter(b);
						const penX = (a.w + b.w) / 2 + gap - Math.abs(ac.x - bc.x);
						const penY = (a.h + b.h) / 2 + gap - Math.abs(ac.y - bc.y);
						if (penX <= 0 || penY <= 0) continue;
						overlapping = true;
						if (penX < penY) {
							// Coincident centres would give a zero push vector and lock the pair together
							// forever; the index comparison breaks the tie deterministically.
							const sign = ac.x < bc.x || (ac.x === bc.x && i < j) ? -1 : 1;
							const push = (sign * penX) / 2;
							dx[i] = (dx[i] as number) + push;
							dx[j] = (dx[j] as number) - push;
						} else {
							const sign = ac.y < bc.y || (ac.y === bc.y && i < j) ? -1 : 1;
							const push = (sign * penY) / 2;
							dy[i] = (dy[i] as number) + push;
							dy[j] = (dy[j] as number) - push;
						}
					}
				}
			}
		}
		if (!overlapping) break;
		for (let i = 0; i < out.length; i += 1) {
			const r = out[i] as Rect;
			r.x += (dx[i] as number) * 0.6;
			r.y += (dy[i] as number) * 0.6;
		}
	}
	return out;
}

/** TinyKeep's `roundm`: snap to a grid. 0 leaves the layout freeform; higher makes it read as built. */
function snapRect(r: Rect, m: number, minDim: number): Rect {
	if (m <= 0) return r;
	return {
		x: Math.round(r.x / m) * m,
		y: Math.round(r.y / m) * m,
		w: Math.max(minDim, Math.round(r.w / m) * m),
		h: Math.max(minDim, Math.round(r.h / m) * m),
	};
}

function runTinyKeep(ctx: GeneratorContext): GeneratorOutput {
	const roomCount = numberParam(ctx.params, 'roomCount');
	const roomSize = numberParam(ctx.params, 'roomSize');
	const sizeVariety = numberParam(ctx.params, 'sizeVariety');
	const loopiness = numberParam(ctx.params, 'loopiness');
	const corridorWidth = numberParam(ctx.params, 'corridorWidth');
	const shape = stringParam(ctx.params, 'dungeonShape');
	const separationIterations = numberParam(ctx.params, 'separationIterations');
	const gridSnap = numberParam(ctx.params, 'gridSnap');
	const hubThreshold = numberParam(ctx.params, 'hubThreshold');
	const style = stringParam(ctx.params, 'corridorStyle') as CorridorStyle;

	const roomsRng = ctx.rng.stream('rooms');
	const corridorsRng = ctx.rng.stream('corridors');
	const secretsRng = ctx.rng.stream('secrets');
	const namePool = drawNamePool(ctx.rng.stream('names'));
	const rolePool = drawRolePool(ctx.rng.stream('roles'));

	// Scatter inside an ellipse whose aspect IS the "Dungeon shape" knob: a circle blobs, a flat ellipse
	// sprawls sideways the way a real dungeon spreads along a seam of rock.
	const scatterCount = roomCount * SCATTER_MULTIPLIER;
	const aspect = SHAPE_ASPECT[shape] ?? 1.7;
	const stdDev = Math.max(0.3, roomSize * sizeVariety);
	const area = scatterCount * (roomSize * 1.9) ** 2;
	const rx = Math.sqrt((area * aspect) / Math.PI);
	const ry = rx / aspect;
	const minDim = 2;
	const maxDim = roomSize * 3.2;

	const scattered: Rect[] = [];
	for (let i = 0; i < scatterCount; i += 1) {
		const angle = roomsRng.next() * Math.PI * 2;
		const radius = Math.sqrt(roomsRng.next());
		const w = clamp(roomsRng.gaussian(roomSize, stdDev), minDim, maxDim);
		const h = clamp(roomsRng.gaussian(roomSize, stdDev), minDim, maxDim);
		const cx = Math.cos(angle) * radius * rx;
		const cy = Math.sin(angle) * radius * ry;
		scattered.push({ x: cx - w / 2, y: cy - h / 2, w, h });
	}

	const gap = Math.max(1, gridSnap);
	const separated = separateRooms(scattered, gap, separationIterations).map((r) =>
		snapRect(r, gridSnap, minDim),
	);

	// Snapping can re-introduce a sliver of overlap that separation had resolved. Rather than iterate
	// forever, drop the loser deterministically — a dungeon with two rooms fused into an L is worse than
	// a dungeon with one room fewer.
	const placed: Array<{ index: number; rect: Rect }> = [];
	for (let i = 0; i < separated.length; i += 1) {
		const rect = separated[i] as Rect;
		if (placed.some((p) => rectsOverlap(p.rect, rect, 0))) continue;
		placed.push({ index: i, rect });
	}
	if (placed.length < 2) return emptyDungeon(ctx, 'TinyKeep');

	// Hub promotion. The threshold decides WHICH rooms qualify — the grand halls that stand out from the
	// crowd — and the room count decides HOW MANY we keep, trimming a surplus or topping up a shortfall
	// from the next-largest. Ranking is by area, ties broken by scatter index, so no RNG is drawn here
	// and the ordering is stable.
	const meanW = placed.reduce((sum, p) => sum + p.rect.w, 0) / placed.length;
	const meanH = placed.reduce((sum, p) => sum + p.rect.h, 0) / placed.length;
	const ranked = [...placed].sort(
		(a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h || a.index - b.index,
	);
	const targetHubs = Math.min(roomCount, placed.length);
	const chosen = ranked.filter(
		(p) => p.rect.w >= hubThreshold * meanW && p.rect.h >= hubThreshold * meanH,
	);
	chosen.length = Math.min(chosen.length, targetHubs);
	const alreadyHub = new Set(chosen.map((p) => p.index));
	for (const candidate of ranked) {
		if (chosen.length >= targetHubs) break;
		if (alreadyHub.has(candidate.index)) continue;
		alreadyHub.add(candidate.index);
		chosen.push(candidate);
	}
	const hubs = chosen.sort((a, b) => a.index - b.index);

	const hubCentres = hubs.map((h) => rectCenter(h.rect));
	const triangulation = delaunay(hubCentres);
	const spanning = ensureConnected(
		hubCentres,
		minimumSpanningTree(hubCentres, triangulation.edges),
	);
	const spanningKeys = new Set(spanning.map(([a, b]) => edgeKey(a, b)));
	const rejected = triangulation.edges.filter(([a, b]) => !spanningKeys.has(edgeKey(a, b)));

	// Loop reintroduction. A pure MST is a tree, and a tree dungeon means every route out is the route
	// in; TinyKeep shipped ~15% of the discarded Delaunay edges back for exactly this reason.
	const shuffledRejects = corridorsRng.shuffle(rejected);
	const loopTarget = Math.round((loopiness / 100) * shuffledRejects.length);
	const reAdded = shuffledRejects.slice(0, loopTarget);
	const stillRejected = shuffledRejects.slice(loopTarget);
	const hubEdges: Edge[] = [...spanning, ...reAdded];

	const paths = hubEdges.map(([a, b]) =>
		corridorPath(
			(hubs[a] as { rect: Rect }).rect,
			(hubs[b] as { rect: Rect }).rect,
			style,
			corridorWidth,
			corridorsRng,
		),
	);

	// Side rooms: a room the hall happens to cut through is a room you found by walking, which is exactly
	// the closet/guardpost/shrine a hand-drawn dungeon is full of. Everything else is discarded.
	const halfWidth = corridorWidth / 2;
	const hubIndices = new Set(hubs.map((h) => h.index));
	const sideByPath: number[][] = paths.map(() => []);
	const sideRooms: Array<{ index: number; rect: Rect }> = [];
	const sideSeen = new Map<number, number>();
	for (let p = 0; p < paths.length; p += 1) {
		const path = paths[p] as Point[];
		const hits: Array<{ index: number; rect: Rect; t: number }> = [];
		for (const candidate of placed) {
			if (hubIndices.has(candidate.index)) continue;
			if (!pathHitsRect(path, inflate(candidate.rect, halfWidth))) continue;
			hits.push({
				index: candidate.index,
				rect: candidate.rect,
				t: dist(rectCenter(candidate.rect), path[0] as Point),
			});
		}
		hits.sort((a, b) => a.t - b.t || a.index - b.index);
		for (const hit of hits) {
			if (!sideSeen.has(hit.index)) {
				sideSeen.set(hit.index, sideRooms.length);
				sideRooms.push({ index: hit.index, rect: hit.rect });
			}
			(sideByPath[p] as number[]).push(hit.index);
		}
	}

	const keptRooms = [...hubs, ...sideRooms];
	const positionOf = new Map(keptRooms.map((room, i) => [room.index, i]));

	// Splice the side rooms into their corridor's chain (hub → side → side → hub) so the graph describes
	// what a player actually walks through, and so connectivity is a property of the graph rather than a
	// claim about it.
	const corridorEdges: Edge[] = [];
	for (let p = 0; p < paths.length; p += 1) {
		const [a, b] = hubEdges[p] as Edge;
		const chain = [
			positionOf.get((hubs[a] as { index: number }).index) as number,
			...(sideByPath[p] as number[]).map((idx) => positionOf.get(idx) as number),
			positionOf.get((hubs[b] as { index: number }).index) as number,
		];
		for (let i = 1; i < chain.length; i += 1) {
			corridorEdges.push([chain[i - 1] as number, chain[i] as number]);
		}
	}

	// The Delaunay edges considered and NOT re-added are the dungeon's ghost connections: two rooms that
	// are adjacent in space but not in the map. That is a secret door, for free.
	const secretEdges: Edge[] = [];
	for (const [a, b] of stillRejected) {
		if (secretEdges.length >= 4) break;
		if (!secretsRng.chance(0.4)) continue;
		const from = positionOf.get((hubs[a] as { index: number }).index);
		const to = positionOf.get((hubs[b] as { index: number }).index);
		if (from === undefined || to === undefined) continue;
		secretEdges.push([from, to]);
	}

	const fit = fitToUnit(
		extentPoints(
			keptRooms.map((r) => r.rect),
			paths,
			halfWidth,
		),
		0.02,
	);
	const graphRooms: GraphRoom[] = keptRooms.map((room, i) =>
		toGraphRoom(ctx, fit, room, namePool, i < hubs.length),
	);

	const built = buildGraph(graphRooms, corridorEdges, secretEdges, rolePool);
	const emitted = emitLayers({
		ctx,
		rooms: graphRooms,
		corridors: paths.map((path) => path.map((p) => fitPoint(fit, p))),
		halfWidth: halfWidth * fit.scale,
		built,
		label: 'TinyKeep',
	});

	return {
		layers: emitted.layers,
		pois: emitted.pois,
		graph: built.graph,
		notes: keyedNotes(graphRooms, built.roles),
		summary: summarize(graphRooms.length, built.loops, built.secrets),
	};
}

/** A generator that could not place two rooms still has to return a well-formed, empty result. */
function emptyDungeon(ctx: GeneratorContext, label: string): GeneratorOutput {
	return {
		layers: [
			buildLayer(ctx, 'floor', `${label} — Floor`, 'base', [], 0),
			buildLayer(ctx, 'graph', `${label} — DM Graph`, 'dm-annotations', [], 1),
		],
		pois: [],
		graph: { nodes: [], edges: [] },
		notes: [],
		summary: summarize(0, 0, 0),
	};
}

export const tinykeepDungeon: GeneratorDefinition = {
	id: 'dungeon.tinykeep',
	group: 'dungeon',
	scale: 'battle',
	label: 'Dungeon — Organic',
	description:
		'Scattered chambers shoved apart until they fit, wired together through a Delaunay/MST graph with loops added back.',
	bestFor:
		'The default. Irregular, non-grid dungeons with a few grand halls, real loops, and a graph that knows where the boss and the locked doors go.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'roomCount',
			label: 'Room count',
			help: 'Main chambers. Side-rooms are added on top wherever a corridor cuts through one, so the finished count runs higher.',
			min: 5,
			max: 60,
			step: 1,
			default: 16,
		},
		{
			kind: 'number',
			id: 'roomSize',
			label: 'Room size',
			help: 'Average chamber size. Everything else scales around it.',
			min: 3,
			max: 18,
			step: 0.5,
			default: 7,
		},
		{
			kind: 'number',
			id: 'sizeVariety',
			label: 'Size variety',
			help: '0 = every room the same box. High = a few grand halls among many small chambers.',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.4,
		},
		{
			kind: 'number',
			id: 'loopiness',
			label: 'Loopiness',
			help: 'Share of rejected connections added back as loops. 0 = a pure tree, and every retreat is the way you came.',
			min: 0,
			max: 40,
			step: 1,
			default: 12,
			unit: '%',
		},
		{
			kind: 'number',
			id: 'corridorWidth',
			label: 'Corridor width',
			help: 'Hall width relative to a room. Wide halls read as a fortress; narrow ones as a warren.',
			min: 1,
			max: 6,
			step: 0.5,
			default: 3,
		},
		{
			kind: 'select',
			id: 'dungeonShape',
			label: 'Dungeon shape',
			help: 'The footprint the rooms are scattered into. Compact blobs; sprawling spreads along one axis.',
			options: [
				{
					value: 'compact',
					label: 'Compact',
					help: 'A dense blob. Everything is close to everything.',
				},
				{
					value: 'balanced',
					label: 'Balanced',
					help: 'Slightly wider than tall. The safe default.',
				},
				{
					value: 'sprawling',
					label: 'Sprawling',
					help: 'Spread along one axis — a dungeon following a seam.',
				},
				{
					value: 'linear',
					label: 'Linear',
					help: 'A long thin run. A mine gallery or a sewer trunk.',
				},
			],
			default: 'balanced',
		},
		{
			kind: 'int',
			id: 'separationIterations',
			label: 'Separation effort',
			help: 'How long rooms are pushed apart before the layout is accepted. Higher settles tighter packing.',
			min: 10,
			max: 500,
			step: 10,
			default: 200,
			advanced: true,
			group: 'Layout',
		},
		{
			kind: 'number',
			id: 'gridSnap',
			label: 'Grid snap',
			help: '0 = freeform, off-grid architecture. Higher snaps rooms to a lattice — strictly orthogonal, built.',
			min: 0,
			max: 4,
			step: 0.5,
			default: 1,
			advanced: true,
			group: 'Layout',
		},
		{
			kind: 'number',
			id: 'hubThreshold',
			label: 'Hall threshold',
			help: 'How much bigger than average a chamber must be to qualify as a main hall rather than a closet.',
			min: 1,
			max: 2,
			step: 0.05,
			default: 1.25,
			advanced: true,
			group: 'Rooms',
		},
		{
			kind: 'select',
			id: 'corridorStyle',
			label: 'Corridor style',
			options: CORRIDOR_STYLE_OPTIONS.map((o) => ({ ...o })),
			default: 'elbow',
			advanced: true,
			group: 'Corridors',
		},
	],
	presets: [
		{
			id: 'cramped-crypt',
			label: 'Cramped crypt',
			description: 'Many small cells, tight halls, almost no loops. Claustrophobic.',
			values: {
				roomCount: 26,
				roomSize: 4,
				sizeVariety: 0.25,
				loopiness: 4,
				corridorWidth: 1.5,
				dungeonShape: 'compact',
				gridSnap: 1,
			},
		},
		{
			id: 'sprawling-ruin',
			label: 'Sprawling ruin',
			description: 'A wide, loose ruin with grand halls and plenty of ways around.',
			values: {
				roomCount: 22,
				roomSize: 8,
				sizeVariety: 0.7,
				loopiness: 22,
				corridorWidth: 3,
				dungeonShape: 'sprawling',
				gridSnap: 0.5,
			},
		},
		{
			id: 'flooded-sewer',
			label: 'Flooded sewer',
			description: 'Long, wide, orthogonal trunks with cisterns hanging off them.',
			values: {
				roomCount: 16,
				roomSize: 6,
				sizeVariety: 0.5,
				loopiness: 30,
				corridorWidth: 4,
				dungeonShape: 'linear',
				gridSnap: 2,
				corridorStyle: 'elbow',
			},
		},
		{
			id: 'grand-halls',
			label: 'Grand halls',
			description: 'Few rooms, enormous, joined by broad processional corridors.',
			values: {
				roomCount: 8,
				roomSize: 12,
				sizeVariety: 0.8,
				loopiness: 10,
				corridorWidth: 5,
				dungeonShape: 'balanced',
				hubThreshold: 1.1,
			},
		},
		{
			id: 'megadungeon',
			label: 'Classic megadungeon',
			description: 'A big level: lots of rooms, real loops, a graph worth mapping.',
			values: {
				roomCount: 36,
				roomSize: 7,
				sizeVariety: 0.55,
				loopiness: 15,
				corridorWidth: 3,
				dungeonShape: 'balanced',
				gridSnap: 1,
			},
		},
	],
	run: runTinyKeep,
};

/* -------------------------------------------------------------------------------------------------
 * 2 — dungeon.bsp
 * ---------------------------------------------------------------------------------------------- */

interface BspNode {
	rect: Rect;
	left: number;
	right: number;
}

const BSP_EXTENT = 64;

function runBsp(ctx: GeneratorContext): GeneratorOutput {
	const roomCount = numberParam(ctx.params, 'roomCount');
	const padding = numberParam(ctx.params, 'roomPadding');
	const splitVariance = numberParam(ctx.params, 'splitVariance');
	const extraConnections = numberParam(ctx.params, 'extraConnections');
	const corridorWidth = numberParam(ctx.params, 'corridorWidth');
	const style = stringParam(ctx.params, 'corridorStyle') as CorridorStyle;
	const roomFill = numberParam(ctx.params, 'roomFill');
	const maxAspect = numberParam(ctx.params, 'maxAspect');

	const roomsRng = ctx.rng.stream('rooms');
	const corridorsRng = ctx.rng.stream('corridors');
	const secretsRng = ctx.rng.stream('secrets');
	const namePool = drawNamePool(ctx.rng.stream('names'));
	const rolePool = drawRolePool(ctx.rng.stream('roles'));

	const minRoom = 4;
	const minLeaf = minRoom + 2 * padding;

	const nodes: BspNode[] = [
		{ rect: { x: 0, y: 0, w: BSP_EXTENT, h: BSP_EXTENT }, left: -1, right: -1 },
	];
	const leaves = new Set<number>([0]);
	const splittable = (r: Rect): boolean => r.w >= 2 * minLeaf || r.h >= 2 * minLeaf;

	// Split the LARGEST splittable leaf each round rather than recursing to a fixed depth. Depth gives
	// you 2^n rooms and no control in between; this makes "Room count" mean what it says, and it splits
	// the biggest space first, which is also what a builder would do.
	while (leaves.size < roomCount) {
		let target = -1;
		let targetArea = -1;
		for (const leaf of [...leaves].sort((a, b) => a - b)) {
			const rect = (nodes[leaf] as BspNode).rect;
			if (!splittable(rect)) continue;
			const area = rect.w * rect.h;
			if (area > targetArea + 1e-9) {
				targetArea = area;
				target = leaf;
			}
		}
		if (target < 0) break;

		const rect = (nodes[target] as BspNode).rect;
		let vertical: boolean;
		if (rect.w / rect.h > maxAspect) vertical = true;
		else if (rect.h / rect.w > maxAspect) vertical = false;
		else vertical = roomsRng.chance(0.5);
		if (vertical && rect.w < 2 * minLeaf) vertical = false;
		if (!vertical && rect.h < 2 * minLeaf) vertical = true;

		const span = vertical ? rect.w : rect.h;
		const ratio = 0.5 + (roomsRng.next() * 2 - 1) * splitVariance;
		let cut = Math.round(span * ratio);
		cut = clamp(cut, minLeaf, span - minLeaf);

		const a: Rect = vertical
			? { x: rect.x, y: rect.y, w: cut, h: rect.h }
			: { x: rect.x, y: rect.y, w: rect.w, h: cut };
		const b: Rect = vertical
			? { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }
			: { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut };
		nodes.push({ rect: a, left: -1, right: -1 });
		nodes.push({ rect: b, left: -1, right: -1 });
		const leftIndex = nodes.length - 2;
		const rightIndex = nodes.length - 1;
		(nodes[target] as BspNode).left = leftIndex;
		(nodes[target] as BspNode).right = rightIndex;
		leaves.delete(target);
		leaves.add(leftIndex);
		leaves.add(rightIndex);
	}

	const leafList = [...leaves].sort((a, b) => a - b);
	if (leafList.length < 2) return emptyDungeon(ctx, 'Fortress');

	const rooms: Array<{ index: number; rect: Rect }> = [];
	const roomOfLeaf = new Map<number, number>();
	for (const leaf of leafList) {
		const rect = (nodes[leaf] as BspNode).rect;
		const innerW = Math.max(minRoom, rect.w - 2 * padding);
		const innerH = Math.max(minRoom, rect.h - 2 * padding);
		const w = Math.max(minRoom, Math.round(innerW * (roomFill + roomsRng.next() * (1 - roomFill))));
		const h = Math.max(minRoom, Math.round(innerH * (roomFill + roomsRng.next() * (1 - roomFill))));
		const ox = Math.round(roomsRng.next() * Math.max(0, innerW - w));
		const oy = Math.round(roomsRng.next() * Math.max(0, innerH - h));
		roomOfLeaf.set(leaf, rooms.length);
		rooms.push({
			index: rooms.length,
			rect: { x: rect.x + padding + ox, y: rect.y + padding + oy, w, h },
		});
	}

	// Corridors follow the tree back up: connect the two nearest rooms across each internal node's
	// subtrees. That is what gives BSP its floorplan legibility — halls never cross a partition they
	// have no business crossing.
	const treeEdges: Edge[] = [];
	const collect = (node: number): number[] => {
		const n = nodes[node] as BspNode;
		if (n.left < 0 || n.right < 0) {
			const room = roomOfLeaf.get(node);
			return room === undefined ? [] : [room];
		}
		const leftRooms = collect(n.left);
		const rightRooms = collect(n.right);
		let best: Edge | null = null;
		let bestD = Infinity;
		for (const a of leftRooms) {
			for (const b of rightRooms) {
				const d = dist(
					rectCenter((rooms[a] as { rect: Rect }).rect),
					rectCenter((rooms[b] as { rect: Rect }).rect),
				);
				if (d < bestD - 1e-12) {
					bestD = d;
					best = [a, b];
				}
			}
		}
		if (best) treeEdges.push(best);
		return [...leftRooms, ...rightRooms];
	};
	collect(0);

	// A pure BSP tree has ZERO loops — the classic complaint, and the reason this knob is on the primary
	// surface rather than buried in Advanced.
	const connectedKeys = new Set(treeEdges.map(([a, b]) => edgeKey(a, b)));
	const neighbours: Edge[] = [];
	for (let i = 0; i < rooms.length; i += 1) {
		for (let j = i + 1; j < rooms.length; j += 1) {
			if (connectedKeys.has(edgeKey(i, j))) continue;
			const a = (rooms[i] as { rect: Rect }).rect;
			const b = (rooms[j] as { rect: Rect }).rect;
			if (!rectsOverlap(a, b, 2 * padding + 3)) continue;
			neighbours.push([i, j]);
		}
	}
	const shuffledNeighbours = corridorsRng.shuffle(neighbours);
	const extraCount = Math.min(
		shuffledNeighbours.length,
		Math.round((extraConnections / 100) * rooms.length),
	);
	const extras = shuffledNeighbours.slice(0, extraCount);
	const leftovers = shuffledNeighbours.slice(extraCount);

	const corridorEdges: Edge[] = [...treeEdges, ...extras];
	const paths = corridorEdges.map(([a, b]) =>
		corridorPath(
			(rooms[a] as { rect: Rect }).rect,
			(rooms[b] as { rect: Rect }).rect,
			style,
			corridorWidth,
			corridorsRng,
		),
	);

	const secretEdges: Edge[] = [];
	for (const edge of leftovers) {
		if (secretEdges.length >= 4) break;
		if (!secretsRng.chance(0.35)) continue;
		secretEdges.push(edge);
	}

	const halfWidth = corridorWidth / 2;
	const fit = fitToUnit(
		extentPoints(
			rooms.map((r) => r.rect),
			paths,
			halfWidth,
		),
		0.02,
	);
	const graphRooms: GraphRoom[] = rooms.map((room) => toGraphRoom(ctx, fit, room, namePool, false));

	const built = buildGraph(graphRooms, corridorEdges, secretEdges, rolePool);
	const emitted = emitLayers({
		ctx,
		rooms: graphRooms,
		corridors: paths.map((path) => path.map((p) => fitPoint(fit, p))),
		halfWidth: halfWidth * fit.scale,
		built,
		label: 'Fortress',
	});

	return {
		layers: emitted.layers,
		pois: emitted.pois,
		graph: built.graph,
		notes: keyedNotes(graphRooms, built.roles),
		summary: summarize(graphRooms.length, built.loops, built.secrets),
	};
}

export const bspDungeon: GeneratorDefinition = {
	id: 'dungeon.bsp',
	group: 'dungeon',
	scale: 'battle',
	label: 'Dungeon — Structured',
	description:
		'Recursive partition of the floorplate into rooms, with halls connecting siblings back up the tree.',
	bestFor:
		'Built places: a fortress, a wizard’s tower, a temple, a prison block. Rectilinear, no wasted space, reads as architecture.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'roomCount',
			label: 'Room count',
			help: 'How many rooms the floorplate is divided into. The partition stops when it cannot make another that fits.',
			min: 4,
			max: 48,
			step: 1,
			default: 16,
		},
		{
			kind: 'number',
			id: 'roomPadding',
			label: 'Room padding',
			help: 'Gap between a room and its partition — the space the corridors breathe in. 0 packs rooms wall-to-wall.',
			min: 0,
			max: 4,
			step: 0.5,
			default: 1.5,
		},
		{
			kind: 'number',
			id: 'splitVariance',
			label: 'Split variance',
			help: '0 = every cut dead centre, uniform and institutional. High = irregular, added-onto-over-centuries.',
			min: 0,
			max: 0.4,
			step: 0.01,
			default: 0.18,
		},
		{
			kind: 'number',
			id: 'extraConnections',
			label: 'Extra connections',
			help: 'A partition is a pure tree — one route to every room. This cuts shortcuts between neighbours.',
			min: 0,
			max: 40,
			step: 1,
			default: 10,
			unit: '%',
		},
		{
			kind: 'number',
			id: 'corridorWidth',
			label: 'Corridor width',
			help: 'Hall width. Wide halls suit a fortress; narrow ones suit a tower stair.',
			min: 1,
			max: 5,
			step: 0.5,
			default: 2,
		},
		{
			kind: 'select',
			id: 'corridorStyle',
			label: 'Corridor style',
			options: CORRIDOR_STYLE_OPTIONS.map((o) => ({ ...o })),
			default: 'elbow',
			advanced: true,
			group: 'Corridors',
		},
		{
			kind: 'number',
			id: 'roomFill',
			label: 'Room fill',
			help: 'How much of its partition a room claims. Lower leaves ragged voids between rooms.',
			min: 0.5,
			max: 1,
			step: 0.05,
			default: 0.85,
			advanced: true,
			group: 'Rooms',
		},
		{
			kind: 'number',
			id: 'maxAspect',
			label: 'Max room aspect',
			help: 'Force the cut across the long axis above this ratio — the guard against 1x20 slivers.',
			min: 1.2,
			max: 3,
			step: 0.1,
			default: 1.6,
			advanced: true,
			group: 'Rooms',
		},
	],
	presets: [
		{
			id: 'fortress',
			label: 'Fortress',
			description: 'Big regular halls, broad corridors, a few flanking routes.',
			values: {
				roomCount: 14,
				roomPadding: 2,
				splitVariance: 0.1,
				extraConnections: 15,
				corridorWidth: 3,
				roomFill: 0.9,
			},
		},
		{
			id: 'wizards-tower',
			label: "Wizard's tower",
			description:
				'Many small chambers, tight halls, no shortcuts. You go where the tower lets you.',
			values: {
				roomCount: 30,
				roomPadding: 1,
				splitVariance: 0.3,
				extraConnections: 0,
				corridorWidth: 1.5,
				roomFill: 0.8,
			},
		},
		{
			id: 'prison-block',
			label: 'Prison block',
			description: 'Uniform cells off a rigid spine. Institutional and grim.',
			values: {
				roomCount: 36,
				roomPadding: 1.5,
				splitVariance: 0,
				extraConnections: 5,
				corridorWidth: 2,
				roomFill: 0.95,
				maxAspect: 1.3,
			},
		},
		{
			id: 'temple-complex',
			label: 'Temple complex',
			description: 'A handful of grand chambers with processional halls and a ring route.',
			values: {
				roomCount: 9,
				roomPadding: 2.5,
				splitVariance: 0.2,
				extraConnections: 30,
				corridorWidth: 4,
				roomFill: 0.9,
			},
		},
		{
			id: 'guild-warren',
			label: 'Guild warren',
			description: 'Cramped, irregular, riddled with back-doors between rooms.',
			values: {
				roomCount: 40,
				roomPadding: 0.5,
				splitVariance: 0.35,
				extraConnections: 35,
				corridorWidth: 1,
				roomFill: 0.75,
			},
		},
	],
	run: runBsp,
};

/* -------------------------------------------------------------------------------------------------
 * 3 — dungeon.rooms-and-mazes
 * ---------------------------------------------------------------------------------------------- */

const MAZE_DIRS: readonly Point[] = [
	{ x: 0, y: -1 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
];

const DEAD_END_PASSES: Record<string, number> = { keep: 0, some: 4, none: 1_000_000 };

/**
 * Trace a set of 4-connected cells into polyline chains through their centres. Junctions and endpoints
 * terminate a chain, so a corridor network of any shape comes out as a handful of polylines rather than
 * one segment per cell.
 */
function traceChains(cells: ReadonlyArray<number>, width: number): number[][] {
	const set = new Set(cells);
	const sorted = [...cells].sort((a, b) => a - b);
	const neighbours = (i: number): number[] => {
		const x = i % width;
		const out: number[] = [];
		if (x > 0 && set.has(i - 1)) out.push(i - 1);
		if (x < width - 1 && set.has(i + 1)) out.push(i + 1);
		if (set.has(i - width)) out.push(i - width);
		if (set.has(i + width)) out.push(i + width);
		return out.sort((a, b) => a - b);
	};
	const visited = new Set<string>();
	const chains: number[][] = [];

	const walk = (start: number, first: number): number[] => {
		const chain = [start];
		let prev = start;
		let cur = first;
		visited.add(edgeKey(prev, cur));
		for (;;) {
			chain.push(cur);
			const next = neighbours(cur).filter((c) => c !== prev);
			if (neighbours(cur).length !== 2 || next.length !== 1) break;
			const step = next[0] as number;
			const key = edgeKey(cur, step);
			if (visited.has(key)) break;
			visited.add(key);
			prev = cur;
			cur = step;
		}
		return chain;
	};

	for (const cell of sorted) {
		const degree = neighbours(cell).length;
		if (degree === 0) {
			chains.push([cell]);
			continue;
		}
		if (degree === 2) continue;
		for (const next of neighbours(cell)) {
			if (visited.has(edgeKey(cell, next))) continue;
			chains.push(walk(cell, next));
		}
	}
	// Anything still unvisited is a pure ring of degree-2 cells — a corridor loop with no junction.
	for (const cell of sorted) {
		for (const next of neighbours(cell)) {
			if (visited.has(edgeKey(cell, next))) continue;
			chains.push(walk(cell, next));
		}
	}
	return chains;
}

function runRoomsAndMazes(ctx: GeneratorContext): GeneratorOutput {
	const roomDensity = numberParam(ctx.params, 'roomDensity');
	const wander = numberParam(ctx.params, 'corridorWander');
	const loopiness = numberParam(ctx.params, 'loopiness');
	const deadEnds = stringParam(ctx.params, 'deadEnds');
	const extent = numberParam(ctx.params, 'dungeonExtent');
	const roomExtraSize = numberParam(ctx.params, 'roomExtraSize');
	const corridorWidth = numberParam(ctx.params, 'corridorWidth');

	const roomsRng = ctx.rng.stream('rooms');
	const corridorsRng = ctx.rng.stream('corridors');
	const secretsRng = ctx.rng.stream('secrets');
	const namePool = drawNamePool(ctx.rng.stream('names'));
	const rolePool = drawRolePool(ctx.rng.stream('roles'));

	// The lattice MUST be odd: rooms sit at odd coordinates with odd sizes so that they land on the same
	// cell parity the maze carver walks. Break that and corridors meet room walls at half-cells, which is
	// exactly the "artificially aligned" seam Nystrom warns about — only worse.
	const W = extent % 2 === 0 ? extent + 1 : extent;
	const H = W;
	const grid: CellGrid = createGrid(W, H, 0); // 1 = FLOOR here (this buffer is ours; it is never persisted)
	const regions = new Int32Array(W * H).fill(-1);
	let regionCount = 0;

	const carve = (x: number, y: number, region: number): void => {
		gridSet(grid, x, y, 1);
		regions[y * W + x] = region;
	};

	const rooms: Array<{ index: number; rect: Rect; region: number }> = [];
	for (let attempt = 0; attempt < roomDensity; attempt += 1) {
		const size = roomsRng.nextInt(1, 2 + roomExtraSize) * 2 + 1;
		const rectangularity = roomsRng.nextInt(0, 1 + Math.floor(size / 2)) * 2;
		let w = size;
		let h = size;
		if (roomsRng.chance(0.5)) w += rectangularity;
		else h += rectangularity;
		w = Math.min(w, W - 2);
		h = Math.min(h, H - 2);
		if (w % 2 === 0) w -= 1;
		if (h % 2 === 0) h -= 1;
		const xSlots = Math.floor((W - w) / 2);
		const ySlots = Math.floor((H - h) / 2);
		if (xSlots < 1 || ySlots < 1) continue;
		const x = roomsRng.nextInt(0, xSlots - 1) * 2 + 1;
		const y = roomsRng.nextInt(0, ySlots - 1) * 2 + 1;
		const rect: Rect = { x, y, w, h };
		// A one-cell buffer is required, not cosmetic: two rooms sharing a wall have no cell left to hang
		// a connector on, so they could never be joined.
		if (rooms.some((other) => rectsOverlap(other.rect, rect, 1))) continue;
		const region = regionCount;
		regionCount += 1;
		for (let cy = y; cy < y + h; cy += 1) {
			for (let cx = x; cx < x + w; cx += 1) carve(cx, cy, region);
		}
		rooms.push({ index: rooms.length, rect, region });
	}
	if (rooms.length < 2) return emptyDungeon(ctx, 'Graph-paper');

	// Growing-tree maze fill of every remaining solid pocket.
	const canCarve = (x: number, y: number, dir: Point): boolean => {
		const bx = x + dir.x * 3;
		const by = y + dir.y * 3;
		if (bx < 0 || by < 0 || bx >= W || by >= H) return false;
		return gridGet(grid, x + dir.x * 2, y + dir.y * 2) === 0;
	};
	for (let sy = 1; sy < H; sy += 2) {
		for (let sx = 1; sx < W; sx += 2) {
			if (gridGet(grid, sx, sy) !== 0) continue;
			const region = regionCount;
			regionCount += 1;
			carve(sx, sy, region);
			const stack: Point[] = [{ x: sx, y: sy }];
			let lastDir: Point | null = null;
			while (stack.length > 0) {
				const cell = stack[stack.length - 1] as Point;
				const open = MAZE_DIRS.filter((d) => canCarve(cell.x, cell.y, d));
				if (open.length === 0) {
					stack.pop();
					lastDir = null;
					continue;
				}
				// High wander = re-roll the direction every step (twisty). Low = keep going straight until
				// you hit something. This is the single best "feel" knob in the whole generator.
				const previous = lastDir;
				const straightOk =
					previous !== null && open.some((d) => d.x === previous.x && d.y === previous.y);
				const dir: Point =
					straightOk && previous !== null && !corridorsRng.chance(wander / 100)
						? previous
						: corridorsRng.pick(open);
				carve(cell.x + dir.x, cell.y + dir.y, region);
				carve(cell.x + dir.x * 2, cell.y + dir.y * 2, region);
				stack.push({ x: cell.x + dir.x * 2, y: cell.y + dir.y * 2 });
				lastDir = dir;
			}
		}
	}

	// Connectors: solid cells that touch two or more regions. Merging through them with a union-find is
	// what turns a pile of disjoint regions into one dungeon.
	const connectorRegions = new Map<number, number[]>();
	for (let y = 1; y < H - 1; y += 1) {
		for (let x = 1; x < W - 1; x += 1) {
			if (gridGet(grid, x, y) !== 0) continue;
			const touching = new Set<number>();
			for (const d of MAZE_DIRS) {
				const r = regions[(y + d.y) * W + (x + d.x)] as number;
				if (r >= 0) touching.add(r);
			}
			if (touching.size < 2) continue;
			connectorRegions.set(
				y * W + x,
				[...touching].sort((a, b) => a - b),
			);
		}
	}

	const parent = Array.from({ length: regionCount }, (_, i) => i);
	const find = (i: number): number => {
		let root = i;
		while ((parent[root] as number) !== root) root = parent[root] as number;
		let cur = i;
		while ((parent[cur] as number) !== cur) {
			const next = parent[cur] as number;
			parent[cur] = root;
			cur = next;
		}
		return root;
	};

	let open = new Set<number>(Array.from({ length: regionCount }, (_, i) => i));
	let candidates = [...connectorRegions.keys()].sort((a, b) => a - b);
	const carvedConnectors: number[] = [];
	const rejectedConnectors: number[] = [];

	const carveConnector = (cell: number): void => {
		const region = find((connectorRegions.get(cell) as number[])[0] as number);
		carve(cell % W, Math.floor(cell / W), region);
		carvedConnectors.push(cell);
	};

	while (open.size > 1 && candidates.length > 0) {
		const chosen = corridorsRng.pick(candidates);
		const merging = (connectorRegions.get(chosen) as number[]).map(find);
		carveConnector(chosen);
		const root = find(merging[0] as number);
		for (const region of merging) {
			const r = find(region);
			if (r !== root) {
				parent[r] = root;
				open.delete(r);
			}
		}
		open = new Set([...open].map(find));

		const cx = chosen % W;
		const cy = Math.floor(chosen / W);
		const next: number[] = [];
		for (const cell of candidates) {
			if (cell === chosen) continue;
			const x = cell % W;
			const y = Math.floor(cell / W);
			// Two doors side by side is a hole in the wall, not two doors.
			if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < 2) continue;
			const spans = new Set((connectorRegions.get(cell) as number[]).map(find));
			if (spans.size > 1) {
				next.push(cell);
				continue;
			}
			// This connector is redundant — but keeping a few of them is the ONLY thing standing between
			// this and a singly-connected dungeon where every route is the route you came in by.
			if (corridorsRng.chance(loopiness / 100)) carveConnector(cell);
			else rejectedConnectors.push(cell);
		}
		candidates = next;
	}

	// Dead-end pruning. Keeping them is a legitimate choice, not laziness: a stub corridor going nowhere
	// is a free secret-room candidate and the oldest trick on a hand-drawn map.
	const passes = DEAD_END_PASSES[deadEnds] ?? 4;
	for (let pass = 0; pass < passes; pass += 1) {
		let removed = false;
		for (let y = 1; y < H - 1; y += 1) {
			for (let x = 1; x < W - 1; x += 1) {
				if (gridGet(grid, x, y) !== 1) continue;
				let exits = 0;
				for (const d of MAZE_DIRS) if (gridGet(grid, x + d.x, y + d.y) === 1) exits += 1;
				if (exits > 1) continue;
				gridSet(grid, x, y, 0);
				regions[y * W + x] = -1;
				removed = true;
			}
		}
		if (!removed) break;
	}

	const roomOfCell = new Int32Array(W * H).fill(-1);
	for (const room of rooms) {
		for (let y = room.rect.y; y < room.rect.y + room.rect.h; y += 1) {
			for (let x = room.rect.x; x < room.rect.x + room.rect.w; x += 1)
				roomOfCell[y * W + x] = room.index;
		}
	}
	const corridorCells: number[] = [];
	for (let y = 0; y < H; y += 1) {
		for (let x = 0; x < W; x += 1) {
			if (gridGet(grid, x, y) !== 1) continue;
			if ((roomOfCell[y * W + x] as number) >= 0) continue;
			corridorCells.push(y * W + x);
		}
	}

	// The room graph is read back off the FINAL carved floor, not off the pre-pruning region graph — the
	// graph must describe the dungeon that exists, not the one that was planned.
	const corridorSet = new Set(corridorCells);
	const seen = new Set<number>();
	const corridorEdges: Edge[] = [];
	for (const start of corridorCells) {
		if (seen.has(start)) continue;
		const component: number[] = [];
		const touched = new Set<number>();
		const queue = [start];
		seen.add(start);
		for (let head = 0; head < queue.length; head += 1) {
			const cell = queue[head] as number;
			component.push(cell);
			const x = cell % W;
			const y = Math.floor(cell / W);
			for (const d of MAZE_DIRS) {
				const nx = x + d.x;
				const ny = y + d.y;
				if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
				const n = ny * W + nx;
				const room = roomOfCell[n] as number;
				if (room >= 0 && gridGet(grid, nx, ny) === 1) {
					touched.add(room);
					continue;
				}
				if (!corridorSet.has(n) || seen.has(n)) continue;
				seen.add(n);
				queue.push(n);
			}
		}
		// Every room this corridor component touches is mutually reachable through it; a chain (rather
		// than a clique) records that without inventing loops that do not exist.
		const chain = [...touched].sort((a, b) => a - b);
		for (let i = 1; i < chain.length; i += 1) {
			corridorEdges.push([chain[i - 1] as number, chain[i] as number]);
		}
	}

	const chains = traceChains(corridorCells, W);
	const paths: Point[][] = [];
	const junctions: Point[][] = [];
	const halfWidth = corridorWidth / 2;
	for (const chain of chains) {
		const points = chain.map((cell) => ({ x: (cell % W) + 0.5, y: Math.floor(cell / W) + 0.5 }));
		if (points.length >= 2) paths.push(points);
		else if (points.length === 1) {
			const p = points[0] as Point;
			junctions.push(
				rectToRing({ x: p.x - halfWidth, y: p.y - halfWidth, w: 2 * halfWidth, h: 2 * halfWidth }),
			);
		}
	}

	// Secret doors: rooms that are near neighbours in SPACE but not in the MAP — the rejected connectors
	// are exactly that list, so the ghosts of the merge become the dungeon's hidden ways.
	const connectedKeys = new Set(corridorEdges.map(([a, b]) => edgeKey(a, b)));
	const secretEdges: Edge[] = [];
	for (const cell of rejectedConnectors) {
		if (secretEdges.length >= 4) break;
		const x = cell % W;
		const y = Math.floor(cell / W);
		const near = new Set<number>();
		for (const d of MAZE_DIRS) {
			const room = roomOfCell[(y + d.y) * W + (x + d.x)] as number;
			if (room >= 0) near.add(room);
		}
		const pair = [...near].sort((a, b) => a - b);
		if (pair.length !== 2) continue;
		const key = edgeKey(pair[0] as number, pair[1] as number);
		if (connectedKeys.has(key)) continue;
		if (!secretsRng.chance(0.5)) continue;
		connectedKeys.add(key);
		secretEdges.push([pair[0] as number, pair[1] as number]);
	}

	const fit = fitToUnit(
		extentPoints(
			rooms.map((r) => r.rect),
			paths,
			halfWidth,
		),
		0.02,
	);
	const graphRooms: GraphRoom[] = rooms.map((room) => toGraphRoom(ctx, fit, room, namePool, false));

	const built = buildGraph(graphRooms, corridorEdges, secretEdges, rolePool);
	const emitted = emitLayers({
		ctx,
		rooms: graphRooms,
		corridors: paths.map((path) => path.map((p) => fitPoint(fit, p))),
		halfWidth: halfWidth * fit.scale,
		extraFloors: junctions.map((ring) => ring.map((p) => fitPoint(fit, p))),
		built,
		label: 'Graph-paper',
	});

	return {
		layers: emitted.layers,
		pois: emitted.pois,
		graph: built.graph,
		notes: keyedNotes(graphRooms, built.roles),
		summary: summarize(graphRooms.length, built.loops, built.secrets),
	};
}

export const roomsAndMazesDungeon: GeneratorDefinition = {
	id: 'dungeon.rooms-and-mazes',
	group: 'dungeon',
	scale: 'battle',
	label: 'Dungeon — Graph-paper',
	description:
		'Rooms dropped onto an odd-cell lattice, a maze grown through everything left over, then merged and pruned.',
	bestFor:
		'The classic hand-drawn D&D look: rectilinear rooms joined by long twisty passages, dead ends and all.',
	version: 1,
	params: [
		{
			kind: 'int',
			id: 'roomDensity',
			label: 'Room density',
			help: 'Placement attempts, not a room count — rooms that land on top of another are simply dropped.',
			min: 20,
			max: 400,
			step: 5,
			default: 140,
		},
		{
			kind: 'number',
			id: 'corridorWander',
			label: 'Corridor wander',
			help: '0 = long straight runs that read as built. 100 = twisty, disorienting, maze-like.',
			min: 0,
			max: 100,
			step: 5,
			default: 40,
			unit: '%',
		},
		{
			kind: 'number',
			id: 'loopiness',
			label: 'Loopiness',
			help: 'Redundant doors kept between already-joined areas. 0 = exactly one route to every room.',
			min: 0,
			max: 40,
			step: 1,
			default: 8,
			unit: '%',
		},
		{
			kind: 'select',
			id: 'deadEnds',
			label: 'Dead ends',
			help: 'Stub corridors going nowhere. Keeping them is good — they are free secret-room candidates.',
			options: [
				{
					value: 'keep',
					label: 'Keep all',
					help: 'The full maze. Dense, confusing, lots of hiding places.',
				},
				{ value: 'some', label: 'Trim some', help: 'Prune the worst stubs, keep the character.' },
				{
					value: 'none',
					label: 'Remove all',
					help: 'Only corridors that go somewhere. Clean and sparse.',
				},
			],
			default: 'some',
		},
		{
			kind: 'int',
			id: 'dungeonExtent',
			label: 'Dungeon extent',
			help: 'Lattice size. Bigger means more room for the maze to sprawl, at the same room density.',
			min: 21,
			max: 81,
			step: 2,
			default: 41,
			advanced: true,
			group: 'Layout',
		},
		{
			kind: 'int',
			id: 'roomExtraSize',
			label: 'Room size bonus',
			help: 'Raises the ceiling on how big a room may roll. 0 keeps everything small and cellular.',
			min: 0,
			max: 4,
			step: 1,
			default: 1,
			advanced: true,
			group: 'Rooms',
		},
		{
			kind: 'number',
			id: 'corridorWidth',
			label: 'Corridor width',
			help: 'Passage width in lattice cells. Below 1 the halls read as cramped crawlspaces.',
			min: 0.6,
			max: 1.6,
			step: 0.1,
			default: 1,
			advanced: true,
			group: 'Corridors',
		},
	],
	presets: [
		{
			id: 'classic-megadungeon',
			label: 'Classic megadungeon',
			description: 'The graph-paper original: rooms, long passages, a few loops, some dead ends.',
			values: {
				roomDensity: 160,
				corridorWander: 40,
				loopiness: 8,
				deadEnds: 'some',
				dungeonExtent: 61,
			},
		},
		{
			id: 'cramped-crypt',
			label: 'Cramped crypt',
			description: 'Small cells and a knot of twisting passages that all look the same.',
			values: {
				roomDensity: 220,
				corridorWander: 90,
				loopiness: 4,
				deadEnds: 'keep',
				dungeonExtent: 41,
				roomExtraSize: 0,
			},
		},
		{
			id: 'flooded-sewer',
			label: 'Flooded sewer',
			description: 'Long straight trunks, heavily interconnected. You can always go around.',
			values: {
				roomDensity: 90,
				corridorWander: 0,
				loopiness: 30,
				deadEnds: 'none',
				dungeonExtent: 51,
				corridorWidth: 1.4,
			},
		},
		{
			id: 'mine-workings',
			label: 'Mine workings',
			description: 'Sparse chambers off a rambling warren of abandoned dead-end galleries.',
			values: {
				roomDensity: 50,
				corridorWander: 70,
				loopiness: 2,
				deadEnds: 'keep',
				dungeonExtent: 71,
				roomExtraSize: 2,
			},
		},
		{
			id: 'sprawling-ruin',
			label: 'Sprawling ruin',
			description: 'Large collapsed halls, wide passages, and a lot of ways through.',
			values: {
				roomDensity: 120,
				corridorWander: 25,
				loopiness: 20,
				deadEnds: 'some',
				dungeonExtent: 71,
				roomExtraSize: 4,
			},
		},
	],
	run: runRoomsAndMazes,
};

/** The dungeon family, in the order the picker should show them. */
export const DUNGEON_GENERATORS: readonly GeneratorDefinition[] = Object.freeze([
	tinykeepDungeon,
	bspDungeon,
	roomsAndMazesDungeon,
]);
