import type { ActorId } from '../state/ids';
import type { SyncOperation } from '../sync/operation-log';
import type { SessionCachePolicy } from './cache-privacy';
import { isSealedCacheEntryUnreadable } from './cache-privacy';
import type { CatchUpControlState } from './reconnect-catchup';

/**
 * COLLAB-013 — MOBILE / RECONNECT CATCH-UP across sleep, backgrounding, and intermittent connectivity
 * (Mobile reconnect audit; Sync operation dependency model; Handout requirements). When a mobile device
 * WAKES after missing a burst of session operations — Scene projection, handout delivery, grant revocation,
 * and combat updates — catch-up must (a) apply those dependencies IN ORDER, (b) make a revoked handout
 * UNREADABLE before any stale UI can open it, and (c) when catch-up FAILS mid-stream, show stale/reconnecting
 * state and DISABLE durable commands that require current grants. This module is the pure Processing-Core
 * policy for those three guarantees; it composes the COLLAB-002 reconnect catch-up + the COLLAB-010/014
 * cache-seal policy rather than re-implementing either.
 *
 *   - ORDERING (AC1): catch-up applies ops in DEPENDENCY order (the {@link SyncOperation.dependencies}
 *     carried by each op), NOT wall-clock order (Contract 2 Sync Unit rule 1). {@link orderCatchUpByDependency}
 *     is a deterministic topological sort that surfaces a missing/cyclic dependency fail-closed (a held op
 *     never applies out of order). The downstream control state then matches CURRENT authority.
 *   - SEAL-BEFORE-OPEN (AC2): a revoked handout sitting in the local cache during offline mode must become
 *     UNREADABLE before any stale UI can open it. {@link isCachedHandoutOpenable} answers, fail closed,
 *     whether a cached handout entry may still be opened — gating on the COLLAB-014 sealed-cache TTL so an
 *     OFFLINE device seals the entry on local-TTL expiry even before the revoke op is delivered.
 *   - MID-STREAM FAILURE (AC3): when the catch-up stream fails partway, {@link deriveCatchUpFailureState}
 *     computes the stale/reconnecting status the participant UI shows and whether durable commands stay
 *     disabled — reusing the COLLAB-002 {@link CatchUpControlState} so a partial/failed catch-up never
 *     re-enables a control that needs current grants.
 *
 * Per ADR-014 the LIVE mobile transport (wake detection, background sync, reconnect handshake) is deferred.
 * This is the POLICY a transport plugs into: on wake the transport hands the missed ops + the cache policy +
 * the catch-up outcome to these helpers and applies the computed ordering/seal/stale decisions. Pure +
 * deterministic over plain data (apart from the `now` clock passed in for TTL) — no DOM/storage/network.
 */

/** The category of a catch-up operation, used to apply mixed dependencies in the right order (AC1). */
export type CatchUpOpKind =
	| 'scene-projection' // a player-view / active-map projection (Scene projection)
	| 'handout' // a handout delivery / reveal / revocation
	| 'grant' // a permission grant / revocation (authority change)
	| 'combat' // a combat lifecycle / resource op
	| 'other'; // any other durable session op

/** Classify a catch-up op by its `opType`/`entityType` (deterministic; fail closed to `other`). */
export function classifyCatchUpOp(op: SyncOperation): CatchUpOpKind {
	const type = op.opType;
	if (type === 'session.project-player-view' || type === 'session.project-active-map') {
		return 'scene-projection';
	}
	if (type.startsWith('session.') && type.includes('handout')) return 'handout';
	if (type.startsWith('permission.')) return 'grant';
	if (type.startsWith('combat.')) return 'combat';
	return 'other';
}

/** A dependency problem found while ordering a catch-up batch (fail-closed: a held op never applies). */
export type CatchUpOrderProblemKind = 'missing-dependency' | 'dependency-cycle';

export interface CatchUpOrderProblem {
	operationId: ActorId;
	kind: CatchUpOrderProblemKind;
	/** The dependency op ids that are missing/involved in the cycle (sorted, deterministic). */
	unresolvedDependencies: string[];
}

