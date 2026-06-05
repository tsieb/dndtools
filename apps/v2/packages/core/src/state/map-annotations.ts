import type { SceneVisibility } from './scene-state';

/**
 * MAP-010 / MAP-011 / MAP-012 / MAP-013 / MAP-019 — the durable map ANNOTATION model: POIs, fog
 * operations, routes, and combat tokens, plus the pure reducers that mutate them.
 *
 * Every annotation lives ON a map layer (`layerId`) and carries its OWN player-facing `visibility`,
 * INDEPENDENT of the map and the layer (MAP-011). Effective visibility is `hidden-ancestor-wins`: an
 * annotation is player-visible only when the map, the layer, AND the annotation itself are all
 * player-facing. The single actor-filtered map query (`queries/map-query.ts`, MAP-018) is the only
 * sanctioned read path; it composes that precedence so a `dm-only` annotation is OMITTED entirely
 * (never redacted in place) from every non-DM surface — list, search, graph, widget, MCP, deep link.
 *
 * Coordinates are NORMALIZED map space (0..1), like {@link MapFeature}, so an annotation stays
 * anchored to the same map location across any render scale/zoom/projection (MAP-010 AC2). Every
 * record carries a monotonic `revision` + audit stamp so each mutation is a conflict-shaped, durable,
 * replayable operation (Contract 2: operation-based merge by POI/route/fog/token id).
 *
 * These reducers are deterministic, side-effect-free transforms over plain serializable records. The
 * command handlers (`commands/map-annotations.ts`) own actor/visibility gating and the durable
 * operation log; this module owns ONLY the record math, so the rules are unit-testable in isolation.
 */

/** A normalized (0..1) point in map space. Shared by POIs, route waypoints, and tokens. */
export interface NormalizedPoint {
	x: number;
	y: number;
}

/** The categories a POI can be filed under. Free-but-bounded so the query can facet by category. */
export type MapPoiCategory =
	| 'settlement'
	| 'landmark'
	| 'dungeon'
	| 'quest'
	| 'hazard'
	| 'shop'
	| 'npc'
	| 'note'
	| 'other';

export const MAP_POI_CATEGORIES: readonly MapPoiCategory[] = Object.freeze([
	'settlement',
	'landmark',
	'dungeon',
	'quest',
	'hazard',
	'shop',
	'npc',
	'note',
	'other',
]);

/**
 * MAP-010 — a point of interest on a map. Stored in NORMALIZED map space so it survives scale and
 * projection changes (MAP-010 AC2). `visibility` is the POI's OWN player-facing level, independent of
 * the map and layer (MAP-011). `linkedEntityType`/`linkedEntityId` link the POI to a note/object/
 * character/scene/map (MAP-010 — "link POIs to notes or objects"); null when unlinked.
 */
export interface MapPoi {
	id: string;
	layerId: string;
	label: string;
	category: MapPoiCategory;
	/** Normalized (0..1) position on the map. */
	position: NormalizedPoint;
	/** The POI's OWN player-facing visibility, independent of map/layer (MAP-011). */
	visibility: SceneVisibility;
	/** Optional DM/author notes. NEVER exposed to a non-DM for a hidden POI (filtered in the query). */
	notes: string;
	/** The entity this POI links to (a note/object/character/scene/map), or null when unlinked. */
	linkedEntityType: string | null;
	linkedEntityId: string | null;
	revision: number;
	updatedBy: string | null;
	updatedAt: string | null;
}

/** A single route waypoint in normalized map space, optionally linked to a note or POI. */
export interface MapRouteWaypoint {
	id: string;
	position: NormalizedPoint;
	/** Optional link to a POI on the same map, a note, or another entity (MAP-013). */
	linkedEntityType: string | null;
	linkedEntityId: string | null;
}

/**
 * MAP-013 — a route drawn across a map as an ordered list of waypoints in normalized space. The
 * route's distance/travel-time are DERIVED (pure functions in `state/map-travel.ts`) from the
 * waypoints + the map scale + a travel speed, never stored, so they always reflect the current
 * geometry. `visibility` is the route's own player-facing level (MAP-011/MAP-016).
 */
export interface MapRoute {
	id: string;
	layerId: string;
	label: string;
	visibility: SceneVisibility;
	waypoints: MapRouteWaypoint[];
	revision: number;
	updatedBy: string | null;
	updatedAt: string | null;
}

/** A fog operation reveals or conceals a region of the map. */
export type MapFogOpKind = 'reveal' | 'conceal';

