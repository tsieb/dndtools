/**
 * RC-DSN-1.2 — the theme presets, spelled once for the React app.
 *
 * `styles/tokens/colors.css` declares one `[data-theme='…']` block per preset and both contrast
 * lints check every one. The boot script (`public/prepaint.js`) and the Electron preloads cannot
 * import this module, so they carry their own copies of these lists; `theme.test.ts` fails when a
 * copy drifts.
 *
 * `system` is a stored preference, never a `data-theme` value: it paints parchment on a light OS
 * and tavern on a dark one, at boot and again whenever the OS setting flips. With nothing stored
 * the app stays on tavern whatever the OS says — the hero theme is a product default, not a guess.
 */
import {
	PREFERENCE_KEYS,
	matchesMedia,
	readPreference,
	subscribeMedia,
	writePreference,
} from './preferences';

export const THEME_PRESETS = [
	'tavern',
	'parchment',
	'scholar',
	'dungeon',
	'high-contrast',
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** The stored preference that follows the OS light/dark setting. */
export const SYSTEM_THEME = 'system';
export type ThemePreference = ThemePreset | typeof SYSTEM_THEME;

export const DEFAULT_THEME: ThemePreset = 'tavern';

/** The presets that render dark, for the native `color-scheme` (scrollbars, form controls). */
export const DARK_THEMES: ReadonlySet<ThemePreset> = new Set([
	'tavern',
	'dungeon',
	'high-contrast',
]);

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)';

export function isThemePreset(value: string | null | undefined): value is ThemePreset {
	return (THEME_PRESETS as readonly string[]).includes(value ?? '');
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
	return value === SYSTEM_THEME || isThemePreset(value);
}

/** The preset a stored preference paints. An unknown or absent value falls back to tavern. */
export function resolveTheme(preference: string | null, prefersLight: boolean): ThemePreset {
	if (preference === SYSTEM_THEME) return prefersLight ? 'parchment' : 'tavern';
	return isThemePreset(preference) ? preference : DEFAULT_THEME;
}

/** Whether the stored preference follows the OS rather than naming a preset. */
export function followsSystemTheme(): boolean {
	return readPreference(PREFERENCE_KEYS.theme) === SYSTEM_THEME;
}

/**
 * The user's theme choice as a picker should show it: the stored preference (`system` included),
 * else the preset actually painted on `<html>`.
 */
export function readThemePreference(): ThemePreference {
	const stored = readPreference(PREFERENCE_KEYS.theme);
	if (isThemePreference(stored)) return stored;
	const painted = document.documentElement.getAttribute('data-theme');
	return isThemePreset(painted) ? painted : DEFAULT_THEME;
}

function paint(theme: ThemePreset): void {
	const root = document.documentElement;
	root.setAttribute('data-theme', theme);
	// prepaint.js sets `style.colorScheme` inline, and an inline style beats the
	// `[data-theme]{color-scheme}` rule, so every switch has to update it too or crossing the
	// dark/light boundary leaves native controls on the wrong scheme.
	root.style.colorScheme = DARK_THEMES.has(theme) ? 'dark' : 'light';
}

/** Persist a theme preference and paint the preset it resolves to, which is returned. */
export function applyThemePreference(preference: string): ThemePreset {
	const value = isThemePreference(preference) ? preference : DEFAULT_THEME;
	writePreference(PREFERENCE_KEYS.theme, value);
	const theme = resolveTheme(value, matchesMedia(LIGHT_SCHEME_QUERY));
	paint(theme);
	return theme;
}

/** Repaint when the OS light/dark setting flips while the stored preference is `system`. */
export function bindSystemTheme(): () => void {
	return subscribeMedia([LIGHT_SCHEME_QUERY], () => {
		if (followsSystemTheme()) paint(resolveTheme(SYSTEM_THEME, matchesMedia(LIGHT_SCHEME_QUERY)));
	});
}
