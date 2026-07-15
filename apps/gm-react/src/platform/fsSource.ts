import Dexie, { type Table } from 'dexie';
import {
	checkContentSourceConstraints,
	serializeMarkdownNote,
	type ContentConstraintCheck,
} from '@dndtools/core';

/**
 * fsSource — the LOCAL-FOLDER vault source (WS-7). Connects a real on-disk markdown folder via the
 * File System Access API (`showDirectoryPicker`, Chromium-only — callers feature-detect with
 * {@link isFsSourceSupported} and hide the option elsewhere), persists the granted
 * `FileSystemDirectoryHandle` in IndexedDB (handles are structured-cloneable, so they survive a
 * reload), and re-checks `queryPermission`/`requestPermission` before every use — a revoked grant
 * fails closed to "reconnect", never a silent no-op.
 *
 * This module is TRANSPORT ONLY. The import path feeds the Processing Core's transactional
 * `content.commit-import` command (the app dispatches; the core is the authority), and the
 * write-back path runs only AFTER the core has accepted an acknowledged `content.write-to-source`
 * (CONTENT-012 — the core recomputes the loss check and gates on the acknowledgment token; this
 * module just performs the byte write its accepted event authorizes).
 *
 * The recursive walk and the nested write are written against MINIMAL STRUCTURAL interfaces
 * (`FsDirHandleLike` / `FsFileHandleLike`) rather than the DOM lib types, so the pure logic is
 * unit-testable in Node with mock handles and the file compiles without the WICG type package.
 */

// --- minimal structural types for the File System Access API ------------------------------------

export type FsPermissionMode = 'read' | 'readwrite';

export interface FsWritableLike {
	write(data: string): Promise<void>;
	close(): Promise<void>;
}

export interface FsFileHandleLike {
	readonly kind: 'file';
	readonly name: string;
	getFile(): Promise<{ text(): Promise<string> }>;
	createWritable(): Promise<FsWritableLike>;
}

export interface FsDirHandleLike {
	readonly kind: 'directory';
	readonly name: string;
	values(): AsyncIterable<FsDirHandleLike | FsFileHandleLike>;
	getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirHandleLike>;
	getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandleLike>;
	// Chromium's persisted-handle permission surface (not in the TS DOM lib).
	queryPermission?(descriptor: { mode: FsPermissionMode }): Promise<string>;
	requestPermission?(descriptor: { mode: FsPermissionMode }): Promise<string>;
}

