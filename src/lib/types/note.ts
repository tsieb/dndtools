import type { ContentVisibility } from './visibility.js';

/** Branded type for Note IDs */
export type NoteId = string & { readonly __brand: 'NoteId' };

/** Branded type for Folder IDs (path-based) */
export type FolderId = string & { readonly __brand: 'FolderId' };

export function createNoteId(id: string): NoteId {
	return id as NoteId;
}

export function createFolderId(path: string): FolderId {
	return path as FolderId;
}

export const ROOT_FOLDER: FolderId = createFolderId('/');

export interface Note {
	readonly id: NoteId;
	title: string;
	content: string;
	folder: FolderId;
	/** Relative markdown path when backed by filesystem storage */
	filePath?: string;
	tags: string[];
	frontmatter: Record<string, unknown>;
	visibility: ContentVisibility;
	readonly createdAt: string;
	updatedAt: string;
	deleted: boolean;
	deletedAt: string | null;
	pinned: boolean;
	pinnedAt: string | null;
}

export interface Link {
	sourceId: NoteId;
	targetId: NoteId;
	displayText: string;
	position: number;
	/** How this link target was resolved from the source wikilink. */
	resolvedBy?: 'id' | 'title' | 'alias';
	/** Alias text that matched when resolvedBy is alias. */
	resolvedAlias?: string | null;
	/** Two-sentence context snippet around the backlink occurrence. */
	contextSnippet?: string | null;
}

export interface TagEntry {
	name: string;
	count: number;
}

export interface Folder {
	id: FolderId;
	name: string;
	parent: FolderId;
	noteCount: number;
}
