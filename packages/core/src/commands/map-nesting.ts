import {
	embedChildMapInputSchema,
	removeMapEmbedInputSchema,
	updateMapEmbedInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapState } from '../state/map-state';
import {
	DEFAULT_TRANSITION_THRESHOLD,
	addEmbed,
	removeEmbed,
	updateEmbed,
	validateAddEmbed,
	type MapEmbed,
	type MapNestingError,
} from '../state/map-nesting';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';

/**
 * MAP-008 / MAP-017 — durable map NESTING command handlers (embed / update / remove).
 *
 * These are the only path through which a parent map gains, changes, or loses an embedded child. Each
 * handler:
 *   1. validates the payload fail-closed against its schema,
 *   2. gates the actor as DM-only (nesting is a structural map edit; Contract 3),
 *   3. composes the PURE graph reducer in `state/map-nesting.ts` — which rejects cycles (MAP-017 AC1)
 *      and over-depth chains (MAP-017 max depth) BEFORE any mutation, so the prior state is untouched
 *      on rejection,
 *   4. bumps the parent map revision and appends a conflict-shaped durable operation,
 *   5. emits a `map.embed-changed` event the GUI/cache-invalidation consumers react to.
 *
 * The embed stores only the child's id — never its name, layers, or visibility — so the child keeps
 * its own independent permission model (MAP-008 AC2). Removing an embed never deletes the child map.
 */

const MAP_NESTING_ERROR_TO_REJECTION: Record<MapNestingError['kind'], CommandRejection['code']> = {
	'child-not-found': 'map-not-found',
	'self-embed': 'invalid-state',
	cycle: 'nesting-cycle',
	'max-depth-exceeded': 'nesting-max-depth',
	'duplicate-embed-id': 'invalid-state',
	'embed-not-found': 'invalid-state',
	'invalid-transform': 'invalid-payload',
	'invalid-threshold': 'invalid-payload',
};

function rejectNestingError(error: MapNestingError, state: CoreStateSlice): CommandResult {
	const code = MAP_NESTING_ERROR_TO_REJECTION[error.kind];
	const message =
		'message' in error
			? error.message
			: error.kind === 'child-not-found'
				? `Child map ${error.childMapId} does not exist.`
				: error.kind === 'self-embed'
					? `A map cannot embed itself (${error.mapId}).`
					: error.kind === 'cycle'
						? `Embedding ${error.childMapId} into ${error.parentMapId} would create a nesting cycle.`
						: error.kind === 'max-depth-exceeded'
							? `Embedding here would create a nesting chain of depth ${error.wouldBeDepth}, exceeding the limit of ${error.limit}.`
							: error.kind === 'duplicate-embed-id'
								? `Embed ${error.embedId} already exists on this map.`
								: `Embed ${error.embedId} does not exist on this map.`;
	return reject({ code, message }, state);
}

function requireMap(state: CoreStateSlice, mapId: string): MapEntity | CommandRejection {
	const map = state.maps.maps[mapId];
	if (!map) return { code: 'map-not-found', message: `Map ${mapId} does not exist.` };
	return map;
}

/** Resolve actor (DM) + parent map up front; shared preamble for every nesting command. */
function preamble(
	state: CoreStateSlice,
	actorId: string,
	parentMapId: string,
): { actorId: string; parent: MapEntity } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const dmCheck = requireDm(actor);
	if (dmCheck) return { rejection: reject(dmCheck, state) };
	const parent = requireMap(state, parentMapId);
	if ('code' in parent) return { rejection: reject(parent, state) };
	return { actorId: actor.id, parent };
}

/** Shared commit tail: write the new embed list back, bump revision, append op, emit event. */
function commitEmbeds(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	parent: MapEntity,
	embeds: MapEmbed[],
	mutation: 'embed' | 'update' | 'remove',
	embedId: string,
	childMapId: string,
): CommandResult {
	const now = env.clock();
	const nextMap: MapEntity = {
		...parent,
		embeds,
		updatedAt: now,
		revision: parent.revision + 1,
	};
	const nextMaps: MapState = {
		...state.maps,
		maps: { ...state.maps.maps, [parent.id]: nextMap },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: parent.id,
		opType: `map.embed.${mutation}`,
		path: `embeds/${embedId}`,
		// The durable op records the embed id, child id, and resulting embed list (placement only —
		// never the child's layers/visibility), so it replays/merges by embed id (Contract 2).
		value: { mutation, embedId, childMapId, embeds },
		beforeRevision: parent.revision,
		afterRevision: nextMap.revision,
	});
	const events: CoreEvent[] = [
		{ kind: 'map.embed-changed', parentMapId: parent.id, embedId, childMapId, mutation, actorId },
	];
	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events,
		operationIds: [op.id],
	};
}

/**
 * MAP-008 / MAP-017 — embed a child map in a parent. The graph reducer rejects fail-closed, in order:
 * unknown child, self-embed, CYCLE (MAP-017 AC1), duplicate embed id, invalid transform/threshold, and
 * a chain that would exceed the configured max depth. Nothing is mutated on rejection.
 */
export function handleEmbedChildMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(embedChildMapInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.parentMapId);
	if ('rejection' in pre) return pre.rejection;

	const embedId = env.ids();
	const request = {
		parentMapId: pre.parent.id,
		embedId,
		childMapId: parsed.data.childMapId,
		transform: parsed.data.transform,
		transitionBehavior: parsed.data.transitionBehavior,
		transitionThreshold: parsed.data.transitionThreshold ?? DEFAULT_TRANSITION_THRESHOLD,
	};

	const error = validateAddEmbed(state.maps.maps, request);
	if (error) return rejectNestingError(error, state);

	const embeds = addEmbed(pre.parent, request);
	return commitEmbeds(
		state,
		env,
		pre.actorId,
		pre.parent,
		embeds,
		'embed',
		embedId,
		request.childMapId,
	);
}

/** MAP-008 — update an embed's transform / transition behavior / threshold. */
export function handleUpdateMapEmbed(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateMapEmbedInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.parentMapId);
	if ('rejection' in pre) return pre.rejection;

	const result = updateEmbed(pre.parent, parsed.data.embedId, {
		transform: parsed.data.transform,
		transitionBehavior: parsed.data.transitionBehavior,
		transitionThreshold: parsed.data.transitionThreshold,
	});
	if ('error' in result) return rejectNestingError(result.error, state);
	const childMapId =
		pre.parent.embeds.find((embed) => embed.id === parsed.data.embedId)?.childMapId ?? '';
	return commitEmbeds(
		state,
		env,
		pre.actorId,
		pre.parent,
		result.embeds,
		'update',
		parsed.data.embedId,
		childMapId,
	);
}

/** MAP-008 — remove an embed. Never deletes the child map (Contract 4). */
export function handleRemoveMapEmbed(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeMapEmbedInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const pre = preamble(state, actorId, parsed.data.parentMapId);
	if ('rejection' in pre) return pre.rejection;

	const childMapId =
		pre.parent.embeds.find((embed) => embed.id === parsed.data.embedId)?.childMapId ?? '';
	const result = removeEmbed(pre.parent, parsed.data.embedId);
	if ('error' in result) return rejectNestingError(result.error, state);
	return commitEmbeds(
		state,
		env,
		pre.actorId,
		pre.parent,
		result.embeds,
		'remove',
		parsed.data.embedId,
		childMapId,
	);
}
