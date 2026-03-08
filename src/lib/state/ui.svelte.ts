import { getStorage } from '$lib/platform/storage/index.js';
import {
	normalizeThemeSetting,
	resolveThemeFamily,
	resolveThemePreset,
	type ThemeFamily,
	type ThemePreset,
	type ThemeSetting,
} from '$lib/domain/theme.js';
import { normalizeNoteReadingWidth, normalizeUiDensity } from '$lib/domain/appearance.js';
import type { NoteReadingWidthMode, UiDensityMode } from '$lib/types/settings.js';

class UIState {
	theme = $state<ThemeSetting>('system');
	uiDensity = $state<UiDensityMode>('standard');
	noteReadingWidth = $state<NoteReadingWidthMode>('comfortable');
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
		this.uiDensity = normalizeUiDensity(await storage.getSetting('uiDensity'));
		this.noteReadingWidth = normalizeNoteReadingWidth(await storage.getSetting('noteReadingWidth'));
		this.sidebarOpen = await storage.getSetting('sidebarOpen');
		this.sidebarWidth = await storage.getSetting('sidebarWidth');
		this.focusReading = await storage.getSetting('focusReading');
	}

	async setTheme(theme: ThemeSetting): Promise<void> {
		this.theme = theme;
		await getStorage().setSetting('theme', theme);
	}

	async setUiDensity(value: UiDensityMode): Promise<void> {
		this.uiDensity = normalizeUiDensity(value);
		await getStorage().setSetting('uiDensity', this.uiDensity);
	}

	async setNoteReadingWidth(value: NoteReadingWidthMode): Promise<void> {
		this.noteReadingWidth = normalizeNoteReadingWidth(value);
		await getStorage().setSetting('noteReadingWidth', this.noteReadingWidth);
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
