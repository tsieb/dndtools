import { getStorage } from '$lib/platform/storage/index.js';

class UIState {
	theme = $state<'light' | 'dark' | 'system'>('system');
	sidebarOpen = $state(true);
	sidebarWidth = $state(260);
	viewportWidth = $state(1280);
	focusReading = $state(false);
	isMobile = $derived(this.viewportWidth < 768);
	isMedium = $derived(this.viewportWidth >= 768 && this.viewportWidth < 1100);
	layoutMode = $derived<'compact' | 'medium' | 'expanded'>(
		this.isMobile ? 'compact' : this.isMedium ? 'medium' : 'expanded',
	);

	resolvedTheme = $derived<'light' | 'dark'>(
		this.theme === 'system'
			? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: this.theme,
	);

	async loadFromStorage(): Promise<void> {
		const storage = getStorage();
		this.theme = await storage.getSetting('theme');
		this.sidebarOpen = await storage.getSetting('sidebarOpen');
		this.sidebarWidth = await storage.getSetting('sidebarWidth');
		this.focusReading = await storage.getSetting('focusReading');
	}

	async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
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

	checkMobile(): void {
		if (typeof window !== 'undefined') {
			this.viewportWidth = window.innerWidth;
			if (this.isMobile) {
				this.sidebarOpen = false;
			}
		}
	}
}

export const ui = new UIState();
