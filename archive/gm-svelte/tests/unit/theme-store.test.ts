import { beforeEach, describe, expect, it } from 'vitest';
import {
	DEFAULT_THEME_PREFERENCE,
	THEME_OPTIONS,
	ThemeStore,
	isDarkTheme,
	resolveAppliedTheme,
} from '../../src/lib/platform/theme.svelte';

// UX-VIS-001: theme is a device-local display preference. A fresh install defaults to `system`,
// which resolves to the warm-dark `tavern` theme under an OS dark preference. The store only
// accepts known preferences, applies the resolved theme to <html>, and announces the change.

describe('theme resolution helpers', () => {
	it('resolves system against the OS dark preference (dark-first)', () => {
		expect(resolveAppliedTheme('system', true)).toBe('tavern');
		expect(resolveAppliedTheme('system', false)).toBe('parchment');
	});

	it('passes named themes through unchanged', () => {
		expect(resolveAppliedTheme('parchment', true)).toBe('parchment');
		expect(resolveAppliedTheme('high-contrast', true)).toBe('high-contrast');
	});

	it('classifies dark vs light themes', () => {
		expect(isDarkTheme('tavern')).toBe(true);
		expect(isDarkTheme('high-contrast')).toBe(true);
		expect(isDarkTheme('parchment')).toBe(false);
	});
});

describe('ThemeStore', () => {
	beforeEach(() => {
		try {
			window.localStorage.clear();
		} catch {
			/* ignore */
		}
		document.documentElement.removeAttribute('data-theme');
	});

	it('defaults to system and offers system + three named themes', () => {
		const store = new ThemeStore();
		expect(store.preference).toBe(DEFAULT_THEME_PREFERENCE);
		expect(store.preference).toBe('system');
		expect(store.options.map((option) => option.id)).toEqual([
			'system',
			'tavern',
			'parchment',
			'high-contrast',
		]);
		expect(THEME_OPTIONS).toHaveLength(4);
	});

	it('applies a named theme to <html>, persists it, and announces (UX-VIS-001)', () => {
		const store = new ThemeStore();
		store.setPreference('high-contrast');
		expect(store.preference).toBe('high-contrast');
		expect(store.appliedTheme).toBe('high-contrast');
		expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast');
		expect(document.documentElement.style.colorScheme).toBe('dark');
		expect(window.localStorage.getItem('dndtools:v2:theme')).toBe('high-contrast');
		expect(store.announcement).toBe('Theme changed to High contrast');
	});

	it('sets a light color-scheme for light themes', () => {
		const store = new ThemeStore();
		store.setPreference('parchment');
		expect(document.documentElement.style.colorScheme).toBe('light');
	});

	it('ignores an unknown preference (fail closed)', () => {
		const store = new ThemeStore();
		store.setPreference('neon' as never);
		expect(store.preference).toBe('system');
		expect(document.documentElement.getAttribute('data-theme')).toBeNull();
	});

	it('rehydrates a persisted preference on init', () => {
		window.localStorage.setItem('dndtools:v2:theme', 'parchment');
		const store = new ThemeStore();
		const stop = store.init();
		expect(store.preference).toBe('parchment');
		expect(document.documentElement.getAttribute('data-theme')).toBe('parchment');
		stop();
	});
});
