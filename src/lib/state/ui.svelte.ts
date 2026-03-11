import { getStorage } from '$lib/platform/storage/index.js';
import {
	normalizeThemeSetting,
	resolveThemeFamily,
	resolveThemePreset,
	type ThemeFamily,
	type ThemePreset,
	type ThemeSetting,
} from '$lib/domain/theme.js';
import {
	normalizeHighContrast,
	normalizeNoteReadingWidth,
	normalizeReduceMotion,
	normalizeUiDensity,
	resolveHighContrast,
	resolveReducedMotion,
} from '$lib/domain/appearance.js';
import type {
	HighContrastMode,
	NoteReadingWidthMode,
	ReduceMotionMode,
	UiDensityMode,
} from '$lib/types/settings.js';

class UIState {
	theme = $state<ThemeSetting>('system');
	uiDensity = $state<UiDensityMode>('standard');
	noteReadingWidth = $state<NoteReadingWidthMode>('comfortable');
	reduceMotion = $state<ReduceMotionMode>('system');
	highContrast = $state<HighContrastMode>('system');
	sidebarOpen = $state(true);
	sidebarWidth = $state(240);
	focusReading = $state(false);

	resolvedTheme = $derived<ThemeFamily>(resolveThemeFamily(this.theme));
	resolvedThemePreset = $derived<ThemePreset>(resolveThemePreset(this.theme));
	resolvedReducedMotion = $derived<boolean>(resolveReducedMotion(this.reduceMotion));
	resolvedHighContrast = $derived<boolean>(resolveHighContrast(this.highContrast));

	async loadFromStorage(): Promise<void> {
		const storage = getStorage();
		const storedTheme = normalizeThemeSetting(await storage.getSetting('theme'));
		this.theme =
			storedTheme === 'light' ? 'parchment' : storedTheme === 'dark' ? 'tavern' : storedTheme;
		this.uiDensity = normalizeUiDensity(await storage.getSetting('uiDensity'));
		this.noteReadingWidth = normalizeNoteReadingWidth(await storage.getSetting('noteReadingWidth'));
		this.reduceMotion = normalizeReduceMotion(await storage.getSetting('reduceMotion'));
		this.highContrast = normalizeHighContrast(await storage.getSetting('highContrast'));
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

	async setReduceMotion(value: ReduceMotionMode): Promise<void> {
		this.reduceMotion = normalizeReduceMotion(value);
		await getStorage().setSetting('reduceMotion', this.reduceMotion);
	}

	async setHighContrast(value: HighContrastMode): Promise<void> {
		this.highContrast = normalizeHighContrast(value);
		await getStorage().setSetting('highContrast', this.highContrast);
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
