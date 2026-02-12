import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { StorageAdapter, ImportResult } from '../src/lib/types/storage.js';
import type { Note, NoteId, FolderId, Link, TagEntry } from '../src/lib/types/note.js';
import type { AppSettings } from '../src/lib/types/settings.js';
import { createNoteId, createFolderId, ROOT_FOLDER } from '../src/lib/types/note.js';
import { DEFAULT_SETTINGS } from '../src/lib/types/settings.js';
import { slugify } from '../src/lib/utils/slug.js';
import { nowISO } from '../src/lib/utils/date.js';
import { generateNoteId } from '../src/lib/utils/id.js';

/** Stored link entry in the vault index */
interface StoredLink {
	targetId: string;
	displayText: string;
	position: number;
}

/** Vault index cache structure */
interface VaultIndex {
	version: number;
	notes: Record<
		string,
		{
			title: string;
			filename: string;
			folder: string;
			tags: string[];
			createdAt: string;
			updatedAt: string;
			deleted: boolean;
			deletedAt: string | null;
		}
	>;
	links: Record<string, StoredLink[]>;
}

function emptyIndex(): VaultIndex {
	return { version: 1, notes: {}, links: {} };
}

/**
 * FileSystemAdapter — StorageAdapter implementation for the MCP server.
 * Stores notes as markdown files with YAML frontmatter on disk.
 */
export class FileSystemAdapter implements StorageAdapter {
	private vaultDir: string;
	private index: VaultIndex = emptyIndex();

	constructor(vaultDir: string) {
		this.vaultDir = path.resolve(vaultDir);
	}

	// --- Paths ---

	private get metaDir(): string {
		return path.join(this.vaultDir, '.vault');
	}

	private get indexPath(): string {
		return path.join(this.metaDir, 'index.json');
	}

	private get settingsPath(): string {
		return path.join(this.metaDir, 'settings.json');
	}

