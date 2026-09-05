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
import { DND5E_SYSTEM_PACKAGE_ID } from '@dndtools/core';
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
		expect(() => validateVaultBackup({ ...real, version: 999 })).toThrow(/not supported/);
		const { characters: _dropped, ...partialSlice } = real.slice;
		expect(() => validateVaultBackup({ ...real, slice: partialSlice })).toThrow(/characters/);
		expect(() =>
			validateVaultBackup({ ...real, assets: [{ id: 'x', mime: 3, base64: 'AA==' }] }),
		).toThrow(/malformed.*asset/);
	});

	it('RC-SYS-1.1: accepts a released backup with no systems slice and hydrates the 5e default', async () => {
		const real = await exportFullVault();
		const released = JSON.parse(JSON.stringify(real)) as Record<string, unknown>;
		const slice = released.slice as Record<string, unknown>;
		delete slice.systems;

		const validated = validateVaultBackup(released);
		expect(validated.slice.systems.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
		expect(validated.slice.systems.packages[DND5E_SYSTEM_PACKAGE_ID]).toBeDefined();
	});

	it('RC-SYS-1.1: rejects a backup whose systems slice is malformed', async () => {
		const real = await exportFullVault();
		const corrupt = JSON.parse(JSON.stringify(real)) as Record<string, unknown>;
		(corrupt.slice as Record<string, unknown>).systems = { packages: {}, schemaVersion: 99 };
		expect(() => validateVaultBackup(corrupt)).toThrow(/systems schema is unsupported/);
	});

	it('accepts the released v1 derived sync field but normalizes it out', async () => {
		const real = await exportFullVault();
		const releasedV1 = JSON.parse(JSON.stringify(real)) as Record<string, unknown>;
		const slice = releasedV1.slice as Record<string, unknown>;
		(slice.sync as Record<string, unknown>).idempotencyKeys = {};

		const validated = validateVaultBackup(releasedV1);
		expect(Object.keys(validated.slice.sync)).toEqual(['operations']);
	});

	it('rejects corrupt media before changing state or existing asset bytes', async () => {
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: { sentinel: { id: 'sentinel' } },
			schemaVersion: 1,
		});
		const existingId = await putAssetBytes(bytesOf('keep-current-vault'), 'text/plain');
		const backup = await exportFullVault();
		backup.assets[0]!.base64 = bytesToBase64(bytesOf('different-bytes'));

		await expect(importFullVault(backup)).rejects.toThrow(/does not match/i);
		expect((await loadCoreState()).scenes.scenes).toHaveProperty('sentinel');
		expect(await getAssetBytes(existingId)).not.toBeNull();
	});
});

describe('authoritative asset replacement', () => {
	it('removes blobs that are not present in the restored backup', async () => {
		const restoredId = await putAssetBytes(bytesOf('belongs-to-backup'), 'text/plain');
		const backup = await exportFullVault();
		const priorOnlyId = await putAssetBytes(bytesOf('belongs-to-current-vault'), 'text/plain');

		await importFullVault(backup);

		expect(await getAssetBytes(restoredId)).not.toBeNull();
		expect(await getAssetBytes(priorOnlyId)).toBeNull();
	});
});
