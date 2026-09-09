import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDesktopUpdatesBridge } from './desktopUpdates';

// The updater lives in the Electron main process (`electron/updater.cjs`), so its pure helpers are
// pulled in through a CommonJS require rather than the app's module graph. `electron-updater`
// itself is required lazily inside the factory, which keeps this import safe under Node.
const requireCjs = createRequire(import.meta.url);
const { plainReleaseNotes, unsupportedReason } = requireCjs('../../electron/updater.cjs') as {
	plainReleaseNotes: (notes: unknown) => string | null;
	unsupportedReason: (app: { isPackaged: boolean }) => string | null;
};

describe('getDesktopUpdatesBridge', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('is null in a browser runtime even if something claims the global', () => {
		vi.stubGlobal('dndtoolsUpdates', { check: () => Promise.resolve(null) });
		expect(getDesktopUpdatesBridge()).toBeNull();
	});
});

describe('plainReleaseNotes', () => {
	it('flattens GitHub HTML into readable plain text', () => {
		const text = plainReleaseNotes(
			'<h2>Highlights</h2><ul><li>Faster scenes</li><li>Fewer bugs &amp; crashes</li></ul>',
		);
		expect(text).toBe('Highlights\n• Faster scenes\n• Fewer bugs & crashes');
		expect(text).not.toContain('<');
	});

	it('joins a per-version changelog list', () => {
		expect(plainReleaseNotes([{ version: '1.1.0', note: '<p>Second</p>' }])).toBe('1.1.0\nSecond');
	});

	it('caps very long notes so the panel cannot be flooded', () => {
		const text = plainReleaseNotes(`<p>${'x'.repeat(9000)}</p>`);
		expect(text).not.toBeNull();
		expect((text as string).length).toBeLessThanOrEqual(4001);
		expect(text as string).toMatch(/…$/);
	});

	it('returns null for empty or non-note values', () => {
		expect(plainReleaseNotes(null)).toBeNull();
		expect(plainReleaseNotes('<p> </p>')).toBeNull();
	});
});

describe('unsupportedReason', () => {
	const feed = process.env.LAMPLIGHT_UPDATE_FEED_URL;
	afterEach(() => {
		if (feed === undefined) delete process.env.LAMPLIGHT_UPDATE_FEED_URL;
		else process.env.LAMPLIGHT_UPDATE_FEED_URL = feed;
	});

	it('refuses to update an unpackaged development build', () => {
		delete process.env.LAMPLIGHT_UPDATE_FEED_URL;
		expect(unsupportedReason({ isPackaged: false })).toContain('development build');
	});

	it('allows an unpackaged build that was pointed at a staged feed', () => {
		process.env.LAMPLIGHT_UPDATE_FEED_URL = 'http://127.0.0.1:1/';
		expect(unsupportedReason({ isPackaged: false })).toBeNull();
	});
});
