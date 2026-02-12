import { notesState } from './notes.svelte.js';
import type { Folder, FolderId, TagEntry } from '$lib/types/note.js';
import { createFolderId, ROOT_FOLDER } from '$lib/types/note.js';

class VaultState {
	/** All unique folders derived from notes */
	folders = $derived.by<Folder[]>(() => {
		const folderMap = new Map<string, number>();
		for (const note of notesState.activeNotes) {
			const folder = note.folder;
			folderMap.set(folder, (folderMap.get(folder) ?? 0) + 1);
		}

		return Array.from(folderMap.entries()).map(([path, count]) => {
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
		const tagMap = new Map<string, number>();
		for (const note of notesState.activeNotes) {
			for (const tag of note.tags) {
				tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
			}
		}
		return Array.from(tagMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count);
	});

	/** Total active note count */
	noteCount = $derived(notesState.activeNotes.length);
}

export const vaultState = new VaultState();
