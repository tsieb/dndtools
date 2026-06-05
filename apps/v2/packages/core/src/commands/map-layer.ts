import {
	createMapLayerInputSchema,
	deleteMapLayerInputSchema,
	duplicateMapLayerInputSchema,
	lockMapLayerInputSchema,
	renameMapLayerInputSchema,
	reorderMapLayerInputSchema,
	setMapLayerEnabledInputSchema,
	setMapLayerOpacityInputSchema,
	setMapLayerTagsInputSchema,
	setMapLayerVisibilityInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import {
	createLayer,
	deleteLayer,
	duplicateLayer,
	renameLayer,
	reorderLayer,
	setLayerDmEnabled,
	setLayerLock,
	setLayerOpacity,
	setLayerPlayerVisibility,
	setLayerTags,
	type MapLayerError,
	type MapLayerMutationKind,
	type MapLayerStamp,
} from '../state/map-layers';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-005 / MAP-006 / MAP-007 — durable map-layer command handlers.
 *
 * These are the ONLY path through which layers are created/renamed/reordered/duplicated/locked/
 * deleted and through which a layer's player-visibility / DM-display / opacity / tags change. Each
 * handler:
 *   1. gates the actor (DM-only; visibility/permission changes are DM-only commands, Contract 3),
 *   2. composes the matching PURE reducer from `state/map-layers.ts` (which enforces fail-closed lock
 *      rejection + validation),
 *   3. bumps the parent map's revision and appends a conflict-shaped durable operation through the
 *      operation log (so the change is replayable/idempotent and the storage adapter persists it),
 *   4. emits a `map.layer-changed` event the GUI/cache-invalidation consumers react to.
 *
 * No GUI component reaches storage; the GUI dispatches these command intents and the runtime appends
 * through the storage adapter + command lifecycle.
 */

const MAP_LAYER_ERROR_TO_REJECTION: Record<MapLayerError['kind'], CommandRejection['code']> = {
	'layer-not-found': 'invalid-state',
	'layer-locked': 'actor-not-authorized',
	'duplicate-layer-id': 'invalid-state',
	'invalid-order': 'invalid-payload',
	'invalid-opacity': 'invalid-payload',
	'invalid-name': 'invalid-payload',
	'last-layer': 'invalid-state',
};

function rejectLayerError(error: MapLayerError, state: CoreStateSlice): CommandResult {
	const code = MAP_LAYER_ERROR_TO_REJECTION[error.kind];
	const message =
		'message' in error
			? error.message
			: error.kind === 'layer-not-found'
				? `Layer ${error.layerId} does not exist on this map.`
				: error.kind === 'layer-locked'
					? `Layer ${error.layerId} is locked and rejects this edit. Unlock it first.`
					: `Layer ${error.layerId} conflicts with an existing layer.`;
	return reject({ code, message }, state);
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

interface ApplyOutcome {
	nextLayers: MapLayer[];
	/** The id of the layer the operation primarily concerns (for the op path + event). */
	targetLayerId: string;
}

/**
 * Shared tail for every layer mutation: bump the parent map revision, write the new layers back into
 * the map state, append a durable operation, and emit the event. The `opType`/`mutation` distinguish
 * which axis changed so cache-invalidation/sync consumers see the precise change.
 */
function commitLayers(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	mutation: MapLayerMutationKind,
	outcome: ApplyOutcome,
): CommandResult {
	const now = env.clock();
	const nextMap: MapEntity = {
		...map,
		layers: outcome.nextLayers,
		updatedAt: now,
		revision: map.revision + 1,
	};
	const nextMaps: MapState = {
		...state.maps,
		maps: { ...state.maps.maps, [map.id]: nextMap },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: map.id,
		opType: `map.layer.${mutation}`,
		path: `layers/${outcome.targetLayerId}`,
		value: { mutation, layers: outcome.nextLayers },
		beforeRevision: map.revision,
		afterRevision: nextMap.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'map.layer-changed',
			mapId: map.id,
			layerId: outcome.targetLayerId,
			mutation,
			actorId,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events,
		operationIds: [op.id],
	};
}

/** Resolve actor (DM) + map up front; every layer command shares this preamble. */
function preamble(
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

function stampFor(env: CoreEnvironment, actorId: string): MapLayerStamp {
	return { actorId, now: env.clock() };
}

export function handleCreateMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = createLayer(
		pre.map.layers,
		{
			id: env.ids(),
			name: parsed.data.name,
			category: parsed.data.category,
			visibility: parsed.data.visibility,
			enabled: parsed.data.enabled,
			opacity: parsed.data.opacity,
			tags: parsed.data.tags,
			query: parsed.data.query,
			locked: parsed.data.locked,
			atOrder: parsed.data.atOrder,
		},
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	const created = result.layers.find(
		(layer) => !pre.map.layers.some((existing) => existing.id === layer.id),
	)!;
	return commitLayers(state, env, pre.actorId, pre.map, 'create', {
		nextLayers: result.layers,
		targetLayerId: created.id,
	});
}

export function handleRenameMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(renameMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = renameLayer(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.name,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'rename', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleReorderMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(reorderMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = reorderLayer(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.toOrder,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'reorder', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleDuplicateMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(duplicateMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = duplicateLayer(
		pre.map.layers,
		parsed.data.layerId,
		env.ids(),
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'duplicate', {
		nextLayers: result.layers,
		targetLayerId: result.newLayerId,
	});
}

export function handleLockMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(lockMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = setLayerLock(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.locked,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'lock', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleDeleteMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = deleteLayer(pre.map.layers, parsed.data.layerId, stampFor(env, pre.actorId));
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'delete', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleSetMapLayerVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setMapLayerVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = setLayerPlayerVisibility(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.visibility,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'set-player-visibility', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleSetMapLayerEnabled(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setMapLayerEnabledInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = setLayerDmEnabled(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.enabled,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'set-dm-enabled', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleSetMapLayerOpacity(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setMapLayerOpacityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = setLayerOpacity(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.opacity,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'set-opacity', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}

export function handleSetMapLayerTags(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setMapLayerTagsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = setLayerTags(
		pre.map.layers,
		parsed.data.layerId,
		parsed.data.tags,
		parsed.data.query,
		stampFor(env, pre.actorId),
	);
	if ('error' in result) return rejectLayerError(result.error, state);
	return commitLayers(state, env, pre.actorId, pre.map, 'set-tags', {
		nextLayers: result.layers,
		targetLayerId: parsed.data.layerId,
	});
}
