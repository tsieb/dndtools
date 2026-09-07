/**
 * @vitest-environment jsdom
 *
 * RC-UX-4.1 — the device-preferences / capability layer. These tests pin the two properties the
 * rest of the app relies on: every accessor is typed against the one key table, and every accessor
 * fails closed when the underlying primitive is missing or throws (private mode, jsdom, a denied
 * clipboard) instead of throwing into a render.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PREFERENCE_KEYS,
	copyToClipboard,
	isOnline,
	matchesMedia,
	readPreference,
	readViewportHeight,
	removePreference,
	subscribeMedia,
	writePreference,
} from './preferences';

afterEach(() => {
	window.localStorage.clear();
	vi.restoreAllMocks();
});

describe('device preferences', () => {
	it('round-trips a value and forgets it on remove', () => {
		expect(readPreference(PREFERENCE_KEYS.theme)).toBeNull();
		writePreference(PREFERENCE_KEYS.theme, 'tavern');
		expect(readPreference(PREFERENCE_KEYS.theme)).toBe('tavern');
		expect(window.localStorage.getItem('dndtools:react:theme')).toBe('tavern');
		removePreference(PREFERENCE_KEYS.theme);
		expect(readPreference(PREFERENCE_KEYS.theme)).toBeNull();
	});

	it('spells every key once, namespaced, with no duplicates', () => {
		const keys = Object.values(PREFERENCE_KEYS);
		expect(new Set(keys).size).toBe(keys.length);
		for (const key of keys) expect(key.startsWith('dndtools')).toBe(true);
	});

	it('reads null and swallows writes when storage throws (private mode)', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('denied');
		});
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new Error('denied');
		});
		expect(readPreference(PREFERENCE_KEYS.tier)).toBeNull();
		expect(() => writePreference(PREFERENCE_KEYS.tier, 'advanced')).not.toThrow();
		expect(() => removePreference(PREFERENCE_KEYS.tier)).not.toThrow();
	});
});

describe('media queries', () => {
	it('reports false and never subscribes when matchMedia is unavailable', () => {
		// This jsdom build ships no matchMedia — exactly the case that used to force GUI stubs.
		expect('matchMedia' in window && typeof window.matchMedia === 'function').toBe(false);
		expect(matchesMedia('(max-width: 640px)')).toBe(false);
		const stop = subscribeMedia(['(max-width: 640px)'], () => {});
		expect(() => stop()).not.toThrow();
	});

	it('resolves matches and unsubscribes every query it subscribed', () => {
		const removals: string[] = [];
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query.includes('640'),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => removals.push(query),
		}));
		expect(matchesMedia('(max-width: 640px)')).toBe(true);
		expect(matchesMedia('(max-width: 1024px)')).toBe(false);
		subscribeMedia(['(max-width: 640px)', '(max-width: 1024px)'], () => {})();
		expect(removals).toEqual(['(max-width: 640px)', '(max-width: 1024px)']);
		vi.unstubAllGlobals();
	});

	it('reports a positive viewport height', () => {
		expect(readViewportHeight()).toBeGreaterThan(0);
	});
});

describe('navigator capabilities', () => {
	it('assumes online rather than fabricating an outage', () => {
		expect(isOnline()).toBe(true);
	});

	it('reports offline only when the browser says so', () => {
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		expect(isOnline()).toBe(false);
	});

	it('resolves false when the clipboard is unavailable so callers degrade honestly', async () => {
		await expect(copyToClipboard('join link')).resolves.toBe(false);
	});

	it('resolves true on a successful write and false on a denied one', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
		await expect(copyToClipboard('join link')).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith('join link');
		writeText.mockRejectedValueOnce(new Error('denied'));
		await expect(copyToClipboard('join link')).resolves.toBe(false);
		vi.unstubAllGlobals();
	});
});
