import type { ActorId } from '../state/ids';
import { isConflictDetectionOpType, isConflictResolutionOpType } from '../state/conflict-lifecycle';
import type { SyncOperation } from './operation-log';

/**
 * RC-CLD-2.4 — the CROSS-DEVICE half of the conflict lifecycle.
 *
 * `state/conflict-lifecycle.ts` already owns the durable conflict RECORD (detect → persist → display →
 * DM-resolve) over the op-log substrate. What was missing is the step BEFORE detection: comparing this
 * device's op-log against the same vault's op-log as another device left it in the cloud, and deciding
 * what that comparison means. That is this module, and it is pure: no crypto, no transport, no clock.
 *
 * WHY A COMPARISON AND NOT A REPLAY. There is no generic op-applier in the core — an operation records
 * WHAT changed (entity, path, value) for audit and backup, not a re-executable command payload. So a
 * remote operation cannot be replayed into local state, and a merge cannot be synthesised op by op.
 * What the two logs CAN do is tell us, exactly and cheaply, whether the devices have diverged and on
 * which entities. That answer drives four honest outcomes:
 *
 *   - `up-to-date`   — the logs agree; nothing to do.
 *   - `fast-forward` — the cloud has operations this device does not, and this device has none the
 *                      cloud lacks. The cloud copy strictly contains this device's history, so
 *                      adopting the cloud snapshot loses nothing. This is the ordinary "I edited on
 *                      the laptop, now I opened the tablet" case.
 *   - `push-only`    — this device is ahead; the existing push path covers it.
 *   - `diverged`     — both sides hold operations the other does not. Nothing is applied. Each entity
 *                      both sides touched becomes a durable conflict record for DM resolution, using
 *                      the SAME record shape and the SAME `conflict.resolve` command that every other
 *                      conflict in the vault already uses.
 *
 * Divergence is not cosmetic. The sync-api stores operations FIRST-WRITE-WINS per revision and rejects
 * a snapshot below the stored revision, so a diverged device that pushes blindly has its operations
 * silently dropped. Detecting the divergence before pushing is what makes cross-device sync honest.
 *
 * COMPARISON MODEL. Operation ids are durable and globally unique, so two logs are compared by id,
 * positionally, from an `agreedRevision` the caller already knows both sides share (-1 = compare from
 * the start). The common prefix of the two tails is the history both devices hold; whatever follows on
 * each side is that side's private history.
 */

export const CROSS_DEVICE_MERGE_SCHEMA_VERSION = 1 as const;

/** The prefix every merge-born conflict record id carries, so its origin is legible in an audit. */
export const MERGE_CONFLICT_ID_PREFIX = 'merge';

/** The opType suffix a merge divergence is recorded under (`<entityType>.merge-conflict`). */
export const MERGE_CONFLICT_OP_SUFFIX = 'merge-conflict';

export type CrossDeviceMergeOutcome = 'up-to-date' | 'fast-forward' | 'push-only' | 'diverged';

/** One side of a divergence: the newest operation that side made to the entity, and where it sat. */
export interface MergeDivergenceSide {
	operationId: string;
	opType: string;
	path: string | null;
	/** The operation's recorded value — the material the DM compares when resolving. */
	value: unknown;
	actorId: ActorId;
	issuedAt: string;
	/** The revision this side's operation sat at in its own log. */
	revision: number;
}

/**
 * One entity both devices changed after they last agreed. This is the three-way shape the existing
 * conflict UI already renders: a common `ancestorRevision`, a local side, and a remote side.
 */
export interface MergeDivergence {
	/** Deterministic, so re-running the same merge produces the SAME record instead of a duplicate. */
	conflictId: string;
	entityType: string;
	entityId: string;
	/** `${entityType}:${entityId}` — the isolation key the conflict lifecycle scopes by. */
	entityKey: string;
	/** The field path when both sides changed the same one; null when they changed the entity broadly. */
	path: string | null;
	/** The last revision both devices held — the common ancestor of the two sides. */
	ancestorRevision: number;
	local: MergeDivergenceSide;
	remote: MergeDivergenceSide;
}