/** The result of ordering a catch-up batch by dependency (Contract 2 Sync Unit rule 1). */
export interface CatchUpOrderResult {
	/** The ops in a valid dependency order (a dependency always precedes the op that depends on it). */
	ordered: SyncOperation[];
	/** Ops that could NOT be ordered (a missing/cyclic dependency). Held back — never applied out of order. */
	held: CatchUpOrderProblem[];
}

/**
 * COLLAB-013 AC1 — order a catch-up batch by DEPENDENCY, not wall-clock. A deterministic topological sort:
 * an op is emitted only once every dependency it declares is either ALREADY APPLIED (`appliedOperationIds`)
 * or already emitted earlier in this batch. An op with an UNRESOLVED dependency (a PENDING-op dependency
 * that is neither applied nor present in this batch) is HELD with `missing-dependency`; a set of ops
 * mutually waiting on each other is HELD with `dependency-cycle`. Held ops NEVER appear in `ordered` (fail
 * closed — a dependency-broken op is not applied out of order).
 *
 * An ENTITY-REVISION MARKER dependency (`entityKey@revision` — it carries an `@`) refers to
 * already-materialized base state, NOT a pending op, so it is treated as SATISFIED (the device already has
 * that base state). Only genuine pending-op-id dependencies can hold an op back.
 *
 * Ties (multiple ready ops) break by `issuedAt` then op id, so the output is fully deterministic.
 */
export function orderCatchUpByDependency(
	operations: readonly SyncOperation[],
	appliedOperationIds: ReadonlySet<string> = new Set(),
): CatchUpOrderResult {
	const inBatch = new Set(operations.map((op) => op.id));
	const satisfied = new Set(appliedOperationIds);
	// An entity-revision marker dependency refers to base state the device already has ⇒ satisfied.
	const isBaseStateRef = (dep: string): boolean => dep.includes('@');
	const remaining = new Map(operations.map((op) => [op.id, op]));
	const ordered: SyncOperation[] = [];

	// An op is ready to emit once EVERY pending-op dependency it declares is already satisfied (applied
	// earlier, or applied before the disconnect). A base-state-ref dependency is always satisfied; an op-id
	// dependency in this batch must be emitted FIRST; an op-id dependency neither applied nor in this batch
	// is unresolvable (missing) and the op is never emitted.
	const readyNow = (op: SyncOperation): boolean =>
		op.dependencies.every((dep) => isBaseStateRef(dep) || satisfied.has(dep));

	// Emit greedily: repeatedly take every op whose dependencies are all already satisfied.
	let progressed = true;
	while (progressed) {
		progressed = false;
		const ready = [...remaining.values()]
			.filter((op) => readyNow(op))
			.sort((a, b) => (a.issuedAt === b.issuedAt ? (a.id < b.id ? -1 : 1) : a.issuedAt < b.issuedAt ? -1 : 1));
		for (const op of ready) {
			ordered.push(op);
			satisfied.add(op.id);
			remaining.delete(op.id);
			progressed = true;
		}
	}

	// Anything left is held: classify each as missing-dependency (a dep neither applied nor in batch) or
	// dependency-cycle (its unresolved deps are all still in the remaining set — a mutual wait).
	const held: CatchUpOrderProblem[] = [...remaining.values()]
		.map((op) => {
			const unresolved = op.dependencies.filter((dep) => !isBaseStateRef(dep) && !satisfied.has(dep));
			const missing = unresolved.filter((dep) => !inBatch.has(dep));
			return {
				operationId: op.id,
				kind: (missing.length > 0 ? 'missing-dependency' : 'dependency-cycle') as CatchUpOrderProblemKind,
				unresolvedDependencies: [...new Set(unresolved)].sort(),
			};
		})
		.sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));

	return { ordered, held };
}

/**
 * COLLAB-013 AC2 — whether a cached handout entry may still be OPENED on a (possibly offline) device. Fail
 * closed: a handout is openable ONLY when it is NOT revoked AND (if its session cache is sealed) its
 * sealed-cache TTL has NOT elapsed. A revoked handout is never openable (the revoke op makes it
 * unreadable); an unrevoked-but-sealed handout becomes unreadable on local-TTL expiry EVEN OFFLINE
 * (reusing {@link isSealedCacheEntryUnreadable}), so stale UI cannot open it before the revoke op arrives.
 * A persistent-granted handout (exempt in the policy) stays openable.
 */
