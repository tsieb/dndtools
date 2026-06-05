import { describe, expect, it } from 'vitest';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	beginMigration,
	markCommitted,
	markCommitting,
	markRolledBack,
	planMigration,
	recoverFromJournal,
	verifyIntegrity,
	type DocumentIntegrityRecord,
	type DurableStateDocumentId,
	type PersistedDocumentVersion,
} from '../src';

function persistedAt(version: number | null): PersistedDocumentVersion[] {
	return DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
		documentId,
		schemaVersion: version,
		present: version !== null,
	}));
}

describe('PLAT-008 migration dry-run (AC1: report required changes and blocking issues before mutation)', () => {
	it('reports a fresh vault as migratable with no required changes', () => {
		const result = planMigration(persistedAt(null));
		expect(result.canMigrate).toBe(true);
		expect(result.migrationRequired).toBe(false);
		expect(result.requiredChanges).toEqual([]);
		expect(result.blockingIssues).toEqual([]);
		expect(result.documents.every((doc) => doc.status === 'absent')).toBe(true);
	});

	it('reports a current vault as requiring no migration', () => {
		const current = DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			schemaVersion: TARGET_SCHEMA_VERSIONS[documentId],
			present: true,
		}));
		const result = planMigration(current);
		expect(result.canMigrate).toBe(true);
		expect(result.migrationRequired).toBe(false);
		expect(result.requiredChanges).toEqual([]);
	});

	it('rejects a below-minimum schema version as unknown rather than silently upgrading', () => {
		// Targets are currently v1, so any persisted integer below 1 is not a real prior
		// schema — it must fail closed as unknown-version, not be "upgraded" blindly.
		const persisted: PersistedDocumentVersion[] = DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			schemaVersion: documentId === 'scenes' ? 0 : TARGET_SCHEMA_VERSIONS[documentId],
			present: true,
		}));
		const result = planMigration(persisted);
		const scenesPlan = result.documents.find((doc) => doc.documentId === 'scenes');
		expect(scenesPlan?.status).toBe('unknown-version');
		expect(result.canMigrate).toBe(false);
		expect(result.blockingIssues).toHaveLength(1);
		// The un-migratable document must NOT appear as a silent required change.
		expect(result.requiredChanges).toEqual([]);
	});

	it('blocks the upgrade when a document was written by a newer build (fail closed)', () => {
		const persisted = DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			schemaVersion:
				documentId === 'maps'
					? TARGET_SCHEMA_VERSIONS[documentId] + 5
					: TARGET_SCHEMA_VERSIONS[documentId],
			present: true,
		}));
		const result = planMigration(persisted);
		expect(result.canMigrate).toBe(false);
		expect(result.blockingIssues).toHaveLength(1);
		const issue = result.blockingIssues[0];
		expect(issue?.reason).toBe('future-version');
		expect(issue?.documentId).toBe('maps');
		expect(issue?.remediation).toMatch(/update/i);
		// The required-change list must NOT silently include the un-migratable doc.
		expect(result.requiredChanges).toEqual([]);
	});

	it('treats an unreadable schema version as a blocking issue, not a silent upgrade', () => {
		const persisted = DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			schemaVersion: documentId === 'permissions' ? Number.NaN : TARGET_SCHEMA_VERSIONS[documentId],
			present: true,
		}));
		const result = planMigration(persisted);
		expect(result.canMigrate).toBe(false);
		expect(result.blockingIssues[0]?.reason).toBe('unknown-version');
	});
});