export interface CrossDeviceMergePlan {
	outcome: CrossDeviceMergeOutcome;
	/** The highest revision both logs are now proven to agree on; the next comparison starts here. */
	agreedRevision: number;
	/** Operations the cloud holds and this device does not, in cloud order. */
	incoming: SyncOperation[];
	/** Operations this device holds and the cloud does not, in local order. */
	outgoing: SyncOperation[];
	/** Entities both sides changed since `agreedRevision`. Empty unless `outcome` is `diverged`. */
	divergences: MergeDivergence[];
	schemaVersion: typeof CROSS_DEVICE_MERGE_SCHEMA_VERSION;
}

export interface CrossDeviceMergeInput {
	/** This device's operations from `baseRevision + 1` onward, in log order. */
	localOperations: readonly SyncOperation[];
	/** The cloud's operations from `baseRevision + 1` onward, in revision order. */
	remoteOperations: readonly SyncOperation[];
	/**
	 * The revision both logs are already known to agree up to. Defaults to -1, which compares the
	 * whole of both logs. A caller that has previously merged passes the plan's `agreedRevision` back
	 * and supplies only the tails, so a long history is never re-fetched.
	 */
	baseRevision?: number;
}

/** The stable entity key a divergence belongs to (matches `state/conflict-lifecycle.ts`). */
function entityKeyOf(op: SyncOperation): string {
	return `${op.entityType}:${op.entityId}`;
}

/**
 * Conflict bookkeeping is not an edit. A detection op records that two edits disagreed and a
 * resolution op records the decision; neither changes the entity the way a user edit does. Pairing
 * them would make a recorded conflict look like fresh divergence on the next comparison and mint a
 * second record for the same disagreement, so they are skipped when picking each side's newest edit.
 */
function isConflictBookkeeping(op: SyncOperation): boolean {
	return isConflictDetectionOpType(op.opType) || isConflictResolutionOpType(op.opType);
}

function sideOf(op: SyncOperation, revision: number): MergeDivergenceSide {
	return {
		operationId: op.id,
		opType: op.opType,
		path: op.path && op.path.length > 0 ? op.path : null,
		value: op.value ?? null,
		actorId: op.actorId,
		issuedAt: op.issuedAt,
		revision,
	};
}

/** The deterministic id of the conflict record a given pair of diverging operations produces. */
export function mergeConflictId(localOperationId: string, remoteOperationId: string): string {
	return `${MERGE_CONFLICT_ID_PREFIX}:${localOperationId}:${remoteOperationId}`;
}

/** Whether a conflict record was born of a cross-device merge (its id carries the merge prefix). */
export function isMergeConflictId(conflictId: string): boolean {
	return conflictId.startsWith(`${MERGE_CONFLICT_ID_PREFIX}:`);
}

/** Whether an opType is one a cross-device merge recorded (a subset of the detection opTypes). */
export function isMergeConflictOpType(opType: string): boolean {
	return opType.endsWith(`.${MERGE_CONFLICT_OP_SUFFIX}`);
}

/**
 * Compare this device's op-log against the cloud's and produce the merge plan. Pure and deterministic:
 * the same two logs always yield the same plan, including the same conflict record ids.
 *
 * The comparison walks both tails from `baseRevision + 1` while the operation ids match; that shared
 * prefix is history both devices hold, so `agreedRevision` advances through it. The remainder of each
 * tail is that side's private history. An entity that appears in BOTH remainders has been changed on
 * both devices with no way to order the two edits, so it becomes a divergence carrying each side's
 * newest operation — the material the DM compares. Entities only one side touched are reported in
 * `incoming` / `outgoing` but are not conflicts: nothing contradicts them.
 */
