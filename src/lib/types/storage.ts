import type { Note, NoteId, FolderId, Link, TagEntry } from './note.js';
import type { AppSettings } from './settings.js';

export interface ImportResult {
	imported: number;
	skipped: number;
	errors: string[];
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

	// Settings
	getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]>;
	setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;

	// Bulk
	importNotes(notes: Note[]): Promise<ImportResult>;
	exportAllNotes(): Promise<Note[]>;

	// Stats
	getNoteCount(): Promise<number>;
	getTagCounts(): Promise<TagEntry[]>;
}
