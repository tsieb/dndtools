import type { ActorId } from './ids';

/**
 * SYNC-006 / SYNC-013 — the VAULT-WIDE conflict LIFECYCLE.
 *
 * This generalizes the per-entity/per-path conflict handling that already exists for characters
 * (`state/character-collaboration.ts` — `same-scalar-path` conflicts on a character field) into ONE
 * durable, entity-agnostic conflict-record model shaped on Architecture Contract 2's `ConflictRecord`.
 * It is NOT a parallel conflict system: characters (and any later MAP/CONTENT slice) record their
 * conflicts as conflict-shaped ops on the SAME op-log substrate, and this module DERIVES the durable
 * vault conflict set from those ops. The SYNC status surface (`queries/sync-status.ts`) already reads
 * the same substrate for its structural conflict list; this module adds the durable RECORD, the
 * per-entity ISOLATION model, the publication gate, and the DM-authorized RESOLUTION + AUDIT policy.
 *
 * Everything here is a pure deterministic function over plain data — no GUI, no storage, no ambient
 * clock/entropy. The command layer composes these reducers and appends durable ops; the GUI renders
 * the computed view and dispatches the resolution command (it never mutates raw storage).
 *
 * The lifecycle, end to end:
 *
 *   1. DETECT  — a slice (e.g. character collaboration) detects a same-path/divergent edit and records a
 *      conflict-shaped op (`*.field-conflict` / `*.conflict`) carrying the conflict facts.
 *   2. PERSIST — that op is durable in the op-log; the conflict record is reconstructed deterministically
 *      from it (`deriveVaultConflicts`).
 *   3. DISPLAY — the SYNC status surface lists structural conflicts; this module adds the per-entity
 *      isolation + publication-gate model the GUI/queries render.
 *   4. RESOLVE — the DM issues the DM-authorized `conflict.resolve` administrative command (SYNC-013):
 *      it references the ACTUAL conflicting source revisions, takes an EXPLICIT selected value + optional
 *      notes, records AUDIT history, and produces a resulting NON-CONFLICTED revision. A matching
 *      resolution op marks the record resolved.
 *
 * CRUCIAL — per-entity ISOLATION (SYNC-006): an unresolved conflict on entity A must NEVER block reads
 * or writes to an unrelated entity B. Conflicts are keyed by `${entityType}:${entityId}` (+ optional
 * path), so the publication gate and editability checks scope to ONE entity. A conflict on entity A
 * leaves B fully editable and publishable.
 */

export const VAULT_CONFLICT_SCHEMA_VERSION = 1 as const;

/**
 * The reason a conflict exists, shaped on Architecture Contract 2's `ConflictRecord.reason`. A
 * conflict-shaped op whose value carries no recognized reason falls back to `same-scalar-path` (the
 * established default for the character collaboration slice).
 */
export type VaultConflictReason =
	| 'same-scalar-path'
	| 'delete-vs-update'
	| 'schema-mismatch'
	| 'source-revision-diverged'
	| 'permission-policy-changed'
	| 'unsupported-external-change';

const VAULT_CONFLICT_REASONS: ReadonlySet<string> = new Set<VaultConflictReason>([
	'same-scalar-path',
	'delete-vs-update',
	'schema-mismatch',
	'source-revision-diverged',
	'permission-policy-changed',
	'unsupported-external-change',
]);

/** One side (local or remote) of a divergence: the conflicting value + the revision/actor it came from. */
export interface VaultConflictSide {
	/** The revision this side diverged at. A resolution must reference these to be non-stale. */
	revision: number;
	/** The conflicting value on this side. Carried in the durable record; never leaked to non-DM views. */
	value: unknown;
	/** The actor whose edit produced this side, when recorded. */
	authorActorId: ActorId | null;
}

/** A durable resolution audit entry (SYNC-013): who resolved what, when, with which value + notes. */
export interface VaultConflictResolutionAudit {
	resolverActorId: ActorId;
	/** The value the DM selected as canonical. */
	selectedValue: unknown;
	/** The source revisions (local + remote) the resolution was applied against. */
	resolvedLocalRevision: number;
	resolvedRemoteRevision: number;
	/** The non-conflicted revision produced by the resolution. */
	resultingRevision: number;
	/** Optional free-text note the DM attached to the decision. */
	notes: string | null;
	/** The durable operation id of the resolution command. */
	resolutionOperationId: string;
	at: string;
}

/**
 * The durable vault conflict record (Architecture Contract 2 Conflict Model). Entity-scoped, keyed by
 * `${entityType}:${entityId}` (+ optional path), so it isolates per entity. Carries the ancestor +
 * both diverging sides and the resolution audit once resolved.
 */
