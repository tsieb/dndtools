import { budgetForId, LIVE_SESSION_DELIVERY_BUDGET_ID } from '../perf/budget-registry';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';
import {
	filterReplicationStream,
	type ReplicationVisibilitySource,
} from './replication-filter';

/**
 * COLLAB-003 — NEAR-REAL-TIME LIVE SESSION STATE SHARING (Vision Collaboration; Architecture Contract 2
 * local-first/degraded sync). Participants share real-time or near-real-time session state for active
 * scenes, combat, dice, timers, handouts, and visible map updates. This module is the pure Processing-Core
 * policy for the DELIVERY half of that capability — it builds, fail closed, the ordered batch of session
 * operations a connected participant may receive, and computes the live/stale status + latency-budget
 * reporting the GUI renders. The live transport (websocket/push) is deferred per ADR-014; this is the
 * policy a transport plugs into.
 *
 * THE FOUR GUARANTEES (the COLLAB-003 acceptance criteria), all enforced HERE:
 *
 *   1. NEAR-REAL-TIME PROJECTED DELIVERY (AC1). When the DM advances a projected combat Scene (or rolls
 *      dice, advances a timer, delivers a handout, reveals a map layer), the visible session op is
 *      delivered to the connected participant. {@link deliverableSessionUpdates} filters the live op
 *      stream through the COLLAB-009 replication filter (so a player NEVER receives a hidden op) and
 *      returns the participant's deliverable batch in order — the substrate a transport pushes.
 *   2. STALE / RECONNECTING STATUS WHEN UPDATES PEND (AC2). When latency delays delivery,
 *      {@link deriveLiveSessionStatus} computes the participant's status (`live`/`syncing`/`stale`/
 *      `reconnecting`) from the pending-update count + connection state, so the GUI can mark the surface
 *      stale and the participant knows their view may be behind.
 *   3. OUT-OF-ORDER DEFERRAL (AC3). An accepted session op delivered before its dependencies DEFERS until
 *      they arrive (it is never applied out of order); if it can never be satisfied from the buffer the
 *      participant is reported STALE. {@link bufferOutOfOrderUpdate} / {@link drainApplicableUpdates}
 *      implement the in-order apply with a deterministic pending buffer.
 *   4. LATENCY-BUDGET REPORTING (AC4). Given a configured product latency budget and a set of measured
 *      deliveries, {@link reportLatencyBudget} computes p95 delivery and stale-state thresholds against
 *      that budget (within / exceeded), so near-real-time performance is measurable against the budget.
 *
 * It REUSES the COLLAB-009 replication filter for visibility (filter-before-send) and does NOT
 * re-implement it. Pure + deterministic over plain data (apart from numeric measurements) — no
 * DOM/storage/clock/entropy/network.
 */

// --- AC1: near-real-time projected delivery ---------------------------------------------------------

/**
 * The session entity types whose live operations COLLAB-003 shares in near-real-time: combat, dice,
 * timers, handouts, player-view/active-map projection, and visible map updates. An op outside this set is
 * not a live-session update (it is delivered through the normal catch-up path, not the live channel).
 */
export const LIVE_SESSION_ENTITY_TYPES: readonly string[] = Object.freeze([
	'session',
	'combat',
	'handout',
	'timer',
	'dice',
	'map',
	'scene',
]);

/** Whether an op is a live-session update COLLAB-003 shares in near-real-time. */
export function isLiveSessionUpdate(op: SyncOperation): boolean {
	if ((LIVE_SESSION_ENTITY_TYPES as readonly string[]).includes(op.entityType)) return true;
	// Some session ops are recorded against a session-scoped opType prefix (e.g. `session.*`, `combat.*`).
	const prefix = op.opType.split('.')[0] ?? '';
	return (LIVE_SESSION_ENTITY_TYPES as readonly string[]).includes(prefix);
}

/**
 * COLLAB-003 AC1 — the ordered batch of live-session updates a participant may RECEIVE. From the live op
 * stream, keep only the live-session updates (combat/dice/timers/handouts/map/scene projection) the
 * participant has not already applied, then filter them through the COLLAB-009 replication filter so a
 * hidden op NEVER enters the participant's stream (filter-before-send). The DM receives every live update.
 *
 * The result is the substrate a transport pushes to the connected participant — a STRICT, in-order subset
 * of the live stream that carries no hidden content. Pure + deterministic.
 */
export function deliverableSessionUpdates(
	liveOperations: readonly SyncOperation[],
	recipient: Actor | undefined,
	resolveVisibility: ReplicationVisibilitySource,
	alreadyAppliedOperationIds: ReadonlySet<string>,
	permission?: PermissionState,
): SyncOperation[] {
	if (!recipient) return [];
	const sessionUpdates = liveOperations.filter(
		(op) => isLiveSessionUpdate(op) && !alreadyAppliedOperationIds.has(op.id),
	);
	const filtered = filterReplicationStream(sessionUpdates, recipient, resolveVisibility, permission);
	return filtered.delivered;
}

// --- AC2: stale / reconnecting status ---------------------------------------------------------------

