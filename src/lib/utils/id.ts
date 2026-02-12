import { nanoid } from 'nanoid';
import { createNoteId, type NoteId } from '$lib/types/note.js';

/** Generate a new unique NoteId using nanoid (21 chars, URL-safe) */
export function generateNoteId(): NoteId {
	return createNoteId(nanoid());
}
