import { describe, expect, it } from 'vitest';
import { buildRelatedNoteJumps } from './related-note-jumps.js';
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

describe('buildRelatedNoteJumps', () => {
	it('suggests notes by shared tags and backlink ids', () => {
		const current = note({
			id: createNoteId('current'),
			title: 'Session 12',
			tags: ['city', 'quest'],
		});
		const linked = note({
			id: createNoteId('linked'),
			title: 'Waterdeep',
			tags: ['city'],
		});
		const tagged = note({
			id: createNoteId('tagged'),
			title: 'Quest Log',
			tags: ['quest'],
		});

		const result = buildRelatedNoteJumps({
			note: current,
			notes: [current, linked, tagged],
			backlinkIds: [createNoteId('linked')],
		});

		expect(result.sameTags.map((entry) => entry.noteId)).toEqual(['tagged', 'linked']);
		expect(result.backlinks.map((entry) => entry.noteId)).toEqual(['linked']);
	});

	it('suggests notes by shared object embed references deterministically', () => {
		const current = note({
			id: createNoteId('current'),
			title: 'Battle Plan',
			content: '![[obj:character:hero-1]] ![[obj:image:map-1]]',
		});
		const alpha = note({
			id: createNoteId('alpha'),
			title: 'Alpha',
			content: '![[obj:character:hero-1]]',
		});
		const bravo = note({
			id: createNoteId('bravo'),
			title: 'Bravo',
			content: '![[obj:character:hero-1]] ![[obj:image:map-1]]',
		});

		const result = buildRelatedNoteJumps({
			note: current,
			notes: [current, alpha, bravo],
			backlinkIds: [],
		});

		expect(result.sameObjectReferences.map((entry) => entry.noteId)).toEqual(['bravo', 'alpha']);
		expect(result.sameObjectReferences[0]?.reason).toContain('2 shared object references');
	});
});
