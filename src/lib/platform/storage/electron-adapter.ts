import type { Note, NoteId, FolderId, Link, TagEntry } from '$lib/types/note.js';
import type { AppSettings } from '$lib/types/settings.js';
import type {
	ImportResult,
	SafetySnapshot,
	SnapshotRestoreResult,
	StorageAdapter,
} from '$lib/types/storage.js';
import type {
	SessionBoard,
	SessionBoardId,
	RelatedNoteSuggestion,
} from '$lib/types/session-board.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from '$lib/types/object.js';
import type { NoteTemplate, ReusableSnippet } from '$lib/types/template-library.js';
import type { SessionState } from '$lib/types/session-state.js';

function getBridge(): NonNullable<Window['dndtoolsDesktop']> {
	const bridge = window.dndtoolsDesktop;
	if (!bridge) {
		throw new Error('Desktop bridge is unavailable');
	}
	return bridge;
}

export class ElectronStorageAdapter implements StorageAdapter {
	async initialize(): Promise<void> {
		await getBridge().getBackendInfo();
	}

	async close(): Promise<void> {
		// Electron storage lifecycle is managed by the main process.
	}

	getNote(id: NoteId): Promise<Note | null> {
		return getBridge().getNote(id);
	}

	getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		return getBridge().getAllNotes(options);
	}

	saveNote(note: Note): Promise<void> {
		return getBridge().saveNote(note);
	}

	deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		return getBridge().deleteNote(id, permanent);
	}

	restoreNote(id: NoteId): Promise<void> {
		return getBridge().restoreNote(id);
	}

	getNotesByFolder(folder: FolderId): Promise<Note[]> {
		return getBridge().getNotesByFolder(folder);
	}

	getNotesByTag(tag: string): Promise<Note[]> {
		return getBridge().getNotesByTag(tag);
	}

	getRecentNotes(limit: number): Promise<Note[]> {
		return getBridge().getRecentNotes(limit);
	}

	getDeletedNotes(): Promise<Note[]> {
		return getBridge().getDeletedNotes();
	}

	resolveTitle(title: string): Promise<Note | null> {
		return getBridge().resolveTitle(title);
	}

	getLinksFrom(noteId: NoteId): Promise<Link[]> {
		return getBridge().getLinksFrom(noteId);
	}

	getLinksTo(noteId: NoteId): Promise<Link[]> {
		return getBridge().getLinksTo(noteId);
	}

	setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		return getBridge().setLinksFrom(noteId, links);
	}

	getAllLinks(): Promise<Link[]> {
		return getBridge().getAllLinks();
	}

	getSessionBoards(): Promise<SessionBoard[]> {
		return getBridge().getSessionBoards();
	}

	getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		return getBridge().getSessionBoard(id);
	}

	saveSessionBoard(board: SessionBoard): Promise<void> {
		return getBridge().saveSessionBoard(board);
	}

	deleteSessionBoard(id: SessionBoardId): Promise<void> {
		return getBridge().deleteSessionBoard(id);
	}

	suggestRelatedNotes(noteIds: NoteId[], limit?: number): Promise<RelatedNoteSuggestion[]> {
		return getBridge().suggestRelatedNotes(noteIds, limit);
	}

	getObject(id: VaultObjectId): Promise<VaultObject | null> {
		return getBridge().getObject(id);
	}

	getAllObjects(options?: { type?: VaultObjectType; query?: string }): Promise<VaultObject[]> {
		return getBridge().getAllObjects(options);
	}

	saveObject(object: VaultObject): Promise<void> {
		return getBridge().saveObject(object);
	}

	deleteObject(id: VaultObjectId): Promise<void> {
		return getBridge().deleteObject(id);
	}

	getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		return getBridge().getObjectRelationshipGraph();
	}

	lintObjects(): Promise<ObjectLintIssue[]> {
		return getBridge().lintObjects();
	}

	getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		return getBridge().getObjectHistory(id, options);
	}

	revertObjectToHistory(id: VaultObjectId, historyEntryId: string): Promise<VaultObject | null> {
		return getBridge().revertObjectToHistory(id, historyEntryId);
	}

	getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		return getBridge().getSetting(key);
	}

	setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		return getBridge().setSetting(key, value);
	}

	getNoteTemplates(): Promise<NoteTemplate[]> {
		return getBridge().getNoteTemplates();
	}

	getReusableSnippets(): Promise<ReusableSnippet[]> {
		return getBridge().getReusableSnippets();
	}

	createSafetySnapshot(reason?: string): Promise<SafetySnapshot> {
		return getBridge().createSafetySnapshot(reason);
	}

	listSafetySnapshots(): Promise<SafetySnapshot[]> {
		return getBridge().listSafetySnapshots();
	}

	restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return getBridge().restoreDeletedFromSnapshot(snapshotId);
	}

	importNotes(notes: Note[]): Promise<ImportResult> {
		return getBridge().importNotes(notes);
	}

	exportAllNotes(): Promise<Note[]> {
		return getBridge().exportAllNotes();
	}

	getNoteCount(): Promise<number> {
		return getBridge().getNoteCount();
	}

	getTagCounts(): Promise<TagEntry[]> {
		return getBridge().getTagCounts();
	}

	getSessionState(): Promise<SessionState> {
		return getBridge().getSessionState();
	}

	saveSessionState(state: SessionState): Promise<void> {
		return getBridge().saveSessionState(state);
	}
}
