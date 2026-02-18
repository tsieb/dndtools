import { beforeEach, describe, expect, it } from 'vitest';
import { searchService } from './search.js';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-default'),
		title: 'Default',
		content: '',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('searchService', () => {
	beforeEach(async () => {
		await searchService.buildIndex([]);
	});

	it('excludes deleted notes from indexed results', async () => {
		await searchService.buildIndex([
			note({ id: createNoteId('keep'), title: 'Goblin Cave', deleted: false }),
			note({ id: createNoteId('drop'), title: 'Goblin Ambush', deleted: true }),
		]);

		const results = searchService.search('goblin');
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe('keep');
	});

	it('returns cached results for the same normalized query', async () => {
		await searchService.buildIndex([note({ id: createNoteId('a'), title: 'Neverwinter' })]);

		const first = searchService.search('never');
		const second = searchService.search('never');
		expect(second).toBe(first);
	});

	it('supports incremental add and remove without full rebuild', async () => {
		await searchService.buildIndex([note({ id: createNoteId('a'), title: 'Phandalin' })]);
		searchService.addNote(note({ id: createNoteId('b'), title: 'Cragmaw Hideout' }));
		expect(searchService.search('cragmaw').map((entry) => entry.id)).toEqual(['b']);

		searchService.removeNote(createNoteId('b'));
		expect(searchService.search('cragmaw')).toEqual([]);
	});
});
