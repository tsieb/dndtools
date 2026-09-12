// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DARK_THEMES,
	THEME_PRESETS,
	applyThemePreference,
	bindSystemTheme,
	readThemePreference,
	resolveTheme,
} from './theme';

/**
 * RC-DSN-1.2. `import.meta.url` resolves against the DOCUMENT url under jsdom, so files are read
 * from `process.cwd()` (the app vitest project runs from the repo root), as prepaint-motion.test does.
 */
const read = (path: string) => readFileSync(`${process.cwd()}/apps/gm-react/${path}`, 'utf8');
const sorted = (values: Iterable<string>) => [...values].sort();

/** The keys of a `var NAME = { a: 1, 'b-c': 1 };` object literal in prepaint.js. */
function prepaintKeys(src: string, name: string): string[] {
	const literal = new RegExp(`var ${name} = \\{([^}]*)\\}`).exec(src);
	expect(literal, `prepaint.js declares ${name}`).not.toBeNull();
	return sorted([...literal![1]!.matchAll(/'?([a-z-]+)'?\s*:/g)].map((m) => m[1]!));
}

/** A `prefers-color-scheme` the test can flip. jsdom has no matchMedia at all. */
function stubColorScheme(initial: 'light' | 'dark') {
	let light = initial === 'light';
	const listeners = new Set<() => void>();
	const original = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		get matches() {
			return query.includes('light') ? light : !light;
		},
		media: query,
		addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
		removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
	})) as unknown as typeof window.matchMedia;
	return {
		set(next: 'light' | 'dark') {
			light = next === 'light';
			for (const fn of listeners) fn();
		},
		restore() {
			window.matchMedia = original;
		},
	};
}

const painted = () => document.documentElement.getAttribute('data-theme');

describe('theme presets', () => {
	it('resolves System to parchment on a light OS and tavern on a dark one', () => {
		expect(resolveTheme('system', true)).toBe('parchment');
		expect(resolveTheme('system', false)).toBe('tavern');
	});

	it('paints every preset as itself, whatever the OS says', () => {
		for (const preset of THEME_PRESETS) {
			expect(resolveTheme(preset, true)).toBe(preset);
			expect(resolveTheme(preset, false)).toBe(preset);
		}
	});

	it('keeps tavern as the default for an absent or unknown value', () => {
		// With nothing stored the OS does not decide: tavern is the product default.
		expect(resolveTheme(null, true)).toBe('tavern');
		expect(resolveTheme('', true)).toBe('tavern');
		expect(resolveTheme('sepia', false)).toBe('tavern');
	});

	it('ships five presets, three of them dark', () => {
		expect(THEME_PRESETS).toEqual(['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']);
		expect(sorted(DARK_THEMES)).toEqual(['dungeon', 'high-contrast', 'tavern']);
	});
});

describe('applying a theme preference', () => {
	let scheme: ReturnType<typeof stubColorScheme>;

	beforeEach(() => {
		window.localStorage.clear();
		scheme = stubColorScheme('light');
	});

	afterEach(() => {
		scheme.restore();
		window.localStorage.clear();
		document.documentElement.removeAttribute('data-theme');
		document.documentElement.style.colorScheme = '';
	});

	it('stores System but paints the preset it resolves to', () => {
		expect(applyThemePreference('system')).toBe('parchment');
		expect(painted()).toBe('parchment');
		expect(document.documentElement.style.colorScheme).toBe('light');
		expect(window.localStorage.getItem('dndtools:react:theme')).toBe('system');
		// The picker shows the choice, not the preset it happens to paint.
		expect(readThemePreference()).toBe('system');
	});

	it('keeps the native color-scheme in step with each preset', () => {
		for (const preset of THEME_PRESETS) {
			applyThemePreference(preset);
			expect(painted()).toBe(preset);
			expect(document.documentElement.style.colorScheme).toBe(
				DARK_THEMES.has(preset) ? 'dark' : 'light',
			);
		}
	});

	it('follows a live OS flip only while the preference is System', () => {
		const unbind = bindSystemTheme();
		try {
			applyThemePreference('system');
			scheme.set('dark');
			expect(painted()).toBe('tavern');
			scheme.set('light');
			expect(painted()).toBe('parchment');

			// An explicit preset is a decision; the OS no longer gets a say.
			applyThemePreference('scholar');
			scheme.set('dark');
			expect(painted()).toBe('scholar');
		} finally {
			unbind();
		}
	});

	it('refuses to store a theme that does not exist', () => {
		expect(applyThemePreference('sepia')).toBe('tavern');
		expect(window.localStorage.getItem('dndtools:react:theme')).toBe('tavern');
	});
});

// prepaint.js, the Electron preloads and main.cjs cannot import theme.ts, so each keeps its own copy
// of the preset list. A copy that misses a preset silently drops it: prepaint would boot a stored
// "dungeon" as tavern, and the title bar would refuse to follow it.
describe('copies of the preset list that cannot import it', () => {
	it('prepaint.js names the same presets and the same dark set', () => {
		const src = read('public/prepaint.js');
		expect(prepaintKeys(src, 'NAMED')).toEqual(sorted(THEME_PRESETS));
		expect(prepaintKeys(src, 'DARK')).toEqual(sorted(DARK_THEMES));
		expect(src).toContain("pref === 'system'");
	});

	it('both Electron preloads accept exactly the presets', () => {
		for (const file of ['electron/preload.cjs', 'electron/window-preload.cjs']) {
			const allow = /\[([^\]]*)\]\.includes\(themeName\)/.exec(read(file));
			expect(allow, `${file} validates themeName`).not.toBeNull();
			const names = [...allow![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
			expect(sorted(names), file).toEqual(sorted(THEME_PRESETS));
		}
	});

	it('the Electron main process has a window palette for every preset', () => {
		const table = /const WINDOW_THEMES = \{([\s\S]*?)\n\};/.exec(read('electron/main.cjs'));
		expect(table).not.toBeNull();
		const names = [...table![1]!.matchAll(/^\t'?([a-z-]+)'?: \{/gm)].map((m) => m[1]!);
		expect(sorted(names)).toEqual(sorted(THEME_PRESETS));
	});

	it('colors.css declares a theme block for exactly these presets', () => {
		const css = read('src/styles/tokens/colors.css');
		const declared = new Set([...css.matchAll(/\[data-theme='([a-z-]+)'\]/g)].map((m) => m[1]!));
		expect(sorted(declared)).toEqual(sorted(THEME_PRESETS));
	});
});
