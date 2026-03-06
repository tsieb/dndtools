import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('navigationState', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('maps route paths to primary sections', async () => {
		const { primarySectionFromPath } = await import('./navigation.svelte.js');

		expect(primarySectionFromPath('/knowledge/notes')).toBe('knowledge');
		expect(primarySectionFromPath('/atlas/maps')).toBe('atlas');
		expect(primarySectionFromPath('/session/combat')).toBe('session');
		expect(primarySectionFromPath('/campaign/timeline')).toBe('campaign');
		expect(primarySectionFromPath('/settings')).toBe('settings');
		expect(primarySectionFromPath('/player')).toBe('knowledge');
	});

	it('tracks active route and section centrally', async () => {
		const { navigationState } = await import('./navigation.svelte.js');

		navigationState.setActiveRoute('/campaign/timeline');
		expect(navigationState.activeRoute).toBe('/campaign/timeline');
		expect(navigationState.activeSection).toBe('campaign');

		navigationState.setActiveRoute('/session/combat');
		expect(navigationState.activeSection).toBe('session');
	});

	it('updates active route when recording history entries', async () => {
		const { navigationState } = await import('./navigation.svelte.js');

		navigationState.record('/knowledge/notes', { label: 'All Notes' });
		navigationState.record('/settings', { label: 'Settings' });

		expect(navigationState.activeRoute).toBe('/settings');
		expect(navigationState.activeSection).toBe('settings');
		expect(navigationState.entries).toHaveLength(2);
		expect(navigationState.currentEntry?.label).toBe('Settings');
	});
});
