import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MAX_ASSET_BLOB_BYTES, assetId, hashAssetBytes } from '@dndtools/core';
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
	resetCoreStorage,
	restoreCoreState,
} from './coreStore';

function bytesOf(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

async function blobText(blob: Blob | null): Promise<string | null> {
	if (!blob) return null;
	return new TextDecoder().decode(await blob.arrayBuffer());
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
		expect(usage.totalBytes).toBe(bytesOf('asset a').byteLength + bytesOf('asset b — longer content').byteLength);
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
	it('restoreCoreState preserves asset bytes (cloud snapshots carry metadata only)', async () => {
		const id = await putAssetBytes(bytesOf('survives a cloud restore'), 'image/png');
		const slice = await loadCoreState();
		await restoreCoreState(slice);
		expect(await blobText(await getAssetBytes(id))).toBe('survives a cloud restore');
	});

	it('resetCoreStorage wipes asset bytes (start-fresh is a true wipe)', async () => {
		const id = await putAssetBytes(bytesOf('gone on fresh start'), 'image/png');
		await resetCoreStorage();
		expect(await getAssetBytes(id)).toBeNull();
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
		await legacy
			.table('documents')
			.put({ key: __testing.SCENE_STATE_KEY, doc: { scenes: { s1: { id: 's1' } }, schemaVersion: 1 } });
		await legacy.table('operations').put({
			id: 'op-1',
			sequence: 0,
			op: { id: 'op-1', opType: 'scene.create', schemaVersion: 1 },
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
