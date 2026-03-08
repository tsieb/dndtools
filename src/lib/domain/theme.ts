export type ThemePreset = 'parchment' | 'tavern' | 'scholar' | 'dungeon';
export type ThemeSetting = ThemePreset | 'system' | 'light' | 'dark';
export type ThemeFamily = 'light' | 'dark';

function systemPrefersDark(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false;
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function normalizeThemeSetting(value: unknown): ThemeSetting {
	if (value === 'system') return 'system';
	if (value === 'parchment' || value === 'tavern' || value === 'scholar' || value === 'dungeon') {
		return value;
	}
	if (value === 'light' || value === 'dark') return value;
	return 'system';
}

export function resolveThemePreset(theme: ThemeSetting): ThemePreset {
	if (theme === 'parchment' || theme === 'tavern' || theme === 'scholar' || theme === 'dungeon') {
		return theme;
	}
	if (theme === 'light') return 'parchment';
	if (theme === 'dark') return 'tavern';
	return systemPrefersDark() ? 'tavern' : 'parchment';
}

export function resolveThemeFamily(theme: ThemeSetting): ThemeFamily {
	const preset = resolveThemePreset(theme);
	return preset === 'tavern' || preset === 'dungeon' ? 'dark' : 'light';
}
