import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { ActorRole } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';
import {
	deriveVaultConflicts,
	publicationStatusForEntity,
	type EntityPublicationStatus,
	type VaultConflictRecord,
	type VaultConflictResolutionAudit,
} from '../state/conflict-lifecycle';

/**
 * SYNC-006 / SYNC-013 — the ACTOR-FILTERED conflict-lifecycle VIEW.
 *
 * This is the single sanctioned read path the GUI/SYNC status surface uses to display the durable
 * vault conflict set. It DERIVES the conflict records from the op-log substrate (the same substrate
 * `queries/sync-status.ts` reads) and projects them per actor:
 *
 *   - the DM sees the FULL conflict records (both diverging values + revisions + the resolution audit
 *     with who/what/when/selected-value), because the DM is the authority that resolves them;
 *   - a non-DM (player/observer) sees ONLY the STRUCTURAL conflict facts (entity, path, reason,
 *     publication status, resolved flag) — NEVER the conflicting VALUES, the author ids, or the
 *     resolution's selected value. This keeps the surface non-leaking for the same reasons the
 *     character collaborative view and the sync-status conflict surface are non-leaking.
 *
 * Pure Processing-Core policy; no GUI, no storage. Fail-closed: an unknown actor is denied.
 */

/** The structural facts every role may see about a conflict. Carries NO conflicting values. */
export interface ConflictLifecycleEntryView {
	conflictId: string;
	entityType: string;
	entityId: string;
	path: string | null;
	reason: VaultConflictRecord['reason'];
	detectedAt: string;
	resolved: boolean;
	resolvedAt: string | null;
	/** The non-DM publication status of the conflicted entity (Contract 2 rule 5). */
	publication: EntityPublicationStatus;
}

/** The DM-only detail layer: the diverging values + revisions + the full resolution audit. */
export interface ConflictLifecycleDmDetailView extends ConflictLifecycleEntryView {
	ancestorRevision: number | null;
	local: { revision: number; value: unknown; authorActorId: ActorId | null };
	remote: { revision: number; value: unknown; authorActorId: ActorId | null };
	resolution: VaultConflictResolutionAudit | null;
}

export interface ConflictLifecycleView {
	kind: 'conflict-lifecycle';
	actorId: ActorId;
	role: ActorRole;
	/** Distinct entity keys (`type:id`) that currently carry an unresolved conflict. */
	conflictedEntityKeys: string[];
	unresolvedCount: number;
	/** Structural entries every role may see (no conflicting values). */
	entries: ConflictLifecycleEntryView[];
	/** DM-only full detail. Empty for non-DM actors (fail-closed non-leak). */
	dmDetail: ConflictLifecycleDmDetailView[];
}

export type ConflictLifecycleResult =
	| ConflictLifecycleView
	| { kind: 'denied'; reason: 'unknown-actor' };

export interface ConflictLifecycleInput {
	operations: readonly SyncOperation[];
}

function structuralEntry(record: VaultConflictRecord): ConflictLifecycleEntryView {
	return {
		conflictId: record.id,
		entityType: record.entityType,
		entityId: record.entityId,
		path: record.path,
		reason: record.reason,
		detectedAt: record.detectedAt,
		resolved: record.resolvedAt !== null,
		resolvedAt: record.resolvedAt,
		// An unresolved conflict on THIS entity makes it `conflicted`; resolved ⇒ `publishable`. Scoped
		// to the entity, so this status is independent of conflicts on OTHER entities (isolation).
		publication: record.resolvedAt === null ? 'conflicted' : 'publishable',
	};
}

/**
 * Derive the actor-filtered conflict-lifecycle view (SYNC-006 display + SYNC-013 audit surface).
 * Fail-closed: an unknown actor is denied. The DM detail layer (conflicting values + audit) is
 * present ONLY for the DM; a non-DM gets the structural entries only.
 */
export function getConflictLifecycle(
	permissions: PermissionState,
	actorId: ActorId,
	input: ConflictLifecycleInput,
): ConflictLifecycleResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };

	const conflicts = deriveVaultConflicts(input.operations, input.operations);
	const entries = conflicts.map(structuralEntry);
	const unresolvedCount = conflicts.filter((conflict) => conflict.resolvedAt === null).length;
	const keysSeen = new Set<string>();
	const conflictedEntityKeys: string[] = [];
	for (const conflict of conflicts) {
		if (conflict.resolvedAt !== null) continue;
		const key = `${conflict.entityType}:${conflict.entityId}`;
		if (keysSeen.has(key)) continue;
		keysSeen.add(key);
		conflictedEntityKeys.push(key);
	}

	const isDm = hasDmAuthority(actor.role);
	const dmDetail: ConflictLifecycleDmDetailView[] = isDm
		? conflicts.map((record) => ({
				...structuralEntry(record),
				ancestorRevision: record.ancestorRevision,
				local: { ...record.local },
				remote: { ...record.remote },
				resolution: record.resolution,
			}))
		: [];

	return {
		kind: 'conflict-lifecycle',
		actorId,
		role: actor.role,
		conflictedEntityKeys,
		unresolvedCount,
		entries,
		dmDetail,
	};
}

/**
 * The publication status of one entity for a NON-DM viewer, scoped to that entity (Contract 2 rule 5;
 * SYNC-006 AC3). This is the gate a per-viewer projection consults: a `conflicted` entity's ambiguous
 * revision is blocked / represented as conflicted until resolved; an entity with no unresolved
 * conflict is publishable regardless of conflicts on OTHER entities.
 */
export function entityPublicationStatus(
	operations: readonly SyncOperation[],
	entityType: string,
	entityId: string,
): EntityPublicationStatus {
	const conflicts = deriveVaultConflicts(operations, operations);
	return publicationStatusForEntity(conflicts, entityType, entityId);
}

/**
 * Fail-closed non-leak self-check used by tests: a NON-DM conflict-lifecycle view must not contain any
 * of the supplied secret values anywhere in its serialized form. Returns true when the view is clean.
 */
export function conflictLifecycleIsStructuralOnly(
	view: ConflictLifecycleView,
	secrets: readonly unknown[],
): boolean {
	if (hasDmAuthority(view.role)) return true;
	if (view.dmDetail.length > 0) return false;
	const serialized = JSON.stringify(view.entries);
	for (const secret of secrets) {
		if (secret === undefined || secret === null) continue;
		if (serialized.includes(String(secret))) return false;
	}
	return true;
}
