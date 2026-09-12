import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	__testing,
	loadCoreState,
	listQuarantinedDocuments,
	migrateStoredDocuments,
	restoreCoreState,
} from './coreStore';
import { assetBlobsTable } from './coreStore';
import { pruneAssetCache, putEmbeddingVector } from './assetStore';
import { collectStoragePressure } from '../../diagnostics/storageUsage';

beforeEach(() => {
	Dexie.dependencies.indexedDB = new IDBFactory();
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await __testing.closeDb();
});

describe('storage pressure', () => {
	it.each([
		[79, false],
		[80, true],
		[100, true],
	])('warns at %i percent: %s', async (usage, pressured) => {
		vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage, quota: 100 }) } });
		expect((await collectStoragePressure())?.pressured).toBe(pressured);
	});
	it.each([{}, { usage: 80, quota: 0 }, { usage: NaN, quota: 100 }])(
		'tolerates unavailable estimates',
		async (estimate) => {
			vi.stubGlobal('navigator', { storage: { estimate: async () => estimate } });
			expect(await collectStoragePressure()).toBeNull();
		},
	);
	it('tolerates estimate rejection', async () => {
		vi.stubGlobal('navigator', {
			storage: {
				estimate: async () => {
					throw new Error('denied');
				},
			},
		});
		expect(await collectStoragePressure()).toBeNull();
	});
	it('prunes rebuildable asset cache while retaining media', async () => {
		await putEmbeddingVector('note', 'model', new Float32Array([1, 2]));
		const media = {
			id: 'campaign-image',
			bytes: new ArrayBuffer(4),
			mime: 'image/png',
			byteLength: 4,
			createdAt: 'now',
		};
		await assetBlobsTable().put(media);
		expect(await pruneAssetCache()).toEqual({ removed: 1, freedBytes: 8 });
		expect(await assetBlobsTable().toArray()).toEqual([media]);
	});
});

describe('open-time quarantine', () => {
	it('loads healthy documents and preserves the exact corrupt original across reopen', async () => {
		const raw = '{"schemaVersion":1,"scenes":';
		await __testing.putRawDocument('scene-state', raw);
		await __testing.putRawDocument('session-state', {
			schemaVersion: 1,
			title: 'Surviving campaign',
		});
		const loaded = await loadCoreState();
		expect(loaded.scenes.scenes).toEqual({});
		expect(loaded.session.title).toBe('Surviving campaign');
		await restoreCoreState({ ...loaded, sync: { operations: loaded.sync.operations } });
		const items = await listQuarantinedDocuments();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ documentKey: 'scene-state', original: raw });
		await __testing.closeDb();
		await loadCoreState();
		expect(await listQuarantinedDocuments()).toEqual(items);
	});
	it('rolls back the move when quarantine cannot be written', async () => {
		await __testing.putRawDocument('scene-state', 'broken');
		vi.spyOn(__testing.getDb().documents, 'add').mockRejectedValueOnce(new Error('quota exceeded'));
		await expect(loadCoreState()).rejects.toThrow('quota exceeded');
		expect(await __testing.getDb().documents.get('scene-state')).toEqual({
			key: 'scene-state',
			doc: 'broken',
		});
		expect(await listQuarantinedDocuments()).toEqual([]);
	});
	it('never quarantines unsupported future schemas', async () => {
		await __testing.putRawDocument('scene-state', 'broken');
		await __testing.putRawDocument('map-state', { schemaVersion: 999, maps: {} });
		await expect(loadCoreState()).rejects.toThrow('newer app version');
		expect(await listQuarantinedDocuments()).toEqual([]);
		expect(await __testing.getDb().documents.get('scene-state')).toBeDefined();
	});
});

describe('migration execution', () => {
	it('dry-runs detached changes, then restores the exact snapshot when a migrator throws', async () => {
		await __testing.putRawDocument('scene-state', {
			schemaVersion: 1,
			scenes: {},
			extra: { label: 'original' },
		});
		const before = await __testing.getDb().documents.toArray();
		const mutate = (documents: Record<string, unknown>) => {
			(documents.scenes as { extra: { label: string } }).extra.label = 'changed';
		};
		await migrateStoredDocuments(mutate, { dryRun: true });
		expect(await __testing.getDb().documents.toArray()).toEqual(before);
		expect(await __testing.getDb().migrationJournal.count()).toBe(0);
		await expect(
			migrateStoredDocuments(
				(documents) => {
					mutate(documents);
					throw new Error('dry-run failed');
				},
				{ dryRun: true },
			),
		).rejects.toThrow('dry-run failed');
		expect(await __testing.getDb().documents.toArray()).toEqual(before);
		expect(await __testing.getDb().migrationJournal.count()).toBe(0);
		await expect(
			migrateStoredDocuments(
				(documents) => {
					mutate(documents);
					throw new Error('migrator failed');
				},
				{ dryRun: false },
			),
		).rejects.toThrow('migrator failed');
		expect(await __testing.getDb().documents.toArray()).toEqual(before);
		expect(await __testing.getDb().migrationJournal.count()).toBe(0);
		vi.spyOn(__testing.getDb().documents, 'bulkPut').mockRejectedValueOnce(
			new Error('write failed'),
		);
		await expect(migrateStoredDocuments(mutate, { dryRun: false })).rejects.toThrow('write failed');
		expect(await __testing.getDb().documents.toArray()).toEqual(before);
		expect(await __testing.getDb().migrationJournal.count()).toBe(0);
		await migrateStoredDocuments(mutate, { dryRun: false });
		expect((await __testing.getDb().documents.get('scene-state'))?.doc).toMatchObject({
			extra: { label: 'changed' },
		});
	});
});
