// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETA_FEEDBACK_URL } from './desktopFeedback';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function desktop() {
	vi.stubGlobal('dndtoolsWindow', {});
	vi.resetModules();
	return import('./capabilities');
}

describe('Electron external URL adapter', () => {
	it('routes the feedback URL to the desktop bridge without window.open', async () => {
		const open = vi.fn(async () => true);
		vi.stubGlobal('dndtoolsFeedback', { open });
		const browserOpen = vi.fn();
		vi.stubGlobal('open', browserOpen);
		const adapter = await desktop();
		expect(adapter.platformCapabilities.runtimeKind).toBe('electron');
		expect(await adapter.openExternalUrl(BETA_FEEDBACK_URL)).toBe(true);
		expect(open).toHaveBeenCalledExactlyOnceWith();
		expect(browserOpen).not.toHaveBeenCalled();
	});

	it('denies arbitrary destinations and URL additions before invoking the bridge', async () => {
		const open = vi.fn(async () => true);
		vi.stubGlobal('dndtoolsFeedback', { open });
		const adapter = await desktop();
		for (const url of [
			'https://example.com',
			`${BETA_FEEDBACK_URL}&data=secret`,
			`${BETA_FEEDBACK_URL}#secret`,
			'file:///tmp/test',
			'invalid',
		]) {
			expect(await adapter.openExternalUrl(url)).toBe(false);
		}
		expect(open).not.toHaveBeenCalled();
	});

	it('fails closed when the bridge is absent, cancelled, or rejects', async () => {
		const adapter = await desktop();
		vi.stubGlobal('dndtoolsFeedback', undefined);
		expect(await adapter.openExternalUrl(BETA_FEEDBACK_URL)).toBe(false);
		vi.stubGlobal('dndtoolsFeedback', { open: async () => false });
		expect(await adapter.openExternalUrl(BETA_FEEDBACK_URL)).toBe(false);
		vi.stubGlobal('dndtoolsFeedback', {
			open: async () => {
				throw new Error('IPC failed');
			},
		});
		expect(await adapter.openExternalUrl(BETA_FEEDBACK_URL)).toBe(false);
	});
});
