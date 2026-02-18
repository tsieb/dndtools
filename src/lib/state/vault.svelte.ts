import { notesState } from './notes.svelte.js';
import type { Folder, TagEntry } from '$lib/types/note.js';
import { createFolderId } from '$lib/types/note.js';

class VaultState {
	/** All unique folders derived from notes */
	folders = $derived.by<Folder[]>(() => {
		const folderCounts: Record<string, number> = {};
		for (const note of notesState.activeNotes) {
			const folder = note.folder;
			folderCounts[folder] = (folderCounts[folder] ?? 0) + 1;
		}

		return Object.entries(folderCounts).map(([path, count]) => {
			const segments = path.split('/').filter(Boolean);
			const name = segments[segments.length - 1] ?? 'Root';
			const parentPath = segments.length > 1 ? '/' + segments.slice(0, -1).join('/') : '/';
			return {
				id: createFolderId(path),
				name,
				parent: createFolderId(parentPath),
				noteCount: count,
			};
		});
	});

	/** Tag counts aggregated from all active notes */
	tagCounts = $derived.by<TagEntry[]>(() => {
		const tagCounts: Record<string, number> = {};
		for (const note of notesState.activeNotes) {
			for (const tag of note.tags) {
				tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
			}
		}
		return Object.entries(tagCounts)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count);
	});

	/** Total active note count */
	noteCount = $derived(notesState.activeNotes.length);
}

export const vaultState = new VaultState();