/** The participant's live-session status (COLLAB-003 AC2). Fail closed: anything but caught-up is degraded. */
export type LiveSessionStatus =
	| 'live' // connected and caught up — the view reflects the latest delivered session state
	| 'syncing' // connected but updates are in flight / pending application (latency); view may be behind
	| 'stale' // connected but updates are overdue / out-of-order and cannot apply; the view is behind
	| 'reconnecting'; // not connected — waiting for the live channel to come back

export interface LiveSessionStatusInput {
	/** Whether the live channel is currently connected. */
	connected: boolean;
	/** Count of delivered-but-not-yet-applied updates (in flight / buffered). */
	pendingUpdateCount: number;
	/** Count of buffered updates that cannot apply because a dependency is missing (out-of-order, AC3). */
	undeliverableUpdateCount?: number;
	/**
	 * Optional: the age in ms of the oldest pending update vs the stale threshold. When the oldest pending
	 * update is older than `staleThresholdMs`, the status escalates from `syncing` to `stale`.
	 */
	oldestPendingAgeMs?: number;
	/** The stale threshold in ms from the product latency budget. */
	staleThresholdMs?: number;
}

/** A generic, non-leaking message per status, for the participant UI. */
const STATUS_MESSAGES: Record<LiveSessionStatus, string> = {
	live: 'Live session is up to date.',
	syncing: 'Receiving live session updates…',
	stale: 'Your live session view is behind and is catching up. Some updates may not be applied yet.',
	reconnecting: 'Reconnecting to the live session… your view may be out of date.',
};

export interface LiveSessionStatusResult {
	status: LiveSessionStatus;
	message: string;
	/** True when the participant's view may be behind the authoritative session (any non-`live` status). */
	stale: boolean;
}

/**
 * COLLAB-003 AC2 — derive the participant's live-session status from the connection + pending-update
 * state. Fail closed (a behind view is never reported `live`):
 *
 *   - NOT connected ⇒ `reconnecting` (the live channel is down; the view is presumed behind).
 *   - connected with ANY undeliverable (out-of-order, dependency-missing) update ⇒ `stale` (AC3 — a held
 *     update means the view cannot be brought current yet).
 *   - connected with pending updates older than the stale threshold ⇒ `stale`.
 *   - connected with pending updates within threshold ⇒ `syncing`.
 *   - connected and fully caught up ⇒ `live`.
 */
export function deriveLiveSessionStatus(input: LiveSessionStatusInput): LiveSessionStatusResult {
	const pending = Math.max(0, Math.trunc(input.pendingUpdateCount));
	const undeliverable = Math.max(0, Math.trunc(input.undeliverableUpdateCount ?? 0));

	let status: LiveSessionStatus;
	if (!input.connected) {
		status = 'reconnecting';
	} else if (undeliverable > 0) {
		status = 'stale';
	} else if (
		pending > 0 &&
		input.oldestPendingAgeMs !== undefined &&
		input.staleThresholdMs !== undefined &&
		input.oldestPendingAgeMs > input.staleThresholdMs
	) {
		status = 'stale';
	} else if (pending > 0) {
		status = 'syncing';
	} else {
		status = 'live';
	}

	return { status, message: STATUS_MESSAGES[status], stale: status !== 'live' };
}

// --- AC3: out-of-order deferral ---------------------------------------------------------------------

/** The result of draining the pending buffer: the ops applied in order + the ops still held. */
export interface DrainResult {
	/** Ops applied this drain, in dependency order (a dependency always precedes its dependent). */
	applied: SyncOperation[];
	/** Ops still buffered because a dependency has not arrived (held — never applied out of order). */
	pending: SyncOperation[];
	/** The applied-id set after this drain (the seed for the next drain). */
	appliedOperationIds: ReadonlySet<string>;
}

/** Whether an op's every dependency is satisfied by the applied set (a base-state `@`-ref is satisfied). */
function dependenciesSatisfied(op: SyncOperation, applied: ReadonlySet<string>): boolean {
	return op.dependencies.every((dep) => dep.includes('@') || applied.has(dep));
}

/**
 * COLLAB-003 AC3 — buffer an out-of-order live update. An accepted session op delivered before its
 * dependencies is added to the pending buffer (deduped by id) rather than applied — it is NEVER applied
 * out of order. Pure: returns a new buffer; the input is unchanged.
 */
export function bufferOutOfOrderUpdate(
	pending: readonly SyncOperation[],
	update: SyncOperation,
): SyncOperation[] {
	if (pending.some((op) => op.id === update.id)) return [...pending];
	return [...pending, update];
}

/**
 * COLLAB-003 AC3 — drain the pending buffer, applying every update whose dependencies are now satisfied,
 * IN dependency order, and holding the rest. A deterministic fixed-point: repeatedly apply every buffered
 * op whose dependencies are satisfied (an earlier-applied op can satisfy a later op), until no more can
 * apply. Anything left is HELD (a dependency that has not arrived) — it is never applied out of order, so
 * the participant view stays consistent and the held count drives the `stale` status (AC2). Pure +
 * deterministic (ties break by `issuedAt` then id).
 */
