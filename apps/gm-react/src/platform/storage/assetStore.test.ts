import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	MAX_ASSET_BLOB_BYTES,
	TARGET_SCHEMA_VERSIONS,
	assetId,
	beginMigration,
	hashAssetBytes,
	markCommitting,
	type DurableStateDocumentId,
} from '@dndtools/core';
import {
	AssetByteLimitError,
	assetUsage,
	collectGarbage,
	deleteAssetBytes,
	getAssetBytes,
	hasAssetBytes,
	listAssetBytes,
	putAssetBytes,
	storageEstimate,
} from './assetStore';
import {
	PlatformBoundaryRejectionError,
	__testing,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
	restoreCoreState,
	validateRestoredCoreState,
	writeMigrationJournal,
} from './coreStore';

function bytesOf(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

async function blobText(blob: Blob | null): Promise<string | null> {
	if (!blob) return null;
	return new TextDecoder().decode(await blob.arrayBuffer());
}

function cloudSnapshot(slice: Awaited<ReturnType<typeof loadCoreState>>) {
	return {
		scenes: slice.scenes,
		maps: slice.maps,
		permissions: slice.permissions,
		session: slice.session,
		widgets: slice.widgets,
		commandCenter: slice.commandCenter,
		characters: slice.characters,
		content: slice.content,
		encounters: slice.encounters,
		audio: slice.audio,
		mcp: slice.mcp,
		sync: { operations: slice.sync.operations },
	};
}

beforeEach(() => {
	// A fresh IndexedDB universe per test: no cross-test blob leakage. Dexie captures its
	// indexedDB reference in Dexie.dependencies at import time, so the override must go there,
	// not (only) on globalThis.
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	await __testing.closeDb();
});

describe('assetStore put/get round trip', () => {
	it('stores bytes and resolves them back as a typed Blob under the content hash', async () => {
		const bytes = bytesOf('the tavern hums with candle light');
		const id = await putAssetBytes(bytes, 'text/plain');
		expect(id).toBe(assetId(hashAssetBytes(bytes)));
		const blob = await getAssetBytes(id);
		expect(blob?.type).toBe('text/plain');
		expect(await blobText(blob)).toBe('the tavern hums with candle light');
		expect(await hasAssetBytes(id)).toBe(true);
	});

	it('dedupes identical bytes to one record with the same id', async () => {
		const bytes = bytesOf('same content twice');
		const first = await putAssetBytes(bytes, 'text/plain');
		const second = await putAssetBytes(bytesOf('same content twice'), 'text/plain');
		expect(second).toBe(first);
		expect((await assetUsage()).count).toBe(1);
	});

	it('returns null for absent bytes (honest miss, never a throw)', async () => {
		expect(await getAssetBytes('fnv1a64-does-not-exist')).toBeNull();
		expect(await hasAssetBytes('fnv1a64-does-not-exist')).toBe(false);
	});

	it('does not alias the caller buffer: later mutation cannot corrupt the stored record', async () => {
		const bytes = bytesOf('immutable once stored');
		const id = await putAssetBytes(bytes, 'text/plain');
		bytes.fill(0);
		expect(await blobText(await getAssetBytes(id))).toBe('immutable once stored');
	});
});

describe('assetStore limits and boundary', () => {
	it('rejects empty and over-limit buffers fail-closed', async () => {
		await expect(putAssetBytes(new Uint8Array(0), 'application/octet-stream')).rejects.toThrow(
			AssetByteLimitError,
		);
		// A sparse over-limit Uint8Array allocates real memory; assert via the size gate instead
		// of allocating 32 MiB: byteLength check happens before any hashing or IO.
		const over = { byteLength: MAX_ASSET_BLOB_BYTES + 1 } as Uint8Array;
		await expect(putAssetBytes(over, 'application/octet-stream')).rejects.toThrow(
			AssetByteLimitError,
		);
	});

	it('rejects a malformed descriptor at the platform boundary (unknown/empty id)', async () => {
		await expect(getAssetBytes('')).rejects.toThrow(PlatformBoundaryRejectionError);
		await expect(deleteAssetBytes('')).rejects.toThrow(PlatformBoundaryRejectionError);
	});

	it('reports a null estimate gracefully where navigator.storage is unavailable', async () => {
		const estimate = await storageEstimate();
		expect(estimate.nearCapacity).toBe(false);
	});
});

describe('assetStore deletion, usage, and garbage collection', () => {
	it('deletes bytes and reflects usage totals', async () => {
		const a = await putAssetBytes(bytesOf('asset a'), 'text/plain');
		const b = await putAssetBytes(bytesOf('asset b — longer content'), 'text/plain');
		const usage = await assetUsage();
		expect(usage.count).toBe(2);
		expect(usage.totalBytes).toBe(
			bytesOf('asset a').byteLength + bytesOf('asset b — longer content').byteLength,
		);
		await deleteAssetBytes(a);
		expect(await getAssetBytes(a)).toBeNull();
		expect(await getAssetBytes(b)).not.toBeNull();
		expect((await assetUsage()).count).toBe(1);
	});

	it('collectGarbage removes only unreferenced blobs and reports freed bytes', async () => {
		const kept = await putAssetBytes(bytesOf('referenced by a map'), 'image/png');
		const orphan = await putAssetBytes(bytesOf('orphaned after delete'), 'image/png');
		const result = await collectGarbage(new Set([kept]));
		expect(result.removed).toBe(1);
		expect(result.freedBytes).toBe(bytesOf('orphaned after delete').byteLength);
		expect(await hasAssetBytes(kept)).toBe(true);
		expect(await hasAssetBytes(orphan)).toBe(false);
	});

	it('lists all blobs for whole-vault backup export', async () => {
		await putAssetBytes(bytesOf('one'), 'text/plain');
		await putAssetBytes(bytesOf('two'), 'audio/mpeg');
		const listed = await listAssetBytes();
		expect(listed).toHaveLength(2);
		expect(new Set(listed.map((e) => e.mime))).toEqual(new Set(['text/plain', 'audio/mpeg']));
	});
});

describe('lifecycle semantics with core state', () => {
	it('rolls back every document and operation when a normal command persist fails', async () => {
		const before = await loadCoreState();
		const operation = {
			id: 'op-atomic-save',
			vaultId: 'local-default',
			sourceId: 'test-device',
			actorId: 'actor-dm',
			entityType: 'scene',
			entityId: 'scene-bad',
			opType: 'scene.create',
			dependencies: [],
			issuedAt: '2026-07-14T00:00:00.000Z',
			schemaVersion: 1 as const,
		};
		const next = structuredClone({
			...before,
			sync: {
				operations: [...before.sync.operations, operation],
				idempotencyKeys: new Set<string>(),
			},
		});
		(next.scenes.scenes as Record<string, unknown>).uncloneable = {
			id: 'scene-bad',
			render: () => 'functions cannot enter IndexedDB',
		};

		await expect(persistFullState(before, next)).rejects.toThrow();
		const after = await loadCoreState();
		expect(after.scenes.scenes).not.toHaveProperty('uncloneable');
		expect(after.sync.operations).toHaveLength(before.sync.operations.length);
	});

	it('restoreCoreState preserves asset bytes (cloud snapshots carry metadata only)', async () => {
		const id = await putAssetBytes(bytesOf('survives a cloud restore'), 'image/png');
		const slice = await loadCoreState();
		await restoreCoreState(cloudSnapshot(slice));
		expect(await blobText(await getAssetBytes(id))).toBe('survives a cloud restore');
	});

	it('rejects an unexpected ephemeral slice before changing the current campaign', async () => {
		const current = await loadCoreState();
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			...current.scenes,
			scenes: { sentinel: { id: 'sentinel' } },
		});
		const before = await loadCoreState();
		const candidate = { ...cloudSnapshot(before), presence: { peers: ['untrusted'] } };

		expect(() => validateRestoredCoreState(candidate)).toThrow(/unexpected state shape/i);
		await expect(restoreCoreState(candidate)).rejects.toThrow(/local campaign was not changed/i);
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('sentinel');
	});

	it('rejects state that would fail startup hydration before replacing the current campaign', async () => {
		const current = await loadCoreState();
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			...current.scenes,
			scenes: { sentinel: { id: 'sentinel' } },
		});
		const before = await loadCoreState();
		const candidate = structuredClone(cloudSnapshot(before));
		candidate.scenes.scenes = {
			mismatched: { id: 'different-id' },
		} as unknown as typeof candidate.scenes.scenes;

		await expect(restoreCoreState(candidate)).rejects.toThrow(/scenes data is invalid/i);
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('sentinel');
	});

	it('rolls back the storage transaction if an accepted-shape document cannot be cloned', async () => {
		const current = await loadCoreState();
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			...current.scenes,
			scenes: { sentinel: { id: 'sentinel' } },
		});
		const before = await loadCoreState();
		const candidate = structuredClone(cloudSnapshot(before));
		(candidate.scenes.scenes as Record<string, unknown>).uncloneable = {
			id: 'uncloneable',
			render: () => 'not structured-cloneable',
		};

		await expect(restoreCoreState(candidate)).rejects.toThrow();
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('sentinel');
	});

	it('resetCoreStorage wipes asset bytes (start-fresh is a true wipe)', async () => {
		const id = await putAssetBytes(bytesOf('gone on fresh start'), 'image/png');
		await resetCoreStorage();
		expect(await getAssetBytes(id)).toBeNull();
	});
});