/** Feature-detect the File System Access API (Chromium only). Callers hide the option elsewhere. */
export function isFsSourceSupported(): boolean {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// --- persisted source registry (handle + metadata) -----------------------------------------------

/** One connected local folder: the persisted handle plus per-source metadata. */
export interface FolderSourceRecord {
	id: string;
	/** The folder's display name (the picked directory's name at connect time). */
	name: string;
	/** The structured-cloneable directory handle (revived with its permission state by the browser). */
	handle: FsDirHandleLike;
	connectedAt: string;
	lastImportAt: string | null;
	lastWriteAt: string | null;
}

const SOURCES_DB_NAME = 'dndtools-sources';

/**
 * A dedicated tiny Dexie DB for connected-source handles, deliberately SEPARATE from the core
 * `dndtools-v2` store: directory handles are platform transport state, not durable Processing-Core
 * documents, so they must never ride the core DB's versioned migration discipline (coreStore
 * DB_VERSION stays untouched).
 */
class SourcesDatabase extends Dexie {
	folders!: Table<FolderSourceRecord, string>;

	constructor() {
		super(SOURCES_DB_NAME);
		this.version(1).stores({
			// Only the primary key is indexed; the handle itself must stay un-indexed (not a valid key).
			folders: '&id',
		});
	}
}

let dbInstance: SourcesDatabase | null = null;

function db(): SourcesDatabase {
	if (!dbInstance) dbInstance = new SourcesDatabase();
	return dbInstance;
}

/** All connected folder sources, oldest first. */
export async function listFolderSources(): Promise<FolderSourceRecord[]> {
	const rows = await db().folders.toArray();
	return rows.sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
}

/**
 * Open the Chromium directory picker (`readwrite` so write-back works without a second prompt) and
 * persist the granted handle. Resolves null when the user cancels (AbortError) — never throws for
 * a cancel. Throws on an unsupported platform; feature-detect first.
 */
export async function connectFolderSource(): Promise<FolderSourceRecord | null> {
	if (!isFsSourceSupported()) {
		throw new Error('This browser cannot connect a local folder. Use the desktop app or Chromium.');
	}
	let handle: FsDirHandleLike;
	try {
		handle = await (
			window as unknown as {
				showDirectoryPicker(options: { mode: FsPermissionMode }): Promise<FsDirHandleLike>;
			}
		).showDirectoryPicker({ mode: 'readwrite' });
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return null;
		throw error;
	}
	const record: FolderSourceRecord = {
		id: crypto.randomUUID(),
		name: handle.name,
		handle,
		connectedAt: new Date().toISOString(),
		lastImportAt: null,
		lastWriteAt: null,
	};
	await db().folders.put(record);
	return record;
}

export async function disconnectFolderSource(id: string): Promise<void> {
	await db().folders.delete(id);
}

/** Stamp per-source activity metadata (lastImportAt / lastWriteAt). */
export async function touchFolderSource(
	id: string,
	patch: Partial<Pick<FolderSourceRecord, 'lastImportAt' | 'lastWriteAt'>>,
): Promise<void> {
	await db().folders.update(id, patch);
}

/**
 * Re-validate a persisted handle's permission before use. `queryPermission` first (silent), then
 * `requestPermission` (one user-gesture prompt). Fails CLOSED: anything but an explicit 'granted'
 * returns false and the caller surfaces a reconnect state instead of silently reading/writing.
 */
export async function ensureFolderPermission(
	handle: FsDirHandleLike,
	mode: FsPermissionMode,
): Promise<boolean> {
	try {
		if (typeof handle.queryPermission === 'function') {
			const state = await handle.queryPermission({ mode });
			if (state === 'granted') return true;
			if (state === 'denied') return false;
		}
		if (typeof handle.requestPermission === 'function') {
			return (await handle.requestPermission({ mode })) === 'granted';
		}
		// No permission surface at all (non-Chromium mock/runtime): fail closed.
		return false;
	} catch {
		return false;
	}
}

// --- folder walk (pure over the structural handle — unit-tested with mocks) ----------------------

/** Sensible caps so a mis-picked giant folder can't hang the tab or flood an import. */
export const WALK_MAX_FILES = 500;
export const WALK_MAX_DEPTH = 12;

export interface WalkedFolder {
	/** `{path, text}` per markdown file — exactly the `content.commit-import` files payload shape. */
	files: Array<{ path: string; text: string }>;
	/** True when the file cap stopped the walk early (the import is partial and the UI says so). */
	truncated: boolean;
	/** How many markdown files were read (== files.length). */
	fileCount: number;
}

function isMarkdownName(name: string): boolean {
	return /\.(md|markdown)$/i.test(name);
}

/** Hidden entries (dotfiles, `.obsidian/`, `.git/`…) never enter an import. */
function isHiddenName(name: string): boolean {
	return name.startsWith('.');
}

/**
 * Recursively read every `*.md` / `*.markdown` file under `root` into `{path, text}` entries with
 * '/'-joined relative paths — the exact shape `content.commit-import` takes. Deterministic: entries
 * are visited in name order (directory iteration order is unspecified). Depth- and count-capped;
 * hidden entries are skipped.
 */
export async function importFromFolder(
	root: FsDirHandleLike,
	options: { maxFiles?: number; maxDepth?: number } = {},
): Promise<WalkedFolder> {
	const maxFiles = options.maxFiles ?? WALK_MAX_FILES;
	const maxDepth = options.maxDepth ?? WALK_MAX_DEPTH;
	const files: Array<{ path: string; text: string }> = [];
	let truncated = false;

	async function walk(dir: FsDirHandleLike, prefix: string, depth: number): Promise<void> {
		if (depth > maxDepth || truncated) return;
		const entries: Array<FsDirHandleLike | FsFileHandleLike> = [];
		for await (const entry of dir.values()) entries.push(entry);
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (truncated) return;
			if (isHiddenName(entry.name)) continue;
			if (entry.kind === 'file') {
				if (!isMarkdownName(entry.name)) continue;
				if (files.length >= maxFiles) {
					truncated = true;
					return;
				}
				const file = await entry.getFile();
				files.push({ path: `${prefix}${entry.name}`, text: await file.text() });
			} else {
				await walk(entry, `${prefix}${entry.name}/`, depth + 1);
			}
		}
	}

	await walk(root, '', 0);
	return { files, truncated, fileCount: files.length };
}

// --- write-back ----------------------------------------------------------------------------------

/**
 * Reject a relative write path that could escape or hide inside the connected folder. The core's
 * SEC-002 path safety already gated the import side; the write side re-checks locally because the
 * path here comes from stored item metadata, not a fresh command payload.
 */
export function isSafeRelativePath(path: string): boolean {
	if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
	const segments = path.split('/');
	return segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..' && !seg.startsWith('.'));
}

/**
 * Create/overwrite one markdown file at a '/'-relative path inside the connected folder, creating
 * intermediate directories as needed. Call ONLY after the core accepted the corresponding
 * `content.write-to-source` command — this is the transport half of CONTENT-012, never the gate.
 */