/**
 * MAP-012 — a durable fog-of-war operation. A reveal/conceal targets a rectangular `region` in
 * normalized map space and syncs to player map views (the durable op is conflict-shaped and replayable
 * — Contract 2). A concealed region never appears in a player's actor-filtered query. `sequence` makes
 * the op-log order deterministic so a replay reconstructs the same fog state.
 */
export interface MapFogOp {
	id: string;
	layerId: string;
	kind: MapFogOpKind;
	/** Rectangular region in normalized (0..1) map space the op reveals/conceals. */
	region: { x: number; y: number; w: number; h: number };
	visibility: SceneVisibility;
	/** Monotonic per-map ordering for deterministic replay (a later op overrides an earlier overlap). */
	sequence: number;
	revision: number;
	updatedBy: string | null;
	updatedAt: string | null;
}

/**
 * MAP-019 — a combat token on a map, linked to a combatant actor/character. Position is normalized
 * map space; `size` is in grid cells (a Large creature is 2). `visibility` is the token's own
 * player-facing level (MAP-011/MAP-016/MAP-019 AC3). `controllerActorId` is the player permitted to
 * MOVE this token (beyond the DM); null when only the DM controls it (MAP-019 AC4).
 */
export interface MapToken {
	id: string;
	layerId: string;
	label: string;
	/** The combatant actor/character this token represents, or null for a plain marker. */
	linkedActorId: string | null;
	position: NormalizedPoint;
	/** Token footprint in grid cells (1 = Medium). Bounded positive. */
	size: number;
	visibility: SceneVisibility;
	/** The non-DM actor permitted to move this token, or null (DM-only control) — MAP-019 AC4. */
	controllerActorId: string | null;
	revision: number;
	updatedBy: string | null;
	updatedAt: string | null;
}

/** A structured failure from a pure annotation reducer; the command layer maps it to a rejection. */
export type MapAnnotationError =
	| { kind: 'poi-not-found'; poiId: string }
	| { kind: 'route-not-found'; routeId: string }
	| { kind: 'fog-not-found'; fogId: string }
	| { kind: 'token-not-found'; tokenId: string }
	| { kind: 'layer-not-found'; layerId: string }
	| { kind: 'invalid-position'; message: string }
	| { kind: 'invalid-region'; message: string }
	| { kind: 'invalid-size'; message: string }
	| { kind: 'invalid-label'; message: string }
	| { kind: 'empty-route'; message: string };

export interface MapAnnotationStamp {
	actorId: string;
	now: string;
}

/** A point is valid iff both coordinates are finite and within normalized [0,1] map space. */
export function isNormalizedPoint(point: NormalizedPoint): boolean {
	return (
		Number.isFinite(point.x) &&
		Number.isFinite(point.y) &&
		point.x >= 0 &&
		point.x <= 1 &&
		point.y >= 0 &&
		point.y <= 1
	);
}

/** A region is valid iff its corner is in [0,1] and it stays within the map bounds. */
export function isNormalizedRegion(region: MapFogOp['region']): boolean {
	return (
		Number.isFinite(region.x) &&
		Number.isFinite(region.y) &&
		Number.isFinite(region.w) &&
		Number.isFinite(region.h) &&
		region.w > 0 &&
		region.h > 0 &&
		region.x >= 0 &&
		region.y >= 0 &&
		region.x + region.w <= 1 &&
		region.y + region.h <= 1
	);
}

// ---------------------------------------------------------------------------
// POI reducers (MAP-010 / MAP-011)
// ---------------------------------------------------------------------------

export interface CreatePoiInput {
	id: string;
	layerId: string;
	label: string;
	category: MapPoiCategory;
	position: NormalizedPoint;
	visibility: SceneVisibility;
	notes?: string;
	linkedEntityType?: string | null;
	linkedEntityId?: string | null;
}

/** MAP-010: create a POI in normalized map space. Fails closed on an out-of-bounds position or an
 *  empty label. The new POI carries its own visibility (independent of map/layer — MAP-011). */
export function createPoi(
	pois: MapPoi[],
	input: CreatePoiInput,
	stamp: MapAnnotationStamp,
): { pois: MapPoi[]; created: MapPoi } | { error: MapAnnotationError } {
	if (input.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'POI label is required.' } };
	}
	if (!isNormalizedPoint(input.position)) {
		return {
			error: {
				kind: 'invalid-position',
				message: 'POI position must be within normalized [0,1] map space.',
			},
		};
	}
	const created: MapPoi = {
		id: input.id,
		layerId: input.layerId,
		label: input.label,
		category: input.category,
		position: { x: input.position.x, y: input.position.y },
		visibility: input.visibility,
		notes: input.notes ?? '',
		linkedEntityType: input.linkedEntityType ?? null,
		linkedEntityId: input.linkedEntityId ?? null,
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { pois: [...pois, created], created };
}