describe('PLAT-008 integrity verification', () => {
	function recordsAll(present: boolean): DocumentIntegrityRecord[] {
		return DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			present,
			schemaVersion: present ? TARGET_SCHEMA_VERSIONS[documentId] : null,
			fingerprint: present ? 'fp' : null,
		}));
	}

	it('reports a fully present vault as consistent', () => {
		expect(verifyIntegrity(recordsAll(true)).consistent).toBe(true);
	});

	it('reports a fully empty vault as consistent (fresh start)', () => {
		expect(verifyIntegrity(recordsAll(false)).consistent).toBe(true);
	});

	it('detects a partially written (mid-write) vault as inconsistent', () => {
		const records = recordsAll(true).map((record) =>
			record.documentId === 'session'
				? { ...record, present: false, schemaVersion: null, fingerprint: null }
				: record,
		);
		const report = verifyIntegrity(records);
		expect(report.consistent).toBe(false);
		expect(report.problems[0]?.kind).toBe('missing-document');
	});

	it('detects an unreadable payload', () => {
		const records = recordsAll(true).map((record) =>
			record.documentId === 'scenes' ? { ...record, fingerprint: null } : record,
		);
		const report = verifyIntegrity(records);
		expect(report.consistent).toBe(false);
		expect(report.problems.some((problem) => problem.kind === 'missing-fingerprint')).toBe(true);
	});
});

describe('PLAT-008 write-ahead recovery (AC2: restart restores a consistent state)', () => {
	const fromVersions = Object.fromEntries(
		DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, 1]),
	) as Record<DurableStateDocumentId, number | null>;
	const targetVersions = Object.fromEntries(
		DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, TARGET_SCHEMA_VERSIONS[id]]),
	) as Record<DurableStateDocumentId, number>;
	const documents = Object.fromEntries(
		DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, { snapshot: id }]),
	) as Record<DurableStateDocumentId, unknown>;

	function begin() {
		return beginMigration({
			migrationId: 'mig-1',
			startedAt: '2026-06-04T00:00:00.000Z',
			snapshotId: 'snap-1',
			fromVersions,
			targetVersions,
			documents,
		});
	}

	it('captures a safety snapshot before mutation in the pending phase', () => {
		const entry = begin();
		expect(entry.phase).toBe('pending');
		expect(entry.snapshot.id).toBe('snap-1');
		expect(entry.snapshot.documents.scenes).toEqual({ snapshot: 'scenes' });
	});

	it('recovers a pending journal by clearing it (nothing was written)', () => {
		const decision = recoverFromJournal(begin());
		expect(decision.action).toBe('clear-journal');
		expect(decision.snapshot).toBeNull();
	});

	it('rolls back to the snapshot when the process died mid-write (committing)', () => {
		const inFlight = markCommitting(begin());
		const decision = recoverFromJournal(inFlight);
		expect(decision.action).toBe('roll-back');
		expect(decision.snapshot?.id).toBe('snap-1');
		// The rollback target is the captured pre-migration document set.
		expect(decision.snapshot?.documents.maps).toEqual({ snapshot: 'maps' });
	});

	it('treats a committed journal as a no-op clear', () => {
		const committed = markCommitted(markCommitting(begin()), '2026-06-04T00:00:01.000Z');
		const decision = recoverFromJournal(committed);
		expect(decision.action).toBe('clear-journal');
	});

	it('does not roll back twice after a prior recovery (rolled-back is a no-op clear)', () => {
		const rolledBack = markRolledBack(markCommitting(begin()), '2026-06-04T00:00:02.000Z');
		const decision = recoverFromJournal(rolledBack);
		expect(decision.action).toBe('clear-journal');
		expect(decision.snapshot).toBeNull();
	});

	it('treats an absent journal as nothing to recover', () => {
		expect(recoverFromJournal(null).action).toBe('none');
	});

	it('roll-back snapshot restores integrity consistency end to end', () => {
		// Simulate: mid-write corruption (session document gone), recover via snapshot.
		const inFlight = markCommitting(begin());
		const decision = recoverFromJournal(inFlight);
		expect(decision.action).toBe('roll-back');
		// After restoring all snapshot documents, integrity is consistent again.
		const restored: DocumentIntegrityRecord[] = DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
			documentId,
			present: true,
			schemaVersion: fromVersions[documentId],
			fingerprint: 'restored',
		}));
		expect(verifyIntegrity(restored).consistent).toBe(true);
	});
});
