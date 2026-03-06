import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('localNavigationPanelsState', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.resetModules();
	});

	it('applies epic defaults for knowledge panel collapse states', async () => {
		const { localNavigationPanelsState } = await import('./local-navigation-panels.svelte.js');

		expect(localNavigationPanelsState.isCollapsed('knowledge', 'folder-tree')).toBe(false);
		expect(localNavigationPanelsState.isCollapsed('knowledge', 'tags')).toBe(true);
		expect(localNavigationPanelsState.isCollapsed('knowledge', 'collections')).toBe(true);
	});

	it('persists toggled states to localStorage and restores on next load', async () => {
		const { localNavigationPanelsState } = await import('./local-navigation-panels.svelte.js');

		localNavigationPanelsState.toggle('knowledge', 'tags', true);
		expect(localNavigationPanelsState.isCollapsed('knowledge', 'tags', true)).toBe(false);
		expect(window.localStorage.getItem('dndtools:local-nav:knowledge:tags:collapsed')).toBe('0');

		vi.resetModules();
		const reloaded = await import('./local-navigation-panels.svelte.js');
		reloaded.localNavigationPanelsState.ensureHydrated();
		expect(reloaded.localNavigationPanelsState.isCollapsed('knowledge', 'tags', true)).toBe(false);
	});
});
