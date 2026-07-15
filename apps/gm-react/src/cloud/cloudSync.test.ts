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
vi.mock('@dndtools/core', () => ({
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

beforeEach(() => {
	window.localStorage.clear();
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
