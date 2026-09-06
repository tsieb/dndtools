import { describe, expect, it } from 'vitest';
import {
	ERROR_TAXONOMY_CATEGORIES,
	PERMISSION_STATE_SCHEMA_VERSION,
	STORAGE_CATEGORIES,
	countErrorsByCategory,
	deriveLastSyncAt,
	exportSupportBundle,
	getDmDiagnostics,
	summarizeStorageUsage,
	type DiagnosticsContextInput,
	type ErrorTaxonomyCounts,
	type PermissionGrant,
	type PermissionState,
	type RawErrorRecord,
	type RawStorageUsageEntry,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

// RC-ENG-6.1 — Observability in the app. Settings › About › Diagnostics needs perf marks, error
// taxonomy counts, storage usage, and last-sync-at, all safe to include in the export bundle
// without depending on the existing `includeSecrets` opt-in (they are counts/bytes/numbers, never
// raw message text or paths).

function permissions(grants: PermissionGrant[] = []): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

function diagnosticsContext(
	overrides: Partial<DiagnosticsContextInput> = {},
): DiagnosticsContextInput {
	return {
		appVersion: '0.2.0',
		platformProfileId: 'desktop',
		generatedAt: '2026-06-04T12:00:00.000Z',
		online: true,
		syncSources: [
			{
				sourceId: 'local-vault',
				kind: 'local-vault',
				displayName: 'Local Vault',
				state: 'connected',
				detail: null,
				pendingOperations: 0,
				lastSyncedAt: '2026-06-04T11:59:00.000Z',
			},
		],
		capabilities: [],
		schema: [],
		environment: {},
		...overrides,
	};
}

describe('RC-ENG-6.1 error taxonomy counts (privacy-safe by construction)', () => {
	it('zero-fills every known category and counts observations', () => {
		const records: RawErrorRecord[] = [
			{ category: 'network', occurredAt: 't1', message: 'fetch failed for /Users/dm/x' },
			{ category: 'network', occurredAt: 't2' },
			{ category: 'sync', occurredAt: 't3' },
		];
		const counts = countErrorsByCategory(records);
		expect(counts.network).toBe(2);
		expect(counts.sync).toBe(1);
		expect(counts.storage).toBe(0);
		expect(Object.keys(counts).sort()).toEqual([...ERROR_TAXONOMY_CATEGORIES].sort());
	});

	it('buckets an unrecognized category under unknown (fail closed)', () => {
		const records = [
			{ category: 'totally-made-up', occurredAt: 't1' } as unknown as RawErrorRecord,
		];
		const counts = countErrorsByCategory(records);
		expect(counts.unknown).toBe(1);
	});

	it('never carries raw message text through the count — the return value has no message field', () => {
		const counts: ErrorTaxonomyCounts = countErrorsByCategory([
			{ category: 'validation', occurredAt: 't1', message: 'secret token abcd' },
		]);
		expect(JSON.stringify(counts)).not.toMatch(/secret|abcd/);
	});
});

describe('RC-ENG-6.1 storage usage summary', () => {
	it('sums bytes by category and overall', () => {
		const entries: RawStorageUsageEntry[] = [
			{ category: 'vault', bytes: 1000 },
			{ category: 'vault', bytes: 500 },
			{ category: 'cache', bytes: 250 },
		];
		const usage = summarizeStorageUsage(entries);
		expect(usage.byCategory.vault).toBe(1500);
		expect(usage.byCategory.cache).toBe(250);
		expect(usage.totalBytes).toBe(1750);
		expect(Object.keys(usage.byCategory).sort()).toEqual([...STORAGE_CATEGORIES].sort());
	});

	it('clamps a negative or non-finite byte count to zero (fail closed)', () => {
		const usage = summarizeStorageUsage([
			{ category: 'assets', bytes: -50 },
			{ category: 'assets', bytes: Number.NaN },
		]);
		expect(usage.byCategory.assets).toBe(0);
		expect(usage.totalBytes).toBe(0);
	});

	it('buckets an unrecognized category under other (fail closed)', () => {
		const usage = summarizeStorageUsage([
			{ category: 'made-up' as RawStorageUsageEntry['category'], bytes: 10 },
		]);
		expect(usage.byCategory.other).toBe(10);
	});
});

describe('RC-ENG-6.1 last sync derivation', () => {
	it('returns the most recent lastSyncedAt across sources', () => {
		const latest = deriveLastSyncAt([
			{
				sourceId: 'a',
				kind: 'local-vault',
				displayName: 'A',
				state: 'connected',
				detail: null,
				pendingOperations: 0,
				lastSyncedAt: '2026-06-01T00:00:00.000Z',
			},
			{
				sourceId: 'b',
				kind: 'obsidian-vault',
				displayName: 'B',
				state: 'connected',
				detail: null,
				pendingOperations: 0,
				lastSyncedAt: '2026-06-04T00:00:00.000Z',
			},
		]);
		expect(latest).toBe('2026-06-04T00:00:00.000Z');
	});

	it('returns null when no source has ever synced', () => {
		expect(
			deriveLastSyncAt([
				{
					sourceId: 'a',
					kind: 'local-vault',
					displayName: 'A',
					state: 'disabled',
					detail: null,
					pendingOperations: 0,
					lastSyncedAt: null,
				},
			]),
		).toBeNull();
	});
});

describe('RC-ENG-6.1 diagnostics view + support bundle include observability fields', () => {
	it('surfaces error taxonomy, storage usage, last sync, and perf marks in the DM view', () => {
		const context = diagnosticsContext({
			errorLog: [{ category: 'render', occurredAt: 't1', message: '/Users/dm/x.tsx crash' }],
			storageUsage: [{ category: 'vault', bytes: 2048 }],
			perfMarks: [{ metricId: 'scene-first-render', value: 120, residency: 'local' }],
		});
		const result = getDmDiagnostics(permissions(), context, DM_ACTOR.id);
		expect(result.kind).toBe('available');
		if (result.kind !== 'available') return;
		expect(result.errorTaxonomy.render).toBe(1);
		expect(result.storageUsage.totalBytes).toBe(2048);
		expect(result.lastSyncAt).toBe('2026-06-04T11:59:00.000Z');
		expect(result.perfMarks).toEqual([
			{ metricId: 'scene-first-render', value: 120, residency: 'local' },
		]);
	});

	it('defaults observability fields to empty/zero when the platform supplies nothing', () => {
		const result = getDmDiagnostics(permissions(), diagnosticsContext(), DM_ACTOR.id);
		expect(result.kind).toBe('available');
		if (result.kind !== 'available') return;
		expect(result.errorTaxonomy.unknown).toBe(0);
		expect(result.storageUsage.totalBytes).toBe(0);
		expect(result.perfMarks).toEqual([]);
	});

	it('includes observability fields in the support bundle, and never leaks the raw error message', () => {
		const context = diagnosticsContext({
			errorLog: [
				{
					category: 'network',
					occurredAt: 't1',
					message: 'auth token sk-live-should-never-appear',
				},
			],
			storageUsage: [{ category: 'sync-queue', bytes: 99 }],
			perfMarks: [{ metricId: 'vault-open', value: 42, residency: 'exported' }],
		});
		const bundle = exportSupportBundle(permissions(), context, DM_ACTOR.id);
		expect(bundle.kind).toBe('bundle');
		if (bundle.kind !== 'bundle') return;
		expect(bundle.errorTaxonomy.network).toBe(1);
		expect(bundle.storageUsage.byCategory['sync-queue']).toBe(99);
		expect(bundle.lastSyncAt).toBe('2026-06-04T11:59:00.000Z');
		expect(bundle.perfMarks).toEqual([
			{ metricId: 'vault-open', value: 42, residency: 'exported' },
		]);
		// The redaction acceptance criterion: the raw error message text must never survive into the
		// exported bundle, with or without the `includeSecrets` opt-in — the taxonomy is counts-only.
		expect(JSON.stringify(bundle)).not.toMatch(/sk-live-should-never-appear/);
	});

	it('still omits the raw error message even when includeSecrets is set (there is nowhere for it to ride)', () => {
		const context = diagnosticsContext({
			errorLog: [{ category: 'permission', occurredAt: 't1', message: 'leaked-secret-xyz' }],
		});
		const bundle = exportSupportBundle(permissions(), context, DM_ACTOR.id, {
			includeSecrets: true,
		});
		expect(bundle.kind).toBe('bundle');
		if (bundle.kind !== 'bundle') return;
		expect(bundle.errorTaxonomy.permission).toBe(1);
		expect(JSON.stringify(bundle)).not.toMatch(/leaked-secret-xyz/);
	});
});
