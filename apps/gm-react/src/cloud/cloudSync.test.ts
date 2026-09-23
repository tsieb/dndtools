// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	custodyAvailable: vi.fn(async () => true),
	forget: vi.fn(async () => undefined),
	hasBridge: true,
}));

vi.mock('./vaultKey', () => ({
	vaultKeyManager: { custodyAvailable: mocks.custodyAvailable, forget: mocks.forget },
}));
vi.mock('./secureStore', () => ({
	get hasDurableSecretStoreBridge() {
		return mocks.hasBridge;
	},
}));
vi.mock('@dndtools/core', async (importOriginal) => ({
	...(await importOriginal<typeof import('@dndtools/core')>()),
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL: {},
	evaluateCloudSyncGate: ({ currentlyEnabled }: { currentlyEnabled: boolean }) => ({
		canEnable: true,
		enabled: currentlyEnabled,
		reasons: [],
	}),
	hasAsciiControlCharacter: (value: string) =>
		Array.from(value).some((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		}),
}));

import {
	cloudSyncIntent,
	forgetCloudSyncAccount,
	getCloudSyncStatus,
	retryPendingCloudKeyDeletions,
	setCloudSyncEnabled,
} from './cloudSync';
import {
	__testing as coreStoreTesting,
	createLocalVault,
	selectLocalVaultForNextLoad,
} from '../platform/storage/coreStore';

beforeEach(() => {
	window.localStorage.clear();
	coreStoreTesting.resetVaultSession();
	mocks.custodyAvailable.mockClear();
	mocks.custodyAvailable.mockResolvedValue(true);
	mocks.forget.mockReset();
	mocks.forget.mockResolvedValue(undefined);
	mocks.hasBridge = true;
});

describe('account-scoped cloud-backup opt-in', () => {
	it('does not carry account A opt-in into account B', async () => {
		await setCloudSyncEnabled(true, 'account-a');

		expect(cloudSyncIntent('account-a')).toBe(true);
		expect(cloudSyncIntent('account-b')).toBe(false);
		expect((await getCloudSyncStatus('account-a')).gate.enabled).toBe(true);
		expect((await getCloudSyncStatus('account-b')).gate.enabled).toBe(false);
		expect(window.localStorage.getItem('dndtools:react:cloud-sync-enabled')).toBeNull();
	});

	it('keeps separately chosen account intents independent', async () => {
		await setCloudSyncEnabled(true, 'account-a');
		await setCloudSyncEnabled(true, 'account-b');
		await setCloudSyncEnabled(false, 'account-a');

		expect(cloudSyncIntent('account-a')).toBe(false);
		expect(cloudSyncIntent('account-b')).toBe(true);
	});

	it('fails closed without an authenticated account namespace', async () => {
		window.localStorage.setItem('dndtools:react:cloud-sync-enabled', 'true');

		expect(cloudSyncIntent(null)).toBe(false);
		expect((await getCloudSyncStatus(null)).gate.enabled).toBe(false);
		await expect(setCloudSyncEnabled(false, '')).rejects.toThrow(/sign in/i);
	});

	it('forgets only the deleted account vault key, opt-in, and push high-water', async () => {
		await setCloudSyncEnabled(true, 'account-a');
		await setCloudSyncEnabled(true, 'account-b');
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev:account-a:primary', '12');
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev:account-b:primary', '8');
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev-v2:account-a:primary', '10');
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev-v2:account-b:primary', '6');

		await forgetCloudSyncAccount('account-a');

		expect(mocks.forget).toHaveBeenCalledWith('account-a', 'primary');
		expect(cloudSyncIntent('account-a')).toBe(false);
		expect(
			window.localStorage.getItem('dndtools:react:cloud-pushed-rev:account-a:primary'),
		).toBeNull();
		expect(
			window.localStorage.getItem('dndtools:react:cloud-pushed-rev-v2:account-a:primary'),
		).toBeNull();
		expect(cloudSyncIntent('account-b')).toBe(true);
		expect(window.localStorage.getItem('dndtools:react:cloud-pushed-rev:account-b:primary')).toBe(
			'8',
		);
		expect(
			window.localStorage.getItem('dndtools:react:cloud-pushed-rev-v2:account-b:primary'),
		).toBe('6');
	});

	it('needs no key deletion in a web build where durable custody never existed', async () => {
		mocks.hasBridge = false;
		mocks.custodyAvailable.mockResolvedValue(false);
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev:account-a:primary', '12');

		await expect(forgetCloudSyncAccount('account-a')).resolves.toBeUndefined();
		expect(mocks.forget).not.toHaveBeenCalled();
		expect(
			window.localStorage.getItem('dndtools:react:cloud-pushed-rev:account-a:primary'),
		).toBeNull();
	});

	it('queues key removal when the desktop credential store is temporarily unavailable', async () => {
		mocks.custodyAvailable.mockResolvedValue(false);

		await expect(forgetCloudSyncAccount('account-a')).rejects.toThrow(/queued/i);
		expect(window.localStorage.getItem('dndtools:react:pending-vault-key-deletions')).toContain(
			'account-a',
		);
		expect(mocks.forget).not.toHaveBeenCalled();
	});

	it('retries a queued key erasure on a later launch and clears its marker', async () => {
		mocks.custodyAvailable.mockResolvedValueOnce(false);
		await expect(forgetCloudSyncAccount('account-a')).rejects.toThrow(/queued/i);
		mocks.custodyAvailable.mockResolvedValue(true);

		await expect(retryPendingCloudKeyDeletions()).resolves.toEqual({ removed: 1, remaining: 0 });
		expect(mocks.forget).toHaveBeenCalledWith('account-a', 'primary');
		expect(window.localStorage.getItem('dndtools:react:pending-vault-key-deletions')).toBeNull();
	});
});

