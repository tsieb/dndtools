import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
