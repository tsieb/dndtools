import { editMapLayerInputSchema, generateMapLayersInputSchema } from '../schemas/commands';
import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import { applyLayerEdit, type MapEditError } from '../state/map-editing';
import {
	generateMapLayers,
	type MapGenerationError,
	type MapGenerationParams,
} from '../state/map-generation';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-003 / MAP-004 — durable map editing + generation command handlers.
 *
 * `map.edit-layer` (MAP-003): a draw/paint edit. The command captures the BEFORE and AFTER content of
 * the affected layer on commit, so the change is both UNDOABLE (its inverse is the same command with
 * before/after swapped — see `buildInverseMapEditCommand` and `UNDOABLE_COMMAND_TYPES`) and
 * SYNC-REPLAYABLE (the durable op carries before+after, plus before/after layer revisions, so another
 * device can apply/merge it). It is DM-only and rejects a locked layer fail-closed (MAP-005), and a
 * stale before-base (optimistic concurrency) so a concurrent edit is never silently clobbered.
 *
 * `map.generate-layers` (MAP-004): deterministic procedural generation. Validates parameters
 * fail-closed FIRST (an invalid set persists no partial layers), generates editable layers from the
 * explicit params + seed, and inserts them as new MAP-005 layers (so the DM can then paint on them via
 * `map.edit-layer`). Every device replaying the same generate command produces byte-identical layers.
 *
 * Both append a conflict-shaped durable operation through the operation log; no GUI reaches storage.
 */

const MAP_EDIT_ERROR_TO_REJECTION: Record<MapEditError['kind'], CommandRejection['code']> = {
	'layer-not-found': 'invalid-state',
	'layer-locked': 'actor-not-authorized',
	'stale-before': 'revision-conflict',
	'invalid-content': 'invalid-payload',
};

const MAP_GENERATION_ERROR_TO_REJECTION: Record<
	MapGenerationError['kind'],
	CommandRejection['code']
> = {
	'invalid-dimension': 'invalid-payload',
	'invalid-density': 'invalid-payload',
	'invalid-kind': 'invalid-payload',
	'invalid-id-prefix': 'invalid-payload',
};

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

/** Resolve actor (DM) + map up front; both editing commands share this preamble. */
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

/** Write the new layers back into the map, bump the map revision, append the op, and emit the event. */
function commitMapEditing(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	nextLayers: MapLayer[],
	op: {
		opType: string;
		path: string;
		value: unknown;
		targetLayerId: string;
		mutation: 'edit' | 'generate';
	},
): CommandResult {
	const now = env.clock();
	const nextMap: MapEntity = {
		...map,
		layers: nextLayers,
		updatedAt: now,
		revision: map.revision + 1,
	};
	const nextMaps: MapState = {
		...state.maps,
		maps: { ...state.maps.maps, [map.id]: nextMap },
	};
	const { log: nextLog, op: appended } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: map.id,
		opType: op.opType,
		path: op.path,
		value: op.value,
		beforeRevision: map.revision,
		afterRevision: nextMap.revision,
	});
	const events: CoreEvent[] = [
		{
			kind: 'map.layer-changed',
			mapId: map.id,
			layerId: op.targetLayerId,
			mutation: op.mutation,
			actorId,
		},
	];
	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events,
		operationIds: [appended.id],
	};
}

/**
 * MAP-003: apply a draw/paint edit to a layer, capturing before+after for undo and sync.
 */
export function handleEditMapLayer(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(editMapLayerInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = applyLayerEdit(
		pre.map.layers,
		{ layerId: parsed.data.layerId, before: parsed.data.before, after: parsed.data.after },
		{ actorId: pre.actorId, now: env.clock() },
	);
	if ('error' in result) {
		const code = MAP_EDIT_ERROR_TO_REJECTION[result.error.kind];
		const message =
			'message' in result.error
				? result.error.message
				: `Layer ${result.error.layerId} cannot be edited.`;
		return reject({ code, message }, state);
	}
	return commitMapEditing(state, env, pre.actorId, pre.map, result.layers, {
		opType: 'map.layer.edit',
		path: `layers/${parsed.data.layerId}/content`,
		// Capture BOTH the before and after content on the durable op. This is the crux of MAP-003:
		// the op is undoable (inverse swaps before/after) and replayable (another device applies after).
		value: {
			mutation: 'edit',
			layerId: parsed.data.layerId,
			before: parsed.data.before,
			after: parsed.data.after,
		},
		targetLayerId: parsed.data.layerId,
		mutation: 'edit',
	});
}

/**
 * MAP-003 undo helper: build the INVERSE of a paint edit. The inverse is the same `map.edit-layer`
 * command with `before`/`after` swapped, so dispatching it restores the captured prior content
 * EXACTLY. Pure — no state access; the caller dispatches the returned command intent.
 */
export function buildInverseMapEditCommand(forwardPayload: {
	mapId: string;
	layerId: string;
	before: unknown;
	after: unknown;
}): { mapId: string; layerId: string; before: unknown; after: unknown } {
	return {
		mapId: forwardPayload.mapId,
		layerId: forwardPayload.layerId,
		before: forwardPayload.after,
		after: forwardPayload.before,
	};
}

/**
 * MAP-004: generate editable map layers from explicit parameters + seed and save them as new MAP-005
 * layers. Validation is fail-closed and runs before any layer is created, so a rejected generation
 * persists nothing (MAP-004 AC2). Generation is deterministic (MAP-004 AC1).
 */
export function handleGenerateMapLayers(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(generateMapLayersInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const params: MapGenerationParams = {
		kind: parsed.data.kind,
		seed: parsed.data.seed,
		width: parsed.data.width,
		height: parsed.data.height,
		density: parsed.data.density,
		visibility: parsed.data.visibility,
		idPrefix: parsed.data.idPrefix,
	};
	const result = generateMapLayers(params, { actorId: pre.actorId, now: env.clock() });
	if ('error' in result) {
		const code = MAP_GENERATION_ERROR_TO_REJECTION[result.error.kind];
		return reject({ code, message: result.error.message }, state);
	}

	// Reject a collision before mutating: a generated id that already exists would otherwise silently
	// clobber an existing layer. Fail closed and persist nothing partial (MAP-004 AC2).
	const existingIds = new Set(pre.map.layers.map((layer) => layer.id));
	const collision = result.layers.find((layer) => existingIds.has(layer.id));
	if (collision) {
		return reject(
			{
				code: 'invalid-state',
				message: `Generated layer id "${collision.id}" already exists on this map. Use a fresh id prefix.`,
			},
			state,
		);
	}

	// Append the generated layers AFTER the existing ones, preserving dense order.
	const baseOrder = pre.map.layers.length;
	const appendedLayers = result.layers.map((layer, index) => ({
		...layer,
		order: baseOrder + index,
	}));
	const nextLayers = [...pre.map.layers, ...appendedLayers];

	return commitMapEditing(state, env, pre.actorId, pre.map, nextLayers, {
		opType: 'map.layer.generate',
		path: `layers`,
		// The op carries the deterministic generation PARAMETERS (replayable: another device replays
		// the same generate to get identical layers) AND the resulting layer ids for auditing.
		value: {
			mutation: 'generate',
			params,
			generatedLayerIds: appendedLayers.map((layer) => layer.id),
		},
		targetLayerId: appendedLayers[0]!.id,
		mutation: 'generate',
	});
}
