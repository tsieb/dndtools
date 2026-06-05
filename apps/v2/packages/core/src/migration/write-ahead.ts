import type { DurableStateDocumentId } from './schema-versions';

export const MIGRATION_JOURNAL_SCHEMA_VERSION = 1 as const;

/**
 * A safety snapshot captured before a migration mutates durable documents. The snapshot
 * is the rollback target: if a migration fails part-way, restoring the snapshot returns
 * the vault to its pre-migration consistent state (PLAT-008).
 */
export interface SafetySnapshot {
	id: string;
	migrationId: string;
	createdAt: string;
	fromVersions: Readonly<Record<DurableStateDocumentId, number | null>>;
	/** Opaque persisted payloads keyed by document id, captured pre-migration. */
	documents: Readonly<Record<DurableStateDocumentId, unknown>>;
}

export type MigrationPhase = 'pending' | 'committing' | 'committed' | 'rolled-back';

/**
 * A write-ahead journal entry. It is written (phase `pending`) and the snapshot is
 * captured BEFORE any durable document is mutated. Phase advances to `committing` while
 * documents are rewritten, then `committed` once every document is at its target
 * version. If the process dies mid-write the journal is left in `pending`/`committing`,
 * which restart recovery detects.
 */
export interface MigrationJournalEntry {
	migrationId: string;
	phase: MigrationPhase;
	startedAt: string;
	committedAt: string | null;
	rolledBackAt: string | null;
	targetVersions: Readonly<Record<DurableStateDocumentId, number>>;
	snapshot: SafetySnapshot;
	schemaVersion: typeof MIGRATION_JOURNAL_SCHEMA_VERSION;
}

export interface BeginMigrationInput {
	migrationId: string;
	startedAt: string;
	snapshotId: string;
	fromVersions: Record<DurableStateDocumentId, number | null>;
	targetVersions: Record<DurableStateDocumentId, number>;
	documents: Record<DurableStateDocumentId, unknown>;
}

/**
 * Create the write-ahead journal entry and safety snapshot that must be durably written
 * before the migration touches any document.
 */
export function beginMigration(input: BeginMigrationInput): MigrationJournalEntry {
	return {
		migrationId: input.migrationId,
		phase: 'pending',
		startedAt: input.startedAt,
		committedAt: null,
		rolledBackAt: null,
		targetVersions: { ...input.targetVersions },
		snapshot: {
			id: input.snapshotId,
			migrationId: input.migrationId,
			createdAt: input.startedAt,
			fromVersions: { ...input.fromVersions },
			documents: { ...input.documents },
		},
		schemaVersion: MIGRATION_JOURNAL_SCHEMA_VERSION,
	};
}

/** Advance the journal to `committing` once document rewrites begin. */
export function markCommitting(entry: MigrationJournalEntry): MigrationJournalEntry {
	return { ...entry, phase: 'committing' };
}

/** Mark the migration committed once every document reached its target version. */
export function markCommitted(
	entry: MigrationJournalEntry,
	committedAt: string,
): MigrationJournalEntry {
	return { ...entry, phase: 'committed', committedAt };
}

export type RecoveryAction = 'none' | 'clear-journal' | 'roll-back';

export interface RecoveryDecision {
	action: RecoveryAction;
	/** When `roll-back`, the snapshot to restore the vault from. */
	snapshot: SafetySnapshot | null;
	reason: string;
}

/**
 * Decide what restart recovery must do given the last journal entry (PLAT-008 AC2).
 *
 * - No journal: nothing to recover.
 * - `committed`: the migration finished; clear the journal.
 * - `pending`: nothing was mutated yet (snapshot captured, no rewrites began); the
 *   on-disk state is still pre-migration and consistent, so just clear the journal.
 * - `committing`: a mutation may have been partially applied; roll back to the snapshot
 *   to restore a consistent state.
 * - `rolled-back`: a prior recovery already restored the snapshot; clear the journal.
 */
export function recoverFromJournal(entry: MigrationJournalEntry | null): RecoveryDecision {
	if (!entry) {
		return { action: 'none', snapshot: null, reason: 'No in-flight migration journal.' };
	}
	switch (entry.phase) {
		case 'committed':
			return {
				action: 'clear-journal',
				snapshot: null,
				reason: 'Migration committed cleanly; clearing write-ahead journal.',
			};
		case 'pending':
			return {
				action: 'clear-journal',
				snapshot: null,
				reason: 'Migration never began writing; on-disk state is the pre-migration snapshot.',
			};
		case 'committing':
			return {
				action: 'roll-back',
				snapshot: entry.snapshot,
				reason: 'Migration failed mid-write; rolling back to the pre-migration safety snapshot.',
			};
		case 'rolled-back':
			return {
				action: 'clear-journal',
				snapshot: null,
				reason: 'Migration was already rolled back; clearing write-ahead journal.',
			};
	}
}

/** Record that a rolled-back snapshot was restored, so a subsequent restart is a no-op. */
export function markRolledBack(
	entry: MigrationJournalEntry,
	rolledBackAt: string,
): MigrationJournalEntry {
	return { ...entry, phase: 'rolled-back', rolledBackAt };
}
