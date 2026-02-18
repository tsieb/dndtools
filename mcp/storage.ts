import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type { StorageAdapter, ImportResult } from '../src/lib/types/storage.js';
import type { Note, NoteId, FolderId, Link, TagEntry } from '../src/lib/types/note.js';
import type {
	SessionBoard,
	SessionBoardId,
	RelatedNoteSuggestion,
} from '../src/lib/types/session-board.js';
import type {
	VaultObject,
	VaultObjectId,
	VaultObjectType,
} from '../src/lib/types/object.js';
import type { McpChangeRecord } from '../src/lib/types/mcp.js';
import type { AppSettings } from '../src/lib/types/settings.js';
import { createNoteId, createFolderId, ROOT_FOLDER } from '../src/lib/types/note.js';
import { createSessionBoardId } from '../src/lib/types/session-board.js';
import { DEFAULT_SETTINGS } from '../src/lib/types/settings.js';
import { slugify } from '../src/lib/utils/slug.js';
import { nowISO } from '../src/lib/utils/date.js';
import { buildRelatedNoteSuggestions } from '../src/lib/domain/related-note-suggestions.js';
import { normalizeVaultObject } from '../src/lib/domain/objects.js';
import { noteToVaultObject, vaultObjectToNote } from '../src/lib/domain/object-notes.js';
import { withMcpChangePreview } from '../src/lib/domain/mcp-change-preview.js';
import { writeFileAtomic, writeJsonAtomic } from './safe-write.js';

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

interface SessionBoardStore {
	version: number;
	boards: Record<string, SessionBoard>;
}

function emptySessionBoardStore(): SessionBoardStore {
	return {
		version: 1,
		boards: {},
	};
}

interface VaultObjectStore {
	version: number;
	objects: Record<string, VaultObject>;
}

function emptyVaultObjectStore(): VaultObjectStore {
	return {
		version: 1,
		objects: {},
	};
}

interface McpChangeLog {
	version: number;
	changes: McpChangeRecord[];
}

function emptyMcpChangeLog(): McpChangeLog {
	return {
		version: 1,
		changes: [],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndexShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		typeof value.version === 'number' &&
		isRecord(value.notes) &&
		isRecord(value.links)
	);
}

function isSessionBoardShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return typeof value.version === 'number' && isRecord(value.boards);
}

function isObjectStoreShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return typeof value.version === 'number' && isRecord(value.objects);
}

function isMcpChangeLogShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return typeof value.version === 'number' && Array.isArray(value.changes);
}

type MetadataFileName =
	| 'index.json'
	| 'session-boards.json'
	| 'objects.json'
	| 'mcp-changelog.json';

type MetadataFileStatus = 'ok' | 'missing' | 'invalid_json' | 'invalid_shape';

interface MetadataIntegrityIssue {
	file: MetadataFileName;
	status: MetadataFileStatus;
	repaired: boolean;
	details: string | null;
}

export interface MetadataIntegrityReport {
	checkedAt: string;
	healthy: boolean;
	repairApplied: boolean;
	issues: MetadataIntegrityIssue[];
}

const MANAGED_FRONTMATTER_KEYS = new Set([
	'id',
	'title',
	'folder',
	'tags',
	'createdAt',
	'updatedAt',
	'deleted',
	'deletedAt',
	'pinned',
	'pinnedAt',
]);

