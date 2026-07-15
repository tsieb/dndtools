// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	auth: { current: null as unknown },
	plan: { current: 'lantern' },
	cloudSyncIntent: vi.fn<(accountId: string | null | undefined) => boolean>(() => false),
	getCloudSyncStatus: vi.fn(),
	retryPendingCloudKeyDeletions: vi.fn(async () => ({ removed: 0, remaining: 0 })),
	setCloudSyncEnabled: vi.fn(),
	currentUser: vi.fn(),
	engine: {
		start: vi.fn(),
		stop: vi.fn(),
		syncNow: vi.fn(),
		restoreFromCloud: vi.fn(),
		getStatus: vi.fn(() => ({
			busy: false,
			lastPushedRevision: -1,
			lastSyncedAt: null,
			lastError: null,
		})),
	},
	createSyncEngine: vi.fn(),
}));

vi.mock('../runtime/RuntimeContext', () => ({ useRuntime: () => ({}) }));
vi.mock('./AuthContext', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('./auth', () => ({ currentUser: mocks.currentUser }));
vi.mock('./entitlements', () => ({
	useEntitlements: () => ({ plan: mocks.plan.current }),
}));
vi.mock('./config', () => ({
	isSyncConfigured: true,
	cloudConfig: { syncApiUrl: 'https://sync.example.com/dev' },
}));
vi.mock('./cloudSync', () => ({
	cloudSyncIntent: mocks.cloudSyncIntent,
	getCloudSyncStatus: mocks.getCloudSyncStatus,
	retryPendingCloudKeyDeletions: mocks.retryPendingCloudKeyDeletions,
	setCloudSyncEnabled: mocks.setCloudSyncEnabled,
}));
vi.mock('./syncEngine', () => ({ createSyncEngine: mocks.createSyncEngine }));

import { CloudSyncProvider, useCloudSync } from './CloudSyncContext';

type CloudSyncValue = ReturnType<typeof useCloudSync>;
const OPEN_GATE = {
	gate: { canEnable: true, enabled: true, reasons: [] },
	custodyAvailable: true,
	canEnableOnThisDevice: true,
};

let latest: CloudSyncValue | null = null;
let root: Root;
let container: HTMLDivElement;

function Probe() {
	latest = useCloudSync();
	return null;
}

function current(): CloudSyncValue {
	if (!latest) throw new Error('Cloud sync probe has not rendered.');
	return latest;
}

async function renderProvider() {
	await act(async () => {
		root.render(createElement(CloudSyncProvider, null, createElement(Probe)));
	});
}

function auth(accountId: string | null) {
	return {
		status: accountId ? 'signed-in' : 'signed-out',
		user: accountId ? { sub: accountId, email: `${accountId}@example.com` } : null,
		requireAuth: vi.fn(async () => Boolean(accountId)),
	};
}

beforeEach(() => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.auth.current = auth(null);
	mocks.plan.current = 'lantern';
	mocks.cloudSyncIntent.mockReset().mockReturnValue(false);
	mocks.getCloudSyncStatus.mockReset().mockResolvedValue(OPEN_GATE);
	mocks.retryPendingCloudKeyDeletions.mockReset().mockResolvedValue({ removed: 0, remaining: 0 });
	mocks.setCloudSyncEnabled.mockReset().mockResolvedValue(OPEN_GATE);
	mocks.currentUser.mockReset();
	mocks.engine.start.mockReset();
	mocks.engine.stop.mockReset();
	mocks.engine.syncNow.mockReset();
	mocks.engine.restoreFromCloud.mockReset();
	mocks.engine.getStatus.mockClear();
	mocks.createSyncEngine.mockReset().mockReturnValue(mocks.engine);
	latest = null;
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('manual backup behavior', () => {
	it('rejects syncNow when no engine is active', async () => {
		await renderProvider();

		await expect(current().syncNow()).rejects.toThrow(/not active/i);
	});

	it('propagates the active engine syncNow failure', async () => {
		mocks.auth.current = auth('account-a');
		mocks.cloudSyncIntent.mockImplementation((accountId) => accountId === 'account-a');
		mocks.engine.syncNow.mockRejectedValueOnce(new Error('manual backup failed'));
		await renderProvider();

		expect(mocks.createSyncEngine).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 'account-a' }),
		);
		await expect(current().syncNow()).rejects.toThrow('manual backup failed');
	});

	it('stops account A engine and stays disabled when switching to account B', async () => {
		mocks.auth.current = auth('account-a');
		mocks.cloudSyncIntent.mockImplementation((accountId) => accountId === 'account-a');
		await renderProvider();
		expect(current().enabled).toBe(true);

		mocks.auth.current = auth('account-b');
		await renderProvider();

		expect(mocks.engine.stop).toHaveBeenCalled();
		expect(current().enabled).toBe(false);
		await expect(current().syncNow()).rejects.toThrow(/not active/i);
	});
});