describe('local-vault-scoped cloud backup (RC-UX-5.4)', () => {
	function openInNextDocument(id: string) {
		selectLocalVaultForNextLoad(id);
		coreStoreTesting.resetVaultSession();
	}

	it('keeps the original vault opt-in in place and never carries it into another local vault', async () => {
		await setCloudSyncEnabled(true, 'account-a');
		// Migration in place: the released, pre-switcher key still holds the original vault's opt-in.
		expect(window.localStorage.getItem('dndtools:react:cloud-sync-enabled:account-a')).toBe('true');
		const second = createLocalVault('Mountain');
		openInNextDocument(second.id);

		expect(cloudSyncIntent('account-a')).toBe(false);
		const status = await getCloudSyncStatus('account-a');
		expect(status.vaultSupported).toBe(false);
		expect(status.canEnableOnThisDevice).toBe(false);
		expect(status.gate.enabled).toBe(false);
		// The sync API stores only the original vault, so this vault must not write into its copy.
		await expect(setCloudSyncEnabled(true, 'account-a')).rejects.toThrow(/original campaign vault/);
		expect(cloudSyncIntent('account-a')).toBe(false);

		openInNextDocument('primary');
		expect(cloudSyncIntent('account-a')).toBe(true);
		expect((await getCloudSyncStatus('account-a')).gate.enabled).toBe(true);
	});

	it('fails closed when the document vault cannot be resolved', async () => {
		await setCloudSyncEnabled(true, 'account-a');
		window.localStorage.setItem('dndtools:react:selected-local-vault', 'missing');
		coreStoreTesting.resetVaultSession();

		expect(cloudSyncIntent('account-a')).toBe(false);
		expect((await getCloudSyncStatus('account-a')).canEnableOnThisDevice).toBe(false);
	});

	it('forgets a deleted account in every local vault on the device', async () => {
		const second = createLocalVault('Mountain');
		await forgetCloudSyncAccount('account-a');

		expect(mocks.forget).toHaveBeenCalledWith('account-a', 'primary');
		expect(mocks.forget).toHaveBeenCalledWith('account-a', second.id);
		expect(window.localStorage.getItem('dndtools:react:pending-vault-key-deletions')).toBeNull();
	});
});

describe('the demo vault is never synced (RC-UX-3.7)', () => {
	it('refuses cloud backup in the demo vault, even with an opt-in recorded elsewhere', async () => {
		await setCloudSyncEnabled(true, 'account-a');
		const demo = createLocalVault('Demo campaign', 'demo');
		selectLocalVaultForNextLoad(demo.id);
		coreStoreTesting.resetVaultSession();

		const status = await getCloudSyncStatus('account-a');
		expect(status.vaultSupported).toBe(false);
		expect(status.canEnableOnThisDevice).toBe(false);
		expect(status.gate.enabled).toBe(false);
		await expect(setCloudSyncEnabled(true, 'account-a')).rejects.toThrow(
			/demo campaign is never synced or backed up/,
		);
		expect(cloudSyncIntent('account-a')).toBe(false);
		// Asked about by id from another document, the answer is the same.
		coreStoreTesting.resetVaultSession();
		expect((await getCloudSyncStatus('account-a', demo.id)).vaultSupported).toBe(false);
	});
});
