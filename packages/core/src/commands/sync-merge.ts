import { mergeRemoteOperationsInputSchema } from '../schemas/commands';
import { deriveVaultConflicts } from '../state/conflict-lifecycle';
import {
	MERGE_CONFLICT_OP_SUFFIX,
	mergeConflictOpValue,
	planCrossDeviceMerge,
	type CrossDeviceMergePlan,
	type MergeDivergence,
} from '../sync/conflict-lifecycle';
import type { SyncOperation } from '../sync/operation-log';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * RC-CLD-2.4 — record what a cross-device merge found.
 *
 * The transport pulls the vault's encrypted op-log from the cloud, decrypts it, and hands the tail to
 * this command. Everything that follows is a CORE decision: the core compares the two logs
 * (`sync/conflict-lifecycle.ts`), classifies the result, and — when the devices have genuinely
 * diverged — appends one durable conflict-detection op per entity both devices changed. The GUI never
 * decides that a conflict exists and never writes one.
 *
 * The recorded ops are `<entityType>.merge-conflict`, which satisfies the detection-opType test the
 * conflict lifecycle already uses, so they derive into ordinary `VaultConflictRecord`s: the DM sees
 * them in the same list, resolves them with the same DM-only `conflict.resolve` command, and gets the
 * same audit history. There is no second conflict system.
 *
 * Nothing is applied to state. An operation records what changed, not a re-executable command, so a
 * remote operation cannot be replayed here — the honest outcomes are "the cloud strictly contains
 * this device's history, so adopting its snapshot is safe" (`fast-forward`, carried out by the
 * transport), "this device is ahead" (`push-only`), or "both moved, a person must choose"
 * (`diverged`). Fail closed: a diverged vault records conflicts and applies nothing.
 *
 * Idempotent: conflict record ids are derived from the two operation ids that produced them, so
 * re-running the same merge finds every record already present and appends nothing.
 */
export function handleMergeRemoteOperations(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	// Merging another device's history into this vault is administrative: DM-only, like resolution.
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(mergeRemoteOperationsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const baseRevision = parsed.data.baseRevision;
	if (baseRevision + 1 > state.sync.operations.length) {
		return reject(
			{
				code: 'revision-conflict',
				message:
					'The merge starts past the end of this device’s change history. Sync again from the start.',
			},
			state,
		);
	}

	const plan: CrossDeviceMergePlan = planCrossDeviceMerge({
		localOperations: state.sync.operations.slice(baseRevision + 1),
		remoteOperations: parsed.data.remoteOperations as SyncOperation[],
		baseRevision,
	});

	// Skip divergences already on record: the first detection per conflict id wins in the lifecycle,
	// so re-recording one would only grow the log with duplicates the derivation discards.
	const known = new Set(
		deriveVaultConflicts(state.sync.operations, state.sync.operations).map((record) => record.id),
	);
	const fresh: MergeDivergence[] = plan.divergences.filter(
		(divergence) => !known.has(divergence.conflictId),
	);

	let log = state.sync;
	const operationIds: string[] = [];
	for (const divergence of fresh) {
		const appended = appendOperationDraft(env, log, actor.id, {
			entityType: divergence.entityType,
			entityId: divergence.entityId,
			opType: `${divergence.entityType}.${MERGE_CONFLICT_OP_SUFFIX}`,
			path:
				divergence.path ??
				`${divergence.entityType}/${divergence.entityId}/conflicts/${divergence.conflictId}`,
			value: mergeConflictOpValue(divergence),
			beforeRevision: divergence.ancestorRevision >= 0 ? divergence.ancestorRevision : undefined,
			afterRevision: Math.max(divergence.local.revision, divergence.remote.revision),
		});
		log = appended.log;
		operationIds.push(appended.op.id);
	}

	const events: CoreEvent[] = [
		{
			kind: 'sync.merge-recorded',
			actorId: actor.id,
			outcome: plan.outcome,
			agreedRevision: plan.agreedRevision,
			incomingCount: plan.incoming.length,
			outgoingCount: plan.outgoing.length,
			conflictCount: plan.divergences.length,
			recordedConflictCount: fresh.length,
		},
	];

	return {
		status: 'accepted',
		nextState: fresh.length > 0 ? { ...state, sync: log } : state,
		events,
		operationIds,
	};
}
