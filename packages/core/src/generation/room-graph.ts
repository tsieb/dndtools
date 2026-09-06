import type { MapFeature } from '../state/map-state';

/**
 * RC-MAP-3.4 — the ROOM GRAPH derived from what is actually on the map.
 *
 * `stockDungeon` keys a dungeon at generation time, from the graph the generator happened to build.
 * That is one moment in a map's life. Afterwards the GM paints a room in by hand, deletes the corridor
 * that made a wing reachable, imports someone else's dungeon — and the generator's graph is gone or
 * wrong. So this module derives the graph BACK OUT of the persisted features, geometrically: whatever
 * is on the map right now is the graph, whoever put it there.
 *
 * The derivation is pure and deterministic. It reads layer content and returns a value; it dispatches
 * nothing, and the same layers produce the same graph in the same order on every device.
 *
 * Two rules do all the work:
 *
 *   - A NODE is a floor feature. `room` rects and closed `polygon`s are rooms; a polygon whose style
 *     says corridor (`dungeon:corridor`, the offset polyline every generator emits for a hall) is a
 *     corridor. Corridors are nodes rather than edges because a GM stocks them too — a hall with a pit
 *     trap in it is the whole point of having halls.
 *   - An EDGE is two nodes whose bounds touch within {@link ROOM_GRAPH_TOUCH_TOLERANCE}, or a `door` feature
 *     whose span touches both. Corridors are drawn from room centre to room centre, so a corridor
 *     overlaps the two rooms it joins and the adjacency falls out of the geometry for free. A door
 *     between two rooms that share a wall connects them with no corridor at all.
 *
 * Bounds rather than exact polygon intersection is a deliberate simplification: it is cheap, it never
 * reports a false NEGATIVE for the corridor case (a corridor's bounds always contain its endpoints),
 * and a spurious link between two rooms whose boxes graze is visible and harmless in a panel a human
 * reads. Exact clipping would cost far more for a graph nobody simulates.
 */

/** What is in the room. The four buckets every stocking table in print reduces to. */
export const ROOM_STOCKING_KINDS = Object.freeze(['empty', 'monster', 'treasure', 'trap'] as const);

export type RoomStocking = (typeof ROOM_STOCKING_KINDS)[number];

/** The feature prop the stocking is persisted in. Additive — absent means "not keyed yet". */
export const ROOM_STOCKING_PROP = 'stocking';

/** Read a feature's stocking, tolerating the absent and the unrecognised alike (fail soft: null). */
export function readStocking(feature: MapFeature): RoomStocking | null {
	const raw = feature.props?.[ROOM_STOCKING_PROP];
	return typeof raw === 'string' && (ROOM_STOCKING_KINDS as readonly string[]).includes(raw)
		? (raw as RoomStocking)
		: null;
}

export interface RoomGraphBounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface RoomGraphNode {
	/** The feature's id. Selecting the node selects exactly this feature. */
	id: string;
	/** The layer the feature lives on — a stocking write has to name it. */
	layerId: string;
	kind: 'room' | 'corridor';
	/** 1-based key number, assigned to ROOMS in reading order. Corridors are unnumbered (`null`). */
	number: number | null;
	/** `props.name` when the generator named it, else the role, else the key number. */
	label: string;
	/** Generator-assigned role ('entrance', 'boss', ...) when present. */
	role: string | null;
	stocking: RoomStocking | null;
	centre: { x: number; y: number };
	bounds: RoomGraphBounds;
	/** How many edges touch this node. 0 means nothing connects to it. */
	degree: number;
}

export interface RoomGraphEdge {
	from: string;
	to: string;
	/** 'passage' — the floor shapes touch. 'door' — a door feature spans between them. */
	kind: 'passage' | 'door';
}

export interface RoomGraph {
	nodes: RoomGraphNode[];
	edges: RoomGraphEdge[];
	/** Node ids unreachable from the entrance (or, with no entrance, from the first node). */
	unreachable: string[];
	/** How many ROOM nodes carry a stocking. The panel's "9 of 14 keyed" readout. */
	stockedRooms: number;
	roomCount: number;
	corridorCount: number;
}

