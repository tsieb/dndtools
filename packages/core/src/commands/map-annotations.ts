import {
	appendMapFogInputSchema,
	configureMapOverlayInputSchema,
	createMapPoiInputSchema,
	createMapRouteInputSchema,
	createMapTokenInputSchema,
	deleteMapPoiInputSchema,
	deleteMapRouteInputSchema,
	deleteMapTokenInputSchema,
	moveMapTokenInputSchema,
	removeMapFogInputSchema,
	setMapOverlayModeInputSchema,
	updateMapPoiInputSchema,
	updateMapRouteInputSchema,
	updateMapTokenInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapState } from '../state/map-state';
import {
	appendFogOp,
	createPoi,
	createRoute,
	createToken,
	deletePoi,
	deleteRoute,
	deleteToken,
	moveToken,
	removeFogOp,
	updatePoi,
	updateRoute,
	updateToken,
	type MapAnnotationError,
	type MapAnnotationStamp,
	type MapFogOp,
	type MapPoi,
	type MapRoute,
	type MapToken,
} from '../state/map-annotations';
import {
	configureOverlay,
	enterOverlayMode,
	type MapOverlaySettings,
} from '../state/map-overlay-modes';
import { measureRange } from '../state/map-travel';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-010 / MAP-011 / MAP-012 / MAP-013 / MAP-014 / MAP-019 — durable map ANNOTATION command handlers.
 *
 * Every annotation mutation (POI, route, fog, token, overlay mode) is a Processing-Core command. Each
 * handler:
 *   1. validates the payload fail-closed against its schema (normalized coords are bounded here),
 *   2. gates the actor — DM-only for authoring; token MOVE additionally allows the declared controller
 *      player (MAP-019 AC4),
 *   3. composes the matching PURE reducer in `state/map-annotations.ts` / `state/map-overlay-modes.ts`,
 *   4. bumps the parent map revision and appends a conflict-shaped durable operation (replayable by
 *      POI/route/fog/token id — Contract 2),
 *   5. emits a typed event the GUI / cache-invalidation consumers react to.
 *
 * No GUI component reaches storage; the GUI dispatches these intents and the runtime persists through
 * the storage adapter + command lifecycle.
 */

const ANNOTATION_ERROR_TO_REJECTION: Record<MapAnnotationError['kind'], CommandRejection['code']> = {
	'poi-not-found': 'invalid-state',
	'route-not-found': 'invalid-state',
	'fog-not-found': 'invalid-state',
	'token-not-found': 'invalid-state',
	'layer-not-found': 'invalid-state',
	'invalid-position': 'invalid-payload',
	'invalid-region': 'invalid-payload',
	'invalid-size': 'invalid-payload',
	'invalid-label': 'invalid-payload',
	'empty-route': 'invalid-payload',
};

function annotationErrorMessage(error: MapAnnotationError): string {
	switch (error.kind) {
		case 'poi-not-found':
			return `POI ${error.poiId} does not exist on this map.`;
		case 'route-not-found':
			return `Route ${error.routeId} does not exist on this map.`;
		case 'fog-not-found':
			return `Fog operation ${error.fogId} does not exist on this map.`;
		case 'token-not-found':
			return `Token ${error.tokenId} does not exist on this map.`;
		case 'layer-not-found':
			return `Layer ${error.layerId} does not exist on this map.`;
		default:
			return error.message;
	}
}

function rejectAnnotationError(error: MapAnnotationError, state: CoreStateSlice): CommandResult {
	return reject(
		{ code: ANNOTATION_ERROR_TO_REJECTION[error.kind], message: annotationErrorMessage(error) },
		state,
	);
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

/** Resolve actor (DM) + map up front; shared preamble for every DM-only annotation command. */
function dmPreamble(
	state: CoreStateSlice,
	actorId: string,
	mapId: string,
): { actorId: string; map: MapEntity } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const dmCheck = requireDm(actor);
	if (dmCheck) return { rejection: reject(dmCheck, state) };
	const map = requireMap(state, mapId);
	if ('code' in map) return { rejection: reject(map, state) };
	return { actorId: actor.id, map };
}

function stampFor(env: CoreEnvironment, actorId: string): MapAnnotationStamp {
	return { actorId, now: env.clock() };
}

/** Whether the map has a layer with this id. POIs/routes/fog/tokens must sit on a real layer. */
function layerExists(map: MapEntity, layerId: string): boolean {
	return map.layers.some((layer) => layer.id === layerId);
}

/**
 * Shared commit tail: write the patched map back, bump its revision, append a durable op, emit events.
 * `patch` carries whichever annotation array changed; the others are inherited from the prior map.
 */
function commitMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	patch: Partial<
		Pick<MapEntity, 'pois' | 'routes' | 'fog' | 'tokens' | 'overlay'>
	>,
	op: { opType: string; path: string; value: unknown },
	events: CoreEvent[],
): CommandResult {
	const now = env.clock();
	const nextMap: MapEntity = {
		...map,
		...patch,
		updatedAt: now,
		revision: map.revision + 1,
	};
	const nextMaps: MapState = { ...state.maps, maps: { ...state.maps.maps, [map.id]: nextMap } };
	const { log: nextLog, op: appended } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: map.id,
		opType: op.opType,
		path: op.path,
		value: op.value,
		beforeRevision: map.revision,
		afterRevision: nextMap.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events,
		operationIds: [appended.id],
	};
}

// ---------------------------------------------------------------------------
// POI commands (MAP-010 / MAP-011)
// ---------------------------------------------------------------------------

export function handleCreateMapPoi(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapPoiInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	if (!layerExists(pre.map, parsed.data.layerId)) {
		return reject(
			{ code: 'invalid-state', message: `Layer ${parsed.data.layerId} does not exist on this map.` },
			state,
		);
	}
	const result = createPoi(
		pre.map.pois,
		{
			id: env.ids(),
			layerId: parsed.data.layerId,
			label: parsed.data.label,
			category: parsed.data.category,
			position: parsed.data.position,
			visibility: parsed.data.visibility,
			notes: parsed.data.notes,
			linkedEntityType: parsed.data.linkedEntityType,
			linkedEntityId: parsed.data.linkedEntityId,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ pois: result.pois },
		{
			opType: 'map.poi.create',
			path: `pois/${result.created.id}`,
			value: { mutation: 'create', poi: result.created },
		},
		[{ kind: 'map.poi-changed', mapId: pre.map.id, poiId: result.created.id, mutation: 'create', actorId: pre.actorId }],
	);
}

export function handleUpdateMapPoi(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapPoiInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	if (parsed.data.layerId !== undefined && !layerExists(pre.map, parsed.data.layerId)) {
		return reject(
			{ code: 'invalid-state', message: `Layer ${parsed.data.layerId} does not exist on this map.` },
			state,
		);
	}
	const result = updatePoi(
		pre.map.pois,
		parsed.data.poiId,
		{
			label: parsed.data.label,
			category: parsed.data.category,
			position: parsed.data.position,
			visibility: parsed.data.visibility,
			notes: parsed.data.notes,
			layerId: parsed.data.layerId,
			linkedEntityType: parsed.data.linkedEntityType,
			linkedEntityId: parsed.data.linkedEntityId,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ pois: result.pois },
		{
			opType: 'map.poi.update',
			path: `pois/${result.updated.id}`,
			value: { mutation: 'update', poi: result.updated },
		},
		[{ kind: 'map.poi-changed', mapId: pre.map.id, poiId: result.updated.id, mutation: 'update', actorId: pre.actorId }],
	);
}

export function handleDeleteMapPoi(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteMapPoiInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = deletePoi(pre.map.pois, parsed.data.poiId);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ pois: result.pois },
		{ opType: 'map.poi.delete', path: `pois/${parsed.data.poiId}`, value: { mutation: 'delete', poiId: parsed.data.poiId } },
		[{ kind: 'map.poi-changed', mapId: pre.map.id, poiId: parsed.data.poiId, mutation: 'delete', actorId: pre.actorId }],
	);
}

// ---------------------------------------------------------------------------
// Route commands (MAP-013)
// ---------------------------------------------------------------------------

export function handleCreateMapRoute(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapRouteInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	if (!layerExists(pre.map, parsed.data.layerId)) {
		return reject(
			{ code: 'invalid-state', message: `Layer ${parsed.data.layerId} does not exist on this map.` },
			state,
		);
	}
	const result = createRoute(
		pre.map.routes,
		{
			id: env.ids(),
			layerId: parsed.data.layerId,
			label: parsed.data.label,
			visibility: parsed.data.visibility,
			waypoints: parsed.data.waypoints,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ routes: result.routes },
		{ opType: 'map.route.create', path: `routes/${result.created.id}`, value: { mutation: 'create', route: result.created } },
		[{ kind: 'map.route-changed', mapId: pre.map.id, routeId: result.created.id, mutation: 'create', actorId: pre.actorId }],
	);
}

export function handleUpdateMapRoute(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapRouteInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = updateRoute(
		pre.map.routes,
		parsed.data.routeId,
		{ label: parsed.data.label, visibility: parsed.data.visibility, waypoints: parsed.data.waypoints },
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ routes: result.routes },
		{ opType: 'map.route.update', path: `routes/${result.updated.id}`, value: { mutation: 'update', route: result.updated } },
		[{ kind: 'map.route-changed', mapId: pre.map.id, routeId: result.updated.id, mutation: 'update', actorId: pre.actorId }],
	);
}

