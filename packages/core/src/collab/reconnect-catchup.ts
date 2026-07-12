import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';
import type { CoreStateSlice } from '../commands/types';
import type {
	EntityVisibilityMetadata,
} from '../permissions/visibility-filter';
import {
	filterCatchUpStream,
	type ReplicationVisibilitySource,
} from './replication-filter';
import {
	validateReplayBatch,
	type ReplayValidationContext,
} from '../sync/replay-validation';

/**
 * COLLAB-002 — RECONNECT CATCH-UP as pure Processing-Core policy (Architecture Contract 3 "Session Join
 * Model" rule 5 — "A reconnecting participant must re-evaluate role, visibility, and grants before
 * receiving catch-up operations"; Contract 2 replication filtering). When a participant reconnects to an
 * active session, they receive ONLY the catch-up operations allowed by their CURRENT role, visibility,
 * grants, and sync cursor. This module is the single place that builds that catch-up batch, fail closed.
 *
 * THE THREE GUARANTEES (the COLLAB-002 acceptance criteria), all enforced HERE before a single op is sent:
 *
 *   1. REVOKED GRANTS ARE NOT RESTORED FROM CACHE (AC1). Catch-up re-evaluates against the CURRENT
 *      {@link PermissionState}, so an op that was visible only under a grant the participant no longer
 *      holds is NOT delivered — a stale local cache cannot resurrect a revoked capability, because the
 *      delivery gate reads live grants, never the cached ones.
 *   2. HIDDEN OPS ARE NOT SENT TO THE PLAYER STREAM (AC2). Content that changed to `dm-only`/hidden while
 *      the participant was disconnected is filtered out at the SOURCE (reusing the COLLAB-009 replication
 *      filter), so a hidden op never enters the player's catch-up stream — it is not merely hidden in the
 *      UI.
 *   3. OPS ARE DELIVERED IN DEPENDENCY ORDER AND REVALIDATED BEFORE CONTROLS RE-ENABLE (AC3). The catch-up
 *      batch preserves dependency order, and EVERY op is revalidated against the CURRENT grants via the
 *      SYNC-011 replay validator before it is applied — a deferred dependency holds the op, an unauthorized
 *      op is rejected — and the participant's durable controls stay DISABLED until the batch applies
 *      cleanly (no rejects/defers remaining).
 *
 * Per ADR-014 the LIVE reconnect TRANSPORT is deferred. This is the POLICY a transport plugs into: on
 * reconnect the transport hands the FULL op stream + the recipient + the participant's already-applied set
 * (their sync cursor expanded) + per-op visibility/permission metadata to {@link computeReconnectCatchUp},
 * which returns the EXACT ordered batch to deliver, the revalidation outcome, and whether the participant's
 * controls may re-enable. Pure + deterministic over plain data (apart from an optional `now` for grant
 * expiry) — no DOM/storage/network/entropy.
 */

/** Whether a reconnecting participant's durable controls may re-enable yet (COLLAB-002 AC3). */
export type CatchUpControlState =
	| 'enabled' // catch-up applied cleanly against current grants; durable controls may re-enable
	| 'disabled-syncing' // catch-up still applying (deferred ops awaiting dependencies); controls stay disabled
	| 'disabled-stale'; // catch-up rejected an op (e.g. a now-unauthorized op); controls stay disabled (fail closed)

/**
 * Inputs for computing a reconnect catch-up batch. The visibility source + per-op replay context are
 * supplied by the caller so this module stays pure (it does not own the entity-by-entity visibility
 * metadata or the per-op required-capability classification).
 */
export interface ReconnectCatchUpInput {
	/** The reconnecting recipient. An unknown/undefined recipient receives the EMPTY batch (fail closed). */
	recipient: Actor | undefined;
	/** The FULL ordered op stream the participant may have missed (oldest first; dependency order preserved). */
	operations: readonly SyncOperation[];
	/** The op ids the participant has ALREADY applied (their sync cursor, expanded). Never re-delivered. */
	alreadyDeliveredOperationIds: ReadonlySet<string>;
	/** The CURRENT permission state — catch-up re-evaluates grants/visibility against THIS (never the cache). */
	permission: PermissionState;
	/** Resolve an op's target visibility metadata. Absent ⇒ fail closed to `dm-only` (the filter default). */
	resolveVisibility: ReplicationVisibilitySource;
	/** The current time, for grant-expiry evaluation. Absent ⇒ expiry is not applied. */
	now?: string;
}

