import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedSearch } from '$lib/types/settings.js';

const persisted: { savedSearches: SavedSearch[] } = { savedSearches: [] };
const getSetting = vi.fn(async () => persisted.savedSearches);
const setSetting = vi.fn(async (_key: string, value: SavedSearch[]) => {
	persisted.savedSearches = value;
});

vi.mock('$lib/platform/storage/index.js', () => ({
	getStorage: () => ({
		getSetting,
		setSetting,
	}),
}));

describe('searchState', () => {
	beforeEach(async () => {
		persisted.savedSearches = [];
		getSetting.mockClear();
		setSetting.mockClear();
		vi.resetModules();
	});

	it('loads saved searches from settings storage', async () => {
		persisted.savedSearches = [
			{
				id: 'a',
				name: 'Recent',
				query: 'updated:>=-7d',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			},
		];
		const { searchState } = await import('./search.svelte.js');
		await searchState.loadSavedSearches();

		expect(searchState.savedSearches).toHaveLength(1);
		expect(searchState.savedSearches[0]?.id).toBe('a');
		expect(getSetting).toHaveBeenCalledWith('savedSearches');
	});

	it('saves and updates a named search', async () => {
		const { searchState } = await import('./search.svelte.js');
		await searchState.loadSavedSearches();

		const first = await searchState.saveSearch('Prep', 'tag:session');
		expect(first.name).toBe('Prep');
		expect(searchState.savedSearches).toHaveLength(1);
		expect(setSetting).toHaveBeenCalled();

		const second = await searchState.saveSearch('Prep', 'tag:session updated:>=-7d');
		expect(second.id).toBe(first.id);
		expect(searchState.savedSearches).toHaveLength(1);
		expect(searchState.savedSearches[0]?.query).toContain('updated');
	});

	it('deletes a saved search', async () => {
		const { searchState } = await import('./search.svelte.js');
		await searchState.loadSavedSearches();
		const saved = await searchState.saveSearch('Temp', 'tag:none');
		await searchState.deleteSearch(saved.id);

		expect(searchState.savedSearches).toEqual([]);
		expect(setSetting).toHaveBeenCalled();
	});
});
