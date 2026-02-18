import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRelatedNoteSuggestions } from './related-note-suggestions.js';
import { createFolderId, createNoteId, type Link, type Note } from '$lib/types/note.js';

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

describe('buildRelatedNoteSuggestions', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('combines links, tags, and recency while excluding selected/deleted notes', () => {
		vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-02-01T00:00:00.000Z'));
		const notes = [
			note({ id: createNoteId('selected'), title: 'Selected', tags: ['quest'] }),
			note({
				id: createNoteId('recent-linked'),
				title: 'Recent Linked',
				tags: ['quest'],
				updatedAt: '2026-01-30T00:00:00.000Z',
			}),
			note({
				id: createNoteId('old-tag-only'),
				title: 'Old Tag',
				tags: ['quest'],
				updatedAt: '2025-10-01T00:00:00.000Z',
			}),
			note({
				id: createNoteId('deleted'),
				title: 'Deleted',
				tags: ['quest'],
				deleted: true,
			}),
		];
		const links: Pick<Link, 'sourceId' | 'targetId'>[] = [
			{ sourceId: createNoteId('selected'), targetId: createNoteId('recent-linked') },
			{ sourceId: createNoteId('deleted'), targetId: createNoteId('selected') },
		];

		const results = buildRelatedNoteSuggestions({
			notes,
			links,
			selectedNoteIds: [createNoteId('selected')],
		});

		expect(results.map((entry) => entry.noteId)).toEqual(['recent-linked', 'old-tag-only']);
		expect(results[0]?.linkedTo).toEqual([createNoteId('selected')]);
		expect(results[0]?.sharedTags).toEqual(['quest']);
	});

	it('sorts ties by note id for deterministic output', () => {
		const notes = [
			note({ id: createNoteId('selected'), title: 'Selected', tags: ['npc'] }),
			note({ id: createNoteId('a-note'), title: 'A', tags: ['npc'] }),
			note({ id: createNoteId('b-note'), title: 'B', tags: ['npc'] }),
		];

		const results = buildRelatedNoteSuggestions({
			notes,
			links: [],
			selectedNoteIds: [createNoteId('selected')],
		});

		expect(results.map((entry) => entry.noteId)).toEqual(['a-note', 'b-note']);
	});

	it('returns empty when selected ids are missing or limit is non-positive', () => {
		const notes = [note({ id: createNoteId('only') })];
		expect(
			buildRelatedNoteSuggestions({
				notes,
				links: [],
				selectedNoteIds: [createNoteId('missing')],
				limit: 5,
			}),
		).toEqual([]);
		expect(
			buildRelatedNoteSuggestions({
				notes,
				links: [],
				selectedNoteIds: [createNoteId('only')],
				limit: 0,
			}),
		).toEqual([]);
	});
});