export interface UpdatePoiPatch {
	label?: string;
	category?: MapPoiCategory;
	position?: NormalizedPoint;
	visibility?: SceneVisibility;
	notes?: string;
	layerId?: string;
	linkedEntityType?: string | null;
	linkedEntityId?: string | null;
}

/**
 * MAP-010 / MAP-011: move, re-categorize, re-link, or re-target the visibility of a POI. A position
 * patch is validated fail-closed (stays in normalized space). Setting `visibility` here is what makes
 * POI visibility assignable INDEPENDENTLY of the map/layer (MAP-011). Only the targeted POI changes.
 */
export function updatePoi(
	pois: MapPoi[],
	poiId: string,
	patch: UpdatePoiPatch,
	stamp: MapAnnotationStamp,
): { pois: MapPoi[]; updated: MapPoi } | { error: MapAnnotationError } {
	const existing = pois.find((poi) => poi.id === poiId);
	if (!existing) return { error: { kind: 'poi-not-found', poiId } };
	if (patch.label !== undefined && patch.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'POI label is required.' } };
	}
	if (patch.position !== undefined && !isNormalizedPoint(patch.position)) {
		return {
			error: {
				kind: 'invalid-position',
				message: 'POI position must be within normalized [0,1] map space.',
			},
		};
	}
	const updated: MapPoi = {
		...existing,
		label: patch.label ?? existing.label,
		category: patch.category ?? existing.category,
		position: patch.position
			? { x: patch.position.x, y: patch.position.y }
			: { ...existing.position },
		visibility: patch.visibility ?? existing.visibility,
		notes: patch.notes ?? existing.notes,
		layerId: patch.layerId ?? existing.layerId,
		linkedEntityType:
			patch.linkedEntityType !== undefined ? patch.linkedEntityType : existing.linkedEntityType,
		linkedEntityId:
			patch.linkedEntityId !== undefined ? patch.linkedEntityId : existing.linkedEntityId,
		revision: existing.revision + 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { pois: pois.map((poi) => (poi.id === poiId ? updated : poi)), updated };
}

/** MAP-010: delete a POI by id. */
export function deletePoi(
	pois: MapPoi[],
	poiId: string,
): { pois: MapPoi[] } | { error: MapAnnotationError } {
	if (!pois.some((poi) => poi.id === poiId)) return { error: { kind: 'poi-not-found', poiId } };
	return { pois: pois.filter((poi) => poi.id !== poiId) };
}

// ---------------------------------------------------------------------------
// Route reducers (MAP-013)
// ---------------------------------------------------------------------------

export interface RouteWaypointInput {
	id: string;
	position: NormalizedPoint;
	linkedEntityType?: string | null;
	linkedEntityId?: string | null;
}

export interface CreateRouteInput {
	id: string;
	layerId: string;
	label: string;
	visibility: SceneVisibility;
	waypoints: RouteWaypointInput[];
}

function validateWaypoints(waypoints: RouteWaypointInput[]): MapAnnotationError | null {
	if (waypoints.length < 2) {
		return { kind: 'empty-route', message: 'A route needs at least two waypoints.' };
	}
	for (const waypoint of waypoints) {
		if (!isNormalizedPoint(waypoint.position)) {
			return {
				kind: 'invalid-position',
				message: 'Every waypoint must be within normalized [0,1] map space.',
			};
		}
	}
	return null;
}

function toWaypoint(input: RouteWaypointInput): MapRouteWaypoint {
	return {
		id: input.id,
		position: { x: input.position.x, y: input.position.y },
		linkedEntityType: input.linkedEntityType ?? null,
		linkedEntityId: input.linkedEntityId ?? null,
	};
}

/** MAP-013: create a route from an ordered list of waypoints. Fails closed on < 2 waypoints or an
 *  out-of-bounds waypoint. Distance/travel-time are DERIVED later, never stored. */
