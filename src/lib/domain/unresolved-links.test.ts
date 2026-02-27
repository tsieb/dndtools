import { describe, expect, it } from 'vitest';
import { createNoteId, createFolderId, type Note } from '$lib/types/note.js';
import { findUnresolvedLinks, renameWikilinkTarget } from './unresolved-links.js';

function createNote(title: string): Note {
	return {
		id: createNoteId(title.toLowerCase().replace(/\s+/g, '-')),
		title,
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
	};
}

describe('findUnresolvedLinks', () => {
	it('groups unresolved links and tracks usage count', () => {
		const result = findUnresolvedLinks('[[Alpha]] [[Alpha]] [[Gamma]]', [createNote('Gamma')]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ title: 'Alpha', count: 2 });
	});

	it('returns close title suggestions', () => {
		const result = findUnresolvedLinks('[[Wat]]', [createNote('Waterdeep'), createNote('Watches')]);
		expect(result[0]?.suggestions).toContain('Waterdeep');
	});
});

describe('renameWikilinkTarget', () => {
	it('renames wikilink targets without touching display aliases', () => {
		const content = '[[Old|Shown]] and [[Old]]';
		const result = renameWikilinkTarget(content, 'Old', 'New');
		expect(result).toBe('[[New|Shown]] and [[New]]');
	});
});