/**
 * Normalized-space slack when deciding whether two shapes touch. Corridors are drawn centre-to-centre
 * so they overlap outright; this exists for the case a wall's thickness leaves a hairline gap, and is
 * small enough (0.2% of the map) that two genuinely separate rooms never merge.
 */
export const ROOM_GRAPH_TOUCH_TOLERANCE = 0.002;

const CORRIDOR_STYLE = /(^|[:-])corridor([:-]|$)/i;

function boundsOfPoints(points: readonly { x: number; y: number }[]): RoomGraphBounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const point of points) {
		if (point.x < minX) minX = point.x;
		if (point.x > maxX) maxX = point.x;
		if (point.y < minY) minY = point.y;
		if (point.y > maxY) maxY = point.y;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function touches(a: RoomGraphBounds, b: RoomGraphBounds, tolerance: number): boolean {
	return (
		a.x - tolerance <= b.x + b.w &&
		b.x - tolerance <= a.x + a.w &&
		a.y - tolerance <= b.y + b.h &&
		b.y - tolerance <= a.y + a.h
	);
}

function stringProp(feature: MapFeature, key: string): string | null {
	const value = feature.props?.[key];
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Is this feature a floor shape — something a party can stand in and a GM can stock? */
function floorKind(feature: MapFeature): 'room' | 'corridor' | null {
	if (feature.kind === 'room') return 'room';
	if (feature.kind !== 'polygon') return null;
	return CORRIDOR_STYLE.test(feature.style) ? 'corridor' : 'room';
}

/**
 * The shape the derivation reads: an id and the features on it. Deliberately STRUCTURAL rather than
 * `MapLayer`, so the app can pass the actor-filtered layer query's entries (which carry `layerId`,
 * not `id`) without first rebuilding whole layers — and so a player-scoped read stays player-scoped.
 */
export interface RoomGraphLayer {
	id: string;
	content: readonly MapFeature[];
}

export interface DeriveRoomGraphOptions {
	/** Override the touch slack. Mostly here so a test can state its geometry exactly. */
	touchTolerance?: number;
	/** Restrict the derivation to these layers. Absent means every layer given. */
	layerIds?: readonly string[];
}

/**
 * Derive the room/corridor graph from a map's layers.
 *
 * Order is stable: nodes come out in layer order then feature order, which is the order the GM sees
 * them stacked on the canvas, and room numbers follow it. Edges are emitted low-id-first and
 * deduplicated, so a door and an overlap between the same pair produce one edge (the door wins — it is
 * the more specific statement about how you get through).
 */
export function deriveRoomGraph(
	layers: readonly RoomGraphLayer[],
	options: DeriveRoomGraphOptions = {},
): RoomGraph {
	const tolerance = options.touchTolerance ?? ROOM_GRAPH_TOUCH_TOLERANCE;
	const allowed = options.layerIds ? new Set(options.layerIds) : null;

	const nodes: RoomGraphNode[] = [];
	const names = new Map<string, string | null>();
	const doors: RoomGraphBounds[] = [];

	for (const layer of layers) {
		if (allowed && !allowed.has(layer.id)) continue;
		for (const feature of layer.content) {
			if (feature.kind === 'door') {
				doors.push(boundsOfPoints(feature.points));
				continue;
			}
			const kind = floorKind(feature);
			if (kind === null || feature.points.length < 2) continue;
			const bounds = boundsOfPoints(feature.points);
			names.set(feature.id, stringProp(feature, 'name'));
			nodes.push({
				id: feature.id,
				layerId: layer.id,
				kind,
				number: null,
				label: '',
				role: stringProp(feature, 'role'),
				stocking: readStocking(feature),
				centre: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
				bounds,
				degree: 0,
			});
		}
	}

	// Numbering and labels, once the whole set is known: rooms are numbered in reading order, and a
	// node with no name of its own falls back to its role, then to the key a GM would write on the map.
	let roomNumber = 0;
	let corridorNumber = 0;
	for (const node of nodes) {
		let fallback: string;
		if (node.kind === 'room') {
			roomNumber += 1;
			node.number = roomNumber;
			fallback = `Room ${roomNumber}`;
		} else {
			corridorNumber += 1;
			fallback = `Corridor ${corridorNumber}`;
		}
		node.label = names.get(node.id) ?? node.role ?? fallback;
	}

	const byId = new Map(nodes.map((node) => [node.id, node]));
	const edges: RoomGraphEdge[] = [];
	const seen = new Map<string, RoomGraphEdge>();
	const addEdge = (a: string, b: string, kind: RoomGraphEdge['kind']) => {
		if (a === b) return;
		const [from, to] = a < b ? [a, b] : [b, a];
		const key = `${from} ${to}`;
		const existing = seen.get(key);
		if (existing) {
			// A door is the more specific statement: it upgrades a bare overlap.
			if (kind === 'door') existing.kind = 'door';
			return;
		}
		const edge: RoomGraphEdge = { from: from as string, to: to as string, kind };
		seen.set(key, edge);
		edges.push(edge);
	};

	for (let i = 0; i < nodes.length; i += 1) {
		const a = nodes[i] as RoomGraphNode;
		for (let j = i + 1; j < nodes.length; j += 1) {
			const b = nodes[j] as RoomGraphNode;
			// Two ROOMS that merely graze are not connected — you need a hall or a door between them.
			// Without this, a dungeon whose rooms sit shoulder to shoulder reads as one blob.
			if (a.kind === 'room' && b.kind === 'room') continue;
			if (touches(a.bounds, b.bounds, tolerance)) addEdge(a.id, b.id, 'passage');
		}
	}

	for (const door of doors) {
		const joined = nodes.filter((node) => touches(node.bounds, door, tolerance));
		for (let i = 0; i < joined.length; i += 1) {
			for (let j = i + 1; j < joined.length; j += 1) {
				addEdge((joined[i] as RoomGraphNode).id, (joined[j] as RoomGraphNode).id, 'door');
			}
		}
	}

	const adjacency = new Map<string, string[]>();
	for (const node of nodes) adjacency.set(node.id, []);
	for (const edge of edges) {
		adjacency.get(edge.from)?.push(edge.to);
		adjacency.get(edge.to)?.push(edge.from);
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (from) from.degree += 1;
		if (to) to.degree += 1;
	}

	// Reachability from the way in. "Unreachable" is the one structural fault worth naming out loud: a
	// wing nothing connects to is a wing the party can never find.
	const start = nodes.find((node) => node.role === 'entrance') ?? nodes[0];
	const reached = new Set<string>();
	if (start) {
		const queue: string[] = [start.id];
		reached.add(start.id);
		while (queue.length > 0) {
			const current = queue.shift() as string;
			for (const next of adjacency.get(current) ?? []) {
				if (reached.has(next)) continue;
				reached.add(next);
				queue.push(next);
			}
		}
	}

	return {
		nodes,
		edges,
		unreachable: nodes.filter((node) => !reached.has(node.id)).map((node) => node.id),
		stockedRooms: nodes.filter((node) => node.kind === 'room' && node.stocking !== null).length,
		roomCount: nodes.filter((node) => node.kind === 'room').length,
		corridorCount: nodes.filter((node) => node.kind === 'corridor').length,
	};
}

/**
 * The feature that carries `node`'s stocking, with `stocking` set (or removed, for `null`).
 *
 * Returning the whole feature rather than a patch is deliberate: `map.update-features` replaces
 * features by id, so this is exactly the payload the caller sends, and the "remove the prop" case
 * cannot be expressed as a merge.
 */
export function withStocking(feature: MapFeature, stocking: RoomStocking | null): MapFeature {
	const props: Record<string, string | number | boolean> = { ...(feature.props ?? {}) };
	if (stocking === null) delete props[ROOM_STOCKING_PROP];
	else props[ROOM_STOCKING_PROP] = stocking;
	const next: MapFeature = {
		id: feature.id,
		kind: feature.kind,
		points: feature.points.map((point) => ({ x: point.x, y: point.y })),
		style: feature.style,
	};
	if (Object.keys(props).length > 0) next.props = props;
	return next;
}
