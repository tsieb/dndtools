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
		expect(resolveAppliedTheme('dungeon', false)).toBe('dungeon');
		expect(resolveAppliedTheme('high-contrast', true)).toBe('high-contrast');
	});

	it('classifies dark vs light themes', () => {
		expect(isDarkTheme('tavern')).toBe(true);
		expect(isDarkTheme('dungeon')).toBe(true);
		expect(isDarkTheme('high-contrast')).toBe(true);
		expect(isDarkTheme('parchment')).toBe(false);
		expect(isDarkTheme('scholar')).toBe(false);
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

	it('defaults to system and offers system + five named themes', () => {
		const store = new ThemeStore();
		expect(store.preference).toBe(DEFAULT_THEME_PREFERENCE);
		expect(store.preference).toBe('system');
		expect(store.options.map((option) => option.id)).toEqual([
			'system',
			'tavern',
			'parchment',
			'dungeon',
			'scholar',
			'high-contrast',
		]);
		expect(THEME_OPTIONS).toHaveLength(6);
	});

	it('applies a named theme to <html>, persists it, and announces (UX-VIS-001)', () => {
		const store = new ThemeStore();
		store.setPreference('dungeon');
		expect(store.preference).toBe('dungeon');
		expect(store.appliedTheme).toBe('dungeon');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dungeon');
		expect(document.documentElement.style.colorScheme).toBe('dark');
		expect(window.localStorage.getItem('dndtools:v2:theme')).toBe('dungeon');
		expect(store.announcement).toBe('Theme changed to Dungeon');
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
		window.localStorage.setItem('dndtools:v2:theme', 'scholar');
		const store = new ThemeStore();
		const stop = store.init();
		expect(store.preference).toBe('scholar');
		expect(document.documentElement.getAttribute('data-theme')).toBe('scholar');
		stop();
	});
});