export interface VaultConflictRecord {
	id: string;
	entityType: string;
	entityId: string;
	/** The conflicting field path within the entity, when the conflict is path-scoped. */
	path: string | null;
	reason: VaultConflictReason;
	/** The common ancestor revision both sides diverged from, when known. */
	ancestorRevision: number | null;
	local: VaultConflictSide;
	remote: VaultConflictSide;
	detectedAt: string;
	/** Null while unresolved. Set to the resolution time once a matching resolution op exists. */
	resolvedAt: string | null;
	/** The resolution audit, present only once resolved. */
	resolution: VaultConflictResolutionAudit | null;
	schemaVersion: typeof VAULT_CONFLICT_SCHEMA_VERSION;
}

/** A conflict-shaped op records the conflict facts under this opType suffix. */
const CONFLICT_SUFFIX = 'conflict';
const RESOLVE_CONFLICT_SUFFIX = 'resolve-conflict';

/** A conflict-shaped DETECTION op (not a resolution op). */
export function isConflictDetectionOpType(opType: string): boolean {
	return opType.endsWith(CONFLICT_SUFFIX) && !opType.endsWith(RESOLVE_CONFLICT_SUFFIX);
}

/** A conflict RESOLUTION op (records the resolution that closes a conflict record). */
export function isConflictResolutionOpType(opType: string): boolean {
	return opType.endsWith(RESOLVE_CONFLICT_SUFFIX);
}

