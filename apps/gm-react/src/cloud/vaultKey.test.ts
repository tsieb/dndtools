import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVaultKeyring, type VaultArtifactContext } from '@dndtools/core';

const mocks = vi.hoisted(() => {
	const values = new Map<string, string>();
	return {
		values,
		store: {
			available: vi.fn(async () => true),
			get: vi.fn(async (key: string) => values.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => {
				values.set(key, value);
				return true;
			}),
			remove: vi.fn(async (key: string) => {
				values.delete(key);
				return true;
			}),
			keys: vi.fn(async () => [...values.keys()]),
		},
	};
});

vi.mock('./secureStore', () => ({ durableSecretStore: mocks.store }));

import { __testing, vaultKeyManager } from './vaultKey';

const context = (accountId: string): VaultArtifactContext => ({
	accountId,
	vaultId: 'primary',
	kind: 'snapshot',
	revision: 4,
});

beforeEach(() => {
	mocks.values.clear();
	vi.clearAllMocks();
	__testing.clearCache();
});

describe('account-scoped vault-key custody', () => {
	it('uses independent durable keyrings for two Cognito accounts sharing one install', async () => {
		const envelopeA = await vaultKeyManager.encrypt(context('account-a'), { owner: 'a' });
		const envelopeB = await vaultKeyManager.encrypt(context('account-b'), { owner: 'b' });
		const scoped = [...mocks.values.entries()].filter(([key]) => key.startsWith('vaultkey:v2:'));

		expect(scoped).toHaveLength(2);
		expect(scoped[0]?.[1]).not.toBe(scoped[1]?.[1]);
		expect(await vaultKeyManager.decrypt(context('account-a'), envelopeA)).toEqual({ owner: 'a' });
		expect(await vaultKeyManager.decrypt(context('account-b'), envelopeB)).toEqual({ owner: 'b' });
		await expect(vaultKeyManager.decrypt(context('account-b'), envelopeA)).rejects.toThrow();
	});

	it('claims a released unscoped key for one account only', async () => {
		const legacy = createVaultKeyring();
		mocks.values.set('vaultkey:primary', JSON.stringify(legacy));

		await vaultKeyManager.encrypt(context('account-a'), { migrated: true });
		await vaultKeyManager.encrypt(context('account-b'), { fresh: true });

		const keyA = await __testing.scopedStorageKey('account-a', 'primary');
		const keyB = await __testing.scopedStorageKey('account-b', 'primary');
		expect(JSON.parse(mocks.values.get(keyA) ?? '')).toEqual(legacy);
		expect(JSON.parse(mocks.values.get(keyB) ?? '')).not.toEqual(legacy);
		const claims = [...mocks.values.entries()].filter(([key]) =>
			key.startsWith('vaultkey:legacy-claim:'),
		);
		expect(claims).toEqual([[expect.any(String), keyA]]);
	});

	it('does not overwrite a damaged durable keyring with a fresh key', async () => {
		const storageKey = await __testing.scopedStorageKey('account-a', 'primary');
		mocks.values.set(storageKey, '{"currentEpoch":0,"keys":{}}');

		await expect(vaultKeyManager.encrypt(context('account-a'), { unsafe: true })).rejects.toThrow(
			/damaged|invalid/i,
		);
		expect(mocks.values.get(storageKey)).toBe('{"currentEpoch":0,"keys":{}}');
	});

	it('forgets both a scoped key and the legacy key it claimed', async () => {
		mocks.values.set('vaultkey:primary', JSON.stringify(createVaultKeyring()));
		await vaultKeyManager.encrypt(context('account-a'), { migrated: true });
		const storageKey = await __testing.scopedStorageKey('account-a', 'primary');

		await vaultKeyManager.forget('account-a', 'primary');

		expect(mocks.values.has(storageKey)).toBe(false);
		expect(mocks.values.has('vaultkey:primary')).toBe(false);
		expect([...mocks.values.keys()].some((key) => key.startsWith('vaultkey:legacy-claim:'))).toBe(
			false,
		);
		await expect(
			vaultKeyManager.encrypt(context('account-a'), { mustNotRecreate: true }),
		).rejects.toThrow(/deleted account/i);
		expect(mocks.values.has(storageKey)).toBe(false);
	});

	it('serializes concurrent rotations so each revocation gets a distinct epoch', async () => {
		await vaultKeyManager.encrypt(context('account-a'), { before: true });
		await Promise.all([
			vaultKeyManager.rotate('account-a', 'primary', {
				participantActorId: 'actor-one',
				joinedAtEpoch: 0,
				revokedAtEpoch: null,
			}),
			vaultKeyManager.rotate('account-a', 'primary', {
				participantActorId: 'actor-two',
				joinedAtEpoch: 0,
				revokedAtEpoch: null,
			}),
		]);

		const storageKey = await __testing.scopedStorageKey('account-a', 'primary');
		const persisted = JSON.parse(mocks.values.get(storageKey) ?? '');
		expect(persisted.currentEpoch).toBe(2);
		expect(Object.keys(persisted.keys)).toEqual(['0', '1', '2']);
	});
});
