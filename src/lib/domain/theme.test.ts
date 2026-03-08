import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeThemeSetting, resolveThemeFamily, resolveThemePreset } from './theme.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('theme domain', () => {
	it('normalizes invalid inputs to system', () => {
		expect(normalizeThemeSetting('unknown')).toBe('system');
		expect(normalizeThemeSetting(null)).toBe('system');
		expect(normalizeThemeSetting('tavern')).toBe('tavern');
		expect(normalizeThemeSetting('dark')).toBe('dark');
	});

	it('maps legacy light/dark values to parchment/tavern presets', () => {
		expect(resolveThemePreset('light')).toBe('parchment');
		expect(resolveThemePreset('dark')).toBe('tavern');
	});

	it('resolves theme family by preset', () => {
		expect(resolveThemeFamily('parchment')).toBe('light');
		expect(resolveThemeFamily('scholar')).toBe('light');
		expect(resolveThemeFamily('tavern')).toBe('dark');
		expect(resolveThemeFamily('dungeon')).toBe('dark');
	});

	it('uses system preference for system mode', () => {
		vi.stubGlobal('window', {
			matchMedia: vi.fn().mockReturnValue({ matches: true }),
		});
		expect(resolveThemePreset('system')).toBe('tavern');
	});
});
