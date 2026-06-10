export type { DurableStateDocumentId } from './schema-versions';
export {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	targetSchemaVersion,
} from './schema-versions';

export type {
	DocumentMigrationPlan,
	DocumentMigrationStatus,
	MigrationBlockingIssue,
	MigrationBlockingReason,
	MigrationDryRunResult,
	PersistedDocumentVersion,
} from './dry-run';
export { planMigration } from './dry-run';

export type {
	DocumentIntegrityRecord,
	IntegrityProblem,
	IntegrityProblemKind,
	IntegrityReport,
} from './integrity';
export { verifyIntegrity } from './integrity';

export type {
	BeginMigrationInput,
	MigrationJournalEntry,
	MigrationPhase,
	RecoveryAction,
	RecoveryDecision,
	SafetySnapshot,
} from './write-ahead';
export {
	MIGRATION_JOURNAL_SCHEMA_VERSION,
	beginMigration,
	markCommitted,
	markCommitting,
	markRolledBack,
	recoverFromJournal,
} from './write-ahead';