function splitFrontmatter(data: Record<string, unknown>): {
	managed: {
		id?: string;
		title?: string;
		folder?: string;
		tags?: string[];
		createdAt?: string;
		updatedAt?: string;
		deleted?: boolean;
		deletedAt?: string | null;
		pinned?: boolean;
		pinnedAt?: string | null;
	};
	custom: Record<string, unknown>;
} {
	const managed: {
		id?: string;
		title?: string;
		folder?: string;
		tags?: string[];
		createdAt?: string;
		updatedAt?: string;
		deleted?: boolean;
		deletedAt?: string | null;
		pinned?: boolean;
		pinnedAt?: string | null;
	} = {};
	const custom: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(data)) {
		if (!MANAGED_FRONTMATTER_KEYS.has(key)) {
			custom[key] = value;
			continue;
		}

		if (key === 'id' && typeof value === 'string') managed.id = value;
		if (key === 'title' && typeof value === 'string') managed.title = value;
		if (key === 'folder' && typeof value === 'string') managed.folder = value;
		if (key === 'tags' && Array.isArray(value)) {
			managed.tags = value.filter((v): v is string => typeof v === 'string');
		}
		if (key === 'createdAt' && typeof value === 'string') managed.createdAt = value;
		if (key === 'updatedAt' && typeof value === 'string') managed.updatedAt = value;
		if (key === 'deleted' && typeof value === 'boolean') managed.deleted = value;
		if (key === 'deletedAt' && (typeof value === 'string' || value === null)) {
			managed.deletedAt = value;
		}
		if (key === 'pinned' && typeof value === 'boolean') managed.pinned = value;
		if (key === 'pinnedAt' && (typeof value === 'string' || value === null)) {
			managed.pinnedAt = value;
		}
	}

	return { managed, custom };
}

function stripUndefinedDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => stripUndefinedDeep(entry));
	}
	if (typeof value === 'object' && value !== null) {
		const output: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			if (nested === undefined) continue;
			output[key] = stripUndefinedDeep(nested);
		}
		return output;
	}
	return value;
}

function cloneVaultObject(object: VaultObject): VaultObject {
	return normalizeVaultObject({
		...object,
		tags: [...object.tags],
		data: JSON.parse(JSON.stringify(object.data)) as VaultObject['data'],
	});
}

/**
 * FileSystemAdapter — StorageAdapter implementation for the MCP server.
 * Stores notes as markdown files with YAML frontmatter on disk.
 */
export class FileSystemAdapter implements StorageAdapter {
	private vaultDir: string;
	private index: VaultIndex = emptyIndex();
	private sessionBoards: SessionBoardStore = emptySessionBoardStore();
	private objects: VaultObjectStore = emptyVaultObjectStore();
	private metadataIntegrity: MetadataIntegrityReport = {
		checkedAt: nowISO(),
		healthy: true,
		repairApplied: false,
		issues: [],
	};

	constructor(vaultDir: string) {
		this.vaultDir = path.resolve(vaultDir);
	}

