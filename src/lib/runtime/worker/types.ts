import type { Note } from '$lib/types/note.js';

export interface IndexedNoteDocument {
	id: string;
	title: string;
	content: string;
	tags: string;
	folder: string;
	filePath: string;
	type: string;
	updatedAt: string;
}

export interface ParseNoteBatchRequest {
	notes: Note[];
}

export interface ParseNoteBatchResult {
	documents: IndexedNoteDocument[];
}

export interface BuildSearchIndexRequest {
	documents: IndexedNoteDocument[];
}

export interface BuildSearchIndexResult {
	serializedIndex: string;
}

export interface LinkEdgeInput {
	sourceId: string;
	targetId: string;
}

export interface BuildLinkGraphRequest {
	noteIds: string[];
	links: LinkEdgeInput[];
}

export interface BuildLinkGraphResult {
	forwardEntries: Array<[string, string[]]>;
	backwardEntries: Array<[string, string[]]>;
}

export type WorkerRequestMessage =
	| { id: string; kind: 'parseNoteBatch'; payload: ParseNoteBatchRequest }
	| { id: string; kind: 'buildSearchIndex'; payload: BuildSearchIndexRequest }
	| { id: string; kind: 'buildLinkGraph'; payload: BuildLinkGraphRequest };

export type WorkerResponseMessage =
	| {
			id: string;
			ok: true;
			result: ParseNoteBatchResult | BuildSearchIndexResult | BuildLinkGraphResult;
	  }
	| { id: string; ok: false; error: string };