export function handleDeleteMapRoute(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteMapRouteInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = deleteRoute(pre.map.routes, parsed.data.routeId);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ routes: result.routes },
		{ opType: 'map.route.delete', path: `routes/${parsed.data.routeId}`, value: { mutation: 'delete', routeId: parsed.data.routeId } },
		[{ kind: 'map.route-changed', mapId: pre.map.id, routeId: parsed.data.routeId, mutation: 'delete', actorId: pre.actorId }],
	);
}

// ---------------------------------------------------------------------------
// Fog commands (MAP-012)
// ---------------------------------------------------------------------------

export function handleAppendMapFog(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(appendMapFogInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	if (!layerExists(pre.map, parsed.data.layerId)) {
		return reject(
			{ code: 'invalid-state', message: `Layer ${parsed.data.layerId} does not exist on this map.` },
			state,
		);
	}
	const result = appendFogOp(
		pre.map.fog,
		{
			id: env.ids(),
			layerId: parsed.data.layerId,
			kind: parsed.data.kind,
			region: parsed.data.region,
			...(parsed.data.feather !== undefined ? { feather: parsed.data.feather } : {}),
			visibility: parsed.data.visibility,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	// MAP-012 AC2: when the DM is offline from remote players, the reveal/conceal QUEUES and the DM
	// sees undelivered sync status — the op is still durably persisted locally (local-first).
	const deliveryStatus = parsed.data.connectionState === 'offline' ? 'queued' : 'delivered';
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ fog: result.fog },
		{
			opType: 'map.fog.append',
			path: `fog/${result.appended.id}`,
			value: { mutation: parsed.data.kind, fogOp: result.appended, deliveryStatus },
		},
		[
			{
				kind: 'map.fog-changed',
				mapId: pre.map.id,
				fogId: result.appended.id,
				mutation: parsed.data.kind,
				deliveryStatus,
				actorId: pre.actorId,
			},
		],
	);
}

export function handleRemoveMapFog(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeMapFogInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = removeFogOp(pre.map.fog, parsed.data.fogId);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ fog: result.fog },
		{ opType: 'map.fog.remove', path: `fog/${parsed.data.fogId}`, value: { mutation: 'remove', fogId: parsed.data.fogId } },
		[
			{
				kind: 'map.fog-changed',
				mapId: pre.map.id,
				fogId: parsed.data.fogId,
				mutation: 'remove',
				deliveryStatus: 'delivered',
				actorId: pre.actorId,
			},
		],
	);
}

// ---------------------------------------------------------------------------
// Token commands (MAP-019)
// ---------------------------------------------------------------------------

export function handleCreateMapToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	if (!layerExists(pre.map, parsed.data.layerId)) {
		return reject(
			{ code: 'invalid-state', message: `Layer ${parsed.data.layerId} does not exist on this map.` },
			state,
		);
	}
	const result = createToken(
		pre.map.tokens,
		{
			id: env.ids(),
			layerId: parsed.data.layerId,
			label: parsed.data.label,
			linkedActorId: parsed.data.linkedActorId,
			position: parsed.data.position,
			size: parsed.data.size,
			visibility: parsed.data.visibility,
			controllerActorId: parsed.data.controllerActorId,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ tokens: result.tokens },
		{ opType: 'map.token.create', path: `tokens/${result.created.id}`, value: { mutation: 'create', token: result.created } },
		[
			{
				kind: 'map.token-changed',
				mapId: pre.map.id,
				tokenId: result.created.id,
				mutation: 'create',
				moveDistance: null,
				actorId: pre.actorId,
			},
		],
	);
}

/**
 * MAP-019 — move a token. Unlike the other annotation commands this is NOT DM-only: the DM, OR the
 * non-DM player declared as the token's `controllerActorId`, may move a VISIBLE token they control
 * (MAP-019 AC4). A non-DM attempting to move a token they do not control — or a token they cannot see
 * — is rejected BEFORE any mutation. On success the move distance is computed from the map scale and
 * carried on the event for session history (MAP-019 AC2).
 */
