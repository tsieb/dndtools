import type { AppSettings } from '$lib/types/settings.js';
import type { StorageAdapter } from '$lib/types/storage.js';
import type { Note, NoteId, FolderId, Link, TagEntry } from '$lib/types/note.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from '$lib/types/object.js';
import type {
	RelatedNoteSuggestion,
	SessionBoard,
	SessionBoardId,
} from '$lib/types/session-board.js';
import type { NoteTemplate, ReusableSnippet } from '$lib/types/template-library.js';
import type { ImportResult, SafetySnapshot, SnapshotRestoreResult } from '$lib/types/storage.js';
import type { SyncWriteTracker } from '$lib/types/sync.js';

export class SyncAwareStorageAdapter implements StorageAdapter {
	constructor(
		private readonly base: StorageAdapter,
		private readonly tracker: SyncWriteTracker,
	) {}

	async initialize(): Promise<void> {
		await this.base.initialize();
	}

	close(): Promise<void> {
		return this.base.close();
	}

	getNote(id: NoteId): Promise<Note | null> {
		return this.base.getNote(id);
	}

	getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		return this.base.getAllNotes(options);
	}

	async saveNote(note: Note): Promise<void> {
		await this.base.saveNote(note);
		void this.base
			.getNote(note.id)
			.then((persisted) => this.tracker.recordNoteUpsert(persisted ?? note))
			.catch(() => this.tracker.recordNoteUpsert(note));
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		await this.base.deleteNote(id, permanent);
		if (permanent) {
			this.tracker.recordNotePermanentDelete(String(id));
			return;
		}
		void this.base
			.getNote(id)
			.then((persisted) => {
				if (persisted) {
					this.tracker.recordNoteUpsert(persisted);
					return;
				}
				this.tracker.recordNotePermanentDelete(String(id));
			})
			.catch(() => this.tracker.recordNotePermanentDelete(String(id)));
	}

	async restoreNote(id: NoteId): Promise<void> {
		await this.base.restoreNote(id);
		void this.base
			.getNote(id)
			.then((persisted) => {
				if (persisted) {
					this.tracker.recordNoteUpsert(persisted);
				}
			})
			.catch(() => undefined);
	}

	getNotesByFolder(folder: FolderId): Promise<Note[]> {
		return this.base.getNotesByFolder(folder);
	}

	getNotesByTag(tag: string): Promise<Note[]> {
		return this.base.getNotesByTag(tag);
	}

	getRecentNotes(limit: number): Promise<Note[]> {
		return this.base.getRecentNotes(limit);
	}

	getDeletedNotes(): Promise<Note[]> {
		return this.base.getDeletedNotes();
	}

	resolveTitle(title: string): Promise<Note | null> {
		return this.base.resolveTitle(title);
	}

	getLinksFrom(noteId: NoteId): Promise<Link[]> {
		return this.base.getLinksFrom(noteId);
	}

	getLinksTo(noteId: NoteId): Promise<Link[]> {
		return this.base.getLinksTo(noteId);
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		await this.base.setLinksFrom(noteId, links);
		this.tracker.recordOpaqueMutation({
			operation: 'links_update',
			entityType: 'links',
			entityId: String(noteId),
		});
	}

	getAllLinks(): Promise<Link[]> {
		return this.base.getAllLinks ? this.base.getAllLinks() : Promise.resolve([]);
	}

	getSessionBoards(): Promise<SessionBoard[]> {
		return this.base.getSessionBoards();
	}

	getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		return this.base.getSessionBoard(id);
	}

	async saveSessionBoard(board: SessionBoard): Promise<void> {
		await this.base.saveSessionBoard(board);
		this.tracker.recordOpaqueMutation({
			operation: 'session_board_upsert',
			entityType: 'session_board',
			entityId: String(board.id),
		});
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		await this.base.deleteSessionBoard(id);
		this.tracker.recordOpaqueMutation({
			operation: 'session_board_delete',
			entityType: 'session_board',
			entityId: String(id),
		});
	}

	suggestRelatedNotes(noteIds: NoteId[], limit?: number): Promise<RelatedNoteSuggestion[]> {
		return this.base.suggestRelatedNotes(noteIds, limit);
	}

	getObject(id: VaultObjectId): Promise<VaultObject | null> {
		return this.base.getObject(id);
	}

	getAllObjects(options?: { type?: VaultObjectType; query?: string }): Promise<VaultObject[]> {
		return this.base.getAllObjects(options);
	}

	async saveObject(object: VaultObject): Promise<void> {
		await this.base.saveObject(object);
		this.tracker.recordOpaqueMutation({
			operation: 'object_upsert',
			entityType: 'object',
			entityId: String(object.id),
		});
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		await this.base.deleteObject(id);
		this.tracker.recordOpaqueMutation({
			operation: 'object_delete',
			entityType: 'object',
			entityId: String(id),
		});
	}

	getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		return this.base.getObjectRelationshipGraph();
	}

	lintObjects(): Promise<ObjectLintIssue[]> {
		return this.base.lintObjects();
	}

	getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		return this.base.getObjectHistory(id, options);
	}

	revertObjectToHistory(id: VaultObjectId, historyEntryId: string): Promise<VaultObject | null> {
		return this.base.revertObjectToHistory(id, historyEntryId);
	}

	getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		return this.base.getSetting(key);
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		await this.base.setSetting(key, value);
		if (key === 'syncEngineState' || key === 'syncConflictStrategy') {
			return;
		}
		this.tracker.recordOpaqueMutation({
			operation: 'setting_update',
			entityType: 'setting',
			entityId: String(key),
		});
	}

	getNoteTemplates(): Promise<NoteTemplate[]> {
		return this.base.getNoteTemplates();
	}

	getReusableSnippets(): Promise<ReusableSnippet[]> {
		return this.base.getReusableSnippets();
	}

	async createSafetySnapshot(reason?: string): Promise<SafetySnapshot> {
		const snapshot = await this.base.createSafetySnapshot(reason);
		this.tracker.recordOpaqueMutation({
			operation: 'snapshot_create',
			entityType: 'snapshot',
			entityId: snapshot.id,
		});
		return snapshot;
	}

	listSafetySnapshots(): Promise<SafetySnapshot[]> {
		return this.base.listSafetySnapshots();
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		const result = await this.base.restoreDeletedFromSnapshot(snapshotId);
		this.tracker.recordOpaqueMutation({
			operation: 'bulk_restore',
			entityType: 'bulk',
			entityId: snapshotId,
		});
		return result;
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		const result = await this.base.importNotes(notes);
		this.tracker.recordOpaqueMutation({
			operation: 'bulk_import',
			entityType: 'bulk',
			entityId: `import-${Date.now()}-${notes.length}`,
		});
		return result;
	}

	exportAllNotes(): Promise<Note[]> {
		return this.base.exportAllNotes();
	}

	getNoteCount(): Promise<number> {
		return this.base.getNoteCount();
	}

	getTagCounts(): Promise<TagEntry[]> {
		return this.base.getTagCounts();
	}
}
