import type { Note, NoteId, FolderId, Link, TagEntry } from './note.js';
import type { AppSettings } from './settings.js';
import type { SessionBoard, SessionBoardId, RelatedNoteSuggestion } from './session-board.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from './object.js';

export interface ImportResult {
	imported: number;
	skipped: number;
	errors: string[];
}

export interface SafetySnapshot {
	id: string;
	createdAt: string;
	reason: string;
	noteCount: number;
}

export interface SnapshotRestoreResult {
	restored: number;
	skipped: number;
}

export interface StorageAdapter {
	// Lifecycle
	initialize(): Promise<void>;
	close(): Promise<void>;

	// Notes CRUD
	getNote(id: NoteId): Promise<Note | null>;
	getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]>;
	saveNote(note: Note): Promise<void>;
	deleteNote(id: NoteId, permanent?: boolean): Promise<void>;
	restoreNote(id: NoteId): Promise<void>;

	// Queries
	getNotesByFolder(folder: FolderId): Promise<Note[]>;
	getNotesByTag(tag: string): Promise<Note[]>;
	getRecentNotes(limit: number): Promise<Note[]>;
	getDeletedNotes(): Promise<Note[]>;
	resolveTitle(title: string): Promise<Note | null>;

	// Links
	getLinksFrom(noteId: NoteId): Promise<Link[]>;
	getLinksTo(noteId: NoteId): Promise<Link[]>;
	setLinksFrom(noteId: NoteId, links: Link[]): Promise<void>;
	getAllLinks?(): Promise<Link[]>;

	// Session Boards
	getSessionBoards(): Promise<SessionBoard[]>;
	getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null>;
	saveSessionBoard(board: SessionBoard): Promise<void>;
	deleteSessionBoard(id: SessionBoardId): Promise<void>;
	suggestRelatedNotes(noteIds: NoteId[], limit?: number): Promise<RelatedNoteSuggestion[]>;

	// Vault Objects
	getObject(id: VaultObjectId): Promise<VaultObject | null>;
	getAllObjects(options?: { type?: VaultObjectType; query?: string }): Promise<VaultObject[]>;
	saveObject(object: VaultObject): Promise<void>;
	deleteObject(id: VaultObjectId): Promise<void>;
	getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph>;
	lintObjects(): Promise<ObjectLintIssue[]>;
	getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]>;
	revertObjectToHistory(id: VaultObjectId, historyEntryId: string): Promise<VaultObject | null>;

	// Settings
	getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]>;
	setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
	createSafetySnapshot(reason?: string): Promise<SafetySnapshot>;
	listSafetySnapshots(): Promise<SafetySnapshot[]>;
	restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult>;

	// Bulk
	importNotes(notes: Note[]): Promise<ImportResult>;
	exportAllNotes(): Promise<Note[]>;

	// Stats
	getNoteCount(): Promise<number>;
	getTagCounts(): Promise<TagEntry[]>;
}
