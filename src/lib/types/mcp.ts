import type { Note } from './note.js';

export type McpChangeType =
	| 'create'
	| 'update'
	| 'soft_delete'
	| 'restore'
	| 'permanent_delete';

export type McpChangeStatus = 'pending' | 'approved' | 'rejected';

export interface McpNoteSnapshot {
	note: Note;
}

export interface McpChangePreview {
	summary: string;
	metadata: string[];
	addedLines: number;
	removedLines: number;
	compactDiff: string;
	fullDiff: string;
	hasMore: boolean;
}

export interface McpChangeRecord {
	id: string;
	createdAt: string;
	resolvedAt: string | null;
	source: 'mcp';
	type: McpChangeType;
	status: McpChangeStatus;
	noteId: string;
	title: string;
	summary: string;
	before: McpNoteSnapshot | null;
	after: McpNoteSnapshot | null;
	preview?: McpChangePreview;
}