	/** Map a FolderId to a filesystem directory */
	private folderToDir(folder: FolderId): string {
		const rel = folder === ROOT_FOLDER ? '' : String(folder).replace(/^\//, '');
		return path.join(this.vaultDir, rel);
	}

	/** Map a filesystem path back to a FolderId */
	private dirToFolder(dir: string): FolderId {
		const rel = path.relative(this.vaultDir, dir).replace(/\\/g, '/');
		return createFolderId(rel ? `/${rel}` : '/');
	}

	/** Get the full file path for a note */
	private noteFilePath(folder: FolderId, filename: string): string {
		return path.join(this.folderToDir(folder), filename);
	}

	/** Generate a filename for a note title, avoiding collisions */
	private generateFilename(title: string, existingFilenames: Set<string>): string {
		const base = slugify(title) || 'untitled';
		let filename = `${base}.md`;
		if (!existingFilenames.has(filename)) return filename;

		let counter = 2;
		while (existingFilenames.has(filename)) {
			filename = `${base}-${counter}.md`;
			counter++;
		}
		return filename;
	}

	// --- Index persistence ---

	private async loadIndex(): Promise<void> {
		try {
			const data = await fs.readFile(this.indexPath, 'utf-8');
			this.index = JSON.parse(data) as VaultIndex;
		} catch {
			this.index = emptyIndex();
		}
	}

	private async saveIndex(): Promise<void> {
		await fs.mkdir(this.metaDir, { recursive: true });
		await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, '\t'), 'utf-8');
	}

	// --- File I/O ---

	/** Read a markdown file and parse into a Note */
	private async readNoteFile(filePath: string): Promise<Note | null> {
		try {
			const raw = await fs.readFile(filePath, 'utf-8');
			const { data, content } = matter(raw);
			const fm = data as Record<string, unknown>;

			return {
				id: createNoteId((fm.id as string) ?? ''),
				title: (fm.title as string) ?? path.basename(filePath, '.md'),
				content: content.replace(/^\n+/, '').replace(/\n$/, ''),
				folder: createFolderId((fm.folder as string) ?? '/'),
				tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
				frontmatter: fm,
				createdAt: (fm.createdAt as string) ?? nowISO(),
				updatedAt: (fm.updatedAt as string) ?? nowISO(),
				deleted: (fm.deleted as boolean) ?? false,
				deletedAt: (fm.deletedAt as string) ?? null,
			};
		} catch {
			return null;
		}
	}

	/** Write a Note to a markdown file with YAML frontmatter */
	private async writeNoteFile(note: Note, filePath: string): Promise<void> {
		const fm: Record<string, unknown> = {
			id: note.id,
			title: note.title,
			folder: note.folder,
			tags: note.tags,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			deleted: note.deleted,
			deletedAt: note.deletedAt,
		};

		const md = matter.stringify(note.content, fm);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, md, 'utf-8');
	}

	/** Update the index entry for a note */
	private indexNote(note: Note, filename: string): void {
		this.index.notes[note.id] = {
			title: note.title,
			filename,
			folder: String(note.folder),
			tags: note.tags,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			deleted: note.deleted,
			deletedAt: note.deletedAt,
		};
	}

	// --- Lifecycle ---

	async initialize(): Promise<void> {
		await fs.mkdir(this.vaultDir, { recursive: true });
		await fs.mkdir(this.metaDir, { recursive: true });
		await this.loadIndex();
		await this.rebuildIndexIfNeeded();
	}

	async close(): Promise<void> {
		await this.saveIndex();
	}

	/** Scan the vault directory and rebuild the index from files */
	private async rebuildIndexIfNeeded(): Promise<void> {
		// Quick check: if index has notes, assume it's valid
		if (Object.keys(this.index.notes).length > 0) return;
		await this.rebuildIndex();
	}

	private async rebuildIndex(): Promise<void> {
		this.index = emptyIndex();
		const files = await this.findAllMarkdownFiles();

		for (const filePath of files) {
			const note = await this.readNoteFile(filePath);
			if (!note || !note.id) continue;

			const dir = path.dirname(filePath);
			const folder = this.dirToFolder(dir);
			const filename = path.basename(filePath);

			this.index.notes[note.id] = {
				title: note.title,
				filename,
				folder: String(folder),
				tags: note.tags,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				deleted: note.deleted,
				deletedAt: note.deletedAt,
			};
		}

		await this.saveIndex();
	}

	/** Find all .md files in the vault, excluding .vault/ */
	private async findAllMarkdownFiles(): Promise<string[]> {
		const results: string[] = [];

		async function walk(dir: string): Promise<void> {
			let entries;
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name === '.vault' || entry.name === 'node_modules') continue;
					await walk(fullPath);
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					results.push(fullPath);
				}
			}
		}

		await walk(this.vaultDir);
		return results;
	}

	// --- Notes CRUD ---

	async getNote(id: NoteId): Promise<Note | null> {
		const entry = this.index.notes[id];
		if (!entry) return null;

		const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
		return this.readNoteFile(filePath);
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		const notes: Note[] = [];
		for (const [id, entry] of Object.entries(this.index.notes)) {
			if (!options?.includeDeleted && entry.deleted) continue;
			const note = await this.getNote(createNoteId(id));
			if (note) notes.push(note);
		}
		return notes;
	}

	async saveNote(note: Note): Promise<void> {
		const existing = this.index.notes[note.id];
		let filename: string;

		if (existing) {
			// If title changed, rename the file
			const expectedFilename = `${slugify(note.title) || 'untitled'}.md`;
			if (existing.filename !== expectedFilename && expectedFilename !== '.md') {
				// Remove old file
				const oldPath = this.noteFilePath(createFolderId(existing.folder), existing.filename);
				try {
					await fs.unlink(oldPath);
				} catch {
					// File may not exist
				}
				const existingFilenames = this.getExistingFilenames(createFolderId(String(note.folder)));
				filename = this.generateFilename(note.title, existingFilenames);
			} else {
				filename = existing.filename;
			}

			// If folder changed, move the file
			if (existing.folder !== String(note.folder)) {
				const oldPath = this.noteFilePath(createFolderId(existing.folder), existing.filename);
				try {
					await fs.unlink(oldPath);
				} catch {
					// File may not exist
				}
			}
		} else {
			const existingFilenames = this.getExistingFilenames(note.folder);
			filename = this.generateFilename(note.title, existingFilenames);
		}

		const filePath = this.noteFilePath(note.folder, filename);
		await this.writeNoteFile(note, filePath);
		this.indexNote(note, filename);
		await this.saveIndex();
	}

	/** Get all filenames currently in use in a folder */
	private getExistingFilenames(folder: FolderId): Set<string> {
		const filenames = new Set<string>();
		for (const entry of Object.values(this.index.notes)) {
			if (entry.folder === String(folder)) {
				filenames.add(entry.filename);
			}
		}
		return filenames;
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		const entry = this.index.notes[id];
		if (!entry) return;

		if (permanent) {
			const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
			try {
				await fs.unlink(filePath);
			} catch {
				// File may already be gone
			}
			delete this.index.notes[id];
			delete this.index.links[id];
		} else {
			// Soft delete: update frontmatter
			const note = await this.getNote(id);
			if (note) {
				const updated: Note = {
					...note,
					deleted: true,
					deletedAt: nowISO(),
					updatedAt: nowISO(),
				};
				const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
				await this.writeNoteFile(updated, filePath);
				this.indexNote(updated, entry.filename);
			}
		}

		await this.saveIndex();
	}

	async restoreNote(id: NoteId): Promise<void> {
		const note = await this.getNote(id);
		if (!note || !note.deleted) return;

		const entry = this.index.notes[id];
		if (!entry) return;

		const restored: Note = {
			...note,
			deleted: false,
			deletedAt: null,
			updatedAt: nowISO(),
		};

		const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
		await this.writeNoteFile(restored, filePath);
		this.indexNote(restored, entry.filename);
		await this.saveIndex();
	}

	// --- Queries ---

	async getNotesByFolder(folder: FolderId): Promise<Note[]> {
		const folderStr = String(folder);
		const ids = Object.entries(this.index.notes)
			.filter(([, e]) => e.folder === folderStr && !e.deleted)
			.map(([id]) => id);

		const notes: Note[] = [];
		for (const id of ids) {
			const note = await this.getNote(createNoteId(id));
			if (note) notes.push(note);
		}
		return notes;
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		const ids = Object.entries(this.index.notes)
			.filter(([, e]) => e.tags.includes(tag) && !e.deleted)
			.map(([id]) => id);

		const notes: Note[] = [];
		for (const id of ids) {
			const note = await this.getNote(createNoteId(id));
			if (note) notes.push(note);
		}
		return notes;
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		const entries = Object.entries(this.index.notes)
			.filter(([, e]) => !e.deleted)
			.sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, limit);

		const notes: Note[] = [];
		for (const [id] of entries) {
			const note = await this.getNote(createNoteId(id));
			if (note) notes.push(note);
		}
		return notes;
	}

	async getDeletedNotes(): Promise<Note[]> {
		const ids = Object.entries(this.index.notes)
			.filter(([, e]) => e.deleted)
			.map(([id]) => id);

		const notes: Note[] = [];
		for (const id of ids) {
			const note = await this.getNote(createNoteId(id));
			if (note) notes.push(note);
		}
		return notes;
	}

	async resolveTitle(title: string): Promise<Note | null> {
		const lower = title.toLowerCase();
		for (const [id, entry] of Object.entries(this.index.notes)) {
			if (entry.title.toLowerCase() === lower && !entry.deleted) {
				return this.getNote(createNoteId(id));
			}
		}
		return null;
	}

	// --- Links ---

	async getLinksFrom(noteId: NoteId): Promise<Link[]> {
		const stored = this.index.links[noteId];
		if (!stored) return [];

		return stored.map((s) => ({
			sourceId: noteId,
			targetId: createNoteId(s.targetId),
			displayText: s.displayText,
			position: s.position,
		}));
	}

	async getLinksTo(noteId: NoteId): Promise<Link[]> {
		const backlinks: Link[] = [];
		for (const [sourceId, links] of Object.entries(this.index.links)) {
			for (const link of links) {
				if (link.targetId === noteId) {
					backlinks.push({
						sourceId: createNoteId(sourceId),
						targetId: noteId,
						displayText: link.displayText,
						position: link.position,
					});
				}
			}
		}
		return backlinks;
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		this.index.links[noteId] = links.map((l) => ({
			targetId: l.targetId,
			displayText: l.displayText,
			position: l.position,
		}));
		await this.saveIndex();
	}

	// --- Settings ---

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		try {
			const data = await fs.readFile(this.settingsPath, 'utf-8');
			const settings = JSON.parse(data) as Partial<AppSettings>;
			return settings[key] ?? DEFAULT_SETTINGS[key];
		} catch {
			return DEFAULT_SETTINGS[key];
		}
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		let settings: Partial<AppSettings> = {};
		try {
			const data = await fs.readFile(this.settingsPath, 'utf-8');
			settings = JSON.parse(data) as Partial<AppSettings>;
		} catch {
			// No existing settings file
		}
		settings[key] = value;
		await fs.mkdir(this.metaDir, { recursive: true });
		await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, '\t'), 'utf-8');
	}

	// --- Bulk ---

	async importNotes(notes: Note[]): Promise<ImportResult> {
		let imported = 0;
		let skipped = 0;
		const errors: string[] = [];

		for (const note of notes) {
			try {
				const existing = this.index.notes[note.id];
				if (existing) {
					skipped++;
					continue;
				}
				await this.saveNote(note);
				imported++;
			} catch (e) {
				errors.push(`Failed to import "${note.title}": ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		return { imported, skipped, errors };
	}

	async exportAllNotes(): Promise<Note[]> {
		return this.getAllNotes({ includeDeleted: true });
	}

	// --- Stats ---

	async getNoteCount(): Promise<number> {
		return Object.values(this.index.notes).filter((e) => !e.deleted).length;
	}

	async getTagCounts(): Promise<TagEntry[]> {
		const counts = new Map<string, number>();
		for (const entry of Object.values(this.index.notes)) {
			if (entry.deleted) continue;
			for (const tag of entry.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
		return Array.from(counts.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count);
	}

	// --- Utilities for tools ---

	/** Resolve wikilinks in a note's content to actual note IDs and update the link index */
	async resolveAndIndexLinks(noteId: NoteId, content: string): Promise<void> {
		const { extractWikilinks } = await import('../src/lib/services/link-extractor.js');
		const extracted = extractWikilinks(content);
		const links: Link[] = [];

		for (const wl of extracted) {
			const target = await this.resolveTitle(wl.title);
			if (target) {
				links.push({
					sourceId: noteId,
					targetId: target.id,
					displayText: wl.displayText,
					position: wl.position,
				});
			}
		}

		await this.setLinksFrom(noteId, links);
	}

	/** Simple text search across all notes */
	async searchNotes(query: string): Promise<Array<{ note: Note; score: number }>> {
		const notes = await this.getAllNotes();
		const lower = query.toLowerCase();
		const results: Array<{ note: Note; score: number }> = [];

		for (const note of notes) {
			let score = 0;
			const titleLower = note.title.toLowerCase();
			const contentLower = note.content.toLowerCase();

			// Title match (highest weight)
			if (titleLower.includes(lower)) {
				score += titleLower === lower ? 100 : 50;
			}

			// Tag match
			for (const tag of note.tags) {
				if (tag.toLowerCase().includes(lower)) {
					score += 30;
				}
			}

			// Content match
			if (contentLower.includes(lower)) {
				score += 10;
			}

			if (score > 0) {
				results.push({ note, score });
			}
		}

		return results.sort((a, b) => b.score - a.score);
	}
}
