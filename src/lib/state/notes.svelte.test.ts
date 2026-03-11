import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '$lib/types/note.js';
import { createNoteId, ROOT_FOLDER } from '$lib/types/note.js';
import { DEFAULT_CONTENT_VISIBILITY } from '$lib/types/visibility.js';

const persistedNotes: Note[] = [];
const getAllNotes = vi.fn(async () => persistedNotes.map((note) => ({ ...note })));
const getLinksFrom = vi.fn(async () => []);
const setLinksFrom = vi.fn(async () => undefined);
const saveNote = vi.fn(async () => undefined);
const getNote = vi.fn(
	async (id: Note['id']) => persistedNotes.find((note) => note.id === id) ?? null,
);

vi.mock('$lib/platform/storage/index.js', () => ({
	getStorage: () => ({
		getAllNotes,
		getLinksFrom,
		setLinksFrom,
		saveNote,
		getNote,
	}),
}));

const addNote = vi.fn();
const removeNote = vi.fn();
vi.mock('$lib/domain/search.js', () => ({
	searchService: {
		addNote,
		removeNote,
	},
}));

const syncNotes = vi.fn();
const updateNoteLinks = vi.fn();
const removeLinksForNote = vi.fn();
vi.mock('./links.svelte.js', () => ({
	linksState: {
		syncNotes,
		updateNoteLinks,
		removeNote: removeLinksForNote,
	},
}));

function createStoredNote(id: string, title: string): Note {
	const now = new Date('2026-03-10T00:00:00.000Z').toISOString();
	return {
		id: createNoteId(id),
		title,
		content: `# ${title}\n`,
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
	};
}

describe('notesState loadAll draft reconciliation', () => {
	beforeEach(() => {
		persistedNotes.splice(0, persistedNotes.length);
		getAllNotes.mockClear();
		getLinksFrom.mockClear();
		setLinksFrom.mockClear();
		saveNote.mockClear();
		getNote.mockClear();
		addNote.mockClear();
		removeNote.mockClear();
		syncNotes.mockClear();
		updateNoteLinks.mockClear();
		removeLinksForNote.mockClear();
		vi.resetModules();
	});

	it('keeps unsaved draft notes when a storage refresh runs', async () => {
		persistedNotes.push(createStoredNote('existing-note', 'Existing Note'));
		const { notesState } = await import('./notes.svelte.js');

		await notesState.loadAll();
		const draft = await notesState.createNote();
		expect(notesState.getNoteById(draft.id)).not.toBeNull();

		await notesState.loadAll();
		expect(notesState.getNoteById(draft.id)).not.toBeNull();
		expect(notesState.getNoteById(draft.id)?.title).toBe('Untitled');
	});

	it('prefers storage version when a draft id is already persisted', async () => {
		const { notesState } = await import('./notes.svelte.js');

		const draft = await notesState.createNote();
		persistedNotes.push(createStoredNote(String(draft.id), 'Persisted Replacement'));

		await notesState.loadAll();

		expect(notesState.notes.filter((note) => note.id === draft.id)).toHaveLength(1);
		expect(notesState.getNoteById(draft.id)?.title).toBe('Persisted Replacement');
	});
});
