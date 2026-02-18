import type MiniSearchType from 'minisearch';
import type { Note, NoteId } from '$lib/types/note.js';

export interface SearchResult {
	id: NoteId;
	title: string;
	folder: string;
	filePath: string | null;
	score: number;
}

interface IndexedNote {
	id: string;
	title: string;
	content: string;
	tags: string;
	folder: string;
	filePath: string;
}

function noteToIndexed(note: Note): IndexedNote {
	return {
		id: note.id,
		title: note.title,
		content: note.content,
		tags: note.tags.join(' '),
		folder: note.folder,
		filePath: note.filePath ?? '',
	};
}

class SearchService {
	private index: MiniSearchType<IndexedNote> | null = null;
	private indexedIds = new Set<string>();
	private indexSignature = '';
	private lastQuery = '';
	private lastResults: SearchResult[] = [];

	private resetQueryCache(): void {
		this.lastQuery = '';
		this.lastResults = [];
	}

	private buildSignature(notes: Note[]): string {
		return notes
			.map((note) => `${note.id}:${note.updatedAt}:${note.deleted ? 1 : 0}`)
			.sort()
			.join('|');
	}

	async buildIndex(notes: Note[]): Promise<void> {
		const nextSignature = this.buildSignature(notes);
		if (!this.index) {
			const MiniSearch = (await import('minisearch')).default;
			this.index = new MiniSearch<IndexedNote>({
				fields: ['title', 'content', 'tags', 'folder', 'filePath'],
				storeFields: ['title', 'folder', 'filePath'],
				searchOptions: {
					boost: { title: 3, tags: 2, content: 1 },
					fuzzy: 0.2,
					prefix: true,
				},
			});
		}
		if (this.indexSignature === nextSignature) {
			return;
		}
		this.index.removeAll();
		const indexed = notes.filter((n) => !n.deleted).map(noteToIndexed);
		this.index.addAll(indexed);
		this.indexedIds = new Set(indexed.map((note) => note.id));
		this.indexSignature = nextSignature;
		this.resetQueryCache();
	}

	search(query: string): SearchResult[] {
		const normalized = query.trim();
		if (!this.index || !normalized) return [];
		if (normalized === this.lastQuery) {
			return this.lastResults;
		}

		const results = this.index.search(normalized).map((r) => ({
			id: r.id as NoteId,
			title: r.title as string,
			folder: r.folder as string,
			filePath: (r.filePath as string) || null,
			score: r.score,
		}));
		this.lastQuery = normalized;
		this.lastResults = results;
		return results;
	}

	addNote(note: Note): void {
		if (!this.index) return;
		this.removeNote(note.id);
		if (!note.deleted) {
			this.index.add(noteToIndexed(note));
			this.indexedIds.add(String(note.id));
		}
		this.indexSignature = '';
		this.resetQueryCache();
	}

	removeNote(id: NoteId): void {
		if (!this.index) return;
		const key = String(id);
		if (!this.indexedIds.has(key)) {
			return;
		}
		this.index.discard(id);
		this.indexedIds.delete(key);
		this.indexSignature = '';
		this.resetQueryCache();
	}
}

export const searchService = new SearchService();