	getVaultDir(): string {
		return this.vaultDir;
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

	private get sessionBoardsPath(): string {
		return path.join(this.metaDir, 'session-boards.json');
	}

	private get objectsPath(): string {
		return path.join(this.metaDir, 'objects.json');
	}

	private get mcpChangeLogPath(): string {
		return path.join(this.metaDir, 'mcp-changelog.json');
	}

	private metadataFiles(): Array<{
		name: MetadataFileName;
		filePath: string;
		defaultValue: VaultIndex | SessionBoardStore | VaultObjectStore | McpChangeLog;
		validate: (value: unknown) => boolean;
	}> {
		return [
			{
				name: 'index.json',
				filePath: this.indexPath,
				defaultValue: emptyIndex(),
				validate: isIndexShape,
			},
			{
				name: 'session-boards.json',
				filePath: this.sessionBoardsPath,
				defaultValue: emptySessionBoardStore(),
				validate: isSessionBoardShape,
			},
			{
				name: 'objects.json',
				filePath: this.objectsPath,
				defaultValue: emptyVaultObjectStore(),
				validate: isObjectStoreShape,
			},
			{
				name: 'mcp-changelog.json',
				filePath: this.mcpChangeLogPath,
				defaultValue: emptyMcpChangeLog(),
				validate: isMcpChangeLogShape,
			},
		];
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

	private toRelativeVaultPath(folder: FolderId, filename: string): string {
		const normalizedFolder = String(folder).replace(/^\/+/, '');
		return normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
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
		await writeJsonAtomic(this.indexPath, this.index);
	}

	private async loadSessionBoards(): Promise<void> {
		try {
			const raw = await fs.readFile(this.sessionBoardsPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<SessionBoardStore>;
			this.sessionBoards = {
				version: parsed.version ?? 1,
				boards: parsed.boards ?? {},
			};
		} catch {
			this.sessionBoards = emptySessionBoardStore();
		}
	}

	private async saveSessionBoards(): Promise<void> {
		await fs.mkdir(this.metaDir, { recursive: true });
		await writeJsonAtomic(this.sessionBoardsPath, this.sessionBoards);
	}

	private async loadObjects(): Promise<void> {
		try {
			const raw = await fs.readFile(this.objectsPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<VaultObjectStore>;
			const entries = Object.values(parsed.objects ?? {})
				.map((object) => normalizeVaultObject(object))
				.filter((object) => object.id && object.type);
			this.objects = {
				version: parsed.version ?? 1,
				objects: Object.fromEntries(entries.map((object) => [object.id, object])),
			};
		} catch {
			this.objects = emptyVaultObjectStore();
		}
	}

	private async saveObjects(): Promise<void> {
		await fs.mkdir(this.metaDir, { recursive: true });
		await writeJsonAtomic(this.objectsPath, this.objects);
	}

	private async loadMcpChangeLog(): Promise<McpChangeLog> {
		try {
			const raw = await fs.readFile(this.mcpChangeLogPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<McpChangeLog>;
			if (!Array.isArray(parsed.changes)) {
				return emptyMcpChangeLog();
			}
			return {
				version: parsed.version ?? 1,
				changes: parsed.changes as McpChangeRecord[],
			};
		} catch {
			return emptyMcpChangeLog();
		}
	}

	private async saveMcpChangeLog(changeLog: McpChangeLog): Promise<void> {
		await fs.mkdir(this.metaDir, { recursive: true });
		await writeJsonAtomic(this.mcpChangeLogPath, changeLog);
	}

	// --- File I/O ---

	/** Read a markdown file and parse into a Note */
	private async readNoteFile(filePath: string, relativePath?: string): Promise<Note | null> {
		try {
			const raw = await fs.readFile(filePath, 'utf-8');
			const { data, content } = matter(raw);
			const fm = data as Record<string, unknown>;
			const { managed, custom } = splitFrontmatter(fm);
			const now = nowISO();

			return {
				id: createNoteId(managed.id ?? ''),
				title: managed.title ?? path.basename(filePath, '.md'),
				content: content.replace(/^\n+/, '').replace(/\n$/, ''),
				folder: createFolderId(managed.folder ?? '/'),
				filePath: relativePath,
				tags: managed.tags ?? [],
				frontmatter: custom,
				createdAt: managed.createdAt ?? now,
				updatedAt: managed.updatedAt ?? now,
				deleted: managed.deleted ?? false,
				deletedAt: managed.deletedAt ?? null,
				pinned: managed.pinned ?? false,
				pinnedAt: managed.pinnedAt ?? null,
			};
		} catch {
			return null;
		}
	}

	/** Write a Note to a markdown file with YAML frontmatter */
	private async writeNoteFile(note: Note, filePath: string): Promise<void> {
		const fm = stripUndefinedDeep({
			...note.frontmatter,
			id: note.id,
			title: note.title,
			folder: note.folder,
			tags: note.tags,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			deleted: note.deleted,
			deletedAt: note.deletedAt,
			pinned: note.pinned,
			pinnedAt: note.pinnedAt,
		}) as Record<string, unknown>;

		const md = matter.stringify(note.content, fm);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await writeFileAtomic(filePath, md);
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

	private async scanMetadataIntegrity(options?: {
		repair?: boolean;
	}): Promise<MetadataIntegrityReport> {
		const repair = options?.repair ?? false;
		const issues: MetadataIntegrityIssue[] = [];
		let repairApplied = false;

		for (const descriptor of this.metadataFiles()) {
			let status: MetadataFileStatus = 'ok';
			let repaired = false;
			let details: string | null = null;

			try {
				const raw = await fs.readFile(descriptor.filePath, 'utf-8');
				let parsed: unknown;
				try {
					parsed = JSON.parse(raw);
				} catch {
					status = 'invalid_json';
				}

				if (status === 'ok' && !descriptor.validate(parsed)) {
					status = 'invalid_shape';
				}
			} catch {
				status = 'missing';
			}

			if (status !== 'ok') {
				details = `Detected ${status.replace('_', ' ')} for ${descriptor.name}`;
				if (repair) {
					if (status === 'invalid_json' || status === 'invalid_shape') {
						const suffix = new Date().toISOString().replace(/[:.]/g, '-');
						await fs
							.rename(descriptor.filePath, `${descriptor.filePath}.corrupt-${suffix}`)
							.catch(() => undefined);
					}
					await writeJsonAtomic(descriptor.filePath, descriptor.defaultValue);
					repaired = true;
					repairApplied = true;
					details = `Replaced ${descriptor.name} with default structure`;
				}
			}

			if (status !== 'ok') {
				issues.push({
					file: descriptor.name,
					status,
					repaired,
					details,
				});
			}
		}

		const report: MetadataIntegrityReport = {
			checkedAt: nowISO(),
			healthy: issues.length === 0,
			repairApplied,
			issues,
		};
		this.metadataIntegrity = report;
		return report;
	}

	async getMetadataIntegrityReport(): Promise<MetadataIntegrityReport> {
		return this.scanMetadataIntegrity();
	}

	async repairMetadataIntegrity(): Promise<MetadataIntegrityReport> {
		const report = await this.scanMetadataIntegrity({ repair: true });
		await this.loadIndex();
		await this.loadSessionBoards();
		await this.loadObjects();
		await this.rebuildIndexIfNeeded();
		return report;
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.vaultDir, { recursive: true });
		await fs.mkdir(this.metaDir, { recursive: true });
		await this.scanMetadataIntegrity({ repair: true });
		await this.loadIndex();
		await this.loadSessionBoards();
		await this.loadObjects();
		await this.rebuildIndexIfNeeded();
		await this.migrateLegacyObjectsToNotes();
	}

	async close(): Promise<void> {
		await this.saveIndex();
		await this.saveSessionBoards();
		await this.saveObjects();
	}

	private async migrateLegacyObjectsToNotes(): Promise<void> {
		if (Object.keys(this.objects.objects).length === 0) return;

		let changed = false;
		for (const object of Object.values(this.objects.objects)) {
			const noteId = createNoteId(String(object.id));
			const existing = await this.getNote(noteId);
			if (!existing) {
				const projected = vaultObjectToNote(object);
				await this.saveNote(projected);
				await this.resolveAndIndexLinks(projected.id, projected.content);
			}
			delete this.objects.objects[object.id];
			changed = true;
		}

		if (changed) {
			await this.saveObjects();
		}
	}

	async refreshFromDisk(): Promise<void> {
		await this.rebuildIndex();
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
		const indexed = await Promise.all(
			files.map(async (filePath) => ({ filePath, note: await this.readNoteFile(filePath) })),
		);

		for (const { filePath, note } of indexed) {
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
		return this.readNoteFile(
			filePath,
			this.toRelativeVaultPath(createFolderId(entry.folder), entry.filename),
		);
	}

	private async getNotesByIds(ids: string[]): Promise<Note[]> {
		const notes = await Promise.all(ids.map((id) => this.getNote(createNoteId(id))));
		return notes.filter((note): note is Note => !!note);
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		const ids = Object.entries(this.index.notes)
			.filter(([, entry]) => options?.includeDeleted || !entry.deleted)
			.map(([id]) => id);
		return this.getNotesByIds(ids);
	}

	private async saveNoteInternal(note: Note, persistIndex: boolean): Promise<void> {
		const existing = this.index.notes[note.id];
		let filename: string;
		let staleFilePath: string | null = null;

		if (existing) {
			// If title changed, rename the file
			const expectedFilename = `${slugify(note.title) || 'untitled'}.md`;
			if (existing.filename !== expectedFilename && expectedFilename !== '.md') {
				const existingFilenames = this.getExistingFilenames(createFolderId(String(note.folder)));
				filename = this.generateFilename(note.title, existingFilenames);
				staleFilePath = this.noteFilePath(createFolderId(existing.folder), existing.filename);
			} else {
				filename = existing.filename;
			}

			// If folder changed, move the file
			if (existing.folder !== String(note.folder)) {
				staleFilePath = this.noteFilePath(createFolderId(existing.folder), existing.filename);
			}
		} else {
			const existingFilenames = this.getExistingFilenames(note.folder);
			filename = this.generateFilename(note.title, existingFilenames);
		}

		const filePath = this.noteFilePath(note.folder, filename);
		await this.writeNoteFile(note, filePath);
		if (staleFilePath && staleFilePath !== filePath) {
			await fs.unlink(staleFilePath).catch(() => undefined);
		}
		this.indexNote(note, filename);
		if (persistIndex) {
			await this.saveIndex();
		}
	}

	async saveNote(note: Note): Promise<void> {
		await this.saveNoteInternal(note, true);
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

		return this.getNotesByIds(ids);
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		const ids = Object.entries(this.index.notes)
			.filter(([, e]) => e.tags.includes(tag) && !e.deleted)
			.map(([id]) => id);

		return this.getNotesByIds(ids);
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		const entries = Object.entries(this.index.notes)
			.filter(([, e]) => !e.deleted)
			.sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, limit);

		return this.getNotesByIds(entries.map(([id]) => id));
	}

	async getDeletedNotes(): Promise<Note[]> {
		const ids = Object.entries(this.index.notes)
			.filter(([, e]) => e.deleted)
			.map(([id]) => id);

		return this.getNotesByIds(ids);
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

	async getAllLinks(): Promise<Link[]> {
		return this.getAllLinksFromIndex().map((link) => ({
			sourceId: createNoteId(link.sourceId),
			targetId: createNoteId(link.targetId),
			displayText: link.displayText,
			position: link.position,
		}));
	}

	async getSessionBoards(): Promise<SessionBoard[]> {
		return Object.values(this.sessionBoards.boards).sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);
	}

	async getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		return this.sessionBoards.boards[id] ?? null;
	}

	async saveSessionBoard(board: SessionBoard): Promise<void> {
		const normalizeInt = (value: number, min: number, max: number): number =>
			Math.min(max, Math.max(min, Math.round(value)));
		const columns = normalizeInt(board.layout?.columns ?? 12, 8, 32);
		const normalizedTiles = board.tiles.map((tile) => {
			const w = normalizeInt(tile.w, 2, columns);
			return {
				id: tile.id,
				noteId: createNoteId(String(tile.noteId)),
				x: normalizeInt(tile.x, 0, columns - w),
				y: normalizeInt(tile.y, 0, 200),
				w,
				h: normalizeInt(tile.h, 2, 8),
				style: tile.style
					? {
							backgroundColor: tile.style.backgroundColor,
							borderColor: tile.style.borderColor,
							borderWidth: normalizeInt(tile.style.borderWidth ?? 1, 0, 8),
							borderRadius: normalizeInt(tile.style.borderRadius ?? 10, 0, 36),
							opacity: Math.max(0.2, Math.min(1, tile.style.opacity ?? 1)),
							scale:
								tile.style.scale === undefined
									? undefined
									: Math.max(0.5, Math.min(2.5, tile.style.scale)),
						}
					: undefined,
			};
		});

		this.sessionBoards.boards[board.id] = {
			id: createSessionBoardId(String(board.id)),
			name: board.name.trim() || 'Session Board',
			description: board.description ?? '',
			tiles: normalizedTiles,
			layout: {
				columns,
				rowHeight: normalizeInt(board.layout?.rowHeight ?? 120, 70, 220),
				minRows: normalizeInt(board.layout?.minRows ?? 12, 6, 240),
				gap: normalizeInt(board.layout?.gap ?? 12, 0, 28),
			},
			style: board.style
				? {
						backgroundColor: board.style.backgroundColor,
						backgroundPattern: board.style.backgroundPattern ?? 'none',
						sectionTintColor: board.style.sectionTintColor,
						sectionTintOpacity: Math.max(0, Math.min(0.75, board.style.sectionTintOpacity ?? 0)),
					}
				: undefined,
			createdAt: board.createdAt,
			updatedAt: board.updatedAt,
		};
		await this.saveSessionBoards();
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		delete this.sessionBoards.boards[id];
		await this.saveSessionBoards();
	}

	async suggestRelatedNotes(
		noteIds: NoteId[],
		limit = 8,
	): Promise<RelatedNoteSuggestion[]> {
		if (noteIds.length === 0) return [];
		const notes = await this.getAllNotes();
		const links = this.getAllLinksFromIndex().map((link) => ({
			sourceId: createNoteId(link.sourceId),
			targetId: createNoteId(link.targetId),
			displayText: link.displayText,
			position: link.position,
		}));
		return buildRelatedNoteSuggestions({
			notes,
			links,
			selectedNoteIds: noteIds,
			limit,
		});
	}

	// --- Vault Objects ---

	async getObject(id: VaultObjectId): Promise<VaultObject | null> {
		const noteId = createNoteId(String(id));
		const fromNote = await this.getNote(noteId).then((note) => (note ? noteToVaultObject(note) : null));
		if (fromNote) return fromNote;

		await this.loadObjects();
		const object = this.objects.objects[id];
		if (object) return cloneVaultObject(object);

		// If another adapter instance wrote notes to disk, our index can be stale.
		await this.rebuildIndex();
		return this.getNote(noteId).then((note) => (note ? noteToVaultObject(note) : null));
	}

	async getAllObjects(options?: {
		type?: VaultObjectType;
		query?: string;
	}): Promise<VaultObject[]> {
		const noteObjects = (await this.getAllNotes())
			.map((note) => noteToVaultObject(note))
			.filter((object): object is VaultObject => !!object);

		await this.loadObjects();
		const seenIds = new Set(noteObjects.map((object) => object.id));
		const legacyObjects = Object.values(this.objects.objects)
			.filter((object) => !seenIds.has(object.id))
			.map((object) => cloneVaultObject(object));
		const allObjects = [...noteObjects, ...legacyObjects];
		const query = options?.query?.trim().toLowerCase() ?? '';
		return allObjects
			.filter((object) => !options?.type || object.type === options.type)
			.filter((object) => {
				if (!query) return true;
				const haystack = [
					object.name,
					object.summary,
					object.tags.join(' '),
					object.type,
				]
					.join(' ')
					.toLowerCase();
				return haystack.includes(query);
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async saveObject(object: VaultObject): Promise<void> {
		const normalized = cloneVaultObject(object);
		const noteId = createNoteId(String(normalized.id));
		const existingNote = await this.getNote(noteId);
		const note = vaultObjectToNote(normalized, existingNote);
		await this.saveNote(note);
		await this.resolveAndIndexLinks(note.id, note.content);

		await this.loadObjects();
		if (this.objects.objects[normalized.id]) {
			delete this.objects.objects[normalized.id];
			await this.saveObjects();
		}
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		const noteId = createNoteId(String(id));
		const note = await this.getNote(noteId);
		if (note) {
			await this.deleteNote(noteId, true);
		}

		await this.loadObjects();
		if (this.objects.objects[id]) {
			delete this.objects.objects[id];
			await this.saveObjects();
		}
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
		await writeJsonAtomic(this.settingsPath, settings);
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
				await this.saveNoteInternal(note, false);
				imported++;
			} catch (e) {
				errors.push(`Failed to import "${note.title}": ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		if (imported > 0) {
			await this.saveIndex();
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

	// --- Index access (fast, no file I/O) ---

	/** Get all note entries from the in-memory index without reading files */
	getIndexEntries(): Array<{
		id: string;
		title: string;
		folder: string;
		filePath: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		deleted: boolean;
		deletedAt: string | null;
	}> {
		return Object.entries(this.index.notes).map(([id, entry]) => {
			const folder = createFolderId(entry.folder);
			return {
				id,
				...entry,
				filePath: this.toRelativeVaultPath(folder, entry.filename),
			};
		});
	}

	/** Get all links from the in-memory index without reading files */
	getAllLinksFromIndex(): Array<{
		sourceId: string;
		targetId: string;
		displayText: string;
		position: number;
	}> {
		const allLinks: Array<{
			sourceId: string;
			targetId: string;
			displayText: string;
			position: number;
		}> = [];
		for (const [sourceId, links] of Object.entries(this.index.links)) {
			for (const link of links) {
				allLinks.push({
					sourceId,
					targetId: link.targetId,
					displayText: link.displayText,
					position: link.position,
				});
			}
		}
		return allLinks;
	}

	/** Get the computed folder tree from the index */
	getFolderTree(): Array<{ path: string; noteCount: number; subfolders: string[] }> {
		const folderCounts = new Map<string, number>();
		const allFolders = new Set<string>();

		for (const entry of Object.values(this.index.notes)) {
			if (entry.deleted) continue;
			const folder = entry.folder;
			allFolders.add(folder);
			folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
		}

		const childrenByParent = new Map<string, string[]>();
		for (const folder of allFolders) {
			const parent = folder.substring(0, folder.lastIndexOf('/')) || '/';
			if (folder === parent) continue;
			const siblings = childrenByParent.get(parent);
			if (siblings) {
				siblings.push(folder);
			} else {
				childrenByParent.set(parent, [folder]);
			}
		}

		for (const siblings of childrenByParent.values()) {
			siblings.sort((a, b) => a.localeCompare(b));
		}

		const tree: Array<{ path: string; noteCount: number; subfolders: string[] }> = [];
		for (const folder of allFolders) {
			const subfolders = childrenByParent.get(folder) ?? [];
			tree.push({
				path: folder,
				noteCount: folderCounts.get(folder) ?? 0,
				subfolders,
			});
		}

		return tree.sort((a, b) => a.path.localeCompare(b.path));
	}

	// --- MCP staged change log ---

	async getMcpChangeLog(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		return [...changeLog.changes];
	}

	async getPendingMcpChanges(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		return changeLog.changes
			.filter((change) => change.status === 'pending')
			.map((change) => withMcpChangePreview(change));
	}

	async recordMcpChange(
		change: Omit<McpChangeRecord, 'id' | 'createdAt' | 'resolvedAt' | 'status' | 'source'>,
	): Promise<McpChangeRecord> {
		const changeLog = await this.loadMcpChangeLog();
		const record: McpChangeRecord = {
			id: randomUUID(),
			createdAt: nowISO(),
			resolvedAt: null,
			source: 'mcp',
			status: 'pending',
			...change,
		};
		changeLog.changes.push(record);
		await this.saveMcpChangeLog(changeLog);
		return record;
	}

	async approveMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		const changeLog = await this.loadMcpChangeLog();
		const target = changeLog.changes.find(
			(entry) => entry.id === changeId && entry.status === 'pending',
		);
		if (!target) {
			return null;
		}

		const related = changeLog.changes
			.filter(
				(entry) =>
					entry.status === 'pending' &&
					entry.noteId === target.noteId &&
					entry.createdAt <= target.createdAt,
			)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

		for (const change of related) {
			await this.applyMcpChange(change);
			change.status = 'approved';
			change.resolvedAt = nowISO();
		}

		await this.saveMcpChangeLog(changeLog);
		return target;
	}

	async approveAllMcpChanges(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		const pending = changeLog.changes.filter((change) => change.status === 'pending');

		for (const change of pending) {
			await this.applyMcpChange(change);
			change.status = 'approved';
			change.resolvedAt = nowISO();
		}

		await this.saveMcpChangeLog(changeLog);
		return pending;
	}

	async rejectMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		const changeLog = await this.loadMcpChangeLog();
		const change = changeLog.changes.find(
			(entry) => entry.id === changeId && entry.status === 'pending',
		);
		if (!change) {
			return null;
		}

		change.status = 'rejected';
		change.resolvedAt = nowISO();
		await this.saveMcpChangeLog(changeLog);
		return change;
	}

	async rejectAllMcpChanges(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		const pending = changeLog.changes.filter((change) => change.status === 'pending');
		for (const change of pending) {
			change.status = 'rejected';
			change.resolvedAt = nowISO();
		}
		await this.saveMcpChangeLog(changeLog);
		return pending;
	}

	private async applyMcpChange(change: McpChangeRecord): Promise<void> {
		if (change.after?.note) {
			const note = change.after.note;
			await this.saveNote(note);
			await this.resolveAndIndexLinks(note.id, note.content);
			return;
		}

		await this.deleteNote(createNoteId(change.noteId), true);
	}

	// --- Utilities for tools ---

	/** Resolve wikilinks in a note's content to actual note IDs and update the link index */
	async resolveAndIndexLinks(noteId: NoteId, content: string): Promise<void> {
		const { extractWikilinks } = await import('../src/lib/domain/link-extractor.js');
		const extracted = extractWikilinks(content);
		const links: Link[] = [];

		for (const wl of extracted) {
			const target = wl.targetIdHint
				? await this.getNote(createNoteId(wl.targetIdHint))
				: await this.resolveTitle(wl.title);
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
