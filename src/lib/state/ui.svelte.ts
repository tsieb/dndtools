import { getStorage } from '$lib/platform/storage/index.js';
import {
	normalizeThemeSetting,
	resolveThemeFamily,
	resolveThemePreset,
	type ThemeFamily,
	type ThemePreset,
	type ThemeSetting,
} from '$lib/domain/theme.js';

class UIState {
	theme = $state<ThemeSetting>('system');
	sidebarOpen = $state(true);
	sidebarWidth = $state(240);
	focusReading = $state(false);

	resolvedTheme = $derived<ThemeFamily>(resolveThemeFamily(this.theme));
	resolvedThemePreset = $derived<ThemePreset>(resolveThemePreset(this.theme));

	async loadFromStorage(): Promise<void> {
		const storage = getStorage();
		const storedTheme = normalizeThemeSetting(await storage.getSetting('theme'));
		this.theme =
			storedTheme === 'light' ? 'parchment' : storedTheme === 'dark' ? 'tavern' : storedTheme;
		this.sidebarOpen = await storage.getSetting('sidebarOpen');
		this.sidebarWidth = await storage.getSetting('sidebarWidth');
		this.focusReading = await storage.getSetting('focusReading');
	}

	async setTheme(theme: ThemeSetting): Promise<void> {
		this.theme = theme;
		await getStorage().setSetting('theme', theme);
	}

	toggleSidebar(): void {
		this.sidebarOpen = !this.sidebarOpen;
		getStorage().setSetting('sidebarOpen', this.sidebarOpen);
	}

	async setFocusReading(value: boolean): Promise<void> {
		this.focusReading = value;
		await getStorage().setSetting('focusReading', value);
	}
}

export const ui = new UIState();
