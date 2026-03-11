import type { PrimarySection } from '$lib/state/navigation.svelte.js';

const LOCAL_PANEL_COLLAPSED_STORAGE_KEY = 'dndtools:desktop-shell:local-panel-collapsed';
const LOCAL_PANEL_WIDTH_STORAGE_PREFIX = 'dndtools:desktop-shell:local-panel-width:';

const SECTION_IDS: readonly PrimarySection[] = [
	'knowledge',
	'atlas',
	'session',
	'campaign',
	'settings',
];

export const DEFAULT_LOCAL_PANEL_WIDTH = 240;
export const MIN_LOCAL_PANEL_WIDTH = 200;
export const MAX_LOCAL_PANEL_WIDTH = 320;
export const LOCAL_PANEL_WIDTH_PRESETS: readonly number[] = [
	MIN_LOCAL_PANEL_WIDTH,
	DEFAULT_LOCAL_PANEL_WIDTH,
	MAX_LOCAL_PANEL_WIDTH,
];

function clampLocalPanelWidth(rawWidth: number): number {
	if (!Number.isFinite(rawWidth)) return DEFAULT_LOCAL_PANEL_WIDTH;
	const rounded = Math.round(rawWidth);
	return Math.min(MAX_LOCAL_PANEL_WIDTH, Math.max(MIN_LOCAL_PANEL_WIDTH, rounded));
}

export function cycleLocalPanelWidthPreset(
	currentWidth: number,
	direction: 'next' | 'previous' = 'next',
): number {
	const current = clampLocalPanelWidth(currentWidth);
	const currentIndex = LOCAL_PANEL_WIDTH_PRESETS.findIndex((width) => width === current);
	if (currentIndex >= 0) {
		const delta = direction === 'next' ? 1 : -1;
		const wrappedIndex =
			(currentIndex + delta + LOCAL_PANEL_WIDTH_PRESETS.length) % LOCAL_PANEL_WIDTH_PRESETS.length;
		return LOCAL_PANEL_WIDTH_PRESETS[wrappedIndex]!;
	}

	if (direction === 'next') {
		return (
			LOCAL_PANEL_WIDTH_PRESETS.find((width) => width > current) ?? LOCAL_PANEL_WIDTH_PRESETS[0]!
		);
	}
	return (
		[...LOCAL_PANEL_WIDTH_PRESETS].reverse().find((width) => width < current) ??
		LOCAL_PANEL_WIDTH_PRESETS[LOCAL_PANEL_WIDTH_PRESETS.length - 1]!
	);
}

function widthStorageKey(section: PrimarySection): string {
	return `${LOCAL_PANEL_WIDTH_STORAGE_PREFIX}${section}`;
}

function parseStoredBoolean(rawValue: string | null): boolean | null {
	if (rawValue === '1') return true;
	if (rawValue === '0') return false;
	return null;
}

function defaultWidthMap(): Record<PrimarySection, number> {
	return {
		knowledge: DEFAULT_LOCAL_PANEL_WIDTH,
		atlas: DEFAULT_LOCAL_PANEL_WIDTH,
		session: DEFAULT_LOCAL_PANEL_WIDTH,
		campaign: DEFAULT_LOCAL_PANEL_WIDTH,
		settings: DEFAULT_LOCAL_PANEL_WIDTH,
	};
}

function defaultScrollMap(): Record<PrimarySection, number> {
	return {
		knowledge: 0,
		atlas: 0,
		session: 0,
		campaign: 0,
		settings: 0,
	};
}

class DesktopShellState {
	localPanelCollapsed = $state(false);
	detailPanelOpen = $state(false);
	zenMode = $state(false);

	private hydrated = false;
	private zenSnapshot: { localPanelCollapsed: boolean; detailPanelOpen: boolean } | null = null;
	private localPanelWidthBySection = $state<Record<PrimarySection, number>>(defaultWidthMap());
	private localPanelScrollBySection = $state<Record<PrimarySection, number>>(defaultScrollMap());

	ensureHydrated(): void {
		if (this.hydrated) return;
		this.hydrated = true;
		if (typeof window === 'undefined') return;

		try {
			const parsedCollapsed = parseStoredBoolean(
				window.localStorage.getItem(LOCAL_PANEL_COLLAPSED_STORAGE_KEY),
			);
			if (parsedCollapsed !== null) {
				this.localPanelCollapsed = parsedCollapsed;
			}

			const loadedWidths = defaultWidthMap();
			for (const section of SECTION_IDS) {
				const rawWidth = window.localStorage.getItem(widthStorageKey(section));
				if (!rawWidth) continue;
				const parsedWidth = Number(rawWidth);
				loadedWidths[section] = clampLocalPanelWidth(parsedWidth);
			}
			this.localPanelWidthBySection = loadedWidths;
		} catch {
			// Non-fatal. Keep in-memory defaults when localStorage is unavailable.
		}
	}

	getLocalPanelWidth(section: PrimarySection): number {
		this.ensureHydrated();
		return clampLocalPanelWidth(this.localPanelWidthBySection[section]);
	}

	setLocalPanelWidth(section: PrimarySection, width: number): void {
		this.ensureHydrated();
		const nextWidth = clampLocalPanelWidth(width);
		this.localPanelWidthBySection = {
			...this.localPanelWidthBySection,
			[section]: nextWidth,
		};
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(widthStorageKey(section), String(nextWidth));
		} catch {
			// Non-fatal. Keep in-memory width even if persistence fails.
		}
	}

	rememberLocalPanelScroll(section: PrimarySection, scrollTop: number): void {
		if (!Number.isFinite(scrollTop)) return;
		this.localPanelScrollBySection = {
			...this.localPanelScrollBySection,
			[section]: Math.max(0, Math.round(scrollTop)),
		};
	}

	getLocalPanelScroll(section: PrimarySection): number {
		return this.localPanelScrollBySection[section] ?? 0;
	}

	toggleLocalPanelCollapsed(): void {
		this.setLocalPanelCollapsed(!this.localPanelCollapsed);
	}

	setLocalPanelCollapsed(collapsed: boolean): void {
		this.ensureHydrated();
		this.applyLocalPanelCollapsed(collapsed, true);
	}

	toggleDetailPanel(): void {
		this.detailPanelOpen = !this.detailPanelOpen;
	}

	setDetailPanelOpen(open: boolean): void {
		this.detailPanelOpen = open;
	}

	setZenMode(enabled: boolean): void {
		if (enabled === this.zenMode) return;
		if (enabled) {
			this.zenSnapshot = {
				localPanelCollapsed: this.localPanelCollapsed,
				detailPanelOpen: this.detailPanelOpen,
			};
			this.zenMode = true;
			this.applyLocalPanelCollapsed(true, false);
			this.detailPanelOpen = false;
			return;
		}

		this.zenMode = false;
		if (!this.zenSnapshot) return;
		const snapshot = this.zenSnapshot;
		this.zenSnapshot = null;
		this.applyLocalPanelCollapsed(snapshot.localPanelCollapsed, false);
		this.detailPanelOpen = snapshot.detailPanelOpen;
	}

	private applyLocalPanelCollapsed(collapsed: boolean, persist: boolean): void {
		this.localPanelCollapsed = collapsed;
		if (!persist || typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(LOCAL_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
		} catch {
			// Non-fatal. Keep in-memory state even if localStorage writes fail.
		}
	}
}

export const desktopShellState = new DesktopShellState();
