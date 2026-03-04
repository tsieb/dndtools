import type { Note } from './note.js';

export const SYNC_ENGINE_STATE_VERSION = 1;

export type SyncIndicatorState = 'online' | 'offline' | 'syncing' | 'error';
export type SyncConflictStrategy = 'manual' | 'use_latest';

export type SyncQueueEntityType =
	| 'note'
	| 'session_board'
	| 'object'
	| 'setting'
	| 'links'
	| 'bulk'
	| 'snapshot';

export type SyncQueueOperation =
	| 'note_upsert'
	| 'note_permanent_delete'
	| 'session_board_upsert'
	| 'session_board_delete'
	| 'object_upsert'
	| 'object_delete'
	| 'setting_update'
	| 'links_update'
	| 'bulk_import'
	| 'bulk_restore'
	| 'snapshot_create';

export type SyncOpaqueQueueEntityType = Exclude<SyncQueueEntityType, 'note'>;

export interface SyncQueueEntry {
	id: string;
	createdAt: string;
	updatedAt: string;
	entityType: SyncQueueEntityType;
	operation: SyncQueueOperation;
	entityId: string;
	ancestorNote: Note | null;
	localNote: Note | null;
	attempts: number;
	lastError: string | null;
}

export type SyncConflictReason =
	| 'remote_created_during_local_create'
	| 'remote_updated_since_ancestor'
	| 'remote_deleted_since_ancestor';

export interface SyncConflictRecord {
	id: string;
	queueEntryId: string;
	noteId: string;
	title: string;
	detectedAt: string;
	reason: SyncConflictReason;
	ancestorNote: Note | null;
	localNote: Note | null;
	remoteNote: Note | null;
}

export interface SyncEngineState {
	version: number;
	queue: SyncQueueEntry[];
	conflicts: SyncConflictRecord[];
	remoteNotes: Record<string, Note>;
	lastSyncAt: string | null;
	lastSyncError: string | null;
}

export interface SyncWriteTracker {
	recordNoteUpsert(note: Note): void;
	recordNotePermanentDelete(noteId: string): void;
	recordOpaqueMutation(input: {
		operation: SyncQueueOperation;
		entityType: SyncOpaqueQueueEntityType;
		entityId: string;
	}): void;
}

export type SyncConflictResolution = 'use_local' | 'use_remote' | 'use_latest' | 'use_merged';

export function createDefaultSyncEngineState(): SyncEngineState {
	return {
		version: SYNC_ENGINE_STATE_VERSION,
		queue: [],
		conflicts: [],
		remoteNotes: {},
		lastSyncAt: null,
		lastSyncError: null,
	};
}
