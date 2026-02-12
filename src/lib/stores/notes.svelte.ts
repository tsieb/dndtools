import type { Note, NoteId } from '$lib/types/note.js';
import { getStorage } from '$lib/storage/index.js';
import { createNewNote } from '$lib/utils/note-factory.js';
import { nowISO } from '$lib/utils/date.js';
import { extractFrontmatter, extractTags, extractTitle } from '$lib/markdown/frontmatter.js';
import { searchService } from '$lib/services/search.js';

class NotesState {
	notes = $state<Note[]>([]);
	activeNoteId = $state<NoteId | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);

	activeNote = $derived<Note | null>(
		this.activeNoteId ? (this.notes.find((n) => n.id === this.activeNoteId) ?? null) : null,
	);

	activeNotes = $derived(this.notes.filter((n) => !n.deleted));

	deletedNotes = $derived(this.notes.filter((n) => n.deleted));

	/** Title-to-NoteId lookup (case-insensitive) */
	titleIndex = $derived.by<Map<string, NoteId>>(() => {
		const map = new Map<string, NoteId>();
		for (const note of this.notes) {
			if (!note.deleted) {
				map.set(note.title.toLowerCase(), note.id);
			}
		}
		return map;
	});

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const storage = getStorage();
			this.notes = await storage.getAllNotes({ includeDeleted: true });
		} catch (e) {
			this.error = String(e);
		} finally {
			this.loading = false;
		}
	}

	async createNote(overrides?: Partial<Note>): Promise<Note> {
		const note = createNewNote(overrides);
		const storage = getStorage();
		await storage.saveNote(note);
		this.notes = [...this.notes, note];
		searchService.addNote(note);
		return note;
	}

	async updateNote(id: NoteId, updates: Partial<Note>): Promise<void> {
		const storage = getStorage();
		const existing = this.notes.find((n) => n.id === id);
		if (!existing) return;

		// Parse frontmatter for metadata updates when content changes
		let parsedUpdates = { ...updates };
		if (updates.content !== undefined) {
			const { frontmatter } = extractFrontmatter(updates.content);
			const tags = extractTags(frontmatter, updates.content);
			const title = extractTitle(frontmatter, updates.content);
			parsedUpdates = {
				...parsedUpdates,
				tags,
				frontmatter,
				title: title !== 'Untitled' ? title : existing.title,
			};
		}

		const updated: Note = {
			...existing,
			...parsedUpdates,
			updatedAt: nowISO(),
		};

		await storage.saveNote(updated);
		this.notes = this.notes.map((n) => (n.id === id ? updated : n));
		searchService.addNote(updated);
	}

	async deleteNote(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.deleteNote(id);
		this.notes = this.notes.map((n) =>
			n.id === id ? { ...n, deleted: true, deletedAt: nowISO(), updatedAt: nowISO() } : n,
		);
		searchService.removeNote(id);
	}

	async restoreNote(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.restoreNote(id);
		this.notes = this.notes.map((n) =>
			n.id === id ? { ...n, deleted: false, deletedAt: null, updatedAt: nowISO() } : n,
		);
		const note = this.notes.find((n) => n.id === id);
		if (note) searchService.addNote(note);
	}

	async permanentDelete(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.deleteNote(id, true);
		this.notes = this.notes.filter((n) => n.id !== id);
	}

	setActive(id: NoteId | null): void {
		this.activeNoteId = id;
	}

	resolveTitle(title: string): NoteId | null {
		const lowerTitle = title.toLowerCase();
		for (const note of this.notes) {
			if (!note.deleted && note.title.toLowerCase() === lowerTitle) {
				return note.id;
			}
		}
		return null;
	}
}

export const notesState = new NotesState();
