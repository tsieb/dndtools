import type { SyncOperation } from './operation-log';
import { SYNC_OPERATION_SCHEMA_VERSION } from './operation-log';

/**
 * SYNC-002 — the CANONICAL operation shape + IDEMPOTENCY model.
 *
 * Architecture Contract 2's "Sync Unit" defines the smallest sync unit as a durable, entity-scoped,
 * idempotent {@link SyncOperation} carrying actor, target, path, dependencies, revisions, and issue
 * time. Every DURABLE mutation in the Processing Core already emits one of these through
 * `commands/helpers.ts#appendOperationDraft` (the single op-emission seam every command handler uses).
 *
 * This module FORMALIZES that contract: it does not introduce a new op type or a parallel emission
 * path. It declares the canonical required-field set, a pure structural CONFORMANCE check that fails
 * if a durable op is missing or malforms any required field, and the IDEMPOTENCY model (re-applying an
 * op id is a no-op). The command-conformance guard (`tests/sync-operation-conformance.test.ts`)
 * dispatches every durable command type and asserts each emitted op conforms — so a future command
 * that forgets a required field fails closed at test time.
 *
 * Everything here is pure and deterministic over plain data — no GUI, storage, clock, or entropy.
 */

/**
 * The canonical required fields of a {@link SyncOperation} (Contract 2 Sync Unit). A durable op is
 * non-conformant if any of these is absent or malformed. `path`/`value`/`beforeRevision`/
 * `afterRevision` are intentionally OPTIONAL on the shape (not every op is path-scoped or
 * revision-bearing), so they are validated only when present.
 */
export const REQUIRED_OPERATION_FIELDS = Object.freeze([
	'id',
	'vaultId',
	'sourceId',
	'actorId',
	'entityType',
	'entityId',
	'opType',
	'dependencies',
	'issuedAt',
	'schemaVersion',
] as const);

export type RequiredOperationField = (typeof REQUIRED_OPERATION_FIELDS)[number];

/** The reason a durable op fails the canonical-shape conformance check. */
export type OperationConformanceProblemKind =
	| 'missing-field'
	| 'empty-field'
	| 'bad-type'
	| 'self-dependency'
	| 'unsupported-schema-version';

export interface OperationConformanceProblem {
	field: string;
	kind: OperationConformanceProblemKind;
	message: string;
}