export function createRoute(
	routes: MapRoute[],
	input: CreateRouteInput,
	stamp: MapAnnotationStamp,
): { routes: MapRoute[]; created: MapRoute } | { error: MapAnnotationError } {
	if (input.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'Route label is required.' } };
	}
	const invalid = validateWaypoints(input.waypoints);
	if (invalid) return { error: invalid };
	const created: MapRoute = {
		id: input.id,
		layerId: input.layerId,
		label: input.label,
		visibility: input.visibility,
		waypoints: input.waypoints.map(toWaypoint),
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { routes: [...routes, created], created };
}

export interface UpdateRoutePatch {
	label?: string;
	visibility?: SceneVisibility;
	waypoints?: RouteWaypointInput[];
}

/** MAP-013: re-label, re-route, or re-target the visibility of a route. A waypoint patch is validated
 *  fail-closed (≥ 2 waypoints, all in normalized space). */
export function updateRoute(
	routes: MapRoute[],
	routeId: string,
	patch: UpdateRoutePatch,
	stamp: MapAnnotationStamp,
): { routes: MapRoute[]; updated: MapRoute } | { error: MapAnnotationError } {
	const existing = routes.find((route) => route.id === routeId);
	if (!existing) return { error: { kind: 'route-not-found', routeId } };
	if (patch.label !== undefined && patch.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'Route label is required.' } };
	}
	if (patch.waypoints !== undefined) {
		const invalid = validateWaypoints(patch.waypoints);
		if (invalid) return { error: invalid };
	}
	const updated: MapRoute = {
		...existing,
		label: patch.label ?? existing.label,
		visibility: patch.visibility ?? existing.visibility,
		waypoints: patch.waypoints
			? patch.waypoints.map(toWaypoint)
			: existing.waypoints.map((waypoint) => ({ ...waypoint, position: { ...waypoint.position } })),
		revision: existing.revision + 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { routes: routes.map((route) => (route.id === routeId ? updated : route)), updated };
}

/** MAP-013: delete a route by id. */
export function deleteRoute(
	routes: MapRoute[],
	routeId: string,
): { routes: MapRoute[] } | { error: MapAnnotationError } {
	if (!routes.some((route) => route.id === routeId)) {
		return { error: { kind: 'route-not-found', routeId } };
	}
	return { routes: routes.filter((route) => route.id !== routeId) };
}

// ---------------------------------------------------------------------------
// Fog reducers (MAP-012)
// ---------------------------------------------------------------------------

export interface AppendFogOpInput {
	id: string;
	layerId: string;
	kind: MapFogOpKind;
	region: MapFogOp['region'];
	visibility: SceneVisibility;
}

/**
 * MAP-012: append a fog reveal/conceal op. The op is APPEND-ONLY (never an in-place edit) so the
 * op-log replays deterministically and a later op overrides an earlier overlapping one. `sequence` is
 * assigned from the current max + 1. Fails closed on an out-of-bounds region.
 */
export function appendFogOp(
	fog: MapFogOp[],
	input: AppendFogOpInput,
	stamp: MapAnnotationStamp,
): { fog: MapFogOp[]; appended: MapFogOp } | { error: MapAnnotationError } {
	if (!isNormalizedRegion(input.region)) {
		return {
			error: {
				kind: 'invalid-region',
				message: 'Fog region must be a positive rectangle within normalized [0,1] map space.',
			},
		};
	}
	const nextSequence = fog.reduce((max, op) => Math.max(max, op.sequence), 0) + 1;
	const appended: MapFogOp = {
		id: input.id,
		layerId: input.layerId,
		kind: input.kind,
		region: { ...input.region },
		visibility: input.visibility,
		sequence: nextSequence,
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { fog: [...fog, appended], appended };
}

/** MAP-012: remove a fog op by id (e.g. the DM undoes a reveal). */
export function removeFogOp(
	fog: MapFogOp[],
	fogId: string,
): { fog: MapFogOp[] } | { error: MapAnnotationError } {
	if (!fog.some((op) => op.id === fogId)) return { error: { kind: 'fog-not-found', fogId } };
	return { fog: fog.filter((op) => op.id !== fogId) };
}

// ---------------------------------------------------------------------------
// Token reducers (MAP-019)
// ---------------------------------------------------------------------------

export interface CreateTokenInput {
	id: string;
	layerId: string;
	label: string;
	linkedActorId?: string | null;
	position: NormalizedPoint;
	size: number;
	visibility: SceneVisibility;
	controllerActorId?: string | null;
}

/** MAP-019: create a combat token. Records id, linked actor, position, size, visibility, and
 *  controller. Fails closed on an out-of-bounds position or a non-positive size. */
export function createToken(
	tokens: MapToken[],
	input: CreateTokenInput,
	stamp: MapAnnotationStamp,
): { tokens: MapToken[]; created: MapToken } | { error: MapAnnotationError } {
	if (input.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'Token label is required.' } };
	}
	if (!isNormalizedPoint(input.position)) {
		return {
			error: {
				kind: 'invalid-position',
				message: 'Token position must be within normalized [0,1] map space.',
			},
		};
	}
	if (!Number.isFinite(input.size) || input.size <= 0) {
		return { error: { kind: 'invalid-size', message: 'Token size must be a positive number.' } };
	}
	const created: MapToken = {
		id: input.id,
		layerId: input.layerId,
		label: input.label,
		linkedActorId: input.linkedActorId ?? null,
		position: { x: input.position.x, y: input.position.y },
		size: input.size,
		visibility: input.visibility,
		controllerActorId: input.controllerActorId ?? null,
		revision: 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { tokens: [...tokens, created], created };
}

