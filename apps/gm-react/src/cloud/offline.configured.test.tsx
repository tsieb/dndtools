// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';

/**
 * RC-PLT-2.4 — the configured-cloud half of "every cloud-only control shows the offline state".
 *
 * The Playwright server blanks every `VITE_*` cloud coordinate on purpose, and
 * `tests/e2e/isolation-guard.spec.ts` asserts it stays that way — no e2e run may reach Cognito or
 * app-api. So a signed-in, cloud-configured screen is unreachable from e2e by design, and the
 * offline state of its controls has to be proved here instead. That is the split
 * `Discover.test.tsx` and `WikiReader.test.tsx` already use for the same reason.
 *
 * What this asserts, per screen: with the cloud configured, an account signed in, and the browser
 * offline, every cloud-only control carries `data-cloud-offline` and `aria-disabled`, and the panel
 * explains why in prose. `aria-disabled` rather than `disabled` is the point — the control stays in
 * the tab order so its reason is reachable (see `cloud/offline.tsx`).
 */

vi.mock('../cloud/config', () => ({
	isAccountApiConfigured: true,
	isAuthConfigured: true,
	isSyncConfigured: true,
	isCloudConfigured: true,
	isPublicAppConfigured: false,
	isFeatureEnabled: () => false,
	cloudConfig: { stage: 'dev', appApiUrl: 'https://api.invalid/v1' },
}));

vi.mock('../cloud/AuthContext', () => ({
	useAuth: () => ({ status: 'signed-in', openAuthModal: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('../cloud/appApi', () => ({
	getProfile: vi.fn(async () => ({
		displayName: 'A DM',
		email: 'dm@example.invalid',
		createdAt: '2026-01-01T00:00:00.000Z',
	})),
	updateProfile: vi.fn(),
	exportAccountData: vi.fn(),
	deleteAccount: vi.fn(),
	listDevices: vi.fn(async () => [
		{ deviceKey: 'd1', name: 'Chrome on Linux', lastSeen: '2026-01-02T00:00:00.000Z' },
	]),
	revokeDevice: vi.fn(),
	revokeAllSessions: vi.fn(),
}));

vi.mock('../cloud/cloudSync', () => ({ forgetCloudSyncAccount: vi.fn() }));

vi.mock('../cloud/CloudSyncContext', () => ({
	useCloudSync: () => ({
		available: true,
		enabled: true,
		includedInPlan: true,
		gate: { canEnableOnThisDevice: true, custodyAvailable: true },
		engineStatus: { busy: false, lastError: null, lastSyncedAt: null, merge: null },
		accountId: 'acct-1',
		syncNow: vi.fn(),
		restore: vi.fn(),
		enable: vi.fn(),
		disable: vi.fn(),
		refresh: vi.fn(),
	}),
}));

vi.mock('../cloud/entitlements', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../cloud/entitlements')>();
	return {
		...actual,
		useEntitlements: () => ({
			plan: 'free',
			loading: false,
			canChangePlan: true,
			serverBacked: true,
			simulated: false,
			billing: null,
			features: [],
			setPlan: vi.fn(),
		}),
	};
});

vi.mock('../runtime/RuntimeContext', () => ({
	useRuntime: () => ({
		defaultActorId: 'dm',
		dispatch: vi.fn(),
		reloadFromStorage: vi.fn(),
		runExclusiveMaintenance: vi.fn(),
		state: {
			sync: { operations: [] },
			// SyncConflictsPanel runs a core query against these on mount.
			permissions: { actors: { dm: { id: 'dm', role: 'dm', displayName: 'A DM' } } },
			content: { items: {} },
		},
	}),
}));

const { SettingsSync } = await import('../screens/settings/Sync');
const { SettingsAccount } = await import('../screens/settings/Account');

let root: Root;
let container: HTMLDivElement;

/** Drive the browser offline the way the app hears about it: the property plus the event. */
async function goOffline() {
	Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
	await act(async () => {
		window.dispatchEvent(new Event('offline'));
	});
}

async function goOnline() {
	Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
	await act(async () => {
		window.dispatchEvent(new Event('online'));
	});
}

async function mount(node: React.ReactNode) {
	await act(async () => {
		root.render(<I18nProvider>{node}</I18nProvider>);
	});
}

/** Controls wearing the gate, by their accessible text. */
function gatedLabels(): string[] {
	return [...container.querySelectorAll('[data-cloud-offline="true"]')].map((el) =>
		(el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
	);
}

describe('RC-PLT-2.4 configured cloud surfaces show the offline state', () => {
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(async () => {
		await goOnline();
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it('Settings › Sync gates the cloud controls and leaves the local ones alone', async () => {
		await mount(<SettingsSync />);
		// Online first: the gate must contribute NOTHING, or it would be dimming live controls.
		expect(gatedLabels()).toEqual([]);

		await goOffline();
		const gated = gatedLabels();
		// The complete set, not a spot check: an ungated cloud control would leave this list short,
		// and an over-eager gate on a local control would make it long.
		expect(gated.sort()).toEqual([
			'End-to-end encrypted cloud backup',
			'Restore this device',
			'Sync now',
		]);

		// Local backup writes a file from the local vault, so it must stay live offline.
		expect(gated).not.toContain('Download backup');
		expect(gated).not.toContain('Restore from file');

		// Soft-disabled, never natively disabled — otherwise the reason leaves the tab order.
		for (const el of container.querySelectorAll('[data-cloud-offline="true"]')) {
			expect(el.getAttribute('aria-disabled')).toBe('true');
			expect((el as HTMLButtonElement).disabled).toBe(false);
			expect(el.getAttribute('title')).toMatch(/offline/i);
		}

		// And the panel says once, in prose, that the vault itself is fine.
		const notice = container.querySelector('[role="status"][data-cloud-offline-notice="true"]');
		expect(notice?.textContent).toMatch(/vault keeps working/i);
	});

	it('Settings › Account gates profile, export and deletion', async () => {
		await mount(<SettingsAccount />);
		expect(gatedLabels()).toEqual([]);

		await goOffline();
		expect(gatedLabels().sort()).toEqual([
			'Delete account',
			'Download account record',
			'Forget',
			'Sign out everywhere',
		]);
		for (const el of container.querySelectorAll('[data-cloud-offline="true"]')) {
			expect(el.getAttribute('aria-disabled')).toBe('true');
			expect(el.getAttribute('title')).toMatch(/offline/i);
		}
	});

	it('restores every control the moment the network returns', async () => {
		await mount(<SettingsSync />);
		await goOffline();
		expect(gatedLabels().length).toBeGreaterThan(0);
		await goOnline();
		expect(gatedLabels()).toEqual([]);
		expect(container.querySelector('[data-cloud-offline-notice="true"]')).toBeNull();
	});
});
