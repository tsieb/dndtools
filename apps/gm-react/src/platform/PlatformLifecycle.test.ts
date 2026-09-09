import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	navigateToShortcut,
	refreshPlatformState,
	registerPlatformStateRefresh,
	resetPlatformStateRefreshHandlersForTest,
} from './PlatformLifecycle';

afterEach(resetPlatformStateRefreshHandlersForTest);

describe('native resume refresh registry', () => {
	it('refreshes every registered state adapter and isolates adapter failures', async () => {
		const vault = vi.fn(async () => {});
		const unavailableOptionalAdapter = vi.fn(async () => {
			throw new Error('offline');
		});
		registerPlatformStateRefresh(vault);
		registerPlatformStateRefresh(unavailableOptionalAdapter);

		await expect(refreshPlatformState()).resolves.toBeUndefined();
		expect(vault).toHaveBeenCalledTimes(1);
		expect(unavailableOptionalAdapter).toHaveBeenCalledTimes(1);
	});

	it('coalesces App resume and active-state events into one in-flight refresh', async () => {
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const vault = vi.fn(() => waiting);
		registerPlatformStateRefresh(vault);

		const resume = refreshPlatformState();
		const active = refreshPlatformState();
		expect(vault).toHaveBeenCalledTimes(1);
		release();
		await Promise.all([resume, active]);
	});
});


describe('home-screen shortcut navigation (RC-PLT-2.2)', () => {
	it('leaves the root directly beneath the shortcut, so one Back reaches it', () => {
		const navigate = vi.fn();
		// Tapped from somewhere deep in the app: the current entry becomes the root, and the
		// destination goes on top of it.
		navigateToShortcut(navigate as never, '/session', '/settings/players');
		expect(navigate.mock.calls).toEqual([['/', { replace: true }], ['/session']]);
	});

	it('does not stack a second root when the shortcut is tapped from the root', () => {
		const navigate = vi.fn();
		navigateToShortcut(navigate as never, '/play', '/');
		expect(navigate.mock.calls).toEqual([['/play']]);
	});

	it('replaces the previous shortcut rather than stacking shortcuts', () => {
		const navigate = vi.fn();
		// Session first, then Play: the second must not leave the first under it, or Back out of
		// Play lands on Session instead of the root.
		navigateToShortcut(navigate as never, '/play', '/session');
		expect(navigate.mock.calls).toEqual([['/', { replace: true }], ['/play']]);
	});
});