export function handleMoveMapToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(moveMapTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const map = requireMap(state, parsed.data.mapId);
	if ('code' in map) return reject(map, state);

	const token = map.tokens.find((candidate) => candidate.id === parsed.data.tokenId);
	if (!token) {
		// Indistinguishable from not-found for a non-DM: a token they cannot see is reported the same
		// way as a missing one (no existence probe).
		return reject(
			{ code: 'invalid-state', message: `Token ${parsed.data.tokenId} does not exist on this map.` },
			state,
		);
	}

	// MAP-019 AC4 — authorization BEFORE mutation. The DM may move any token; a non-DM may move ONLY a
	// token whose declared controller is them. A non-DM is also blocked from moving a token they cannot
	// see (dm-only token, or a token on a dm-only layer) — checked via the controller, which is never
	// set to a player for a hidden token in practice, plus an explicit visibility guard.
	if (actor.role !== 'dm') {
		const layer = map.layers.find((candidate) => candidate.id === token.layerId);
		const tokenVisible =
			!!layer && layer.visibility !== 'dm-only' && token.visibility !== 'dm-only';
		if (!tokenVisible || token.controllerActorId !== actor.id) {
			return reject(
				{
					code: 'actor-not-authorized',
					message: 'You do not control this token. Only its controller or the DM may move it.',
				},
				state,
			);
		}
	}

	const result = moveToken(
		map.tokens,
		parsed.data.tokenId,
		{ position: parsed.data.position },
		stampFor(env, actor.id),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	const moveDistance = measureRange(result.fromPosition, result.toPosition, map.scale);
	return commitMap(
		state,
		env,
		actor.id,
		map,
		{ tokens: result.tokens },
		{
			opType: 'map.token.move',
			path: `tokens/${result.moved.id}`,
			value: {
				mutation: 'move',
				token: result.moved,
				from: result.fromPosition,
				to: result.toPosition,
				moveDistance,
			},
		},
		[
			{
				kind: 'map.token-changed',
				mapId: map.id,
				tokenId: result.moved.id,
				mutation: 'move',
				moveDistance,
				actorId: actor.id,
			},
		],
	);
}

export function handleUpdateMapToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = updateToken(
		pre.map.tokens,
		parsed.data.tokenId,
		{
			label: parsed.data.label,
			visibility: parsed.data.visibility,
			size: parsed.data.size,
			controllerActorId: parsed.data.controllerActorId,
			linkedActorId: parsed.data.linkedActorId,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ tokens: result.tokens },
		{ opType: 'map.token.update', path: `tokens/${result.updated.id}`, value: { mutation: 'update', token: result.updated } },
		[
			{
				kind: 'map.token-changed',
				mapId: pre.map.id,
				tokenId: result.updated.id,
				mutation: 'update',
				moveDistance: null,
				actorId: pre.actorId,
			},
		],
	);
}

export function handleDeleteMapToken(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteMapTokenInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = deleteToken(pre.map.tokens, parsed.data.tokenId);
	if ('error' in result) return rejectAnnotationError(result.error, state);
	return commitMap(
		state,
		env,
		pre.actorId,
		pre.map,
		{ tokens: result.tokens },
		{ opType: 'map.token.delete', path: `tokens/${parsed.data.tokenId}`, value: { mutation: 'delete', tokenId: parsed.data.tokenId } },
		[
			{
				kind: 'map.token-changed',
				mapId: pre.map.id,
				tokenId: parsed.data.tokenId,
				mutation: 'delete',
				moveDistance: null,
				actorId: pre.actorId,
			},
		],
	);
}

// ---------------------------------------------------------------------------
// Overlay mode commands (MAP-014)
// ---------------------------------------------------------------------------

function commitOverlay(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	overlay: MapOverlaySettings,
	mutation: 'set-mode' | 'configure',
): CommandResult {
	return commitMap(
		state,
		env,
		actorId,
		map,
		{ overlay },
		{ opType: `map.overlay.${mutation}`, path: 'overlay', value: { mutation, overlay } },
		[{ kind: 'map.overlay-changed', mapId: map.id, mode: overlay.mode, mutation, actorId }],
	);
}

export function handleSetMapOverlayMode(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setMapOverlayModeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = enterOverlayMode(
		pre.map.overlay,
		{ mode: parsed.data.mode, autoSatisfyPrerequisites: parsed.data.autoSatisfyPrerequisites },
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) {
		// MAP-014 AC1/AC2 — a mode whose prerequisite visual state is unmet is BLOCKED with a reason,
		// fail-closed (even an internal forced transition reaches this gate).
		return reject({ code: 'overlay-prerequisite-unmet', message: result.error.message }, state);
	}
	return commitOverlay(state, env, pre.actorId, pre.map, result.settings, 'set-mode');
}

export function handleConfigureMapOverlay(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(configureMapOverlayInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = dmPreamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;
	const result = configureOverlay(
		pre.map.overlay,
		{
			gridVisible: parsed.data.gridVisible,
			gridSize: parsed.data.gridSize,
			tokensEnabled: parsed.data.tokensEnabled,
			unitsPerCell: parsed.data.unitsPerCell,
		},
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) {
		const code = result.error.kind === 'prerequisite-unmet' ? 'overlay-prerequisite-unmet' : 'invalid-payload';
		return reject({ code, message: result.error.message }, state);
	}
	return commitOverlay(state, env, pre.actorId, pre.map, result.settings, 'configure');
}

export type { MapFogOp, MapPoi, MapRoute, MapToken };