export function planCrossDeviceMerge(input: CrossDeviceMergeInput): CrossDeviceMergePlan {
	const base = Number.isSafeInteger(input.baseRevision) ? (input.baseRevision as number) : -1;
	const local = input.localOperations;
	const remote = input.remoteOperations;

	let shared = 0;
	while (
		shared < local.length &&
		shared < remote.length &&
		local[shared]!.id === remote[shared]!.id
	) {
		shared += 1;
	}
	const agreedRevision = base + shared;
	const outgoing = local.slice(shared);
	const incoming = remote.slice(shared);

	// Index each side's remainder by entity, keeping the NEWEST operation per entity: that is the edit
	// the DM is actually being asked to choose between. Earlier edits on the same entity are already
	// superseded by it on their own device.
	const localByEntity = new Map<string, { op: SyncOperation; revision: number }>();
	outgoing.forEach((op, offset) => {
		if (isConflictBookkeeping(op)) return;
		localByEntity.set(entityKeyOf(op), { op, revision: base + shared + 1 + offset });
	});

	const divergences: MergeDivergence[] = [];
	const seenEntities = new Set<string>();
	incoming.forEach((op, offset) => {
		if (isConflictBookkeeping(op)) return;
		const key = entityKeyOf(op);
		const localSide = localByEntity.get(key);
		if (!localSide || seenEntities.has(key)) return;
		seenEntities.add(key);
		const remoteRevision = base + shared + 1 + offset;
		// Only claim a shared path when both sides really changed the same one; otherwise the conflict
		// is entity-wide and a path would overstate what the record knows.
		const localPath = localSide.op.path && localSide.op.path.length > 0 ? localSide.op.path : null;
		const remotePath = op.path && op.path.length > 0 ? op.path : null;
		divergences.push({
			conflictId: mergeConflictId(localSide.op.id, op.id),
			entityType: op.entityType,
			entityId: op.entityId,
			entityKey: key,
			path: localPath !== null && localPath === remotePath ? localPath : null,
			ancestorRevision: agreedRevision,
			local: sideOf(localSide.op, localSide.revision),
			remote: sideOf(op, remoteRevision),
		});
	});
	// Newest-per-entity means at most one divergence per entity, but the incoming walk visits entities
	// in cloud order; sort by entity key so the recorded conflict set does not depend on push order.
	divergences.sort((a, b) => (a.entityKey < b.entityKey ? -1 : a.entityKey > b.entityKey ? 1 : 0));

	const outcome: CrossDeviceMergeOutcome =
		incoming.length > 0 && outgoing.length > 0
			? 'diverged'
			: incoming.length > 0
				? 'fast-forward'
				: outgoing.length > 0
					? 'push-only'
					: 'up-to-date';

	return {
		outcome,
		agreedRevision,
		incoming,
		outgoing,
		divergences,
		schemaVersion: CROSS_DEVICE_MERGE_SCHEMA_VERSION,
	};
}

/**
 * The value a merge divergence is recorded under on its conflict-detection op. The shape is the one
 * `state/conflict-lifecycle.ts` already reads (`id`, `reason`, `ancestorRevision`, `local`, `remote`),
 * so a merge conflict derives into exactly the same `VaultConflictRecord` a character field conflict
 * does and needs no second resolution path.
 */
export function mergeConflictOpValue(divergence: MergeDivergence): {
	id: string;
	conflictId: string;
	reason: 'source-revision-diverged';
	path: string | null;
	ancestorRevision: number;
	local: { value: unknown; revision: number; authorActorId: ActorId };
	remote: { value: unknown; revision: number; authorActorId: ActorId };
} {
	return {
		id: divergence.conflictId,
		conflictId: divergence.conflictId,
		reason: 'source-revision-diverged',
		path: divergence.path,
		ancestorRevision: divergence.ancestorRevision,
		local: {
			value: divergence.local.value,
			revision: divergence.local.revision,
			authorActorId: divergence.local.actorId,
		},
		remote: {
			value: divergence.remote.value,
			revision: divergence.remote.revision,
			authorActorId: divergence.remote.actorId,
		},
	};
}

/**
 * A one-line, non-leaking summary of what a merge found. Used by the sync surface so the user is told
 * the truth about the comparison without any campaign content crossing into a status string.
 */
export function summarizeMergePlan(plan: CrossDeviceMergePlan): {
	outcome: CrossDeviceMergeOutcome;
	incomingCount: number;
	outgoingCount: number;
	conflictCount: number;
	agreedRevision: number;
} {
	return {
		outcome: plan.outcome,
		incomingCount: plan.incoming.length,
		outgoingCount: plan.outgoing.length,
		conflictCount: plan.divergences.length,
		agreedRevision: plan.agreedRevision,
	};
}
