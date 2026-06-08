import {
	grantCapabilitySetInputSchema,
	revokeGrantInputSchema,
	transferOwnershipInputSchema,
} from '../schemas/commands';
import type { PermissionGrant, PermissionState } from '../state/permission-state';
import {
	buildGrantRecord,
	checkSingularOwnershipConflict,
	computeOwnershipTransfer,
	revokeGrantById,
	upsertGrant,
	validateGrantRecord,
	validateOwnershipTransfer,
	type GrantRecordInput,
} from '../permissions/grant-records';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import { findRawFieldListGrant } from '../con/capability-set-sustainability';

/**
 * PERM-004 / PERM-013 / CON-004 — durable grant + transfer commands (Architecture Contract 3, Axis 2).
 *
 * Grants are DM-authored only and additive over base role. Each mutation:
 *
 *   1. requires the actor be the DM (fail closed for player/observer authors),
 *   2. REJECTS a per-instance RAW FIELD-LIST grant before anything else (CON-004 AC1) — the only
 *      permission selector is a single named `capabilitySet`, never a list/map of fields,
 *   3. validates the grant against the per-entity-type capability schema (PERM-005),
 *   4. mutates the durable PermissionState grant list through a PURE reducer, and
 *   5. appends a durable `permission.*` sync operation so the write is replayable and persisted via
 *      the storage adapter — never written to storage directly (Contract 1 / PLAT-006).
 *
 * Transfer is ATOMIC: the prior singular holder's grant is revoked as the new holder's grant is
 * issued, in one accepted command, so there is never a window with zero or two owners (PERM-013).
 */

/**
 * CON-004 AC1 — reject a per-instance raw field-list grant fail-closed BEFORE schema parsing. The
 * grant model is a NAMED-capability-set model; a field-list-shaped payload (or a non-name
 * `capabilitySet`) is the drift CON-004 forbids, so it is rejected with a CON-004 reason rather than
 * letting a generic schema error obscure why. Returns a rejection result, or `null` to proceed.
 */
function rejectRawFieldListGrant(
	state: CoreStateSlice,
	rawPayload: unknown,
): CommandResult | null {
	const finding = findRawFieldListGrant(rawPayload);
	if (finding) return reject({ code: 'invalid-payload', message: finding.message }, state);
	return null;
}

function permissionWith(
	permissions: PermissionState,
	grants: PermissionGrant[],
): PermissionState {
	return { ...permissions, grants };
}

export function handleGrantCapabilitySet(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	// CON-004 AC1 — a per-instance raw field-list grant is rejected before schema validation.
	const rawFieldListRejection = rejectRawFieldListGrant(state, rawPayload);
	if (rawFieldListRejection) return rawFieldListRejection;

	const parsed = parseInput(grantCapabilitySetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const now = env.clock();
	const input: GrantRecordInput = {
		entityType: parsed.data.entityType,
		entityId: parsed.data.entityId,
		playerActorId: parsed.data.playerActorId,
		capabilitySet: parsed.data.capabilitySet,
		expiresAt: parsed.data.expiresAt,
	};

	const validation = validateGrantRecord(state.permissions, input, now);
	if (!validation.ok) {
		return reject({ code: 'invalid-payload', message: validation.message }, state);
	}

	// CHAR-003 AC2 — reject a singular-ownership grant when a different player already holds it;
	// `transfer-ownership` is the only path that changes ownership atomically (PERM-013).
	const ownershipConflict = checkSingularOwnershipConflict(state.permissions, input, now);
	if (!ownershipConflict.ok) {
		return reject({ code: 'invalid-payload', message: ownershipConflict.message }, state);
	}

	const grant = buildGrantRecord(input, { id: env.ids(), createdBy: actor.id, now });
	const nextGrants = upsertGrant(state.permissions.grants, grant);
	// Resolve the persisted grant (upsert may reuse an existing grant id/createdAt for the key).
	const persisted = nextGrants.find(
		(candidate) =>
			candidate.entityType === grant.entityType &&
			candidate.entityId === grant.entityId &&
			candidate.playerActorId === grant.playerActorId &&
			candidate.capabilitySet === grant.capabilitySet,
	)!;

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'permission-grant',
		entityId: persisted.id,
		opType: 'permission.grant-capability-set',
		path: `grants/${persisted.entityType}/${persisted.entityId}/${persisted.playerActorId}`,
		value: persisted,
	});

	const events: CoreEvent[] = [
		{
			kind: 'permission.grant-added',
			grantId: persisted.id,
			entityType: persisted.entityType,
			entityId: persisted.entityId,
			playerActorId: persisted.playerActorId,
			capabilitySet: persisted.capabilitySet,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: {
			...state,
			permissions: permissionWith(state.permissions, nextGrants),
			sync: draft.log,
		},
		events,
		operationIds: [draft.op.id],
	};
}

