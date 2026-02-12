import MiniSearch from 'minisearch';
import type { Note, NoteId } from '$lib/types/note.js';

export interface SearchResult {
	id: NoteId;
	title: string;
	folder: string;
	score: number;
}

interface IndexedNote {
	id: string;
	title: string;
	content: string;
	tags: string;
	folder: string;
}

function noteToIndexed(note: Note): IndexedNote {
	return {
		id: note.id,
		title: note.title,
		content: note.content,
		tags: note.tags.join(' '),
		folder: note.folder,
	};
}

class SearchService {
	private index: MiniSearch<IndexedNote>;

	constructor() {
		this.index = new MiniSearch<IndexedNote>({
			fields: ['title', 'content', 'tags'],
			storeFields: ['title', 'folder'],
			searchOptions: {
				boost: { title: 3, tags: 2, content: 1 },
				fuzzy: 0.2,
				prefix: true,
			},
		});
	}

	buildIndex(notes: Note[]): void {
		this.index.removeAll();
		const indexed = notes.filter((n) => !n.deleted).map(noteToIndexed);
		this.index.addAll(indexed);
	}

	search(query: string): SearchResult[] {
		if (!query.trim()) return [];
		return this.index.search(query).map((r) => ({
			id: r.id as NoteId,
			title: r.title as string,
			folder: r.folder as string,
			score: r.score,
		}));
	}

	addNote(note: Note): void {
		this.removeNote(note.id);
		if (!note.deleted) {
			this.index.add(noteToIndexed(note));
		}
	}

	removeNote(id: NoteId): void {
		try {
			this.index.discard(id);
		} catch {
			// Not in index
		}
	}
}

export const searchService = new SearchService();
