import type { Note, NoteId } from '$lib/types/note.js';
import { notesState } from './notes.svelte.js';
import { debounce } from '$lib/utils/debounce.js';
import { extractWikilinks } from '$lib/services/link-extractor.js';
import { getStorage } from '$lib/storage/index.js';
import { createNoteId } from '$lib/types/note.js';

class EditorState {
	content = $state('');
	title = $state('');
	dirty = $state(false);
	saving = $state(false);
	lastSaved = $state<string | null>(null);
	noteId = $state<NoteId | null>(null);

	private debouncedSave = debounce(() => {
		void this.save();
	}, 500);

	setContent(content: string): void {
		this.content = content;
		this.dirty = true;
		this.debouncedSave();
	}

	setTitle(title: string): void {
		this.title = title;
		this.dirty = true;
		this.debouncedSave();
	}

	async save(): Promise<void> {
		if (!this.noteId || !this.dirty) return;

		this.saving = true;
		try {
			await notesState.updateNote(this.noteId, {
				content: this.content,
				title: this.title,
			});

			// Extract and store links
			const extracted = extractWikilinks(this.content);
			const storage = getStorage();
			const links = await Promise.all(
				extracted.map(async (link) => {
					const targetId = notesState.resolveTitle(link.title);
					return {
						sourceId: this.noteId!,
						targetId: targetId ?? createNoteId(`unresolved:${link.title}`),
						displayText: link.displayText,
						position: link.position,
					};
				}),
			);
			await storage.setLinksFrom(this.noteId, links);

			this.dirty = false;
			this.lastSaved = new Date().toISOString();
		} catch (e) {
			console.error('Failed to save note:', e);
		} finally {
			this.saving = false;
		}
	}

	load(note: Note): void {
		this.noteId = note.id;
		this.content = note.content;
		this.title = note.title;
		this.dirty = false;
		this.lastSaved = note.updatedAt;
	}

	reset(): void {
		this.noteId = null;
		this.content = '';
		this.title = '';
		this.dirty = false;
		this.saving = false;
		this.lastSaved = null;
	}
}

export const editorState = new EditorState();
