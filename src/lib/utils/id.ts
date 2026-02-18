import { nanoid } from 'nanoid';
import { createNoteId, type NoteId } from '$lib/types/note.js';
import { createSessionBoardId, type SessionBoardId } from '$lib/types/session-board.js';
import { createVaultObjectId, type VaultObjectId } from '$lib/types/object.js';

/** Generate a new unique NoteId using nanoid (21 chars, URL-safe) */
export function generateNoteId(): NoteId {
	return createNoteId(nanoid());
}

/** Generate a new unique SessionBoardId using nanoid (21 chars, URL-safe) */
export function generateSessionBoardId(): SessionBoardId {
	return createSessionBoardId(nanoid());
}

/** Generate a new unique VaultObjectId using nanoid (21 chars, URL-safe) */
export function generateVaultObjectId(): VaultObjectId {
	return createVaultObjectId(nanoid());
}