describe('fail-closed persisted-state hydration', () => {
	it('refuses a document written by a newer app instead of silently downgrading it', async () => {
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: {},
			schemaVersion: 999,
		});

		await expect(loadCoreState()).rejects.toThrow(/newer app version/i);
	});

	it('refuses a damaged document instead of partially loading the vault', async () => {
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, { scenes: {} });

		await expect(loadCoreState()).rejects.toThrow(/state is damaged/i);
	});

	it('refuses malformed operation history instead of dropping the invalid entry', async () => {
		await __testing.putRawOperation('op-corrupt', 0, {
			id: 'op-corrupt',
			opType: 'scene.create',
			schemaVersion: 1,
		});

		await expect(loadCoreState()).rejects.toThrow(/operation history is damaged/i);
	});
});

describe('crash-safe migration recovery', () => {
	function recoveryJournal(
		current: Awaited<ReturnType<typeof loadCoreState>>,
		absent: ReadonlySet<DurableStateDocumentId> = new Set(),
	) {
		const fromVersions = Object.fromEntries(
			DURABLE_STATE_DOCUMENT_IDS.map((id) => [
				id,
				absent.has(id) ? null : current[id].schemaVersion,
			]),
		) as Record<DurableStateDocumentId, number | null>;
		const documents = Object.fromEntries(
			DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, absent.has(id) ? undefined : current[id]]),
		) as Record<DurableStateDocumentId, unknown>;
		return markCommitting(
			beginMigration({
				migrationId: 'test-recovery',
				startedAt: '2026-07-14T00:00:00.000Z',
				snapshotId: 'test-snapshot',
				fromVersions,
				targetVersions: { ...TARGET_SCHEMA_VERSIONS },
				documents,
			}),
		);
	}

	it('restores a pre-migration snapshot before hydration and clears the journal atomically', async () => {
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: { before: { id: 'before' } },
			schemaVersion: 1,
		});
		const before = await loadCoreState();
		await writeMigrationJournal(recoveryJournal(before));
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: { partial: { id: 'partial' } },
			schemaVersion: 1,
		});

		const restored = await loadCoreState();
		expect(restored.scenes.scenes).toHaveProperty('before');
		expect(restored.scenes.scenes).not.toHaveProperty('partial');
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('before');
	});

	it('restores an absent legacy slice as absence rather than a damaged undefined record', async () => {
		const before = await loadCoreState();
		await writeMigrationJournal(recoveryJournal(before, new Set(['maps'])));
		await __testing.putRawDocument(__testing.MAP_STATE_KEY, {
			maps: { partial: { id: 'partial' } },
			assets: {},
			schemaVersion: 1,
		});

		const restored = await loadCoreState();
		expect(restored.maps.maps).not.toHaveProperty('partial');
		expect(restored.maps.schemaVersion).toBe(TARGET_SCHEMA_VERSIONS.maps);
	});

	it('does not overwrite current documents from a damaged recovery snapshot', async () => {
		const before = await loadCoreState();
		const validJournal = recoveryJournal(before);
		await writeMigrationJournal({
			...validJournal,
			snapshot: {
				...validJournal.snapshot,
				documents: { ...validJournal.snapshot.documents, scenes: { schemaVersion: 1 } },
			},
		});
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: { current: { id: 'current' } },
			schemaVersion: 1,
		});

		await expect(loadCoreState()).rejects.toThrow(/stored scenes state is damaged/i);
		// Change only the phase so the next load clears the journal without consulting its bad
		// snapshot; the current document proves the failed recovery never wrote over it.
		await writeMigrationJournal({ ...validJournal, phase: 'pending' });
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('current');
	});
});

