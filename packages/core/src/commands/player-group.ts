import {
	createPlayerGroupInputSchema,
	deletePlayerGroupInputSchema,
	updatePlayerGroupInputSchema,
} from '../schemas/commands';
import {
	PLAYER_GROUP_ENTITY_TYPE,
	normalizeMembers,
	type PlayerGroup,
} from '../state/player-group';
import { hasDmAuthority } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * COLLAB-012 — PLAYER GROUP command handlers (Architecture Contract 1 / Contract 3).
 *
 * The DM CREATES, UPDATES, and DELETES Player Groups used ONLY as PROJECTION and HANDOUT DELIVERY TARGETS.
 * The architecture invariants this slice upholds, fail-closed:
 *
 *   - DM-only. Players/observers cannot manage groups (a group is DM authorship metadata).
 *   - Members must be REGISTERED PARTICIPANTS (players/observers) — never the DM, never an unknown actor.
 *     An invalid member rejects the whole command (no partial, surprising membership commits).
 *   - A group record carries NO permission/visibility data and writes ONLY the `playerGroups` slice. It
 *     NEVER touches `permissions`/grants. This is the structural guarantee that membership confers nothing:
 *     there is no code path here that creates or modifies a grant. (COLLAB-012 critical invariant.)
 *
 * Each mutation appends a durable `session.*-player-group` op (actor + group + members — the audit) so the
 * change replays in order; group membership changes are applied BEFORE later queued deliveries that depend
 * on them (COLLAB-012 AC3) by virtue of op ordering. The GUI dispatches the intent; it never writes groups.
 */

/** Validate that every member id is a registered, non-DM participant. Fail closed on any invalid id. */
function validateMembers(
	state: CoreStateSlice,
	memberActorIds: readonly string[],
): CommandRejection | null {
	for (const memberId of memberActorIds) {
		const member = state.permissions.actors[memberId];
		if (!member || hasDmAuthority(member.role)) {
			return {
				code: 'invalid-payload',
				message: `Player group member ${memberId} must be a registered player or observer.`,
			};
		}
	}
	return null;
}

function withPlayerGroups(
	state: CoreStateSlice,
	groups: Record<string, PlayerGroup>,
): CoreStateSlice {
	return { ...state, session: { ...state.session, playerGroups: groups } };
}

export function handleCreatePlayerGroup(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(createPlayerGroupInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const memberCheck = validateMembers(state, input.memberActorIds);
	if (memberCheck) return reject(memberCheck, state);

	const previous = input.groupId ? state.session.playerGroups[input.groupId] : undefined;
	const groupId = previous?.id ?? input.groupId ?? env.ids();
	const now = env.clock();
	const memberActorIds = normalizeMembers(input.memberActorIds);
	const group: PlayerGroup = {
		id: groupId,
		name: input.name,
		memberActorIds,
		createdBy: previous?.createdBy ?? actor.id,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: PLAYER_GROUP_ENTITY_TYPE,
		entityId: groupId,
		opType: 'session.create-player-group',
		path: `playerGroups/${groupId}`,
		value: { groupId, name: input.name, memberActorIds },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: group.revision,
	});

	return {
		status: 'accepted',
		nextState: withPlayerGroups(
			{ ...state, sync: nextLog },
			{ ...state.session.playerGroups, [groupId]: group },
		),
		events: [
			{ kind: 'session.player-group-created', groupId, memberActorIds, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleUpdatePlayerGroup(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updatePlayerGroupInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.session.playerGroups[input.groupId];
	if (!previous) {
		return reject(
			{ code: 'content-item-not-found', message: `Player group ${input.groupId} does not exist.` },
			state,
		);
	}

	if (input.memberActorIds !== undefined) {
		const memberCheck = validateMembers(state, input.memberActorIds);
		if (memberCheck) return reject(memberCheck, state);
	}

	const memberActorIds =
		input.memberActorIds !== undefined
			? normalizeMembers(input.memberActorIds)
			: previous.memberActorIds;
	const group: PlayerGroup = {
		...previous,
		name: input.name ?? previous.name,
		memberActorIds,
		updatedAt: env.clock(),
		revision: previous.revision + 1,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: PLAYER_GROUP_ENTITY_TYPE,
		entityId: group.id,
		opType: 'session.update-player-group',
		path: `playerGroups/${group.id}`,
		value: { groupId: group.id, name: group.name, memberActorIds },
		beforeRevision: previous.revision,
		afterRevision: group.revision,
	});

	return {
		status: 'accepted',
		nextState: withPlayerGroups(
			{ ...state, sync: nextLog },
			{ ...state.session.playerGroups, [group.id]: group },
		),
		events: [
			{ kind: 'session.player-group-updated', groupId: group.id, memberActorIds, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleDeletePlayerGroup(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deletePlayerGroupInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.session.playerGroups[input.groupId];
	if (!previous) {
		return reject(
			{ code: 'content-item-not-found', message: `Player group ${input.groupId} does not exist.` },
			state,
		);
	}

	const nextGroups = { ...state.session.playerGroups };
	delete nextGroups[input.groupId];

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: PLAYER_GROUP_ENTITY_TYPE,
		entityId: input.groupId,
		opType: 'session.delete-player-group',
		path: `playerGroups/${input.groupId}`,
		value: { groupId: input.groupId },
		beforeRevision: previous.revision,
		afterRevision: previous.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: withPlayerGroups({ ...state, sync: nextLog }, nextGroups),
		events: [{ kind: 'session.player-group-deleted', groupId: input.groupId, actorId: actor.id }],
		operationIds: [op.id],
	};
}