export interface OperationConformanceResult {
	conformant: boolean;
	problems: OperationConformanceProblem[];
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Validate a candidate value against the canonical {@link SyncOperation} shape. Pure and fail-closed:
 * the result lists EVERY problem found (so a conformance failure names exactly which field is wrong).
 * A value that passes carries actor (`actorId`), target (`entityType` + `entityId`), an op kind
 * (`opType`), an explicit dependency list, an issue time, and a supported schema version — the full
 * Contract 2 Sync Unit field set.
 *
 * `path`, `value`, `beforeRevision`, and `afterRevision` are optional on the shape; when present they
 * must be the declared type, so a malformed optional field is still caught.
 */
export function validateSyncOperationShape(candidate: unknown): OperationConformanceResult {
	const problems: OperationConformanceProblem[] = [];
	const add = (
		field: string,
		kind: OperationConformanceProblemKind,
		message: string,
	): void => {
		problems.push({ field, kind, message });
	};

	if (candidate === null || typeof candidate !== 'object') {
		add('(root)', 'bad-type', 'Operation must be an object.');
		return { conformant: false, problems };
	}
	const op = candidate as Record<string, unknown>;

	// Required string identity/target/kind fields.
	for (const field of ['id', 'vaultId', 'sourceId', 'actorId', 'entityType', 'entityId', 'opType']) {
		if (!(field in op)) {
			add(field, 'missing-field', `Operation is missing required field "${field}".`);
		} else if (typeof op[field] !== 'string') {
			add(field, 'bad-type', `Operation field "${field}" must be a string.`);
		} else if (!isNonEmptyString(op[field])) {
			add(field, 'empty-field', `Operation field "${field}" must not be empty.`);
		}
	}

	// `issuedAt` — required non-empty ISO-ish string (issue time, Contract 2).
	if (!('issuedAt' in op)) {
		add('issuedAt', 'missing-field', 'Operation is missing required field "issuedAt".');
	} else if (!isNonEmptyString(op.issuedAt)) {
		add('issuedAt', 'empty-field', 'Operation field "issuedAt" must be a non-empty timestamp.');
	}

	// `dependencies` — required ARRAY of operation ids (the explicit ordering, Contract 2 rule 1).
	if (!('dependencies' in op)) {
		add('dependencies', 'missing-field', 'Operation is missing required field "dependencies".');
	} else if (!Array.isArray(op.dependencies)) {
		add('dependencies', 'bad-type', 'Operation field "dependencies" must be an array.');
	} else {
		for (const dep of op.dependencies) {
			if (!isNonEmptyString(dep)) {
				add('dependencies', 'bad-type', 'Each dependency must be a non-empty operation id.');
				break;
			}
		}
		// An op must not depend on itself; a self-dependency can never be satisfied (would deadlock replay).
		if (isNonEmptyString(op.id) && (op.dependencies as unknown[]).includes(op.id)) {
			add('dependencies', 'self-dependency', 'An operation must not depend on itself.');
		}
	}

	// `schemaVersion` — required, and must be the supported canonical version (fail closed on a future
	// version: Contract 2 "Unsupported future versions fail closed").
	if (!('schemaVersion' in op)) {
		add('schemaVersion', 'missing-field', 'Operation is missing required field "schemaVersion".');
	} else if (typeof op.schemaVersion !== 'number') {
		add('schemaVersion', 'bad-type', 'Operation field "schemaVersion" must be a number.');
	} else if (op.schemaVersion !== SYNC_OPERATION_SCHEMA_VERSION) {
		add(
			'schemaVersion',
			'unsupported-schema-version',
			`Operation schema version ${op.schemaVersion} is not the supported version ${SYNC_OPERATION_SCHEMA_VERSION}.`,
		);
	}

	// Optional fields validated only when present.
	if ('path' in op && op.path !== undefined && typeof op.path !== 'string') {
		add('path', 'bad-type', 'Operation field "path" must be a string when present.');
	}
	for (const field of ['beforeRevision', 'afterRevision'] as const) {
		const value = op[field];
		if (field in op && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
			add(field, 'bad-type', `Operation field "${field}" must be a finite number when present.`);
		}
	}

	return { conformant: problems.length === 0, problems };
}

/** Convenience predicate: does a candidate conform to the canonical operation shape? */
export function isConformantSyncOperation(candidate: unknown): candidate is SyncOperation {
	return validateSyncOperationShape(candidate).conformant;
}

/**
 * Assert a durable op conforms to the canonical shape, throwing a descriptive error if not. Used as
 * the fail-closed structural guard in the command-conformance test; can also gate an op before it is
 * queued/persisted so a malformed op never enters the log.
 */
export function assertDurableOperationConforms(candidate: unknown): asserts candidate is SyncOperation {
	const result = validateSyncOperationShape(candidate);
	if (!result.conformant) {
		const detail = result.problems.map((p) => `${p.field}: ${p.message}`).join('; ');
		throw new Error(`Sync operation is not canonically conformant: ${detail}`);
	}
}

// --- Idempotency (Contract 2 rule 2: operations must be replayable and idempotent) ----------------

/**
 * Whether an op id is already present in a set of applied op ids — i.e. re-applying it would be a
 * duplicate. The op id is the idempotency key for replay: applying the SAME op id twice must not apply
 * the mutation twice (SYNC-002 AC2).
 */
export function isOperationApplied(
	appliedOperationIds: ReadonlySet<string>,
	operationId: string,
): boolean {
	return appliedOperationIds.has(operationId);
}

export interface ApplyOperationIdempotentResult {
	/** Whether the op was applied THIS time (false ⇒ it was a duplicate and no-op'd). */
	applied: boolean;
	/** The next applied-id set. Unchanged (same reference) when the op was a duplicate. */
	appliedOperationIds: ReadonlySet<string>;
}

/**
 * Idempotently record that an op was applied, keyed by op id. A first application returns
 * `applied: true` with the id added; re-applying the SAME id returns `applied: false` and the same
 * set reference (the no-op guarantee). This is the deterministic primitive a replay loop uses to skip
 * a duplicate op without re-running its mutation.
 */
export function applyOperationIdempotent(
	appliedOperationIds: ReadonlySet<string>,
	operationId: string,
): ApplyOperationIdempotentResult {
	if (appliedOperationIds.has(operationId)) {
		return { applied: false, appliedOperationIds };
	}
	const next = new Set(appliedOperationIds);
	next.add(operationId);
	return { applied: true, appliedOperationIds: next };
}

/** The set of op ids already present in a log, for seeding an idempotent replay. */
export function appliedOperationIdsOf(operations: readonly SyncOperation[]): Set<string> {
	return new Set(operations.map((op) => op.id));
}

/**
 * Deduplicate a stream of operations by id, preserving first-seen order. A duplicate op id is dropped
 * (idempotent ingest). This proves the "re-applying the same op id is a no-op" rule at the log level:
 * appending the same op twice yields one entry.
 */
export function dedupeOperationsById(operations: readonly SyncOperation[]): SyncOperation[] {
	const seen = new Set<string>();
	const out: SyncOperation[] = [];
	for (const op of operations) {
		if (seen.has(op.id)) continue;
		seen.add(op.id);
		out.push(op);
	}
	return out;
}
