import {
	deriveHealthLevel,
	toSyncSourceStatusView,
	type DiagnosticsContextInput,
	type SyncSourceStatusView,
	type SystemHealthLevel,
} from '../diagnostics/health';
import { canRetry, type CommandLifecycleState } from '../lifecycle/command-lifecycle';
import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';

/**
 * SYNC-010 — the computed SYNC STATUS model. A user inspects pending outbound operations, inbound
 * revisions, conflicts, source health, and retry actions WITHOUT needing raw storage knowledge: this
 * is a clean derived view over the op-log substrate, NOT raw IndexedDB. It is pure Processing-Core
 * policy (deterministic over its inputs); the GUI renders the returned model and dispatches the named
 * retry/resolve intents — it never reads the operation log directly.
 *
 * Per ADR-014 the live REMOTE transport is deferred, so "outbound" means op-log entries not yet
 * acknowledged/synced, and "inbound" is modeled over received revisions the shell supplies. The model
 * is the seam a future transport plugs into: when a transport exists it supplies acknowledged op ids
 * and inbound revisions, and this derivation is unchanged.
 */

/** An op-log entry is OUTBOUND-pending when its id is not in the acknowledged set. */
export type OutboundOperationGroupKey = string;

export interface PendingOutboundOperation {
	operationId: string;
	entityType: string;
	entityId: string;
	opType: string;
	sourceId: string;
	issuedAt: string;
}

export interface PendingOutboundSourceGroup {
	sourceId: string;
	operations: PendingOutboundOperation[];
	/** Distinct entities affected on this source, for the "affected sources/entities" summary. */
	affectedEntityCount: number;
}

/**
 * An inbound revision the shell received from a remote source but has not yet applied locally. With
 * the live transport deferred (ADR-014) this is supplied by the caller; the model treats it uniformly
 * so a future transport plugs in without changing the view shape.
 */
export interface InboundRevisionInput {
	sourceId: string;
	entityType: string;
	entityId: string;
	revision: number;
	receivedAt: string;
}

export interface InboundRevisionView {
	sourceId: string;
	entityType: string;
	entityId: string;
	revision: number;
	receivedAt: string;
}

/**
 * A conflict surfaced from a conflict-shaped op-log entry (Contract 2 conflict model). A conflict op
 * has an `opType` ending in `conflict` (e.g. `character.field-conflict`); a later op ending in
 * `resolve-conflict` whose value references the conflict id marks it resolved. The view carries only
 * the STRUCTURAL conflict facts (entity, path, reason) — never the conflicting VALUES, so the status
 * surface itself never leaks hidden content.
 */
export interface ConflictStatusView {
	conflictId: string;
	entityType: string;
	entityId: string;
	path: string | null;
	reason: string;
	detectedAt: string;
	resolved: boolean;
}

export type SyncRetryAction = 'retry-pending' | 'reauthorize-source' | 'resolve-conflicts' | 'none';

export interface SyncRetryActionView {
	action: SyncRetryAction;
	/** Action-oriented label for the GUI affordance. */
	label: string;
	/** Generic, non-leaking explanation of why the action is offered. */
	detail: string;
	/** True when the action is currently actionable (e.g. a failed lifecycle exists to retry). */
	available: boolean;
}

export interface SyncStatusView {
	kind: 'sync-status';
	actorId: ActorId;
	role: 'dm' | 'player' | 'observer';
	health: SystemHealthLevel;
	online: boolean;
	sources: SyncSourceStatusView[];
	pendingOutbound: PendingOutboundSourceGroup[];
	pendingOutboundCount: number;
	inboundRevisions: InboundRevisionView[];
	conflicts: ConflictStatusView[];
	unresolvedConflictCount: number;
	retryActions: SyncRetryActionView[];
}

export type SyncStatusResult = SyncStatusView | { kind: 'denied'; reason: 'unknown-actor' };

export interface SyncStatusInput {
	context: DiagnosticsContextInput;
	operations: readonly SyncOperation[];
	/** Op ids the transport has acknowledged/synced. Absent ⇒ everything is still pending outbound. */
	acknowledgedOperationIds?: ReadonlySet<string>;
	/** Inbound revisions received but not yet applied (deferred transport supplies these). */
	inboundRevisions?: readonly InboundRevisionInput[];
	/** Command lifecycles for the active flows, so retry reuses the PLAT-018 lifecycle. */
	commandLifecycles?: readonly CommandLifecycleState[];
}

const CONFLICT_SUFFIX = 'conflict';
const RESOLVE_CONFLICT_SUFFIX = 'resolve-conflict';

function isConflictOp(op: SyncOperation): boolean {
	return op.opType.endsWith(CONFLICT_SUFFIX) && !op.opType.endsWith(RESOLVE_CONFLICT_SUFFIX);
}

function isResolveConflictOp(op: SyncOperation): boolean {
	return op.opType.endsWith(RESOLVE_CONFLICT_SUFFIX);
}

/**
 * Extract a stable conflict id + structural facts from a conflict-shaped op. The conflict id is read
 * from the op value's `id` when present (the durable conflict record id), else the op id itself. Only
 * structural fields are read — never the conflicting values.
 */
function conflictFromOp(op: SyncOperation): ConflictStatusView {
	const value = (op.value ?? {}) as { id?: unknown; reason?: unknown };
	const conflictId = typeof value.id === 'string' ? value.id : op.id;
	const reason = typeof value.reason === 'string' ? value.reason : 'same-scalar-path';
	return {
		conflictId,
		entityType: op.entityType,
		entityId: op.entityId,
		path: op.path && op.path.length > 0 ? op.path : null,
		reason,
		detectedAt: op.issuedAt,
		resolved: false,
	};
}

