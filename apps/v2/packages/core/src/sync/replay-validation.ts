import type { SyncOperation } from './operation-log';
import type { CoreStateSlice } from '../commands/types';
import type { Actor } from '../state/permission-state';
import {
	evaluateVisibility,
	type EntityVisibilityMetadata,
} from '../permissions/visibility-filter';
import { hasGrantedCapability } from '../permissions/grants';
import { SYNC_OPERATION_SCHEMA_VERSION } from './operation-log';
import { validateSyncOperationShape } from './operation-model';
import { SCENE_ENTITY_TYPE } from '../state/vault-object-schema';
import { CHARACTER_ENTITY_TYPE, CHARACTER_DRAFT_ENTITY_TYPE } from '../state/character-state';
import { CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import { ENCOUNTER_ENTITY_TYPE } from '../state/encounter';

/**
 * SYNC-011 — fail-closed REPLAY VALIDATION for queued/remote operations.
 *
 * Architecture Contract 2 (Sync Unit, rule 3 — "Operations carry enough information to validate
 * permissions at replay time") + Contract 3 (Role, Visibility & Permission). Before a queued local op
 * or an inbound remote op is APPLIED, replay must validate, fail-closed, that:
 *
 *   1. SHAPE          — the op is canonically conformant (SYNC-002), else it can carry no trustworthy
 *                       actor/target/dependency data to validate against.
 *   2. SCHEMA VERSION — the op's schema version is compatible with this build (reuse the migration
 *                       fail-closed-on-future-version stance). A future version fails closed.
 *   3. DEPENDENCIES   — every declared dependency op id is already applied; an unsatisfied dependency
 *                       DEFERS the op (a recoverable hold, not a hard reject) with a structured reason.
 *   4. TARGET         — the target entity exists (resolved through the live state, or recorded identity
 *                       metadata supplied by the caller). A missing target rejects fail-closed rather
 *                       than writing to the wrong/absent entity.
 *   5. ACTOR          — the issuing actor is a known participant (authority floor).
 *   6. VISIBILITY     — the actor can SEE the target (reuse the PERM visibility-filter engine).
 *   7. PERMISSION     — the actor may WRITE the target (reuse the PERM grant/role model). The DM
 *                       bypasses capability-set restrictions inherently (Contract 3 DM Authority).
 *
 * CRITICAL: this is a REPLAY-TIME guard for queued/remote ops. It is NOT the in-process dispatch path
 * (which already validates inside each command reducer). It exists so a future sync transport can
 * validate an op it RECEIVES before re-applying it, without changing any existing command. It is pure
 * Processing-Core policy: deterministic over (op, state, applied-id set, supplied target/visibility
 * metadata). The GUI/transport renders the structured outcome and never applies a rejected op.
 *
 * A valid op returns `{ outcome: 'accept' }`; a recoverable hold returns `{ outcome: 'defer' }`; any
 * failing check returns `{ outcome: 'reject' }` (fail closed — the op is NOT applied).
 */

export type ReplayValidationOutcome = 'accept' | 'reject' | 'defer';

/** The dimension that produced a non-accept outcome (the structured reason, Contract 2 / SYNC-011). */
export type ReplayRejectionReason =
	| 'malformed-operation'
	| 'unsupported-schema-version'
	| 'unsatisfied-dependency'
	| 'target-missing'
	| 'unknown-actor'
	| 'not-visible'
	| 'not-permitted';

export interface ReplayValidationResult {
	outcome: ReplayValidationOutcome;
	/** Present when `outcome` is `reject` or `defer`. */
	reason: ReplayRejectionReason | null;
	/** A generic, non-leaking explanation. Never carries the op's value or hidden content. */
	message: string;
	/** For `unsatisfied-dependency`: the dependency op ids that are not yet applied. */
	unsatisfiedDependencies: string[];
}

/**
 * How replay resolves whether the op's target entity exists. Replay must not assume a single slice
 * shape, so the caller may supply:
 *
 *   - `appliedOperationIds`: the op ids already applied (for the dependency check). Required.
 *   - `targetEntityIds`: recorded identity metadata — the known live entity ids per entity type. When
 *     present for the op's entity type, target existence is resolved from it (this is the "recorded
 *     identity metadata" path SYNC-011 AC2 calls for — it survives a rename because identity is keyed
 *     by id, not title). When absent for the type, existence falls back to the live `state` slice.
 *   - `visibilityMetadata`: the target's visibility metadata, applied BEFORE the read (Contract 3 rule
 *     6). Absent ⇒ fail closed to `dm-only` (the visibility-filter default), so an op against an
 *     entity with no metadata is visible only to the DM.
 *   - `requiredCapability`: the capability set the op's write requires on its target (e.g. `owner`,
 *     `combat-participant`, `co-editor`). Absent ⇒ the op is treated as a DM-authority write (only the
 *     DM may apply it), which is the fail-closed default for an unclassified durable mutation.
 */
export interface ReplayValidationContext {
	appliedOperationIds: ReadonlySet<string>;
	targetEntityIds?: Readonly<Record<string, ReadonlySet<string>>>;
	visibilityMetadata?: EntityVisibilityMetadata;
	requiredCapability?: string;
	/** The current time, for grant-expiry evaluation. Absent ⇒ expiry is not applied. */
	now?: string;
}

function result(
	outcome: ReplayValidationOutcome,
	reason: ReplayRejectionReason | null,
	message: string,
	unsatisfiedDependencies: string[] = [],
): ReplayValidationResult {
	return { outcome, reason, message, unsatisfiedDependencies };
}

/**
 * Resolve whether the op's target entity exists. Prefers caller-supplied recorded identity metadata
 * (keyed by entity type → live id set); otherwise resolves through the known durable state slices.
 * An entity type with no known mapping is treated as NOT existing (fail closed) unless the caller
 * supplies identity metadata for it.
 */
function targetExists(op: SyncOperation, state: CoreStateSlice, context: ReplayValidationContext): boolean {
	const declared = context.targetEntityIds?.[op.entityType];
	if (declared) return declared.has(op.entityId);

	switch (op.entityType) {
		case SCENE_ENTITY_TYPE:
			return op.entityId in state.scenes.scenes;
		case CHARACTER_ENTITY_TYPE:
			return op.entityId in state.characters.characters;
		case CHARACTER_DRAFT_ENTITY_TYPE:
			return op.entityId in state.characters.drafts;
		case CONTENT_ITEM_ENTITY_TYPE:
			return op.entityId in state.content.items;
		case ENCOUNTER_ENTITY_TYPE:
			return op.entityId in state.encounters.encounters;
		case 'map':
			return op.entityId in state.maps.maps;
		default:
			// Unknown entity type with no supplied identity metadata: cannot prove the target exists.
			return false;
	}
}

/**
 * Validate a single queued/remote operation for replay, fail-closed. Checks run in a fixed order so
 * the FIRST failing dimension is the reported reason (a malformed op can carry no trustworthy
 * actor/target, so shape is checked first). A valid op accepts; an unsatisfied dependency DEFERS
 * (recoverable); every other failure REJECTS (the op is not applied).
 */
export function validateReplayOperation(
	op: unknown,
	state: CoreStateSlice,
	context: ReplayValidationContext,
): ReplayValidationResult {
	// 1. SHAPE — a non-conformant op carries no trustworthy fields to validate against. The
	// `unsupported-schema-version` problem is handled by the dedicated dimension (2) so it reports its
	// own precise reason rather than collapsing into a generic malformed reject.
	const shape = validateSyncOperationShape(op);
	const nonVersionProblems = shape.problems.filter((p) => p.kind !== 'unsupported-schema-version');
	if (nonVersionProblems.length > 0) {
		return result(
			'reject',
			'malformed-operation',
			'The operation is not canonically conformant and cannot be replayed.',
		);
	}
	const operation = op as SyncOperation;

	// 2. SCHEMA VERSION — fail closed on an unsupported (e.g. future) version (Contract 2).
	if (operation.schemaVersion !== SYNC_OPERATION_SCHEMA_VERSION) {
		return result(
			'reject',
			'unsupported-schema-version',
			`The operation schema version ${operation.schemaVersion} is not supported by this build.`,
		);
	}

	// 3. DEPENDENCIES — every dependency must already be applied; else DEFER (recoverable hold).
	const unsatisfied = operation.dependencies.filter((dep) => !context.appliedOperationIds.has(dep));
	if (unsatisfied.length > 0) {
		return result(
			'defer',
			'unsatisfied-dependency',
			'The operation depends on changes that have not been applied yet; it is deferred until they are.',
			unsatisfied,
		);
	}

	// 4. TARGET EXISTENCE — never write to a missing/wrong entity (fail closed).
	if (!targetExists(operation, state, context)) {
		return result(
			'reject',
			'target-missing',
			'The operation targets an entity that does not exist on this device.',
		);
	}

	// 5. ACTOR AUTHORITY — the issuing actor must be a known participant.
	const actor: Actor | undefined = state.permissions.actors[operation.actorId];
	if (!actor) {
		return result('reject', 'unknown-actor', 'The operation actor is not a known participant.');
	}

	// 6. VISIBILITY — the actor must be able to SEE the target (reuse the PERM visibility engine).
	// The DM always can; a non-DM is decided by the supplied metadata (absent ⇒ fail closed dm-only).
	if (actor.role !== 'dm') {
		const metadata: EntityVisibilityMetadata = context.visibilityMetadata ?? {
			entityType: operation.entityType,
			entityId: operation.entityId,
		};
		const decision = evaluateVisibility(
			metadata,
			operation.path !== undefined ? { fieldPath: operation.path } : {},
			actor,
			state.permissions,
		);
		if (!decision.visible) {
			return result(
				'reject',
				'not-visible',
				'The operation actor cannot see the target entity; the operation is rejected.',
			);
		}
	}

	// 7. PERMISSION — the actor must be allowed to WRITE the target. The DM bypasses capability-set
	// restrictions inherently (Contract 3 DM Authority). A non-DM needs the required grant; an
	// unclassified write (no `requiredCapability`) is treated as DM-only and fails closed for non-DM.
	if (actor.role !== 'dm') {
		const required = context.requiredCapability;
		const permitted =
			required !== undefined &&
			hasGrantedCapability(
				state.permissions,
				actor,
				operation.entityType,
				operation.entityId,
				required,
				context.now,
			);
		if (!permitted) {
			return result(
				'reject',
				'not-permitted',
				'The operation actor lacks write permission on the target entity; the operation is rejected.',
			);
		}
	}

	return result('accept', null, 'The operation passed every replay validation and may be applied.');
}

/**
 * Validate a BATCH of operations in order, threading the applied-id set so an op can satisfy a later
 * op's dependency within the same batch. Accepted ops are added to the applied set; deferred/rejected
 * ops are NOT applied (fail closed). Returns the per-op outcomes plus the resulting applied-id set and
 * the ids that were applied. Pure and deterministic.
 *
 * `contextFor` lets the caller supply per-op target/visibility/permission metadata while replay owns
 * the shared applied-id threading.
 */
export interface ReplayBatchEntry {
	operation: SyncOperation;
	result: ReplayValidationResult;
}

export interface ReplayBatchResult {
	entries: ReplayBatchEntry[];
	appliedOperationIds: ReadonlySet<string>;
	appliedIds: string[];
	deferredIds: string[];
	rejectedIds: string[];
}

export function validateReplayBatch(
	operations: readonly SyncOperation[],
	state: CoreStateSlice,
	baseAppliedOperationIds: ReadonlySet<string>,
	contextFor?: (op: SyncOperation) => Omit<ReplayValidationContext, 'appliedOperationIds'>,
): ReplayBatchResult {
	let applied = new Set(baseAppliedOperationIds);
	const entries: ReplayBatchEntry[] = [];
	const appliedIds: string[] = [];
	const deferredIds: string[] = [];
	const rejectedIds: string[] = [];

	for (const operation of operations) {
		const extra = contextFor?.(operation) ?? {};
		const validation = validateReplayOperation(operation, state, {
			...extra,
			appliedOperationIds: applied,
		});
		entries.push({ operation, result: validation });
		if (validation.outcome === 'accept') {
			// Apply idempotently: a duplicate id is a no-op.
			if (!applied.has(operation.id)) {
				applied = new Set(applied).add(operation.id);
			}
			appliedIds.push(operation.id);
		} else if (validation.outcome === 'defer') {
			deferredIds.push(operation.id);
		} else {
			rejectedIds.push(operation.id);
		}
	}

	return {
		entries,
		appliedOperationIds: applied,
		appliedIds,
		deferredIds,
		rejectedIds,
	};
}
