import { nanoid } from 'nanoid';
import { getStorage } from '$lib/platform/storage/index.js';
import type { SavedSearch } from '$lib/types/settings.js';

export interface SmartCollection {
	id: string;
	name: string;
	description: string;
	query: string;
}

const SMART_COLLECTIONS: SmartCollection[] = [
	{
		id: 'recent-week',
		name: 'Updated This Week',
		description: 'Notes touched in the last 7 days',
		query: 'updated:>=-7d',
	},
	{
		id: 'untagged',
		name: 'Untagged Notes',
		description: 'Notes missing tags',
		query: 'tag:none',
	},
	{
		id: 'character-notes',
		name: 'Character Notes',
		description: 'Notes with frontmatter type:character',
		query: 'type:character',
	},
	{
		id: 'session-prep',
		name: 'Session Prep',
		description: 'Recently updated session-tagged notes',
		query: 'tag:session updated:>=-14d',
	},
];

class SearchState {
	savedSearches = $state<SavedSearch[]>([]);
	loaded = $state(false);
	loading = $state(false);

	smartCollections = SMART_COLLECTIONS;

	async loadSavedSearches(): Promise<void> {
		if (this.loaded || this.loading) return;
		this.loading = true;
		try {
			const saved = await getStorage().getSetting('savedSearches');
			this.savedSearches = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			this.loaded = true;
		} finally {
			this.loading = false;
		}
	}

	private async persistSavedSearches(): Promise<void> {
		await getStorage().setSetting('savedSearches', this.savedSearches);
	}

	async saveSearch(name: string, query: string): Promise<SavedSearch> {
		const cleanName = name.trim();
		const cleanQuery = query.trim();
		if (!cleanName) {
			throw new Error('Search name is required.');
		}
		if (!cleanQuery) {
			throw new Error('Search query is required.');
		}

		const now = new Date().toISOString();
		const existing = this.savedSearches.find(
			(entry) => entry.name.toLowerCase() === cleanName.toLowerCase(),
		);
		let nextRecord: SavedSearch;
		if (existing) {
			nextRecord = { ...existing, query: cleanQuery, updatedAt: now };
			this.savedSearches = this.savedSearches
				.map((entry) => (entry.id === existing.id ? nextRecord : entry))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} else {
			nextRecord = {
				id: nanoid(),
				name: cleanName,
				query: cleanQuery,
				createdAt: now,
				updatedAt: now,
			};
			this.savedSearches = [nextRecord, ...this.savedSearches];
		}
		await this.persistSavedSearches();
		return nextRecord;
	}

	async deleteSearch(id: string): Promise<void> {
		this.savedSearches = this.savedSearches.filter((entry) => entry.id !== id);
		await this.persistSavedSearches();
	}
}

export const searchState = new SearchState();
