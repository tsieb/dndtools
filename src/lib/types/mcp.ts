import type { Note } from './note.js';

export type McpChangeType = 'create' | 'update' | 'soft_delete' | 'restore' | 'permanent_delete';

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
	semantic: {
		titleChanged: boolean;
		folderChanged: boolean;
		tagsChanged: boolean;
		frontmatterChanged: boolean;
		deletedStateChanged: boolean;
		structural: boolean;
	};
	linkImpact: {
		added: number;
		removed: number;
		addedTargets: string[];
		removedTargets: string[];
	};
}

export interface McpChangeConflict {
	reason:
		| 'target_missing'
		| 'target_exists'
		| 'target_changed_since_stage'
		| 'target_already_deleted';
	details: string;
	detectedAt: string;
}

export interface McpChangePolicyDecision {
	presetId: 'strict_review' | 'balanced' | 'trusted';
	decision: 'pending_review' | 'auto_approved';
	reason: string;
}

export interface McpChangeAuditEntry {
	at: string;
	actor: string;
	action: 'staged' | 'approved' | 'rejected' | 'auto_approved' | 'conflict_blocked';
	reason: string;
	notes?: string;
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
	agentId?: string;
	conflict?: McpChangeConflict | null;
	policy?: McpChangePolicyDecision;
	audit?: McpChangeAuditEntry[];
}