export interface MoveTokenInput {
	position: NormalizedPoint;
}

/**
 * MAP-019: move a token to a new normalized position. Returns BOTH the new token list and the
 * `fromPosition`/`toPosition` so the command layer can compute the move distance from the map scale
 * and record it in session history. Fails closed on an out-of-bounds destination.
 */
export function moveToken(
	tokens: MapToken[],
	tokenId: string,
	input: MoveTokenInput,
	stamp: MapAnnotationStamp,
):
	| { tokens: MapToken[]; moved: MapToken; fromPosition: NormalizedPoint; toPosition: NormalizedPoint }
	| { error: MapAnnotationError } {
	const existing = tokens.find((token) => token.id === tokenId);
	if (!existing) return { error: { kind: 'token-not-found', tokenId } };
	if (!isNormalizedPoint(input.position)) {
		return {
			error: {
				kind: 'invalid-position',
				message: 'Token position must be within normalized [0,1] map space.',
			},
		};
	}
	const fromPosition = { ...existing.position };
	const toPosition = { x: input.position.x, y: input.position.y };
	const moved: MapToken = {
		...existing,
		position: { ...toPosition },
		revision: existing.revision + 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return {
		tokens: tokens.map((token) => (token.id === tokenId ? moved : token)),
		moved,
		fromPosition,
		toPosition,
	};
}

export interface UpdateTokenPatch {
	label?: string;
	visibility?: SceneVisibility;
	size?: number;
	controllerActorId?: string | null;
	linkedActorId?: string | null;
}

/** MAP-019: update a token's label/visibility/size/controller/link (not its position — use
 *  {@link moveToken} so movement distance is computed). Fails closed on a non-positive size. */
export function updateToken(
	tokens: MapToken[],
	tokenId: string,
	patch: UpdateTokenPatch,
	stamp: MapAnnotationStamp,
): { tokens: MapToken[]; updated: MapToken } | { error: MapAnnotationError } {
	const existing = tokens.find((token) => token.id === tokenId);
	if (!existing) return { error: { kind: 'token-not-found', tokenId } };
	if (patch.label !== undefined && patch.label.trim().length === 0) {
		return { error: { kind: 'invalid-label', message: 'Token label is required.' } };
	}
	if (patch.size !== undefined && (!Number.isFinite(patch.size) || patch.size <= 0)) {
		return { error: { kind: 'invalid-size', message: 'Token size must be a positive number.' } };
	}
	const updated: MapToken = {
		...existing,
		label: patch.label ?? existing.label,
		visibility: patch.visibility ?? existing.visibility,
		size: patch.size ?? existing.size,
		controllerActorId:
			patch.controllerActorId !== undefined ? patch.controllerActorId : existing.controllerActorId,
		linkedActorId:
			patch.linkedActorId !== undefined ? patch.linkedActorId : existing.linkedActorId,
		revision: existing.revision + 1,
		updatedBy: stamp.actorId,
		updatedAt: stamp.now,
	};
	return { tokens: tokens.map((token) => (token.id === tokenId ? updated : token)), updated };
}

/** MAP-019: delete a token by id. */
export function deleteToken(
	tokens: MapToken[],
	tokenId: string,
): { tokens: MapToken[] } | { error: MapAnnotationError } {
	if (!tokens.some((token) => token.id === tokenId)) {
		return { error: { kind: 'token-not-found', tokenId } };
	}
	return { tokens: tokens.filter((token) => token.id !== tokenId) };
}
