import type { Note } from '$lib/types/note.js';
import type { VaultObject } from '$lib/types/object.js';
import type { ContentVisibility } from '$lib/types/visibility.js';

export function isPlayerVisibleVisibility(visibility: ContentVisibility): boolean {
	return visibility === 'shared' || visibility === 'public';
}

export function isNoteVisibleInPlayerMode(note: Pick<Note, 'visibility'>): boolean {
	return isPlayerVisibleVisibility(note.visibility);
}

export function filterPlayerVisibleNotes<T extends Pick<Note, 'visibility'>>(notes: T[]): T[] {
	return notes.filter((note) => isPlayerVisibleVisibility(note.visibility));
}

export function isObjectVisibleInPlayerMode(object: Pick<VaultObject, 'visibility'>): boolean {
	return isPlayerVisibleVisibility(object.visibility);
}
