import type { Note } from '$lib/types/note.js';
import { ROOT_FOLDER } from '$lib/types/note.js';
import { DEFAULT_CONTENT_VISIBILITY } from '$lib/types/visibility.js';
import { generateNoteId } from './id.js';
import { nowISO } from './date.js';

/** Create a new Note with sensible defaults. Override any field via `overrides`. */
export function createNewNote(overrides?: Partial<Note>): Note {
	const now = nowISO();
	return {
		id: generateNoteId(),
		title: 'Untitled',
		content: '',
		folder: ROOT_FOLDER,
		tags: [],
		frontmatter: {},
		visibility: DEFAULT_CONTENT_VISIBILITY,
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}
