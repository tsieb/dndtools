import type { Note, NoteId, Link } from '$lib/types/note.js';
import { createNoteId } from '$lib/types/note.js';
import { getStorage } from '$lib/platform/storage/index.js';
import { createNewNote } from '$lib/utils/note-factory.js';
import { nowISO } from '$lib/utils/date.js';
import { extractFrontmatter, extractTags, extractTitle } from '$lib/markdown/frontmatter.js';
import { searchService } from '$lib/domain/search.js';
import { extractWikilinks } from '$lib/domain/link-extractor.js';
import { linksState } from './links.svelte.js';

class NotesState {
	notes = $state<Note[]>([]);
	activeNoteId = $state<NoteId | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);

	noteById = $derived.by(() => {
		const map = new Map<NoteId, Note>();
		for (const note of this.notes) {
			map.set(note.id, note);
		}
		return map;
	});

	activeNotes = $derived(this.notes.filter((n) => !n.deleted));

	activeNoteById = $derived.by(() => {
		const map = new Map<NoteId, Note>();
		for (const note of this.activeNotes) {
			map.set(note.id, note);
		}
		return map;
	});

	activeNoteTitleIndex = $derived.by(() => {
		const map = new Map<string, NoteId>();
		for (const note of this.activeNotes) {
			map.set(note.title.toLowerCase(), note.id);
		}
		return map;
	});

	activeNote = $derived<Note | null>(
		this.activeNoteId ? (this.activeNoteById.get(this.activeNoteId) ?? null) : null,
	);

	pinnedNotes = $derived(
		[...this.activeNotes]
			.filter((n) => n.pinned)
			.sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? '')),
	);

	deletedNotes = $derived(this.notes.filter((n) => n.deleted));

	private setNoteById(updated: Note): void {
		const index = this.notes.findIndex((n) => n.id === updated.id);
		if (index < 0) return;
		const next = [...this.notes];
		next[index] = updated;
		this.notes = next;
	}

	private async syncNoteLinks(note: Note): Promise<void> {
		const storage = getStorage();
		if (note.deleted) {
			await storage.setLinksFrom(note.id, []);
			linksState.removeNote(note.id);
			return;
		}

		const links: Link[] = extractWikilinks(note.content)
			.map((link) => {
				const targetId = link.targetIdHint
					? createNoteId(link.targetIdHint)
					: this.resolveTitle(link.title);
				if (!targetId) return null;
				return {
					sourceId: note.id,
					targetId,
					displayText: link.displayText,
					position: link.position,
				};
			})
			.filter((entry): entry is Link => !!entry);

		await storage.setLinksFrom(note.id, links);
		linksState.updateNoteLinks(note.id, links.map((link) => link.targetId));
	}

	getNoteById(id: NoteId): Note | null {
		return this.noteById.get(id) ?? null;
	}

	getActiveNoteById(id: NoteId): Note | null {
		return this.activeNoteById.get(id) ?? null;
	}

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const storage = getStorage();
			this.notes = await storage.getAllNotes({ includeDeleted: true });
			linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
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
		const persisted = (await storage.getNote(note.id)) ?? note;
		this.notes = [...this.notes, persisted];
		searchService.addNote(persisted);
		await this.syncNoteLinks(persisted);
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
		return persisted;
	}

	async updateNote(id: NoteId, updates: Partial<Note>): Promise<void> {
		const storage = getStorage();
		const existing = this.noteById.get(id);
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
		const persisted = (await storage.getNote(id)) ?? updated;
		this.setNoteById(persisted);
		searchService.addNote(persisted);
		if (updates.content !== undefined || persisted.deleted) {
			await this.syncNoteLinks(persisted);
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async deleteNote(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.deleteNote(id);
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const timestamp = nowISO();
			const next = [...this.notes];
			next[index] = {
				...next[index]!,
				deleted: true,
				deletedAt: timestamp,
				updatedAt: timestamp,
			};
			this.notes = next;
		}
		searchService.removeNote(id);
		linksState.removeNote(id);
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async restoreNote(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.restoreNote(id);
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const next = [...this.notes];
			next[index] = {
				...next[index]!,
				deleted: false,
				deletedAt: null,
				updatedAt: nowISO(),
			};
			this.notes = next;
			searchService.addNote(next[index]!);
			await this.syncNoteLinks(next[index]!);
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async permanentDelete(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.deleteNote(id, true);
		this.notes = this.notes.filter((n) => n.id !== id);
		searchService.removeNote(id);
		linksState.removeNote(id);
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async permanentDeleteMany(ids: NoteId[]): Promise<void> {
		if (ids.length === 0) return;
		const storage = getStorage();
		await Promise.all(ids.map((id) => storage.deleteNote(id, true)));
		const idSet = new Set(ids);
		this.notes = this.notes.filter((n) => !idSet.has(n.id));
		for (const id of ids) {
			searchService.removeNote(id);
			linksState.removeNote(id);
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async togglePin(id: NoteId): Promise<void> {
		const storage = getStorage();
		const note = this.noteById.get(id);
		if (!note) return;

		const pinned = !note.pinned;
		const updated: Note = {
			...note,
			pinned,
			pinnedAt: pinned ? nowISO() : null,
			updatedAt: nowISO(),
		};

		await storage.saveNote(updated);
		const persisted = (await storage.getNote(id)) ?? updated;
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const next = [...this.notes];
			next[index] = persisted;
			this.notes = next;
		}
	}

	setActive(id: NoteId | null): void {
		this.activeNoteId = id;
	}

	resolveTitle(title: string): NoteId | null {
		return this.activeNoteTitleIndex.get(title.toLowerCase()) ?? null;
	}
}

export const notesState = new NotesState();