export function handleRevokeGrant(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(revokeGrantInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const existing = state.permissions.grants.find((grant) => grant.id === parsed.data.grantId);
	if (!existing) {
		return reject(
			{ code: 'invalid-state', message: `Grant ${parsed.data.grantId} does not exist.` },
			state,
		);
	}

	const nextGrants = revokeGrantById(state.permissions.grants, existing.id);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'permission-grant',
		entityId: existing.id,
		opType: 'permission.revoke-grant',
		path: `grants/${existing.entityType}/${existing.entityId}/${existing.playerActorId}`,
		value: { grantId: existing.id, playerActorId: existing.playerActorId },
	});

	const events: CoreEvent[] = [
		{
			kind: 'permission.grant-revoked',
			grantId: existing.id,
			entityType: existing.entityType,
			entityId: existing.entityId,
			playerActorId: existing.playerActorId,
			capabilitySet: existing.capabilitySet,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: {
			...state,
			permissions: permissionWith(state.permissions, nextGrants),
			sync: draft.log,
		},
		events,
		operationIds: [draft.op.id],
	};
}

export function handleTransferOwnership(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	// CON-004 AC1 — a per-instance raw field-list grant is rejected before schema validation.
	const rawFieldListRejection = rejectRawFieldListGrant(state, rawPayload);
	if (rawFieldListRejection) return rawFieldListRejection;

	const parsed = parseInput(transferOwnershipInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const now = env.clock();
	const input: GrantRecordInput = {
		entityType: parsed.data.entityType,
		entityId: parsed.data.entityId,
		playerActorId: parsed.data.toPlayerActorId,
		capabilitySet: parsed.data.capabilitySet,
		expiresAt: parsed.data.expiresAt,
	};

	const validation = validateOwnershipTransfer(state.permissions, input, now);
	if (!validation.ok) {
		return reject({ code: 'invalid-payload', message: validation.message }, state);
	}

	const transfer = computeOwnershipTransfer(state.permissions.grants, input, {
		id: env.ids(),
		createdBy: actor.id,
		now,
	});

	// One durable operation describes the whole atomic transfer (revoked + new holder).
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'permission-grant',
		entityId: transfer.newGrantId,
		opType: 'permission.transfer-ownership',
		path: `grants/${input.entityType}/${input.entityId}/owner`,
		value: {
			newGrantId: transfer.newGrantId,
			toPlayerActorId: input.playerActorId,
			revokedGrantIds: transfer.revokedGrantIds,
			capabilitySet: input.capabilitySet,
		},
	});

	const events: CoreEvent[] = [
		{
			kind: 'permission.ownership-transferred',
			entityType: input.entityType,
			entityId: input.entityId,
			toPlayerActorId: input.playerActorId,
			newGrantId: transfer.newGrantId,
			revokedGrantIds: transfer.revokedGrantIds,
			capabilitySet: input.capabilitySet,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: {
			...state,
			permissions: permissionWith(state.permissions, transfer.grants),
			sync: draft.log,
		},
		events,
		operationIds: [draft.op.id],
	};
}
