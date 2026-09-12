import { describe, expect, it } from 'vitest';
import { beginMigration } from './write-ahead';
import { planMigration } from './dry-run';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	type DurableStateDocumentId,
} from './schema-versions';

describe('migration snapshot isolation', () => {
	it('retains nested pre-migration data after the caller mutates its input', () => {
		const documents = Object.fromEntries(
			DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, { nested: { name: 'original' } }]),
		) as Record<DurableStateDocumentId, { nested: { name: string } }>;
		const entry = beginMigration({
			migrationId: 'migration',
			snapshotId: 'snapshot',
			startedAt: 'now',
			fromVersions: { ...TARGET_SCHEMA_VERSIONS },
			targetVersions: { ...TARGET_SCHEMA_VERSIONS },
			documents,
		});
		documents.scenes.nested.name = 'changed';
		expect(entry.snapshot.documents.scenes).toEqual({ nested: { name: 'original' } });
	});
	it('blocks a present document with an unreadable version instead of treating it as absent', () => {
		const result = planMigration([{ documentId: 'scenes', present: true, schemaVersion: null }]);
		expect(result.canMigrate).toBe(false);
		expect(result.blockingIssues[0]?.reason).toBe('unknown-version');
	});
});