/** The catch-up batch + revalidation outcome for a reconnecting participant. */
export interface ReconnectCatchUpResult {
	recipientActorId: ActorId | null;
	/**
	 * The EXACT ordered ops to deliver: the participant's NOW-visible, not-yet-applied ops, in dependency
	 * order. A revoked-grant or hidden op is absent (filtered at the source). A subset of `operations`.
	 */
	delivered: SyncOperation[];
	/** The op ids accepted by replay revalidation (applied against current grants). */
	appliedOperationIds: string[];
	/** The op ids DEFERRED (a dependency not yet applied) — catch-up is still in progress. */
	deferredOperationIds: string[];
	/** The op ids REJECTED by replay revalidation (e.g. now-unauthorized) — fail closed, not applied. */
	rejectedOperationIds: string[];
	/** Whether the participant's durable controls may re-enable (COLLAB-002 AC3). Fail closed. */
	controlState: CatchUpControlState;
}

/**
 * The per-op replay context the caller supplies for revalidation: the op's CURRENT visibility metadata and
 * the capability set its write requires on its target. Catch-up re-evaluates each op against the CURRENT
 * grants using exactly this, so a revoked grant means the op fails the permission check (rejected, not
 * applied) — never silently re-applied from the cache.
 */
export type ReconnectReplayContextSource = (
	op: SyncOperation,
) => Pick<ReplayValidationContext, 'targetEntityIds' | 'visibilityMetadata' | 'requiredCapability'>;

/**
 * COLLAB-002 — compute the reconnect catch-up batch for a participant, fail closed.
 *
 * Step 1 — DELIVERY FILTER (AC1 + AC2): {@link filterCatchUpStream} re-evaluates EVERY op against the
 * CURRENT permission/visibility state and excludes ops the participant has already applied. The result is
 * exactly the ops that are NOW visible to the participant AND not yet delivered — so a revoked-grant op
 * (no longer visible) and a now-hidden op are BOTH absent from `delivered`, in dependency order.
 *
 * Step 2 — REPLAY REVALIDATION (AC3): the delivered batch is revalidated, IN ORDER, by the SYNC-011 replay
 * validator against the CURRENT state/grants. An op whose dependency is not yet applied DEFERS; an op the
 * participant is no longer authorized to apply is REJECTED (fail closed); the rest are accepted. The
 * applied-id set threads through the batch so an earlier op can satisfy a later op's dependency.
 *
 * Step 3 — CONTROL GATE (AC3): the participant's durable controls re-enable ONLY when the batch applied
 * cleanly — no rejects and no defers. A reject ⇒ `disabled-stale` (a now-unauthorized op was withheld;
 * the participant must not act on stale authority). A defer with no reject ⇒ `disabled-syncing` (still
 * catching up). Otherwise ⇒ `enabled`.
 */
