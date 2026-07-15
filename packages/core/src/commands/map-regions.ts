import {
	createMapRegionInputSchema,
	deleteMapRegionInputSchema,
	updateMapRegionInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapState } from '../state/map-state';
import {
	createRegion,
	deleteRegion,
	updateRegion,
	type MapRegionError,
} from '../state/map-regions';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-021 — durable map REGION command handlers.
 *
 * `MapRegion` shipped as an orphan: the type existed, `session.set-active-map` READ one (a projection is
 * framed on a region), `MapEntity.defaultRegionId` NAMED one — and no command could ever create one, so
 * the only regions in any vault came from the demo seed. These three close that gap.
 *
 * All DM-only, all five-step (parse → preamble → pure reducer → error table → commit tail), all
 * appending exactly one durable op. The load-bearing rule lives in the reducer, not here: DELETING the
 * map's default region CLEARS `defaultRegionId` rather than leaving it pointing at a region that no
 * longer exists.
 */

const REGION_ERROR_TO_REJECTION: Record<MapRegionError['kind'], CommandRejection['code']> = {
	'region-not-found': 'invalid-state',
	'duplicate-region-id': 'invalid-state',
	'invalid-name': 'invalid-payload',
	'invalid-bounds': 'invalid-payload',
};

function rejectRegionError(error: MapRegionError, state: CoreStateSlice): CommandResult {
	const message =
		'message' in error
			? error.message
			: error.kind === 'region-not-found'
				? `Region ${error.regionId} does not exist on this map.`
				: `Region ${error.regionId} already exists on this map.`;
	return reject({ code: REGION_ERROR_TO_REJECTION[error.kind], message }, state);
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

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

/** Shared tail: write the patched map back, bump its revision, append ONE op, emit the event. */
function commitRegions(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	map: MapEntity,
	patch: Pick<MapEntity, 'regions'> & Partial<Pick<MapEntity, 'defaultRegionId'>>,
	op: { opType: string; path: string; value: unknown },
	event: CoreEvent,
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
		events: [event],
		operationIds: [appended.id],
	};
}

export function handleCreateMapRegion(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapRegionInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	// An explicit id is the undo/replay path (the inverse of a delete recreates the region under its
	// ORIGINAL id, so a `defaultRegionId` pointing at it resolves again); omitted, the id is minted.
	const result = createRegion(pre.map.regions, {
		id: parsed.data.id ?? env.ids(),
		name: parsed.data.name,
		bounds: parsed.data.bounds,
	});
	if ('error' in result) return rejectRegionError(result.error, state);

	return commitRegions(
		state,
		env,
		pre.actorId,
		pre.map,
		{
			regions: result.regions,
			...(parsed.data.makeDefault ? { defaultRegionId: result.created.id } : {}),
		},
		{
			opType: 'map.region.create',
			path: `regions/${result.created.id}`,
			value: {
				mutation: 'create',
				region: result.created,
				makeDefault: parsed.data.makeDefault,
			},
		},
		{
			kind: 'map.region-changed',
			mapId: pre.map.id,
			regionId: result.created.id,
			mutation: 'create',
			actorId: pre.actorId,
		},
	);
}

export function handleUpdateMapRegion(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapRegionInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = updateRegion(pre.map.regions, parsed.data.regionId, {
		name: parsed.data.name,
		bounds: parsed.data.bounds,
	});
	if ('error' in result) return rejectRegionError(result.error, state);

	return commitRegions(
		state,
		env,
		pre.actorId,
		pre.map,
		{ regions: result.regions },
		{
			opType: 'map.region.update',
			path: `regions/${result.updated.id}`,
			value: { mutation: 'update', region: result.updated },
		},
		{
			kind: 'map.region-changed',
			mapId: pre.map.id,
			regionId: result.updated.id,
			mutation: 'update',
			actorId: pre.actorId,
		},
	);
}

/**
 * Delete a region. When it is the map's DEFAULT, `defaultRegionId` is CLEARED in the same commit — never
 * left dangling at a region that no longer exists (the reducer computes the corrected value, so no
 * caller can forget).
 */
export function handleDeleteMapRegion(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteMapRegionInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.mapId);
	if ('rejection' in pre) return pre.rejection;

	const result = deleteRegion(pre.map, parsed.data.regionId);
	if ('error' in result) return rejectRegionError(result.error, state);

	return commitRegions(
		state,
		env,
		pre.actorId,
		pre.map,
		{ regions: result.regions, defaultRegionId: result.defaultRegionId },
		{
			opType: 'map.region.delete',
			path: `regions/${parsed.data.regionId}`,
			value: {
				mutation: 'delete',
				regionId: parsed.data.regionId,
				// The deleted record rides the op so the delete has an inverse (recreate it under the same
				// id), and so the audit trail says what was removed rather than only that something was.
				region: result.deleted,
				wasDefault: pre.map.defaultRegionId === parsed.data.regionId,
				defaultRegionId: result.defaultRegionId,
			},
		},
		{
			kind: 'map.region-changed',
			mapId: pre.map.id,
			regionId: parsed.data.regionId,
			mutation: 'delete',
			actorId: pre.actorId,
		},
	);
}
