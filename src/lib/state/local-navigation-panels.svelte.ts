import type { PrimarySection } from '$lib/state/navigation.svelte.js';

const STORAGE_KEY_PREFIX = 'dndtools:local-nav:';

type PanelNamespace = 'knowledge' | 'atlas' | 'session' | 'campaign' | 'settings';

const DEFAULT_COLLAPSED: Readonly<Record<string, boolean>> = {
	'knowledge:folder-tree': false,
	'knowledge:tags': true,
	'knowledge:collections': true,
};

function toNamespace(section: PrimarySection): PanelNamespace {
	if (section === 'knowledge') return 'knowledge';
	if (section === 'atlas') return 'atlas';
	if (section === 'session') return 'session';
	if (section === 'campaign') return 'campaign';
	return 'settings';
}

function keyFor(namespace: PanelNamespace, sectionId: string): string {
	return `${namespace}:${sectionId}`;
}

function storageKey(sectionKey: string): string {
	return `${STORAGE_KEY_PREFIX}${sectionKey}:collapsed`;
}

class LocalNavigationPanelsState {
	private hydrated = false;
	private collapsedBySectionKey = $state<Record<string, boolean>>({});

	isCollapsed(section: PrimarySection, sectionId: string, defaultCollapsed = false): boolean {
		const namespace = toNamespace(section);
		const sectionKey = keyFor(namespace, sectionId);
		const stored = this.collapsedBySectionKey[sectionKey];
		if (typeof stored === 'boolean') return stored;
		const knownDefault = DEFAULT_COLLAPSED[sectionKey];
		if (typeof knownDefault === 'boolean') return knownDefault;
		return defaultCollapsed;
	}

	toggle(section: PrimarySection, sectionId: string, defaultCollapsed = false): void {
		const next = !this.isCollapsed(section, sectionId, defaultCollapsed);
		this.setCollapsed(section, sectionId, next);
	}

	setCollapsed(section: PrimarySection, sectionId: string, collapsed: boolean): void {
		this.ensureHydrated();
		const namespace = toNamespace(section);
		const sectionKey = keyFor(namespace, sectionId);
		this.collapsedBySectionKey = {
			...this.collapsedBySectionKey,
			[sectionKey]: collapsed,
		};
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(storageKey(sectionKey), collapsed ? '1' : '0');
		} catch {
			// Non-fatal; retain in-memory state even when localStorage is unavailable.
		}
	}

	ensureHydrated(): void {
		if (this.hydrated) return;
		this.hydrated = true;
		if (typeof window === 'undefined') return;
		const loaded: Record<string, boolean> = {};
		try {
			for (let i = 0; i < window.localStorage.length; i += 1) {
				const rawKey = window.localStorage.key(i);
				if (!rawKey || !rawKey.startsWith(STORAGE_KEY_PREFIX)) continue;
				if (!rawKey.endsWith(':collapsed')) continue;
				const sectionKey = rawKey
					.slice(STORAGE_KEY_PREFIX.length)
					.replace(/:collapsed$/, '')
					.trim();
				if (!sectionKey) continue;
				const rawValue = window.localStorage.getItem(rawKey);
				if (rawValue === '1') {
					loaded[sectionKey] = true;
				} else if (rawValue === '0') {
					loaded[sectionKey] = false;
				}
			}
		} catch {
			// Non-fatal; callers still receive defaults.
		}
		this.collapsedBySectionKey = loaded;
	}
}

export const localNavigationPanelsState = new LocalNavigationPanelsState();