export async function writeBack(
	root: FsDirHandleLike,
	path: string,
	markdown: string,
): Promise<void> {
	if (!isSafeRelativePath(path)) {
		throw new Error(`Refusing to write unsafe path "${path}".`);
	}
	const segments = path.split('/');
	const fileName = segments.pop()!;
	let dir = root;
	for (const segment of segments) {
		dir = await dir.getDirectoryHandle(segment, { create: true });
	}
	const fileHandle = await dir.getFileHandle(fileName, { create: true });
	const writable = await fileHandle.createWritable();
	try {
		await writable.write(markdown);
	} finally {
		await writable.close();
	}
}

// --- push plan (pure — which notes go where, gated by the CONTENT-012 pre-write check) -----------

/** The minimal note shape a push plan needs (a subset of the core's `ContentItemView`). */
export interface PushPlanNote {
	id: string;
	title: string;
	body: string;
	fields: Record<string, unknown>;
	visibility: string;
}

/** One planned write: the note's serialized text, its target path, and its pre-write check. */
export interface PushPlanEntry {
	itemId: string;
	title: string;
	/** '/'-relative target path (slugged + deduped). Meaningful for folder sources. */
	path: string;
	/** The serialized note text the `content.write-to-source` gate checks AND the transport writes. */
	noteText: string;
	/** The CONTENT-012 pre-write constraint check for this note against the target source. */
	check: ContentConstraintCheck;
}

/** A whole push, planned BEFORE any dispatch so the loss summary is shown up front. */
export interface PushPlan {
	source: string;
	entries: PushPlanEntry[];
	/** Entries whose write would lose or downgrade note structures (need acknowledgment). */
	lossyEntries: PushPlanEntry[];
	/** Union of DOWNGRADED features across all entries (for the confirm summary). */
	lossyFeatures: string[];
	/** Union of DROPPED features across all entries (for the confirm summary). */
	droppedFeatures: string[];
	/** True when ANY entry requires acknowledgment — the UI must confirm before dispatching. */
	requiresAcknowledgment: boolean;
}

/** Front-matter keys surfaced explicitly (mirrors the core exporter); raw copies are skipped. */
const EXPLICIT_FIELD_KEYS = new Set(['aliases', 'tags', 'wikilinks']);

/**
 * Serialize one note to portable markdown (front matter + body), mirroring the core exporter's
 * property mapping: user string/string[] fields are preserved, aliases/tags emitted as lists, and the
 * DND Tools visibility re-emitted NAMESPACED under `dndtools.visibility` (never a bare property).
 */
export function serializeNoteForPush(note: PushPlanNote): string {
	const properties: Record<string, string | string[]> = { title: note.title };
	for (const [key, value] of Object.entries(note.fields)) {
		if (EXPLICIT_FIELD_KEYS.has(key)) continue;
		if (typeof value === 'string') properties[key] = value;
		else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
			properties[key] = value as string[];
		}
	}
	const aliases = note.fields['aliases'];
	if (Array.isArray(aliases) && aliases.length > 0) properties['aliases'] = aliases.map(String);
	const tags = note.fields['tags'];
	if (Array.isArray(tags) && tags.length > 0) properties['tags'] = tags.map(String);
	properties['dndtools.visibility'] = note.visibility;
	return serializeMarkdownNote(properties, note.body);
}

/** Slug a note title to a stable file stem (mirrors the core exporter's path convention). */
function slugStem(title: string, fallback: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stem === '' ? fallback : stem;
}

/**
 * Plan a push of notes to a target source (pure). Every note gets a deduped `<slug>.md` path, its
 * serialized text, and its CONTENT-012 pre-write check. The plan carries the union loss summary so
 * the UI confirms ONCE for the whole push; each entry still keeps its OWN acknowledgment token
 * (the core re-checks per item — a stale token rejects that item only).
 */
export function planNotesPush(notes: PushPlanNote[], source: string): PushPlan {
	const usedPaths = new Set<string>();
	const entries: PushPlanEntry[] = notes.map((note) => {
		const stem = slugStem(note.title, note.id);
		let path = `${stem}.md`;
		for (let n = 2; usedPaths.has(path); n += 1) path = `${stem}-${n}.md`;
		usedPaths.add(path);
		const noteText = serializeNoteForPush(note);
		return {
			itemId: note.id,
			title: note.title,
			path,
			noteText,
			check: checkContentSourceConstraints(noteText, source),
		};
	});
	const lossyEntries = entries.filter((entry) => entry.check.requiresAcknowledgment);
	const lossyFeatures = [...new Set(lossyEntries.flatMap((e) => e.check.lossyFeatures))].sort();
	const droppedFeatures = [...new Set(lossyEntries.flatMap((e) => e.check.droppedFeatures))].sort();
	return {
		source,
		entries,
		lossyEntries,
		lossyFeatures,
		droppedFeatures,
		requiresAcknowledgment: lossyEntries.length > 0,
	};
}

export const __testing = {
	closeDb: async (): Promise<void> => {
		if (dbInstance) {
			dbInstance.close();
			dbInstance = null;
		}
	},
	SOURCES_DB_NAME,
};
