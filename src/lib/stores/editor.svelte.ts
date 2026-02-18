import type { Note, NoteId } from '$lib/types/note.js';
import { notesState } from './notes.svelte.js';
import { debounce } from '$lib/utils/debounce.js';

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
