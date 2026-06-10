import { resolveVaultConflictInputSchema } from '../schemas/commands';
import {
	deriveVaultConflicts,
	resolveVaultConflict,
	type VaultConflictRecord,
} from '../state/conflict-lifecycle';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * SYNC-013 — the DM-authorized, vault-wide CONFLICT RESOLUTION administrative command.
 *
 * Conflict resolution is itself a validated Processing-Core command (Contract 2 Conflict Model rule 7):
 * it takes EXPLICIT SELECTED VALUES, references the SOURCE REVISIONS being resolved, accepts OPTIONAL
 * NOTES, records AUDIT HISTORY, and produces a RESULTING NON-CONFLICTED REVISION. It generalizes the
 * character-specific `character.resolve-conflict` (which selects local/remote on a character field) to
 * ANY entity type by reusing the SAME durable conflict-record substrate (the op-log) and the SAME
 * lifecycle/audit shape — it does not fork a parallel resolution system.
 *
 * Fail closed (SYNC-013 AC1):
 *   - ONLY the DM may resolve. A non-DM (player/observer) is rejected `actor-not-authorized` and the
 *     conflict remains available for DM resolution.
 *   - The command MUST reference the conflict's ACTUAL source revisions. A stale/invalid pair is
 *     rejected `revision-conflict` (the pure resolver returns `stale-source-revision`).
 *   - An unknown conflict id is rejected `conflict-not-found`; an already-resolved conflict is rejected
 *     `invalid-state` (idempotent — the first resolution stands).
 *
 * After acceptance the entity is NON-CONFLICTED for that conflict: a durable `<entityType>.resolve-conflict`
 * op is appended carrying the resolution audit (resolver, selected value, source revisions, resulting
 * revision, notes). Deriving the conflict set over the new op-log marks the record resolved, so the
 * SYNC status surface and the conflict-lifecycle view both report it resolved. The resulting revision is
 * one past BOTH diverging sides, so it supersedes the divergence.
 *
 * Idempotent replay (SYNC-013 AC2): the durable record set takes the FIRST resolution per conflict id,
 * so a resolution op replayed twice resolves the record once; a second resolve command finds the
 * record already resolved and is rejected `invalid-state` rather than producing a second revision.
 */
export function handleResolveVaultConflict(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	// SYNC-013 AC1 — DM-only. A non-DM/observer is rejected; the conflict stays available for the DM.
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(resolveVaultConflictInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	// Reconstruct the durable conflict set from the op-log substrate, then resolve the specific record.
	const conflicts = deriveVaultConflicts(state.sync.operations, state.sync.operations);
	const target: VaultConflictRecord | undefined = conflicts.find(
		(conflict) =>
			conflict.id === parsed.data.conflictId &&
			conflict.entityType === parsed.data.entityType &&
			conflict.entityId === parsed.data.entityId,
	);
	if (!target) {
		return reject(
			{
				code: 'conflict-not-found',
				message: `Conflict ${parsed.data.conflictId} not found for ${parsed.data.entityType} ${parsed.data.entityId}.`,
			},
			state,
		);
	}

	const now = env.clock();
	const operationId = env.ids();
	// The resulting non-conflicted revision supersedes BOTH diverging sides.
	const resultingRevision = Math.max(target.local.revision, target.remote.revision) + 1;
	const resolution = resolveVaultConflict(
		conflicts,
		{
			conflictId: parsed.data.conflictId,
			selectedValue: parsed.data.selectedValue,
			sourceLocalRevision: parsed.data.sourceLocalRevision,
			sourceRemoteRevision: parsed.data.sourceRemoteRevision,
			notes: parsed.data.notes ?? null,
		},
		resultingRevision,
		{ resolverActorId: actor.id, resolutionOperationId: operationId, now },
	);
	if (!resolution.ok) {
		// Map the pure fail-closed reasons to rejection codes. A stale source-revision pair is a
		// revision conflict; an already-resolved conflict is an invalid state.
		const code =
			resolution.error === 'conflict-not-found'
				? 'conflict-not-found'
				: resolution.error === 'stale-source-revision'
					? 'revision-conflict'
					: 'invalid-state';
		return reject({ code, message: resolution.message }, state);
	}

	const op = appendOperationDraft(env, state.sync, actor.id, {
		entityType: target.entityType,
		entityId: target.entityId,
		opType: `${target.entityType}.resolve-conflict`,
		path: target.path ?? `${target.entityType}/${target.entityId}/conflicts/${target.id}`,
		value: {
			id: target.id,
			conflictId: target.id,
			reason: target.reason,
			selectedValue: parsed.data.selectedValue,
			resolvedLocalRevision: resolution.audit.resolvedLocalRevision,
			resolvedRemoteRevision: resolution.audit.resolvedRemoteRevision,
			resultingRevision,
			notes: resolution.audit.notes,
			resolverActorId: actor.id,
		},
		beforeRevision: target.remote.revision,
		afterRevision: resultingRevision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'conflict.resolved',
			entityType: target.entityType,
			entityId: target.entityId,
			conflictId: target.id,
			revision: resultingRevision,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...state, sync: op.log },
		events,
		operationIds: [op.op.id],
	};
}