export function computeReconnectCatchUp(
	input: ReconnectCatchUpInput,
	state: CoreStateSlice,
	replayContextFor: ReconnectReplayContextSource,
): ReconnectCatchUpResult {
	const recipientActorId = input.recipient?.id ?? null;

	// Step 1 — delivery filter: NOW-visible, not-yet-applied ops only, in dependency order (AC1 + AC2).
	const stream = filterCatchUpStream(
		input.operations,
		input.recipient,
		input.resolveVisibility,
		input.alreadyDeliveredOperationIds,
		input.permission,
	);
	const delivered = stream.delivered;

	// A dependency reference that is an ENTITY-REVISION MARKER (`entityKey@revision` — it carries an `@`)
	// refers to already-materialized base state, NOT a pending op, so it counts as SATISFIED for catch-up.
	// Seed the replay's applied set with these so only a genuine PENDING-op dependency (an op id) can defer
	// an op — otherwise a revision-marker dependency would spuriously defer a perfectly applicable op. (A
	// genuine op-id dependency that is missing still defers, fail closed.)
	const seededApplied = new Set(input.alreadyDeliveredOperationIds);
	for (const op of delivered) {
		for (const dep of op.dependencies) {
			if (dep.includes('@')) seededApplied.add(dep);
		}
	}

	// Step 2 — replay revalidation against CURRENT grants, in dependency order (AC3). The DM never needs
	// the catch-up authority gate (it sees everything and acts with inherent authority), but the gate is
	// still safe for the DM (every op is authored under DM authority). The applied-id set seeds from the
	// participant's already-applied cursor (plus satisfied base-state refs) so a dependency satisfied before
	// the disconnect still counts.
	const batch = validateReplayBatch(
		delivered,
		state,
		seededApplied,
		(op) => ({ ...replayContextFor(op), now: input.now }),
	);

	// Step 3 — control gate (fail closed): a reject keeps controls stale; a pending defer keeps them
	// syncing; only a clean apply re-enables durable controls.
	let controlState: CatchUpControlState;
	if (batch.rejectedIds.length > 0) controlState = 'disabled-stale';
	else if (batch.deferredIds.length > 0) controlState = 'disabled-syncing';
	else controlState = 'enabled';

	return {
		recipientActorId,
		delivered,
		appliedOperationIds: batch.appliedIds,
		deferredOperationIds: batch.deferredIds,
		rejectedOperationIds: batch.rejectedIds,
		controlState,
	};
}

/**
 * COLLAB-002 AC1 — the hard, fail-closed assertion that a catch-up batch RESTORES NO REVOKED-GRANT
 * capability. Given the delivered catch-up batch + a predicate that decides whether the recipient is
 * CURRENTLY visible/authorized for an op, this throws if any delivered op is one the recipient may no
 * longer see — a boundary guard so a buggy transport that bypassed {@link computeReconnectCatchUp} (or
 * served ops from a stale cache) is caught at the source rather than restoring revoked access. Pure
 * (apart from throwing). The DM is exempt (it sees everything).
 */
export function assertCatchUpRestoresNoRevokedAccess(
	delivered: readonly SyncOperation[],
	recipient: Actor | undefined,
	resolveVisibility: ReplicationVisibilitySource,
	permission: PermissionState,
): void {
	if (recipient && hasDmAuthority(recipient.role)) return;
	// Re-run the SAME source-side filter the delivery used; any delivered op that is not now-visible is a leak.
	const recheck = filterCatchUpStream(
		delivered,
		recipient,
		resolveVisibility,
		new Set<string>(),
		permission,
	);
	const visibleIds = new Set(recheck.delivered.map((op) => op.id));
	for (const op of delivered) {
		if (!visibleIds.has(op.id)) {
			throw new Error(
				`Reconnect catch-up leak: operation "${op.id}" is not visible to recipient "${recipient?.id ?? 'unknown'}" under current grants and must not be restored from cache.`,
			);
		}
	}
}

/**
 * Resolve a participant's sync cursor — the set of op ids they have already applied — from a recorded
 * cursor op id within the FULL ordered op stream. Every op up to AND INCLUDING the cursor op is considered
 * applied; everything after is catch-up. A `null` cursor (fresh join / no prior state) ⇒ the empty set
 * (everything is catch-up). A cursor op id not found in the stream ⇒ the empty set (fail closed — treat the
 * participant as having applied nothing rather than guessing a position). Pure + deterministic.
 */
export function appliedIdsBeforeCursor(
	operations: readonly SyncOperation[],
	syncCursor: string | null,
): Set<string> {
	const applied = new Set<string>();
	if (syncCursor === null) return applied;
	let found = false;
	for (const op of operations) {
		applied.add(op.id);
		if (op.id === syncCursor) {
			found = true;
			break;
		}
	}
	return found ? applied : new Set<string>();
}

export type { EntityVisibilityMetadata };
