import { describe, expect, it } from 'vitest';
import { buildDiagnosticsContext } from '../../src/lib/platform/diagnostics-context';
import { DURABLE_STATE_DOCUMENT_IDS } from '@dndtools/core';
import { DM_ACTOR, buildInitialState } from '@dndtools/core/testing';

const baseEnv = {
	appVersion: '0.2.0',
	platformProfileId: 'desktop',
	online: true,
	storageAvailable: true,
	filesystemAvailable: true,
	pendingOperations: 0,
	now: '2026-06-04T12:00:00.000Z',
};

describe('PLAT-009 buildDiagnosticsContext: persistedVersions covers all durable documents', () => {
	it('emits a schema-health entry for every durable document in DURABLE_STATE_DOCUMENT_IDS', () => {
		const state = buildInitialState(DM_ACTOR);
		const context = buildDiagnosticsContext(state, baseEnv);

		const reportedIds = context.schema.map((entry) => entry.documentId);
		for (const documentId of DURABLE_STATE_DOCUMENT_IDS) {
			expect(reportedIds, `expected schema health entry for "${documentId}"`).toContain(documentId);
		}
		// All 11 durable documents must be present — no extras, no gaps.
		expect(reportedIds).toHaveLength(DURABLE_STATE_DOCUMENT_IDS.length);
	});

	it('marks encounters, audio, and mcp as present (not absent) in the initial state', () => {
		const state = buildInitialState(DM_ACTOR);
		const context = buildDiagnosticsContext(state, baseEnv);

		for (const documentId of ['encounters', 'audio', 'mcp'] as const) {
			const entry = context.schema.find((e) => e.documentId === documentId);
			expect(entry, `schema entry for "${documentId}" should exist`).toBeDefined();
			// The document IS present in the initial state; schema-health must not falsely
			// report it absent (schemaVersion null / migrationRequired would be the symptom
			// of the persistedVersions bug where these 3 keys were missing from the map).
			expect(entry?.currentVersion, `"${documentId}" currentVersion must not be null`).not.toBeNull();
		}
	});

	it('reports no migration required when all documents are at their target version', () => {
		const state = buildInitialState(DM_ACTOR);
		const context = buildDiagnosticsContext(state, baseEnv);

		const needsMigration = context.schema.filter((e) => e.migrationRequired || e.blocked);
		expect(
			needsMigration.map((e) => e.documentId),
			'no document should require migration on a fresh initial state',
		).toHaveLength(0);
	});
});
