// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
interface DesktopMcpStatus {
	state: 'stopped' | 'running' | 'error';
	vaultDir: string | null;
	entry: string | null;
	pid: number | null;
	lastStartedAt: string | null;
	error: string | null;
}

interface DesktopMcpChangeRecord {
	id: string;
	createdAt: string;
	resolvedAt: string | null;
	source: 'mcp';
	type: 'create' | 'update' | 'soft_delete' | 'restore' | 'permanent_delete';
	status: 'pending' | 'approved' | 'rejected';
	noteId: string;
	title: string;
	summary: string;
	before: { note: import('$lib/types/note.js').Note } | null;
	after: { note: import('$lib/types/note.js').Note } | null;
	preview?: {
		summary: string;
		metadata: string[];
		addedLines: number;
		removedLines: number;
		compactDiff: string;
		fullDiff: string;
		hasMore: boolean;
	};
}

interface DesktopIntegrityIssue {
	file: 'index.json' | 'session-boards.json' | 'objects.json' | 'mcp-changelog.json';
	status: 'ok' | 'missing' | 'invalid_json' | 'invalid_shape';
	repaired: boolean;
	details: string | null;
}

interface DesktopIntegrityReport {
	checkedAt: string;
	healthy: boolean;
	repairApplied: boolean;
	issues: DesktopIntegrityIssue[];
}

	interface Window {
		dndtoolsDesktop?: {
			getNote(id: import('$lib/types/note.js').NoteId): Promise<import('$lib/types/note.js').Note | null>;
			getAllNotes(options?: {
				includeDeleted?: boolean;
			}): Promise<import('$lib/types/note.js').Note[]>;
			saveNote(note: import('$lib/types/note.js').Note): Promise<void>;
			deleteNote(id: import('$lib/types/note.js').NoteId, permanent?: boolean): Promise<void>;
			restoreNote(id: import('$lib/types/note.js').NoteId): Promise<void>;
			getNotesByFolder(folder: import('$lib/types/note.js').FolderId): Promise<import('$lib/types/note.js').Note[]>;
			getNotesByTag(tag: string): Promise<import('$lib/types/note.js').Note[]>;
			getRecentNotes(limit: number): Promise<import('$lib/types/note.js').Note[]>;
			getDeletedNotes(): Promise<import('$lib/types/note.js').Note[]>;
			resolveTitle(title: string): Promise<import('$lib/types/note.js').Note | null>;
			getLinksFrom(noteId: import('$lib/types/note.js').NoteId): Promise<import('$lib/types/note.js').Link[]>;
			getLinksTo(noteId: import('$lib/types/note.js').NoteId): Promise<import('$lib/types/note.js').Link[]>;
			setLinksFrom(
				noteId: import('$lib/types/note.js').NoteId,
				links: import('$lib/types/note.js').Link[],
			): Promise<void>;
			getAllLinks(): Promise<import('$lib/types/note.js').Link[]>;
			getSessionBoards(): Promise<import('$lib/types/session-board.js').SessionBoard[]>;
			getSessionBoard(
				id: import('$lib/types/session-board.js').SessionBoardId,
			): Promise<import('$lib/types/session-board.js').SessionBoard | null>;
			saveSessionBoard(
				board: import('$lib/types/session-board.js').SessionBoard,
			): Promise<void>;
			deleteSessionBoard(id: import('$lib/types/session-board.js').SessionBoardId): Promise<void>;
			suggestRelatedNotes(
				noteIds: import('$lib/types/note.js').NoteId[],
				limit?: number,
			): Promise<import('$lib/types/session-board.js').RelatedNoteSuggestion[]>;
			getObject(
				id: import('$lib/types/object.js').VaultObjectId,
			): Promise<import('$lib/types/object.js').VaultObject | null>;
			getAllObjects(options?: {
				type?: import('$lib/types/object.js').VaultObjectType;
				query?: string;
			}): Promise<import('$lib/types/object.js').VaultObject[]>;
			saveObject(object: import('$lib/types/object.js').VaultObject): Promise<void>;
			deleteObject(id: import('$lib/types/object.js').VaultObjectId): Promise<void>;
			getSetting<K extends keyof import('$lib/types/settings.js').AppSettings>(
				key: K,
			): Promise<import('$lib/types/settings.js').AppSettings[K]>;
			setSetting<K extends keyof import('$lib/types/settings.js').AppSettings>(
				key: K,
				value: import('$lib/types/settings.js').AppSettings[K],
			): Promise<void>;
			importNotes(
				notes: import('$lib/types/note.js').Note[],
			): Promise<import('$lib/types/storage.js').ImportResult>;
			exportAllNotes(): Promise<import('$lib/types/note.js').Note[]>;
			getNoteCount(): Promise<number>;
			getTagCounts(): Promise<import('$lib/types/note.js').TagEntry[]>;
			refreshFromDisk(): Promise<void>;
			getIntegrityReport(): Promise<DesktopIntegrityReport>;
			repairIntegrity(): Promise<DesktopIntegrityReport>;
			getBackendInfo(): Promise<{ backend: 'desktop-filesystem'; vaultDir: string }>;
			pickVaultDirectory(): Promise<{ vaultDir: string } | null>;
			getMcpStatus(): Promise<DesktopMcpStatus>;
			restartMcpSidecar(): Promise<DesktopMcpStatus>;
			refreshVault(): Promise<{ noteCount: number }>;
			listMcpPendingChanges(): Promise<DesktopMcpChangeRecord[]>;
			approveMcpChange(changeId: string): Promise<DesktopMcpChangeRecord | null>;
			approveAllMcpChanges(): Promise<DesktopMcpChangeRecord[]>;
			rejectMcpChange(changeId: string): Promise<DesktopMcpChangeRecord | null>;
			rejectAllMcpChanges(): Promise<DesktopMcpChangeRecord[]>;
			minimizeWindow(): Promise<void>;
			toggleWindowMaximize(): Promise<void>;
			closeWindow(): Promise<void>;
			getWindowState(): Promise<{ isMaximized: boolean }>;
			onWindowStateChange(
				callback: (state: { isMaximized: boolean }) => void,
			): () => void;
		};
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
