import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	VaultBackupValidationError,
	base64ToBytes,
	bytesToBase64,
	exportFullVault,
	importFullVault,
	validateVaultBackup,
} from './backup';
import { getAssetBytes, putAssetBytes } from './storage/assetStore';
import { __testing, loadCoreState } from './storage/coreStore';

function bytesOf(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

beforeEach(() => {
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	await __testing.closeDb();
});

describe('base64 codec', () => {
	it('round-trips arbitrary bytes, including multi-chunk buffers', () => {
		const big = new Uint8Array(70_000).map((_, i) => i % 251);
		expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
		const empty = new Uint8Array(0);
		expect(base64ToBytes(bytesToBase64(empty))).toEqual(empty);
	});
});

describe('whole-vault backup round trip', () => {
	it('export → wipe → import restores state documents and asset bytes', async () => {
		// Seed a raw scene document + an op (bypassing the command guard, test-only) and a blob.
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: { s1: { id: 's1', name: 'The Sunken Crypt' } },
			schemaVersion: 1,
		});
		const assetId = await putAssetBytes(bytesOf('ambient-tavern-loop'), 'audio/mpeg');

		const backup = await exportFullVault();
		expect(backup.assets).toHaveLength(1);

		// Simulate moving to a fresh device: new IndexedDB universe entirely.
		await __testing.closeDb();
		const factory = new IDBFactory();
		globalThis.indexedDB = factory;
		Dexie.dependencies.indexedDB = factory;

		const validated = validateVaultBackup(JSON.parse(JSON.stringify(backup)));
		const result = await importFullVault(validated);
		expect(result.restoredAssets).toBe(1);
		expect(result.skippedAssets).toBe(0);

		const slice = await loadCoreState();
		expect(slice.scenes.scenes).toHaveProperty('s1');
		const blob = await getAssetBytes(assetId);
		expect(blob).not.toBeNull();
		expect(new TextDecoder().decode(await blob!.arrayBuffer())).toBe('ambient-tavern-loop');
	});
});

describe('backup validation (fail closed)', () => {
	it('rejects non-backup JSON, wrong format, future versions, and missing slices', async () => {
		expect(() => validateVaultBackup(null)).toThrow(VaultBackupValidationError);
		expect(() => validateVaultBackup({ format: 'something-else' })).toThrow(
			VaultBackupValidationError,
		);
		const real = await exportFullVault();
		expect(() => validateVaultBackup({ ...real, version: 999 })).toThrow(/newer/);
		const { characters: _dropped, ...partialSlice } = real.slice;
		expect(() => validateVaultBackup({ ...real, slice: partialSlice })).toThrow(/characters/);
		expect(() =>
			validateVaultBackup({ ...real, assets: [{ id: 'x', mime: 3, base64: 'AA==' }] }),
		).toThrow(/malformed asset/);
	});

	it('a corrupt asset entry skips without aborting the restore', async () => {
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: {},
			schemaVersion: 1,
		});
		const backup = await exportFullVault();
		backup.assets.push({ id: 'fnv1a64-bogus', mime: 'audio/mpeg', base64: '' });
		const result = await importFullVault(backup);
		expect(result.skippedAssets).toBe(1);
	});
});
