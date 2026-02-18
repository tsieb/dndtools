import type { Note } from '../../../src/lib/types/note.js';

export function noteSummary(note: Note): {
	id: string;
	title: string;
	folder: string;
	filePath: string | null;
	tags: string[];
	updatedAt: string;
	deleted: boolean;
} {
	return {
		id: note.id,
		title: note.title,
		folder: note.folder,
		filePath: note.filePath ?? null,
		tags: note.tags,
		updatedAt: note.updatedAt,
		deleted: note.deleted,
	};
}