export function isCachedHandoutOpenable(
	cacheKey: string,
	revoked: boolean,
	policy: SessionCachePolicy,
	now: string,
	sealedAt?: string,
): boolean {
	if (revoked) return false; // a revoked handout is unreadable — never openable from a stale cache
	// Not revoked: openable unless the sealed-cache TTL has made it unreadable (offline revocation, AC2).
	return !isSealedCacheEntryUnreadable(policy, cacheKey, now, sealedAt);
}

/** Whether catch-up completed cleanly, was still applying, or FAILED mid-stream (COLLAB-013 AC3). */
export type CatchUpStreamPhase = 'complete' | 'in-progress' | 'failed';

/** The participant UI status a mid-stream catch-up failure surfaces (COLLAB-013 AC3). */
export type CatchUpUiStatus = 'live' | 'syncing' | 'stale-reconnecting';

/** The stale/reconnecting state + control gate derived from a catch-up stream phase (COLLAB-013 AC3). */
export interface CatchUpFailureState {
	phase: CatchUpStreamPhase;
	/** The status the participant UI shows. */
	uiStatus: CatchUpUiStatus;
	/** The COLLAB-002 control gate: whether durable commands requiring current grants may re-enable. */
	controlState: CatchUpControlState;
	/** True when durable commands requiring current grants must stay DISABLED (fail closed). */
	durableCommandsDisabled: boolean;
	/** A generic, non-leaking message for the participant UI. */
	message: string;
}

const FAILURE_MESSAGES: Record<CatchUpUiStatus, string> = {
	live: 'Your session is up to date.',
	syncing: 'Catching up on session updates…',
	'stale-reconnecting':
		'Your session view is out of date and is reconnecting. Some actions are disabled until you are caught up.',
};

/**
 * COLLAB-013 AC3 — derive the stale/reconnecting UI state + control gate from a catch-up stream phase.
 * Fail closed:
 *
 *   - `failed` (catch-up failed mid-stream — a delivery error, or a held/unresolvable dependency, or a
 *     rejected op) ⇒ `stale-reconnecting` UI and durable commands DISABLED (`disabled-stale`). The
 *     participant cannot act on stale authority.
 *   - `in-progress` (catch-up still applying — deferred ops awaiting dependencies) ⇒ `syncing` UI and
 *     durable commands DISABLED (`disabled-syncing`).
 *   - `complete` (catch-up applied cleanly against current grants) ⇒ `live` UI and durable commands ENABLED.
 *
 * `durableCommandsDisabled` is true for anything but a clean completion — a control that needs current
 * grants never re-enables until the participant is provably caught up.
 */
export function deriveCatchUpFailureState(phase: CatchUpStreamPhase): CatchUpFailureState {
	if (phase === 'failed') {
		return {
			phase,
			uiStatus: 'stale-reconnecting',
			controlState: 'disabled-stale',
			durableCommandsDisabled: true,
			message: FAILURE_MESSAGES['stale-reconnecting'],
		};
	}
	if (phase === 'in-progress') {
		return {
			phase,
			uiStatus: 'syncing',
			controlState: 'disabled-syncing',
			durableCommandsDisabled: true,
			message: FAILURE_MESSAGES.syncing,
		};
	}
	return {
		phase,
		uiStatus: 'live',
		controlState: 'enabled',
		durableCommandsDisabled: false,
		message: FAILURE_MESSAGES.live,
	};
}

/**
 * COLLAB-013 AC1 — map a reconnect catch-up control state (+ whether any op was held by dependency
 * ordering) to a catch-up stream phase, so the mobile UI state can be derived from the catch-up outcome:
 *
 *   - any HELD op (unresolvable/cyclic dependency) ⇒ `failed` (dependencies cannot be applied in order).
 *   - control state `disabled-stale` (a rejected op) ⇒ `failed`.
 *   - control state `disabled-syncing` (deferred ops) ⇒ `in-progress`.
 *   - control state `enabled` with no held ops ⇒ `complete`.
 */
export function catchUpPhase(
	controlState: CatchUpControlState,
	heldOperationCount: number,
): CatchUpStreamPhase {
	if (heldOperationCount > 0 || controlState === 'disabled-stale') return 'failed';
	if (controlState === 'disabled-syncing') return 'in-progress';
	return 'complete';
}