function resolvedConflictIds(operations: readonly SyncOperation[]): Set<string> {
	const resolved = new Set<string>();
	for (const op of operations) {
		if (!isResolveConflictOp(op)) continue;
		const value = (op.value ?? {}) as { conflictId?: unknown; id?: unknown };
		if (typeof value.conflictId === 'string') resolved.add(value.conflictId);
		else if (typeof value.id === 'string') resolved.add(value.id);
	}
	return resolved;
}

/** Derive the structural conflict views, marking each resolved when a matching resolution op exists. */
function deriveConflicts(operations: readonly SyncOperation[]): ConflictStatusView[] {
	const resolved = resolvedConflictIds(operations);
	const conflicts: ConflictStatusView[] = [];
	for (const op of operations) {
		if (!isConflictOp(op)) continue;
		const view = conflictFromOp(op);
		conflicts.push({ ...view, resolved: resolved.has(view.conflictId) });
	}
	return conflicts;
}

function derivePendingOutbound(
	operations: readonly SyncOperation[],
	acknowledged: ReadonlySet<string>,
): PendingOutboundSourceGroup[] {
	const groups = new Map<string, PendingOutboundOperation[]>();
	for (const op of operations) {
		if (acknowledged.has(op.id)) continue;
		// Conflict/resolution markers are not user-pending WRITES; they are status records.
		if (isConflictOp(op)) continue;
		const list = groups.get(op.sourceId) ?? [];
		list.push({
			operationId: op.id,
			entityType: op.entityType,
			entityId: op.entityId,
			opType: op.opType,
			sourceId: op.sourceId,
			issuedAt: op.issuedAt,
		});
		groups.set(op.sourceId, list);
	}
	return [...groups.entries()].map(([sourceId, ops]) => ({
		sourceId,
		operations: ops,
		affectedEntityCount: new Set(ops.map((o) => `${o.entityType}:${o.entityId}`)).size,
	}));
}

/**
 * Build the retry/recovery actions. Retry reuses the PLAT-018 lifecycle: a `retry-pending` action is
 * available only when a failed command lifecycle exists (`canRetry`). A source in an error state
 * offers reauthorization guidance; unresolved conflicts offer DM resolution. Every detail string is
 * generic and non-leaking.
 */
function deriveRetryActions(
	sources: SyncSourceStatusView[],
	pendingOutboundCount: number,
	unresolvedConflictCount: number,
	lifecycles: readonly CommandLifecycleState[],
): SyncRetryActionView[] {
	const actions: SyncRetryActionView[] = [];

	const hasFailedLifecycle = lifecycles.some(
		(state) => state.status === 'failure' && canRetry(state),
	);
	actions.push({
		action: 'retry-pending',
		label: 'Retry pending sync',
		detail:
			pendingOutboundCount > 0
				? 'Resend the changes queued on this device.'
				: 'No changes are queued on this device.',
		available: hasFailedLifecycle || pendingOutboundCount > 0,
	});

	const errorSource = sources.some((source) => source.state === 'error');
	actions.push({
		action: 'reauthorize-source',
		label: 'Reconnect or re-authorize source',
		detail: errorSource
			? 'A source reported an error. Reconnect or re-authenticate it; your local work stays available.'
			: 'All sources are reachable.',
		available: errorSource,
	});

	actions.push({
		action: 'resolve-conflicts',
		label: 'Resolve conflicts',
		detail:
			unresolvedConflictCount > 0
				? 'Some changes need a resolution decision before they can publish.'
				: 'No conflicts need resolution.',
		available: unresolvedConflictCount > 0,
	});

	return actions;
}

/**
 * Derive the SYNC STATUS view for an actor (SYNC-010). Fails closed: an unknown actor is denied. The
 * view is a clean computed model over the op-log substrate + PLAT diagnostics; it never exposes raw
 * storage. Conflict views carry only structural facts (no conflicting values), so the status surface
 * is non-leaking for every role. SYNC-014 layers actor-filtered lineage on top of this same input.
 */
export function getSyncStatus(
	permissions: PermissionState,
	actorId: ActorId,
	input: SyncStatusInput,
): SyncStatusResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };

	const acknowledged = input.acknowledgedOperationIds ?? new Set<string>();
	const sources = input.context.syncSources.map(toSyncSourceStatusView);
	const pendingOutbound = derivePendingOutbound(input.operations, acknowledged);
	const pendingOutboundCount = pendingOutbound.reduce(
		(total, group) => total + group.operations.length,
		0,
	);
	const conflicts = deriveConflicts(input.operations);
	const unresolvedConflictCount = conflicts.filter((conflict) => !conflict.resolved).length;
	const inboundRevisions: InboundRevisionView[] = (input.inboundRevisions ?? []).map((revision) => ({
		sourceId: revision.sourceId,
		entityType: revision.entityType,
		entityId: revision.entityId,
		revision: revision.revision,
		receivedAt: revision.receivedAt,
	}));

	return {
		kind: 'sync-status',
		actorId,
		role: actor.role,
		health: deriveHealthLevel(input.context),
		online: input.context.online,
		sources,
		pendingOutbound,
		pendingOutboundCount,
		inboundRevisions,
		conflicts,
		unresolvedConflictCount,
		retryActions: deriveRetryActions(
			sources,
			pendingOutboundCount,
			unresolvedConflictCount,
			input.commandLifecycles ?? [],
		),
	};
}