export function drainApplicableUpdates(
	pending: readonly SyncOperation[],
	baseAppliedOperationIds: ReadonlySet<string>,
): DrainResult {
	let applied = new Set(baseAppliedOperationIds);
	const remaining = new Map(pending.map((op) => [op.id, op]));
	const appliedOrder: SyncOperation[] = [];

	let progressed = true;
	while (progressed) {
		progressed = false;
		const ready = [...remaining.values()]
			.filter((op) => dependenciesSatisfied(op, applied))
			.sort((a, b) =>
				a.issuedAt === b.issuedAt ? (a.id < b.id ? -1 : 1) : a.issuedAt < b.issuedAt ? -1 : 1,
			);
		for (const op of ready) {
			appliedOrder.push(op);
			if (!applied.has(op.id)) applied = new Set(applied).add(op.id);
			remaining.delete(op.id);
			progressed = true;
		}
	}

	const stillPending = [...remaining.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { applied: appliedOrder, pending: stillPending, appliedOperationIds: applied };
}

// --- AC4: latency-budget reporting ------------------------------------------------------------------

/**
 * The product latency budget for near-real-time session updates (COLLAB-003 AC4). `p95DeliveryMs` is the
 * 95th-percentile delivery-latency target; `staleThresholdMs` is when a pending update marks the view
 * stale. These are CONFIGURED product numbers; this module reports MEASUREMENTS against them, it does not
 * invent the budget.
 */
export interface SessionLatencyBudget {
	/** The p95 delivery-latency target in ms. */
	p95DeliveryMs: number;
	/** The stale-state threshold in ms (a pending update older than this marks the view stale). */
	staleThresholdMs: number;
}

/**
 * A sensible default budget for the first prototype: 500ms p95 delivery, 2s stale threshold. The p95
 * delivery target is OWNED by the PERF-001 registry (`live-session-delivery`); this default reads it
 * from there so the number is declared in exactly one place. The `staleThresholdMs` stays local to the
 * live-session module — it is a live-session presentation threshold, not a generic graded budget.
 */
export const DEFAULT_SESSION_LATENCY_BUDGET: SessionLatencyBudget = Object.freeze({
	p95DeliveryMs: budgetForId(LIVE_SESSION_DELIVERY_BUDGET_ID)?.metric.target ?? 500,
	staleThresholdMs: 2000,
});

export interface LatencyBudgetReport {
	/** The configured budget the measurements were reported against. */
	budget: SessionLatencyBudget;
	/** The number of measured deliveries (0 ⇒ nothing to report; thresholds are reported as met). */
	sampleCount: number;
	/** The measured p95 delivery latency in ms (0 when there are no samples). */
	measuredP95Ms: number;
	/** The maximum measured delivery latency in ms (0 when there are no samples). */
	measuredMaxMs: number;
	/** Whether measured p95 is within the budget's p95 target. */
	withinP95Budget: boolean;
	/** The count of measured deliveries that exceeded the stale threshold. */
	staleDeliveryCount: number;
	/** Whether no measured delivery exceeded the stale threshold. */
	withinStaleThreshold: boolean;
}

/**
 * Compute the p95 of a numeric sample using the nearest-rank method (deterministic). An empty sample
 * yields 0. Used to report measured delivery latency against the budget's p95 target (AC4).
 */
export function percentile(samples: readonly number[], p: number): number {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((a, b) => a - b);
	const clampedP = p < 0 ? 0 : p > 100 ? 100 : p;
	// Nearest-rank: rank = ceil(p/100 * N), 1-based; index = rank - 1, clamped to the array bounds.
	const rank = Math.ceil((clampedP / 100) * sorted.length);
	const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
	return sorted[index]!;
}

/**
 * COLLAB-003 AC4 — report measured near-real-time delivery latencies against the configured product
 * budget. Given the per-delivery latencies (ms) and the budget, computes measured p95 + max delivery,
 * whether p95 is within the budget, and how many deliveries exceeded the stale threshold (and whether any
 * did). With no samples the thresholds are reported as met (nothing measured exceeded anything). Pure +
 * deterministic.
 */
export function reportLatencyBudget(
	deliveryLatenciesMs: readonly number[],
	budget: SessionLatencyBudget = DEFAULT_SESSION_LATENCY_BUDGET,
): LatencyBudgetReport {
	const samples = deliveryLatenciesMs.filter((ms) => Number.isFinite(ms) && ms >= 0);
	const measuredP95Ms = percentile(samples, 95);
	const measuredMaxMs = samples.length === 0 ? 0 : Math.max(...samples);
	const staleDeliveryCount = samples.filter((ms) => ms > budget.staleThresholdMs).length;
	return {
		budget,
		sampleCount: samples.length,
		measuredP95Ms,
		measuredMaxMs,
		withinP95Budget: measuredP95Ms <= budget.p95DeliveryMs,
		staleDeliveryCount,
		withinStaleThreshold: staleDeliveryCount === 0,
	};
}

/** Re-exported for callers wiring the COLLAB-003 delivery filter (the visibility source it consumes). */
export type { ReplicationVisibilitySource };