describe('Dexie v2 → v3 upgrade', () => {
	it('preserves existing documents and operations when the assetBlobs table is added', async () => {
		// Simulate a vault written by the shipped v2 schema (documents/operations/migrationJournal
		// only), then open it through the current adapter and prove nothing was rewritten.
		const legacy = new Dexie(__testing.DB_NAME);
		legacy.version(2).stores({
			documents: '&key',
			operations: '&id, sequence',
			migrationJournal: '&key',
		});
		await legacy.table('documents').put({
			key: __testing.SCENE_STATE_KEY,
			doc: { scenes: { s1: { id: 's1' } }, schemaVersion: 1 },
		});
		await legacy.table('operations').put({
			id: 'op-1',
			sequence: 0,
			op: {
				id: 'op-1',
				vaultId: 'local-default',
				sourceId: 'legacy-device',
				actorId: 'actor-dm',
				entityType: 'scene',
				entityId: 's1',
				opType: 'scene.create',
				dependencies: [],
				issuedAt: '2026-07-14T00:00:00.000Z',
				schemaVersion: 1,
			},
		});
		legacy.close();

		const slice = await loadCoreState();
		expect(slice.scenes.scenes).toHaveProperty('s1');
		expect(slice.sync.operations).toHaveLength(1);
		// And the new table is immediately usable in the upgraded database.
		const id = await putAssetBytes(bytesOf('first blob after upgrade'), 'image/png');
		expect(await hasAssetBytes(id)).toBe(true);
	});
});
