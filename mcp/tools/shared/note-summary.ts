import type { Note } from '../../../src/lib/types/note.js';
import { normalizeContentVisibility } from '../../../src/lib/types/visibility.js';

export function noteSummary(note: Note): {
	id: string;
	title: string;
	folder: string;
	filePath: string | null;
	tags: string[];
	visibility: Note['visibility'];
	updatedAt: string;
	deleted: boolean;
} {
	return {
		id: note.id,
		title: note.title,
		folder: note.folder,
		filePath: note.filePath ?? null,
		tags: note.tags,
		visibility: normalizeContentVisibility(note.visibility),
		updatedAt: note.updatedAt,
		deleted: note.deleted,
	};
}
