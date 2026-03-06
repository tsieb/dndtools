import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoteId } from '$lib/types/note.js';

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

	it('enables back/forward only for same-section history and disables back on section roots', async () => {
		const { navigationState } = await import('./navigation.svelte.js');

		navigationState.record('/knowledge', { label: 'Knowledge' });
		navigationState.record('/knowledge/search', { label: 'Search' });
		expect(navigationState.canGoBack).toBe(true);
		expect(navigationState.backEntry?.label).toBe('Knowledge');

		navigationState.record('/settings', { label: 'Settings' });
		expect(navigationState.canGoBack).toBe(false);

		navigationState.record('/knowledge/notes', { label: 'All Notes' });
		expect(navigationState.canGoBack).toBe(false);

		navigationState.record('/knowledge', { label: 'Knowledge' });
		expect(navigationState.canGoBack).toBe(false);
	});

	it('resets navigation history to a single current entry', async () => {
		const { navigationState } = await import('./navigation.svelte.js');

		navigationState.record('/knowledge/notes', { label: 'All Notes' });
		navigationState.record('/knowledge/search', { label: 'Search' });
		expect(navigationState.entries).toHaveLength(2);
		expect(navigationState.canGoBack).toBe(true);

		navigationState.reset('/settings', { label: 'Settings' });
		expect(navigationState.entries).toHaveLength(1);
		expect(navigationState.index).toBe(0);
		expect(navigationState.currentEntry?.label).toBe('Settings');
		expect(navigationState.activeSection).toBe('settings');
		expect(navigationState.canGoBack).toBe(false);
		expect(navigationState.canGoForward).toBe(false);
	});

	it('tracks cross-type recent navigation items with recency ordering', async () => {
		const { navigationState } = await import('./navigation.svelte.js');

		navigationState.record('/knowledge/notes/note-1', {
			label: 'Session Note',
			noteId: createNoteId('note-1'),
			recentKind: 'note',
			recentItemId: 'note-1',
		});
		navigationState.record('/atlas/maps?map=map-7', {
			label: 'Map map-7',
			recentKind: 'map',
			recentItemId: 'map-7',
		});
		navigationState.record('/knowledge/notes/entity-1', {
			label: 'Captain Varyn',
			noteId: createNoteId('entity-1'),
			recentKind: 'entity',
			recentItemId: 'entity-1',
		});
		navigationState.record('/knowledge/notes/note-1', {
			label: 'Session Note',
			noteId: createNoteId('note-1'),
			recentKind: 'note',
			recentItemId: 'note-1',
		});

		expect(navigationState.recentItems).toHaveLength(3);
		expect(navigationState.recentItems.map((entry) => entry.kind)).toEqual([
			'note',
			'entity',
			'map',
		]);
		expect(navigationState.recentItems[0]?.itemId).toBe('note-1');
	});
});
