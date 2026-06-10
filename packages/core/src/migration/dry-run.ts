import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	type DurableStateDocumentId,
} from './schema-versions';

/**
 * A persisted durable document as read from storage, before the build trusts it. Only
 * the schema version is needed to plan a migration; the payload stays opaque so the
 * planner never depends on document internals.
 */
export interface PersistedDocumentVersion {
	documentId: DurableStateDocumentId;
	/** The schema version recorded with the persisted document, or null when missing. */
	schemaVersion: number | null;
	/** True when no record exists yet for this document (fresh vault / first run). */
	present: boolean;
}

export type DocumentMigrationStatus =
	| 'current'
	| 'absent'
	| 'needs-upgrade'
	| 'unknown-version'
	| 'future-version';

export interface DocumentMigrationPlan {
	documentId: DurableStateDocumentId;
	status: DocumentMigrationStatus;
	fromVersion: number | null;
	toVersion: number;
	/** Human-readable required change, shown before any mutation (PLAT-008 AC1). */
	requiredChange: string | null;
	/** Set when the document cannot be safely migrated and blocks the upgrade. */
	blockingIssue: MigrationBlockingIssue | null;
}

export type MigrationBlockingReason = 'future-version' | 'unknown-version';

export interface MigrationBlockingIssue {
	documentId: DurableStateDocumentId;
	reason: MigrationBlockingReason;
	fromVersion: number | null;
	toVersion: number;
	message: string;
	/** Action-oriented remediation a DM/admin can follow. */
	remediation: string;
}

export interface MigrationDryRunResult {
	/** True only when every document is safe to migrate (or already current). */
	canMigrate: boolean;
	/** True when at least one document requires a mutating upgrade. */
	migrationRequired: boolean;
	documents: DocumentMigrationPlan[];
	/** Ordered required changes for documents that will be upgraded. */
	requiredChanges: string[];
	/** Issues that block the upgrade; non-empty implies `canMigrate` is false. */
	blockingIssues: MigrationBlockingIssue[];
}

function classify(
	version: number | null,
	present: boolean,
	target: number,
): DocumentMigrationStatus {
	if (!present || version === null) return 'absent';
	if (!Number.isInteger(version) || version < 1) return 'unknown-version';
	if (version === target) return 'current';
	if (version < target) return 'needs-upgrade';
	return 'future-version';
}

function planDocument(persisted: PersistedDocumentVersion): DocumentMigrationPlan {
	const toVersion = TARGET_SCHEMA_VERSIONS[persisted.documentId];
	const fromVersion = persisted.present ? persisted.schemaVersion : null;
	const status = classify(persisted.schemaVersion, persisted.present, toVersion);

	switch (status) {
		case 'current':
		case 'absent':
			return {
				documentId: persisted.documentId,
				status,
				fromVersion,
				toVersion,
				requiredChange: null,
				blockingIssue: null,
			};
		case 'needs-upgrade':
			return {
				documentId: persisted.documentId,
				status,
				fromVersion,
				toVersion,
				requiredChange: `Upgrade ${persisted.documentId} from schema v${fromVersion} to v${toVersion}.`,
				blockingIssue: null,
			};
		case 'unknown-version': {
			const message = `${persisted.documentId} reports an unreadable schema version (${String(
				persisted.schemaVersion,
			)}).`;
			return {
				documentId: persisted.documentId,
				status,
				fromVersion,
				toVersion,
				requiredChange: null,
				blockingIssue: {
					documentId: persisted.documentId,
					reason: 'unknown-version',
					fromVersion,
					toVersion,
					message,
					remediation: 'Restore the vault from a backup or safety snapshot before upgrading.',
				},
			};
		}
		case 'future-version': {
			const message = `${persisted.documentId} was written by a newer build (schema v${fromVersion} > supported v${toVersion}).`;
			return {
				documentId: persisted.documentId,
				status,
				fromVersion,
				toVersion,
				requiredChange: null,
				blockingIssue: {
					documentId: persisted.documentId,
					reason: 'future-version',
					fromVersion,
					toVersion,
					message,
					remediation: 'Update DND Tools to the latest version to open this vault.',
				},
			};
		}
	}
}

/**
 * Plan a vault upgrade without mutating anything. Reports the required changes and any
 * blocking issues so the user sees them before mutation (PLAT-008 AC1). Fails closed:
 * future or unreadable schema versions block the whole upgrade rather than being
 * partially parsed (Contract 2 Sync Security rule 5).
 */
export function planMigration(
	persisted: readonly PersistedDocumentVersion[],
): MigrationDryRunResult {
	const byId = new Map(persisted.map((entry) => [entry.documentId, entry]));
	const documents = DURABLE_STATE_DOCUMENT_IDS.map((documentId) =>
		planDocument(byId.get(documentId) ?? { documentId, schemaVersion: null, present: false }),
	);
	const requiredChanges = documents
		.map((plan) => plan.requiredChange)
		.filter((change): change is string => change !== null);
	const blockingIssues = documents
		.map((plan) => plan.blockingIssue)
		.filter((issue): issue is MigrationBlockingIssue => issue !== null);
	const migrationRequired = documents.some((plan) => plan.status === 'needs-upgrade');
	return {
		canMigrate: blockingIssues.length === 0,
		migrationRequired,
		documents,
		requiredChanges,
		blockingIssues,
	};
}