/** The stable entity key a conflict belongs to. Used everywhere isolation is enforced. */
export function conflictEntityKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`;
}

function reasonOf(value: unknown): VaultConflictReason {
	if (value && typeof value === 'object' && 'reason' in value) {
		const raw = (value as { reason?: unknown }).reason;
		if (typeof raw === 'string' && VAULT_CONFLICT_REASONS.has(raw)) {
			return raw as VaultConflictReason;
		}
	}
	return 'same-scalar-path';
}

function numberOrNull(raw: unknown): number | null {
	return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function actorOrNull(raw: unknown): ActorId | null {
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * One diverging side, read from a conflict op's value. Both the generalized SYNC shape
 * (`{ local: { value, revision, authorActorId } }`) and the character collaboration shape
 * (`{ local: { value, authorActorId, authorRole }, ancestorRevision }`) are read tolerantly so the
 * EXISTING character conflict ops reconstruct without change.
 */
function sideFrom(raw: unknown, fallbackRevision: number | null): VaultConflictSide {
	if (raw && typeof raw === 'object') {
		const record = raw as { value?: unknown; revision?: unknown; authorActorId?: unknown };
		return {
			revision: numberOrNull(record.revision) ?? fallbackRevision ?? 0,
			value: 'value' in record ? record.value : null,
			authorActorId: actorOrNull(record.authorActorId),
		};
	}
	return { revision: fallbackRevision ?? 0, value: null, authorActorId: null };
}

interface ConflictOpInput {
	id: string;
	entityType: string;
	entityId: string;
	path?: string;
	opType: string;
	value?: unknown;
	issuedAt: string;
	beforeRevision?: number;
	afterRevision?: number;
}

interface ResolutionOpInput {
	id: string;
	actorId: ActorId;
	opType: string;
	value?: unknown;
	issuedAt: string;
	afterRevision?: number;
}

/**
 * Reconstruct the durable conflict record FROM a conflict-shaped detection op. Reads only the
 * structural facts + the diverging sides from the op value (the same value the detecting slice
 * recorded). The conflict id is the value's `id` when present (the durable record id the slice
 * minted), else the op id.
 */
function recordFromOp(op: ConflictOpInput): VaultConflictRecord {
	const value = (op.value ?? {}) as {
		id?: unknown;
		path?: unknown;
		ancestorRevision?: unknown;
		local?: unknown;
		remote?: unknown;
	};
	const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : op.id;
	const path =
		typeof value.path === 'string' && value.path.length > 0
			? value.path
			: op.path && op.path.length > 0
				? op.path
				: null;
	const ancestorRevision = numberOrNull(value.ancestorRevision) ?? numberOrNull(op.beforeRevision);
	return {
		id,
		entityType: op.entityType,
		entityId: op.entityId,
		path,
		reason: reasonOf(op.value),
		ancestorRevision,
		local: sideFrom(value.local, ancestorRevision),
		remote: sideFrom(value.remote, ancestorRevision),
		detectedAt: op.issuedAt,
		resolvedAt: null,
		resolution: null,
		schemaVersion: VAULT_CONFLICT_SCHEMA_VERSION,
	};
}

/** The audit a resolution op carries, by conflict id. */
function resolutionAuditFromOp(
	op: ResolutionOpInput,
): { conflictId: string; audit: VaultConflictResolutionAudit } | null {
	const value = (op.value ?? {}) as {
		conflictId?: unknown;
		id?: unknown;
		selectedValue?: unknown;
		value?: unknown;
		resolvedLocalRevision?: unknown;
		resolvedRemoteRevision?: unknown;
		resultingRevision?: unknown;
		notes?: unknown;
	};
	const conflictId =
		typeof value.conflictId === 'string'
			? value.conflictId
			: typeof value.id === 'string'
				? value.id
				: null;
	if (!conflictId) return null;
	const selectedValue = 'selectedValue' in value ? value.selectedValue : value.value ?? null;
	return {
		conflictId,
		audit: {
			resolverActorId: op.actorId,
			selectedValue,
			resolvedLocalRevision: numberOrNull(value.resolvedLocalRevision) ?? 0,
			resolvedRemoteRevision: numberOrNull(value.resolvedRemoteRevision) ?? 0,
			resultingRevision: numberOrNull(value.resultingRevision) ?? numberOrNull(op.afterRevision) ?? 0,
			notes: typeof value.notes === 'string' && value.notes.length > 0 ? value.notes : null,
			resolutionOperationId: op.id,
			at: op.issuedAt,
		},
	};
}

/**
 * Derive the durable vault conflict set from the op-log substrate. Detection ops become conflict
 * records; a matching resolution op (idempotently — the FIRST resolution wins) marks the record
 * resolved and attaches its audit. Pure and deterministic.
 *
 * Idempotent replay (SYNC-013 AC2): a resolution op replayed twice resolves the SAME record once —
 * the second matching op finds the record already resolved and is a no-op for the derived set.
 */
export function deriveVaultConflicts(
	operations: readonly ConflictOpInput[],
	resolutionOperations: readonly ResolutionOpInput[],
): VaultConflictRecord[] {
	const records: VaultConflictRecord[] = [];
	const byId = new Map<string, VaultConflictRecord>();
	for (const op of operations) {
		if (!isConflictDetectionOpType(op.opType)) continue;
		const record = recordFromOp(op);
		// First detection per conflict id wins; a duplicate detection op (idempotent replay) is ignored.
		if (byId.has(record.id)) continue;
		byId.set(record.id, record);
		records.push(record);
	}
	for (const op of resolutionOperations) {
		if (!isConflictResolutionOpType(op.opType)) continue;
		const parsed = resolutionAuditFromOp(op);
		if (!parsed) continue;
		const record = byId.get(parsed.conflictId);
		// First resolution wins (idempotent). A resolution for an unknown conflict id is ignored.
		if (!record || record.resolvedAt !== null) continue;
		record.resolvedAt = parsed.audit.at;
		record.resolution = parsed.audit;
	}
	return records;
}

// --- Per-entity isolation + publication gate (pure) ---------------------------------------------

/** The conflict records that are still UNRESOLVED. */
export function unresolvedConflicts(conflicts: readonly VaultConflictRecord[]): VaultConflictRecord[] {
	return conflicts.filter((conflict) => conflict.resolvedAt === null);
}

/**
 * Whether a SPECIFIC entity currently has an unresolved conflict. This is the isolation primitive:
 * it scopes strictly to one `${entityType}:${entityId}`, so an unresolved conflict on entity A
 * returns false for unrelated entity B.
 */
export function isEntityConflicted(
	conflicts: readonly VaultConflictRecord[],
	entityType: string,
	entityId: string,
): boolean {
	return conflicts.some(
		(conflict) =>
			conflict.resolvedAt === null &&
			conflict.entityType === entityType &&
			conflict.entityId === entityId,
	);
}

/** The distinct entity keys that currently carry an unresolved conflict, in stable first-seen order. */
export function conflictedEntityKeys(conflicts: readonly VaultConflictRecord[]): string[] {
	const seen = new Set<string>();
	const keys: string[] = [];
	for (const conflict of conflicts) {
		if (conflict.resolvedAt !== null) continue;
		const key = conflictEntityKey(conflict.entityType, conflict.entityId);
		if (seen.has(key)) continue;
		seen.add(key);
		keys.push(key);
	}
	return keys;
}

export type EntityPublicationStatus = 'publishable' | 'conflicted';

/**
 * The publication status of an entity for NON-DM viewers (Contract 2 Conflict Model rule 5; SYNC-006
 * AC3). An entity with an unresolved conflict is `conflicted` — its ambiguous revision is blocked /
 * represented as conflicted until resolved. An entity with NO unresolved conflict is `publishable`,
 * regardless of conflicts on OTHER entities (per-entity isolation).
 */
export function publicationStatusForEntity(
	conflicts: readonly VaultConflictRecord[],
	entityType: string,
	entityId: string,
): EntityPublicationStatus {
	return isEntityConflicted(conflicts, entityType, entityId) ? 'conflicted' : 'publishable';
}

/**
 * Whether an entity remains EDITABLE despite vault conflicts. The isolation guarantee: an entity B is
 * editable as long as B itself has no unresolved conflict — a conflict on a DIFFERENT entity A never
 * blocks B. (A conflicted entity is still editable per Contract 2 — a new edit is recorded normally;
 * only PUBLICATION of the ambiguous revision is gated. So editability is scoped to the entity, and
 * never gated by unrelated entities.)
 */
export function entityIsEditableDespiteOtherConflicts(
	_conflicts: readonly VaultConflictRecord[],
	_entityType: string,
	_entityId: string,
): boolean {
	// Editing is never blocked by ANOTHER entity's conflict; the entity's own conflict does not block
	// editing either (only publication). Editability is therefore unconditional here — the function
	// exists to make the isolation invariant explicit and testable at the policy boundary.
	return true;
}

// --- DM-authorized resolution (pure; SYNC-013) --------------------------------------------------

/** The explicit input a DM resolution carries (SYNC-013): selected value + source revisions + notes. */
export interface ResolveVaultConflictInput {
	/** The durable conflict record id being resolved. */
	conflictId: string;
	/** The value the DM explicitly selects to become canonical. */
	selectedValue: unknown;
	/** The source revisions the resolution is applied against — MUST match the conflict's sides. */
	sourceLocalRevision: number;
	sourceRemoteRevision: number;
	/** Optional free-text resolution note. */
	notes?: string | null;
}

export interface ResolveVaultConflictMeta {
	resolverActorId: ActorId;
	resolutionOperationId: string;
	now: string;
}

export type ResolveVaultConflictError =
	| 'conflict-not-found'
	| 'conflict-already-resolved'
	| 'stale-source-revision';

export type ResolveVaultConflictResult =
	| {
			ok: true;
			/** The resolved record (with its audit), ready to be re-derived from the resolution op. */
			resolved: VaultConflictRecord;
			audit: VaultConflictResolutionAudit;
	  }
	| { ok: false; error: ResolveVaultConflictError; message: string };

/**
 * Resolve a durable vault conflict (SYNC-013). Pure: it validates the resolution against the ACTUAL
 * conflict record and produces the resolved record + audit. The command layer maps `ok` to a durable
 * resolution op (which produces the resulting non-conflicted revision) and `!ok` to a fail-closed
 * rejection.
 *
 * Fail-closed checks, in order:
 *
 *   1. The conflict id must exist in the durable set → else `conflict-not-found`.
 *   2. The conflict must be unresolved → else `conflict-already-resolved` (idempotent: a second
 *      resolution attempt is rejected, the first stands).
 *   3. The resolution MUST reference the conflict's ACTUAL source revisions (both sides) → else
 *      `stale-source-revision`. This rejects a resolution computed against a stale snapshot of the
 *      conflict, so the DM can only resolve the divergence they actually reviewed.
 *
 * `resultingRevision` is supplied by the caller (the entity's next revision); the audit records who
 * resolved, the selected value, the source revisions, optional notes, the resulting revision, the
 * resolution op id, and when.
 */
export function resolveVaultConflict(
	conflicts: readonly VaultConflictRecord[],
	input: ResolveVaultConflictInput,
	resultingRevision: number,
	meta: ResolveVaultConflictMeta,
): ResolveVaultConflictResult {
	const conflict = conflicts.find((entry) => entry.id === input.conflictId);
	if (!conflict) {
		return { ok: false, error: 'conflict-not-found', message: `Conflict ${input.conflictId} not found.` };
	}
	if (conflict.resolvedAt !== null) {
		return {
			ok: false,
			error: 'conflict-already-resolved',
			message: 'This conflict has already been resolved.',
		};
	}
	if (
		input.sourceLocalRevision !== conflict.local.revision ||
		input.sourceRemoteRevision !== conflict.remote.revision
	) {
		return {
			ok: false,
			error: 'stale-source-revision',
			message:
				'The resolution references source revisions that no longer match this conflict. Reload the conflict and resolve the current divergence.',
		};
	}
	const audit: VaultConflictResolutionAudit = {
		resolverActorId: meta.resolverActorId,
		selectedValue: input.selectedValue,
		resolvedLocalRevision: conflict.local.revision,
		resolvedRemoteRevision: conflict.remote.revision,
		resultingRevision,
		notes: input.notes && input.notes.length > 0 ? input.notes : null,
		resolutionOperationId: meta.resolutionOperationId,
		at: meta.now,
	};
	return {
		ok: true,
		resolved: { ...conflict, resolvedAt: meta.now, resolution: audit },
		audit,
	};
}
