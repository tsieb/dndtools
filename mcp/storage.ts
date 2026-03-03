import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type {
	StorageAdapter,
	ImportResult,
	SafetySnapshot,
	SnapshotRestoreResult,
} from '../src/lib/types/storage.js';
import type { Note, NoteId, FolderId, Link, TagEntry } from '../src/lib/types/note.js';
import type { NoteTemplate, ReusableSnippet } from '../src/lib/types/template-library.js';
import type {
	SessionBoard,
	SessionBoardId,
	RelatedNoteSuggestion,
} from '../src/lib/types/session-board.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from '../src/lib/types/object.js';
import type { McpChangeRecord } from '../src/lib/types/mcp.js';
import type {
	AppSettings,
	McpPolicyPresetId,
	McpPolicySettings,
} from '../src/lib/types/settings.js';
import { createNoteId, createFolderId, ROOT_FOLDER } from '../src/lib/types/note.js';
import type { ContentVisibility } from '../src/lib/types/visibility.js';
import {
	DEFAULT_CONTENT_VISIBILITY,
	normalizeContentVisibility,
} from '../src/lib/types/visibility.js';
import { createSessionBoardId } from '../src/lib/types/session-board.js';
import { DEFAULT_SETTINGS } from '../src/lib/types/settings.js';
import { slugify } from '../src/lib/utils/slug.js';
import { nowISO } from '../src/lib/utils/date.js';
import { buildRelatedNoteSuggestions } from '../src/lib/domain/related-note-suggestions.js';
import { buildTwoSentenceContextSnippetAtPosition } from '../src/lib/domain/backlink-context.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	resolveLinkTargetId,
} from '../src/lib/domain/link-resolution.js';
import { normalizeVaultObject } from '../src/lib/domain/objects.js';
import { buildObjectRelationshipGraph } from '../src/lib/domain/object-relationships.js';
import { noteToVaultObject, vaultObjectToNote } from '../src/lib/domain/object-notes.js';
import { lintVaultObjects } from '../src/lib/domain/object-validation.js';
import { withMcpChangePreview } from '../src/lib/domain/mcp-change-preview.js';
import { DND_TEMPLATES, GLOBAL_TEMPLATE_IDS } from '../src/lib/domain/templates.js';
import { REUSABLE_SNIPPETS } from '../src/lib/domain/snippets.js';
import { normalizeWorldCalendar } from '../src/lib/domain/world-calendar.js';
import { normalizeDiceMacros } from '../src/lib/domain/dice.js';
import {
	DEFAULT_SESSION_CONTEXT,
	normalizeBoardTemplatesSetting,
	normalizeSessionBoardLayout,
	normalizeSessionContextState,
	normalizeSessionBoardStyle,
	normalizeSessionBoardTile,
} from '../src/lib/domain/session-board.js';
import {
	CURRENT_SCHEMA_VERSION,
	getSchemaMigrationReport as getVaultSchemaMigrationReport,
	runSchemaMigrations as runVaultSchemaMigrations,
	type SchemaMigrationReport,
} from './migrations.js';
import { writeFileAtomic, writeJsonAtomic } from './safe-write.js';

/** A schema migration checkpoint directory entry returned to callers. */
export interface MigrationCheckpointEntry {
	name: string;
	dirPath: string;
	createdAt: string;
	fileCount: number;
}

async function countFiles(dir: string): Promise<number> {
	let count = 0;
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile()) {
			count += 1;
		} else if (entry.isDirectory()) {
			count += await countFiles(path.join(dir, entry.name));
		}
	}
	return count;
}

function toTitleCaseFromSlug(value: string): string {
	return value
		.split(/[-_]+/g)
		.filter((segment) => segment.length > 0)
		.map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
		.join(' ');
}

function ensureLeadingSlash(value: string): string {
	const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
	return normalized ? `/${normalized}` : '/';
}

/** Stored link entry in the vault index */
interface StoredLink {
	targetId: string;
	displayText: string;
	position: number;
	resolvedBy?: 'id' | 'title' | 'alias';
	resolvedAlias?: string | null;
	contextSnippet?: string | null;
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
			visibility: ContentVisibility;
			aliases?: string[];
			createdAt: string;
			updatedAt: string;
			deleted: boolean;
			deletedAt: string | null;
		}
	>;
	links: Record<string, StoredLink[]>;
	aliasIndex: Record<string, string[]>;
}

function emptyIndex(): VaultIndex {
	return { version: CURRENT_SCHEMA_VERSION.metadata, notes: {}, links: {}, aliasIndex: {} };
}

interface SessionBoardStore {
	version: number;
	boards: Record<string, SessionBoard>;
}

function emptySessionBoardStore(): SessionBoardStore {
	return {
		version: CURRENT_SCHEMA_VERSION.metadata,
		boards: {},
	};
}

interface VaultObjectStore {
	version: number;
	objects: Record<string, VaultObject>;
}

function emptyVaultObjectStore(): VaultObjectStore {
	return {
		version: CURRENT_SCHEMA_VERSION.metadata,
		objects: {},
	};
}

interface VaultObjectHistoryStore {
	version: number;
	history: Record<string, VaultObjectHistoryEntry[]>;
}

function emptyVaultObjectHistoryStore(): VaultObjectHistoryStore {
	return {
		version: CURRENT_SCHEMA_VERSION.metadata,
		history: {},
	};
}

interface McpChangeLog {
	version: number;
	changes: McpChangeRecord[];
}

function emptyMcpChangeLog(): McpChangeLog {
	return {
		version: CURRENT_SCHEMA_VERSION.metadata,
		changes: [],
	};
}

function emptyWriteJournal(): WriteJournal {
	return {
		version: 1,
		pending: [],
	};
}

function emptySnapshotManifest(): SnapshotManifest {
	return {
		version: SNAPSHOT_MANIFEST_VERSION,
		snapshots: [],
	};
}

function computeContentChecksum(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}

function cloneNoteSnapshot(note: Note): Note {
	return {
		...note,
		tags: [...note.tags],
		frontmatter: { ...note.frontmatter },
		visibility: normalizeContentVisibility(note.visibility),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndexShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const aliasIndex = value.aliasIndex;
	return (
		typeof value.version === 'number' &&
		isRecord(value.notes) &&
		isRecord(value.links) &&
		(aliasIndex === undefined || isRecord(aliasIndex))
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

function isObjectHistoryStoreShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return typeof value.version === 'number' && isRecord(value.history);
}

function isMcpChangeLogShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return typeof value.version === 'number' && Array.isArray(value.changes);
}

function isSettingsShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const version = value.version;
	return version === undefined || typeof version === 'number';
}

function isWriteJournalShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	if (typeof value.version !== 'number') return false;
	if (!Array.isArray(value.pending)) return false;
	return value.pending.every(
		(entry) =>
			isRecord(entry) &&
			typeof entry.id === 'string' &&
			typeof entry.operation === 'string' &&
			typeof entry.startedAt === 'string',
	);
}

type MetadataFileName =
	| 'index.json'
	| 'settings.json'
	| 'session-boards.json'
	| 'objects.json'
	| 'object-history.json'
	| 'mcp-changelog.json';

type MetadataFileStatus = 'ok' | 'missing' | 'invalid_json' | 'invalid_shape';

interface MetadataIntegrityIssue {
	file: MetadataFileName;
	status: MetadataFileStatus;
	repaired: boolean;
	details: string | null;
}

type NoteIntegrityIssueStatus =
	| 'missing_marker'
	| 'invalid_marker'
	| 'checksum_mismatch'
	| 'orphan_entry';

interface NoteIntegrityIssue {
	noteId: string;
	filePath: string;
	status: NoteIntegrityIssueStatus;
	details: string;
	repaired: boolean;
}

interface JournalRecoveryStatus {
	replayed: boolean;
	pendingEntries: number;
	recoveredAt: string | null;
}

export interface MetadataIntegrityReport {
	checkedAt: string;
	healthy: boolean;
	repairApplied: boolean;
	issues: MetadataIntegrityIssue[];
	noteIssues: NoteIntegrityIssue[];
	journalRecovery: JournalRecoveryStatus;
}

interface WriteJournalEntry {
	id: string;
	operation: string;
	startedAt: string;
}

interface WriteJournal {
	version: number;
	pending: WriteJournalEntry[];
}

interface SnapshotStore {
	version: number;
	createdAt: string;
	reason: string;
	notes: Note[];
	index: VaultIndex;
	sessionBoards: SessionBoardStore;
	objects: VaultObjectStore;
	objectHistory: VaultObjectHistoryStore;
	mcpChangeLog: McpChangeLog;
}

interface SnapshotManifest {
	version: number;
	snapshots: SafetySnapshot[];
}

const NOTE_MARKER_KEY = 'dndtools_integrity';
const NOTE_MARKER_VERSION = 1;
const SNAPSHOT_MANIFEST_VERSION = 1;
const SNAPSHOT_STORE_VERSION = 1;
const DEFAULT_MCP_AGENT_ID = 'default-agent';

interface McpPolicyBehavior {
	presetId: McpPolicyPresetId;
	label: string;
	autoApproveNonStructural: boolean;
	requireReviewStructural: boolean;
}

const MCP_POLICY_BEHAVIORS: Record<McpPolicyPresetId, McpPolicyBehavior> = {
	strict_review: {
		presetId: 'strict_review',
		label: 'Strict Review',
		autoApproveNonStructural: false,
		requireReviewStructural: true,
	},
	balanced: {
		presetId: 'balanced',
		label: 'Balanced',
		autoApproveNonStructural: true,
		requireReviewStructural: true,
	},
	trusted: {
		presetId: 'trusted',
		label: 'Trusted',
		autoApproveNonStructural: true,
		requireReviewStructural: false,
	},
};

function isMcpPolicyPresetId(value: unknown): value is McpPolicyPresetId {
	return value === 'strict_review' || value === 'balanced' || value === 'trusted';
}

function normalizeMcpPolicySettings(value: unknown): McpPolicySettings {
	if (!isRecord(value)) {
		return { ...DEFAULT_SETTINGS.mcpPolicySettings };
	}

	const defaultPresetId = isMcpPolicyPresetId(value.defaultPresetId)
		? value.defaultPresetId
		: DEFAULT_SETTINGS.mcpPolicySettings.defaultPresetId;
	const perAgentRaw = isRecord(value.perAgent) ? value.perAgent : {};
	const perAgent: Record<string, McpPolicyPresetId> = {};
	for (const [agentId, presetId] of Object.entries(perAgentRaw)) {
		if (!agentId.trim()) continue;
		if (isMcpPolicyPresetId(presetId)) {
			perAgent[agentId] = presetId;
		}
	}
	return { defaultPresetId, perAgent };
}

function normalizeSettingValue<K extends keyof AppSettings>(
	key: K,
	value: unknown,
): AppSettings[K] {
	if (key === 'mcpPolicySettings') {
		return normalizeMcpPolicySettings(value) as AppSettings[K];
	}
	if (key === 'boardTemplates') {
		return normalizeBoardTemplatesSetting(value) as AppSettings[K];
	}
	if (key === 'diceMacros') {
		return normalizeDiceMacros(value) as AppSettings[K];
	}
	if (key === 'worldCalendar') {
		return normalizeWorldCalendar(value) as AppSettings[K];
	}
	return (value as AppSettings[K]) ?? DEFAULT_SETTINGS[key];
}

function normalizeSessionBoardRecord(
	key: string,
	value: unknown,
): { id: SessionBoardId; board: SessionBoard } | null {
	if (!isRecord(value)) return null;
	const rawTiles = Array.isArray(value.tiles) ? value.tiles : [];
	const layout = normalizeSessionBoardLayout(isRecord(value.layout) ? value.layout : undefined);
	const tiles: SessionBoard['tiles'] = [];

	for (const rawTile of rawTiles) {
		if (!isRecord(rawTile) || typeof rawTile.id !== 'string' || rawTile.id.trim().length === 0) {
			continue;
		}
		const noteIdRaw =
			typeof rawTile.noteId === 'string'
				? rawTile.noteId.trim()
				: String(rawTile.noteId ?? '').trim();
		const noteId =
			noteIdRaw.length > 0 && noteIdRaw !== 'undefined' ? createNoteId(noteIdRaw) : undefined;
		const normalizedTile = normalizeSessionBoardTile(
			{
				id: rawTile.id,
				type:
					rawTile.type === 'calendar' ||
					rawTile.type === 'timer' ||
					rawTile.type === 'note' ||
					rawTile.type === 'combat' ||
					rawTile.type === 'dice' ||
					rawTile.type === 'generator' ||
					rawTile.type === 'handouts'
						? rawTile.type
						: undefined,
				noteId,
				x: typeof rawTile.x === 'number' ? rawTile.x : 0,
				y: typeof rawTile.y === 'number' ? rawTile.y : 0,
				w: typeof rawTile.w === 'number' ? rawTile.w : 4,
				h: typeof rawTile.h === 'number' ? rawTile.h : 3,
				style: isRecord(rawTile.style)
					? (rawTile.style as SessionBoard['tiles'][number]['style'])
					: undefined,
				previewDepth: rawTile.previewDepth as 'title' | 'summary' | 'full' | undefined,
				previewLineCount:
					typeof rawTile.previewLineCount === 'number' ? rawTile.previewLineCount : undefined,
				timer: isRecord(rawTile.timer)
					? (rawTile.timer as unknown as SessionBoard['tiles'][number]['timer'])
					: undefined,
				combat: isRecord(rawTile.combat)
					? (rawTile.combat as unknown as SessionBoard['tiles'][number]['combat'])
					: undefined,
			},
			layout.columns,
		);
		tiles.push(normalizedTile);
	}

	const idRaw = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : key;
	const id = createSessionBoardId(idRaw);
	const createdAt =
		typeof value.createdAt === 'string' && value.createdAt.trim().length > 0
			? value.createdAt
			: nowISO();
	const updatedAt =
		typeof value.updatedAt === 'string' && value.updatedAt.trim().length > 0
			? value.updatedAt
			: createdAt;

	const board: SessionBoard = {
		id,
		name:
			typeof value.name === 'string' && value.name.trim().length > 0
				? value.name.trim()
				: 'Session Board',
		description: typeof value.description === 'string' ? value.description : '',
		tiles,
		layout,
		style: normalizeSessionBoardStyle(
			isRecord(value.style) ? (value.style as SessionBoard['style']) : undefined,
		),
		sessionContext: normalizeSessionContextState(
			isRecord(value.sessionContext) ? value.sessionContext : DEFAULT_SESSION_CONTEXT,
		),
		createdAt,
		updatedAt,
	};
	return { id, board };
}

function noteMatchesSnapshot(live: Note, snapshot: Note): boolean {
	return (
		live.id === snapshot.id &&
		live.title === snapshot.title &&
		live.content === snapshot.content &&
		String(live.folder) === String(snapshot.folder) &&
		(live.filePath ?? null) === (snapshot.filePath ?? null) &&
		live.updatedAt === snapshot.updatedAt &&
		live.deleted === snapshot.deleted &&
		live.deletedAt === snapshot.deletedAt &&
		live.visibility === snapshot.visibility &&
		JSON.stringify(live.tags) === JSON.stringify(snapshot.tags) &&
		JSON.stringify(live.frontmatter) === JSON.stringify(snapshot.frontmatter)
	);
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
	'visibility',
	'pinned',
	'pinnedAt',
	NOTE_MARKER_KEY,
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
		visibility?: ContentVisibility;
		pinned?: boolean;
		pinnedAt?: string | null;
		integrity?: {
			version: number;
			contentChecksum: string;
		};
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
		visibility?: ContentVisibility;
		pinned?: boolean;
		pinnedAt?: string | null;
		integrity?: {
			version: number;
			contentChecksum: string;
		};
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
		if (key === 'visibility') {
			managed.visibility = normalizeContentVisibility(value);
		}
		if (key === 'pinned' && typeof value === 'boolean') managed.pinned = value;
		if (key === 'pinnedAt' && (typeof value === 'string' || value === null)) {
			managed.pinnedAt = value;
		}
		if (key === NOTE_MARKER_KEY && isRecord(value)) {
			const version = value['version'];
			const contentChecksum = value['contentChecksum'];
			if (typeof version === 'number' && typeof contentChecksum === 'string') {
				managed.integrity = { version, contentChecksum };
			}
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
	} as VaultObject);
}

function areObjectsEquivalent(a: VaultObject, b: VaultObject): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
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
	private objectHistory: VaultObjectHistoryStore = emptyVaultObjectHistoryStore();
	private metadataIntegrity: MetadataIntegrityReport = {
		checkedAt: nowISO(),
		healthy: true,
		repairApplied: false,
		issues: [],
		noteIssues: [],
		journalRecovery: {
			replayed: false,
			pendingEntries: 0,
			recoveredAt: null,
		},
	};
	private journalRecovery: JournalRecoveryStatus = {
		replayed: false,
		pendingEntries: 0,
		recoveredAt: null,
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

	private get objectHistoryPath(): string {
		return path.join(this.metaDir, 'object-history.json');
	}

	private get mcpChangeLogPath(): string {
		return path.join(this.metaDir, 'mcp-changelog.json');
	}

	private get backupsDir(): string {
		return path.join(this.metaDir, 'backups');
	}

	private get snapshotManifestPath(): string {
		return path.join(this.backupsDir, 'manifest.json');
	}

	private get writeJournalPath(): string {
		return path.join(this.metaDir, 'write-journal.json');
	}

	private get templatesDir(): string {
		return path.join(this.metaDir, 'templates');
	}

	private get snippetsDir(): string {
		return path.join(this.metaDir, 'snippets');
	}

	private metadataFiles(): Array<{
		name: MetadataFileName;
		filePath: string;
		defaultValue:
			| VaultIndex
			| (Partial<AppSettings> & { version: number })
			| SessionBoardStore
			| VaultObjectStore
			| VaultObjectHistoryStore
			| McpChangeLog;
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
				name: 'settings.json',
				filePath: this.settingsPath,
				defaultValue: { version: CURRENT_SCHEMA_VERSION.metadata },
				validate: isSettingsShape,
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
				name: 'object-history.json',
				filePath: this.objectHistoryPath,
				defaultValue: emptyVaultObjectHistoryStore(),
				validate: isObjectHistoryStoreShape,
			},
			{
				name: 'mcp-changelog.json',
				filePath: this.mcpChangeLogPath,
				defaultValue: emptyMcpChangeLog(),
				validate: isMcpChangeLogShape,
			},
		];
	}

	private async writeMetadataJson(
		filePath: string,
		value: unknown,
		validate: (payload: unknown) => boolean,
		label: string,
	): Promise<void> {
		await fs.mkdir(this.metaDir, { recursive: true });
		await writeJsonAtomic(filePath, value, { validate, label });
	}

	private async writeIndexMetadata(index: VaultIndex): Promise<void> {
		await this.writeMetadataJson(this.indexPath, index, isIndexShape, 'index.json');
	}

	private async writeSettingsMetadata(
		settings: Partial<AppSettings> & { version?: number },
	): Promise<void> {
		const payload: Partial<AppSettings> & { version: number } = {
			...settings,
			version: settings.version ?? CURRENT_SCHEMA_VERSION.metadata,
		};
		await this.writeMetadataJson(this.settingsPath, payload, isSettingsShape, 'settings.json');
	}

	private async writeSessionBoardsMetadata(store: SessionBoardStore): Promise<void> {
		await this.writeMetadataJson(
			this.sessionBoardsPath,
			store,
			isSessionBoardShape,
			'session-boards.json',
		);
	}

	private async writeObjectsMetadata(store: VaultObjectStore): Promise<void> {
		await this.writeMetadataJson(this.objectsPath, store, isObjectStoreShape, 'objects.json');
	}

	private async writeObjectHistoryMetadata(store: VaultObjectHistoryStore): Promise<void> {
		await this.writeMetadataJson(
			this.objectHistoryPath,
			store,
			isObjectHistoryStoreShape,
			'object-history.json',
		);
	}

	private async writeMcpChangeLogMetadata(changeLog: McpChangeLog): Promise<void> {
		await this.writeMetadataJson(
			this.mcpChangeLogPath,
			changeLog,
			isMcpChangeLogShape,
			'mcp-changelog.json',
		);
	}

	private async writeJournalMetadata(journal: WriteJournal): Promise<void> {
		await this.writeMetadataJson(
			this.writeJournalPath,
			journal,
			isWriteJournalShape,
			'write-journal.json',
		);
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

	private normalizeAliasKey(value: string): string {
		return value.trim().toLowerCase();
	}

	private rebuildAliasIndex(): void {
		const aliasIndex = new Map<string, Set<string>>();
		for (const [noteId, entry] of Object.entries(this.index.notes)) {
			if (entry.deleted) continue;
			const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
			for (const alias of aliases) {
				if (typeof alias !== 'string') continue;
				const key = this.normalizeAliasKey(alias);
				if (!key) continue;
				const existing = aliasIndex.get(key);
				if (existing) {
					existing.add(noteId);
				} else {
					aliasIndex.set(key, new Set([noteId]));
				}
			}
		}
		this.index.aliasIndex = Object.fromEntries(
			[...aliasIndex.entries()].map(([alias, noteIds]) => [
				alias,
				[...noteIds].sort((a, b) => a.localeCompare(b)),
			]),
		);
	}

	// --- Index persistence ---

	private async loadIndex(): Promise<void> {
		try {
			const data = await fs.readFile(this.indexPath, 'utf-8');
			const parsed = JSON.parse(data) as Partial<VaultIndex>;
			const notes = isRecord(parsed.notes) ? (parsed.notes as VaultIndex['notes']) : {};
			const links = isRecord(parsed.links) ? (parsed.links as VaultIndex['links']) : {};
			const aliasIndex = isRecord(parsed.aliasIndex)
				? (parsed.aliasIndex as VaultIndex['aliasIndex'])
				: {};
			this.index = {
				version:
					typeof parsed.version === 'number' ? parsed.version : CURRENT_SCHEMA_VERSION.metadata,
				notes,
				links,
				aliasIndex,
			};
			this.rebuildAliasIndex();
		} catch {
			this.index = emptyIndex();
		}
	}

	private async saveIndex(): Promise<void> {
		this.rebuildAliasIndex();
		await this.writeIndexMetadata(this.index);
	}

	private async loadSessionBoards(): Promise<void> {
		try {
			const raw = await fs.readFile(this.sessionBoardsPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<SessionBoardStore>;
			const rawBoards = isRecord(parsed.boards) ? parsed.boards : {};
			const boards: Record<string, SessionBoard> = {};
			for (const [key, value] of Object.entries(rawBoards)) {
				const normalized = normalizeSessionBoardRecord(key, value);
				if (!normalized) continue;
				boards[normalized.id] = normalized.board;
			}
			this.sessionBoards = {
				version: parsed.version ?? CURRENT_SCHEMA_VERSION.metadata,
				boards,
			};
		} catch {
			this.sessionBoards = emptySessionBoardStore();
		}
	}

	private async saveSessionBoards(): Promise<void> {
		await this.writeSessionBoardsMetadata(this.sessionBoards);
	}

	private async loadObjects(): Promise<void> {
		try {
			const raw = await fs.readFile(this.objectsPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<VaultObjectStore>;
			const entries = Object.values(parsed.objects ?? {})
				.map((object) => normalizeVaultObject(object))
				.filter((object) => object.id && object.type);
			this.objects = {
				version: parsed.version ?? CURRENT_SCHEMA_VERSION.metadata,
				objects: Object.fromEntries(entries.map((object) => [object.id, object])),
			};
		} catch {
			this.objects = emptyVaultObjectStore();
		}
	}

	private async saveObjects(): Promise<void> {
		await this.writeObjectsMetadata(this.objects);
	}

	private normalizeHistoryEntry(
		entry: Partial<VaultObjectHistoryEntry> | null | undefined,
		objectId: VaultObjectId,
	): VaultObjectHistoryEntry | null {
		if (!entry || !entry.object) return null;
		const object = normalizeVaultObject(entry.object as VaultObject);
		return {
			id: typeof entry.id === 'string' ? entry.id : randomUUID(),
			objectId,
			recordedAt: typeof entry.recordedAt === 'string' ? entry.recordedAt : nowISO(),
			reason:
				entry.reason === 'delete' || entry.reason === 'revert' || entry.reason === 'save'
					? entry.reason
					: 'save',
			object,
		};
	}

	private async loadObjectHistory(): Promise<void> {
		try {
			const raw = await fs.readFile(this.objectHistoryPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<VaultObjectHistoryStore>;
			const historyEntries = parsed.history ?? {};
			const normalized: Record<string, VaultObjectHistoryEntry[]> = {};
			for (const [id, entries] of Object.entries(historyEntries)) {
				const objectId = id as VaultObjectId;
				const normalizedEntries = Array.isArray(entries)
					? entries
							.map((entry) => this.normalizeHistoryEntry(entry, objectId))
							.filter((entry): entry is VaultObjectHistoryEntry => !!entry)
							.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
					: [];
				if (normalizedEntries.length > 0) {
					normalized[id] = normalizedEntries;
				}
			}
			this.objectHistory = {
				version: parsed.version ?? CURRENT_SCHEMA_VERSION.metadata,
				history: normalized,
			};
		} catch {
			this.objectHistory = emptyVaultObjectHistoryStore();
		}
	}

	private async saveObjectHistory(): Promise<void> {
		await this.writeObjectHistoryMetadata(this.objectHistory);
	}

	private async appendObjectHistory(
		object: VaultObject,
		reason: VaultObjectHistoryEntry['reason'],
	): Promise<void> {
		await this.loadObjectHistory();
		const bucket = this.objectHistory.history[object.id] ?? [];
		bucket.unshift({
			id: randomUUID(),
			objectId: object.id,
			recordedAt: nowISO(),
			reason,
			object: cloneVaultObject(object),
		});
		this.objectHistory.history[object.id] = bucket.slice(0, 100);
		await this.saveObjectHistory();
	}

	private async loadMcpChangeLog(): Promise<McpChangeLog> {
		try {
			const raw = await fs.readFile(this.mcpChangeLogPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<McpChangeLog>;
			if (!Array.isArray(parsed.changes)) {
				return emptyMcpChangeLog();
			}
			return {
				version: parsed.version ?? CURRENT_SCHEMA_VERSION.metadata,
				changes: parsed.changes as McpChangeRecord[],
			};
		} catch {
			return emptyMcpChangeLog();
		}
	}

	private async saveMcpChangeLog(changeLog: McpChangeLog): Promise<void> {
		await this.writeMcpChangeLogMetadata(changeLog);
	}

	private snapshotFilePath(snapshotId: string): string {
		return path.join(this.backupsDir, `${snapshotId}.json`);
	}

	private async loadWriteJournal(): Promise<WriteJournal> {
		try {
			const raw = await fs.readFile(this.writeJournalPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<WriteJournal>;
			if (!Array.isArray(parsed.pending)) return emptyWriteJournal();
			return {
				version: parsed.version ?? 1,
				pending: parsed.pending
					.filter((entry) => entry && typeof entry.id === 'string')
					.map((entry) => ({
						id: entry.id,
						operation: typeof entry.operation === 'string' ? entry.operation : 'unknown-operation',
						startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : nowISO(),
					})),
			};
		} catch {
			return emptyWriteJournal();
		}
	}

	private async saveWriteJournal(journal: WriteJournal): Promise<void> {
		await this.writeJournalMetadata(journal);
	}

	private async withWriteJournal<T>(operation: string, action: () => Promise<T>): Promise<T> {
		const journal = await this.loadWriteJournal();
		const entry: WriteJournalEntry = {
			id: randomUUID(),
			operation,
			startedAt: nowISO(),
		};
		journal.pending.push(entry);
		await this.saveWriteJournal(journal);

		const result = await action();
		journal.pending = journal.pending.filter((pending) => pending.id !== entry.id);
		await this.saveWriteJournal(journal);
		return result;
	}

	private isAtomicTempFileName(fileName: string): boolean {
		return /^\..+\.\d+-\d+-[a-f0-9]+\.tmp$/i.test(fileName);
	}

	private async cleanupAtomicTempFiles(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === '.vault' && dir === this.vaultDir) {
					await this.cleanupAtomicTempFiles(fullPath);
					continue;
				}
				if (entry.name.startsWith('.')) continue;
				await this.cleanupAtomicTempFiles(fullPath);
				continue;
			}

			if (!entry.isFile()) continue;
			if (!this.isAtomicTempFileName(entry.name)) continue;
			await fs.rm(fullPath, { force: true }).catch(() => undefined);
		}
	}

	private async replayWriteJournalIfNeeded(): Promise<void> {
		const journal = await this.loadWriteJournal();
		if (journal.pending.length === 0) {
			this.journalRecovery = {
				replayed: false,
				pendingEntries: 0,
				recoveredAt: null,
			};
			return;
		}

		await this.cleanupAtomicTempFiles(this.vaultDir);

		// Rebuild index and persist metadata to recover from interrupted writes.
		await this.rebuildIndex();
		await this.saveSessionBoards();
		await this.saveObjects();
		await this.saveObjectHistory();
		const changelog = await this.loadMcpChangeLog();
		await this.saveMcpChangeLog(changelog);

		this.journalRecovery = {
			replayed: true,
			pendingEntries: journal.pending.length,
			recoveredAt: nowISO(),
		};
		await this.saveWriteJournal(emptyWriteJournal());
	}

	private async loadSnapshotManifest(): Promise<SnapshotManifest> {
		try {
			const raw = await fs.readFile(this.snapshotManifestPath, 'utf-8');
			const parsed = JSON.parse(raw) as Partial<SnapshotManifest>;
			if (!Array.isArray(parsed.snapshots)) return emptySnapshotManifest();
			return {
				version: parsed.version ?? SNAPSHOT_MANIFEST_VERSION,
				snapshots: parsed.snapshots
					.filter((entry) => entry && typeof entry.id === 'string')
					.map((entry) => ({
						id: entry.id,
						createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : nowISO(),
						reason: typeof entry.reason === 'string' ? entry.reason : 'manual',
						noteCount: typeof entry.noteCount === 'number' ? entry.noteCount : 0,
					})),
			};
		} catch {
			return emptySnapshotManifest();
		}
	}

	private async saveSnapshotManifest(manifest: SnapshotManifest): Promise<void> {
		await fs.mkdir(this.backupsDir, { recursive: true });
		await writeJsonAtomic(this.snapshotManifestPath, manifest);
	}

	private async pruneSnapshots(manifest: SnapshotManifest): Promise<void> {
		const retention = Math.max(1, await this.getSetting('backupRetentionCount'));
		if (manifest.snapshots.length <= retention) return;

		const sorted = [...manifest.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		const keep = sorted.slice(0, retention);
		const remove = sorted.slice(retention);
		for (const snapshot of remove) {
			await fs.rm(this.snapshotFilePath(snapshot.id), { force: true }).catch(() => undefined);
		}
		manifest.snapshots = keep;
	}

	private async maybeCreateScheduledSnapshot(trigger: string): Promise<void> {
		const cadence = await this.getSetting('backupCadence');
		// 'manual' and 'on-close' are not triggered by vault mutations.
		if (cadence === 'manual' || cadence === 'on-close') return;

		const snapshots = await this.listSafetySnapshots();
		const latest = snapshots.find((entry) => entry.reason.startsWith('auto-'));
		if (!latest) {
			await this.createSafetySnapshot(`auto-${cadence}-${trigger}`);
			return;
		}

		const elapsed = Date.now() - new Date(latest.createdAt).getTime();
		const thresholdMs = cadence === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
		if (elapsed >= thresholdMs) {
			await this.createSafetySnapshot(`auto-${cadence}-${trigger}`);
		}
	}

	private async pathExists(targetPath: string): Promise<boolean> {
		try {
			await fs.access(targetPath);
			return true;
		} catch {
			return false;
		}
	}

	private async listMarkdownFilesInDir(rootDir: string): Promise<string[]> {
		const results: string[] = [];

		const walk = async (dir: string): Promise<void> => {
			let entries: Dirent[];
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					await walk(fullPath);
					continue;
				}
				if (!entry.isFile()) continue;
				if (!entry.name.toLowerCase().endsWith('.md')) continue;
				results.push(fullPath);
			}
		};

		await walk(rootDir);
		results.sort((a, b) => a.localeCompare(b));
		return results;
	}

	private templateSeedFilePath(template: NoteTemplate): string {
		const folder =
			template.scope === 'global' || GLOBAL_TEMPLATE_IDS.has(template.id)
				? 'global'
				: String(template.defaultFolder).replace(/^\/+/, '');
		return path.join(this.templatesDir, folder, `${template.id}.md`);
	}

	private async writeTextFileIfMissing(filePath: string, content: string): Promise<void> {
		if (await this.pathExists(filePath)) return;
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
		await writeFileAtomic(filePath, normalizedContent);
	}

	private async seedTemplateAndSnippetLibraryIfEmpty(): Promise<void> {
		await fs.mkdir(this.templatesDir, { recursive: true });
		await fs.mkdir(this.snippetsDir, { recursive: true });

		const [templateFiles, snippetFiles] = await Promise.all([
			this.listMarkdownFilesInDir(this.templatesDir),
			this.listMarkdownFilesInDir(this.snippetsDir),
		]);

		if (templateFiles.length === 0) {
			for (const template of DND_TEMPLATES) {
				await this.writeTextFileIfMissing(this.templateSeedFilePath(template), template.content);
			}
		}

		if (snippetFiles.length === 0) {
			for (const snippet of REUSABLE_SNIPPETS) {
				await this.writeTextFileIfMissing(
					path.join(this.snippetsDir, `${snippet.id}.md`),
					snippet.content,
				);
			}
		}
	}

	private parseTemplateScope(relativePath: string): {
		scope: 'global' | 'folder';
		scopeFolder: string | null;
	} {
		const normalized = relativePath.replace(/\\/g, '/');
		const folder = path.posix.dirname(normalized);
		if (folder === '.' || folder === '' || folder === 'global' || folder.startsWith('global/')) {
			return { scope: 'global', scopeFolder: null };
		}
		return { scope: 'folder', scopeFolder: ensureLeadingSlash(folder) };
	}

	// --- File I/O ---

	/** Read a markdown file and parse into a Note */
	private async readNoteFile(
		filePath: string,
		relativePath?: string,
		options?: { fallbackVisibility?: ContentVisibility },
	): Promise<Note | null> {
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
				visibility: normalizeContentVisibility(
					managed.visibility,
					options?.fallbackVisibility ?? DEFAULT_CONTENT_VISIBILITY,
				),
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
		const checksum = computeContentChecksum(note.content);
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
			visibility: normalizeContentVisibility(note.visibility),
			pinned: note.pinned,
			pinnedAt: note.pinnedAt,
			[NOTE_MARKER_KEY]: {
				version: NOTE_MARKER_VERSION,
				contentChecksum: checksum,
			},
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
			visibility: normalizeContentVisibility(note.visibility),
			aliases: extractAliasesFromFrontmatter(note.frontmatter),
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			deleted: note.deleted,
			deletedAt: note.deletedAt,
		};
	}

	// --- Lifecycle ---

	private async scanNoteIntegrity(options?: { repair?: boolean }): Promise<NoteIntegrityIssue[]> {
		const repair = options?.repair ?? false;
		const issues: NoteIntegrityIssue[] = [];

		for (const [noteId, entry] of Object.entries(this.index.notes)) {
			const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
			let parsed: { data: Record<string, unknown>; content: string };
			let raw: string;
			try {
				raw = await fs.readFile(filePath, 'utf-8');
				parsed = matter(raw) as { data: Record<string, unknown>; content: string };
			} catch {
				// File is missing on disk but still referenced in index — orphaned entry.
				issues.push({
					noteId,
					filePath: this.toRelativeVaultPath(createFolderId(entry.folder), entry.filename),
					status: 'orphan_entry',
					details: 'Note is listed in index.json but its file does not exist on disk.',
					repaired: false,
				});
				continue;
			}

			let status: NoteIntegrityIssueStatus | null = null;
			let details = '';
			let repaired = false;
			const marker = parsed.data[NOTE_MARKER_KEY];
			if (!isRecord(marker)) {
				status = 'missing_marker';
				details = 'Missing note integrity marker in frontmatter.';
			} else {
				const version = marker['version'];
				const contentChecksum = marker['contentChecksum'];
				if (typeof version !== 'number' || typeof contentChecksum !== 'string') {
					status = 'invalid_marker';
					details = 'Invalid note integrity marker format.';
				} else {
					const checksum = computeContentChecksum(
						parsed.content.replace(/^\n+/, '').replace(/\n$/, ''),
					);
					if (checksum !== contentChecksum || version !== NOTE_MARKER_VERSION) {
						status = 'checksum_mismatch';
						details = 'Checksum marker does not match note content.';
					}
				}
			}

			if (!status) continue;

			if (repair) {
				const note = await this.readNoteFile(filePath);
				if (note) {
					await this.writeNoteFile(note, filePath);
					repaired = true;
				}
			}

			issues.push({
				noteId,
				filePath: this.toRelativeVaultPath(createFolderId(entry.folder), entry.filename),
				status,
				details,
				repaired,
			});
		}

		return issues;
	}

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
					await writeJsonAtomic(descriptor.filePath, descriptor.defaultValue, {
						validate: descriptor.validate,
						label: descriptor.name,
					});
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
			noteIssues: await this.scanNoteIntegrity({ repair }),
			journalRecovery: this.journalRecovery,
		};
		report.healthy = report.healthy && report.noteIssues.length === 0;
		this.metadataIntegrity = report;
		return report;
	}

	async getMetadataIntegrityReport(): Promise<MetadataIntegrityReport> {
		return this.scanMetadataIntegrity();
	}

	async repairMetadataIntegrity(): Promise<MetadataIntegrityReport> {
		const repaired = await this.scanMetadataIntegrity({ repair: true });
		await this.loadIndex();
		await this.loadSessionBoards();
		await this.loadObjects();
		await this.loadObjectHistory();
		await this.rebuildIndexIfNeeded();
		await this.scanMetadataIntegrity();
		return repaired;
	}

	/** Force a full rebuild of the in-memory index from files on disk. */
	async rebuildVaultIndex(): Promise<{ rebuilt: number }> {
		await this.rebuildIndex();
		const count = Object.keys(this.index.notes).length;
		return { rebuilt: count };
	}

	/**
	 * Remove resolved (approved/rejected) MCP changelog entries older than the
	 * given age threshold. Returns how many entries were removed.
	 */
	async clearMcpChangelog(options?: { maxAgeMs?: number }): Promise<{ removed: number }> {
		const changelog = await this.loadMcpChangeLog();
		const before = changelog.changes.length;
		const cutoff = options?.maxAgeMs != null ? Date.now() - options.maxAgeMs : null;

		changelog.changes = changelog.changes.filter((change) => {
			// Keep pending changes always.
			if (change.status === 'pending') return true;
			// Keep recent resolved changes if a cutoff is specified.
			if (cutoff !== null && change.resolvedAt) {
				return new Date(change.resolvedAt).getTime() > cutoff;
			}
			// No cutoff — remove all resolved changes.
			return cutoff !== null;
		});

		await this.saveMcpChangeLog(changelog);
		return { removed: before - changelog.changes.length };
	}

	async getSchemaMigrationReport(): Promise<SchemaMigrationReport> {
		return getVaultSchemaMigrationReport(this.vaultDir);
	}

	async runSchemaMigrations(options?: {
		dryRun?: boolean;
		createCheckpoint?: boolean;
	}): Promise<SchemaMigrationReport> {
		const report = await runVaultSchemaMigrations(this.vaultDir, options);
		if (!report.dryRun && report.upgradeApplied) {
			await this.scanMetadataIntegrity({ repair: true });
			await this.loadIndex();
			await this.loadSessionBoards();
			await this.loadObjects();
			await this.loadObjectHistory();
			await this.rebuildIndexIfNeeded();
		}
		return report;
	}

	async listMigrationCheckpoints(): Promise<MigrationCheckpointEntry[]> {
		const checkpointsDir = path.join(this.metaDir, 'checkpoints');
		try {
			const entries = await fs.readdir(checkpointsDir, { withFileTypes: true });
			const results: MigrationCheckpointEntry[] = [];
			for (const entry of entries) {
				if (!entry.isDirectory() || !entry.name.startsWith('schema-migration-')) continue;
				const dirPath = path.join(checkpointsDir, entry.name);
				const stat = await fs.stat(dirPath);
				// Count backed-up files by walking the checkpoint directory tree.
				const backupCount = await countFiles(dirPath);
				results.push({
					name: entry.name,
					dirPath: path.relative(this.vaultDir, dirPath).replace(/\\/g, '/'),
					createdAt: stat.birthtime.toISOString(),
					fileCount: backupCount,
				});
			}
			// Most-recent first.
			results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			return results;
		} catch {
			return [];
		}
	}

	async restoreMigrationCheckpoint(checkpointName: string): Promise<{ restored: number }> {
		const checkpointsDir = path.join(this.metaDir, 'checkpoints');
		// Validate the name to prevent path traversal.
		if (
			!checkpointName.startsWith('schema-migration-') ||
			checkpointName.includes('/') ||
			checkpointName.includes('\\') ||
			checkpointName.includes('..')
		) {
			throw new Error(`Invalid checkpoint name: ${checkpointName}`);
		}
		const checkpointDir = path.join(checkpointsDir, checkpointName);
		await fs.stat(checkpointDir); // throws if missing — caller should handle

		let restored = 0;
		const restore = async (srcDir: string, relBase: string): Promise<void> => {
			const entries = await fs.readdir(srcDir, { withFileTypes: true });
			for (const entry of entries) {
				const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
				const srcPath = path.join(srcDir, entry.name);
				const destPath = path.join(this.vaultDir, relPath);
				if (entry.isDirectory()) {
					await fs.mkdir(destPath, { recursive: true });
					await restore(srcPath, relPath);
				} else if (entry.isFile()) {
					await fs.mkdir(path.dirname(destPath), { recursive: true });
					await fs.copyFile(srcPath, destPath);
					restored += 1;
				}
			}
		};

		await restore(checkpointDir, '');
		// Reload in-memory state from the restored files.
		await this.scanMetadataIntegrity({ repair: true });
		await this.loadIndex();
		await this.loadSessionBoards();
		await this.loadObjects();
		await this.loadObjectHistory();
		await this.rebuildIndexIfNeeded();
		return { restored };
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.vaultDir, { recursive: true });
		await fs.mkdir(this.metaDir, { recursive: true });
		await this.seedTemplateAndSnippetLibraryIfEmpty();
		const migrationReport = await this.runSchemaMigrations({
			dryRun: false,
			createCheckpoint: true,
		});
		if (migrationReport.failures.length > 0) {
			throw new Error(
				`Vault schema migration failed: ${migrationReport.failures[0]?.message ?? 'unknown error'}`,
			);
		}
		await this.scanMetadataIntegrity({ repair: true });
		await this.loadIndex();
		await this.loadSessionBoards();
		await this.loadObjects();
		await this.loadObjectHistory();
		await this.rebuildIndexIfNeeded();
		await this.replayWriteJournalIfNeeded();
		await this.migrateLegacyObjectsToNotes();
		await this.scanMetadataIntegrity();
	}

	async close(): Promise<void> {
		await this.saveIndex();
		await this.saveSessionBoards();
		await this.saveObjects();
		await this.saveObjectHistory();
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
				visibility: normalizeContentVisibility(note.visibility),
				aliases: extractAliasesFromFrontmatter(note.frontmatter),
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
			{ fallbackVisibility: normalizeContentVisibility(entry.visibility) },
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
		await this.withWriteJournal('save-note', async () => {
			await this.saveNoteInternal(note, true);
			await this.maybeCreateScheduledSnapshot('save-note');
		});
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
		await this.withWriteJournal(
			permanent ? 'delete-note-permanent' : 'delete-note-soft',
			async () => {
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
				await this.maybeCreateScheduledSnapshot('delete-note');
			},
		);
	}

	async restoreNote(id: NoteId): Promise<void> {
		await this.withWriteJournal('restore-note', async () => {
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
			await this.maybeCreateScheduledSnapshot('restore-note');
		});
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
		const entries = Object.entries(this.index.notes)
			.filter(([, entry]) => !entry.deleted)
			.map(([id, entry]) => ({
				id,
				title: entry.title,
				updatedAt: entry.updatedAt,
				aliases: entry.aliases ?? [],
			}));
		const resolvedId = resolveLinkTargetId(title, entries);
		return resolvedId ? this.getNote(resolvedId) : null;
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
			resolvedBy: s.resolvedBy,
			resolvedAlias: s.resolvedAlias ?? null,
			contextSnippet: s.contextSnippet ?? null,
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
						resolvedBy: link.resolvedBy,
						resolvedAlias: link.resolvedAlias ?? null,
						contextSnippet: link.contextSnippet ?? null,
					});
				}
			}
		}
		return backlinks;
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		await this.withWriteJournal('set-links', async () => {
			this.index.links[noteId] = links.map((l) => ({
				targetId: l.targetId,
				displayText: l.displayText,
				position: l.position,
				resolvedBy: l.resolvedBy,
				resolvedAlias: l.resolvedAlias ?? null,
				contextSnippet: l.contextSnippet ?? null,
			}));
			await this.saveIndex();
		});
	}

	async getAllLinks(): Promise<Link[]> {
		return this.getAllLinksFromIndex().map((link) => ({
			sourceId: createNoteId(link.sourceId),
			targetId: createNoteId(link.targetId),
			displayText: link.displayText,
			position: link.position,
			resolvedBy: link.resolvedBy,
			resolvedAlias: link.resolvedAlias ?? null,
			contextSnippet: link.contextSnippet ?? null,
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
		await this.withWriteJournal('save-session-board', async () => {
			const layout = normalizeSessionBoardLayout(board.layout);
			const normalizedTiles = board.tiles.map((tile) =>
				normalizeSessionBoardTile(
					{
						...tile,
						noteId:
							typeof tile.noteId === 'string' && tile.noteId.trim().length > 0
								? createNoteId(tile.noteId)
								: undefined,
					},
					layout.columns,
				),
			);
			const timestamp = nowISO();
			const createdAt = board.createdAt || timestamp;
			const sessionContext = normalizeSessionContextState(
				board.sessionContext ?? DEFAULT_SESSION_CONTEXT,
			);

			this.sessionBoards.boards[board.id] = {
				id: createSessionBoardId(String(board.id)),
				name: board.name.trim() || 'Session Board',
				description: board.description ?? '',
				tiles: normalizedTiles,
				layout,
				style: normalizeSessionBoardStyle(board.style),
				sessionContext,
				createdAt,
				updatedAt: board.updatedAt || timestamp,
			};
			await this.saveSessionBoards();
		});
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		await this.withWriteJournal('delete-session-board', async () => {
			delete this.sessionBoards.boards[id];
			await this.saveSessionBoards();
		});
	}

	async suggestRelatedNotes(noteIds: NoteId[], limit = 8): Promise<RelatedNoteSuggestion[]> {
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
		const fromNote = await this.getNote(noteId).then((note) =>
			note ? noteToVaultObject(note) : null,
		);
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
				const haystack = [object.name, object.summary, object.tags.join(' '), object.type]
					.join(' ')
					.toLowerCase();
				return haystack.includes(query);
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async saveObject(object: VaultObject): Promise<void> {
		await this.withWriteJournal('save-object', async () => {
			const normalized = cloneVaultObject(object);
			const existing = await this.getObject(normalized.id);
			const noteId = createNoteId(String(normalized.id));
			const existingNote = await this.getNote(noteId);
			const note = vaultObjectToNote(normalized, existingNote, { syncMarkdown: true });
			await this.saveNoteInternal(note, true);
			await this.resolveAndIndexLinks(note.id, note.content);
			if (existing && !areObjectsEquivalent(existing, normalized)) {
				await this.appendObjectHistory(existing, 'save');
			}

			await this.loadObjects();
			if (this.objects.objects[normalized.id]) {
				delete this.objects.objects[normalized.id];
				await this.saveObjects();
			}
		});
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		await this.withWriteJournal('delete-object', async () => {
			const existing = await this.getObject(id);
			if (existing) {
				await this.appendObjectHistory(existing, 'delete');
			}
			const noteId = createNoteId(String(id));
			const note = await this.getNote(noteId);
			if (note) {
				const entry = this.index.notes[noteId];
				if (entry) {
					const filePath = this.noteFilePath(createFolderId(entry.folder), entry.filename);
					await fs.unlink(filePath).catch(() => undefined);
					delete this.index.notes[noteId];
					delete this.index.links[noteId];
					await this.saveIndex();
				}
			}

			await this.loadObjects();
			if (this.objects.objects[id]) {
				delete this.objects.objects[id];
				await this.saveObjects();
			}
		});
	}

	async getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		return buildObjectRelationshipGraph(await this.getAllObjects());
	}

	async lintObjects(): Promise<ObjectLintIssue[]> {
		return lintVaultObjects(await this.getAllObjects());
	}

	async getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		await this.loadObjectHistory();
		const limit = options?.limit ?? 50;
		const entries = this.objectHistory.history[id] ?? [];
		return entries.slice(0, Math.max(1, limit)).map((entry) => ({
			...entry,
			object: cloneVaultObject(entry.object),
		}));
	}

	async revertObjectToHistory(
		id: VaultObjectId,
		historyEntryId: string,
	): Promise<VaultObject | null> {
		return this.withWriteJournal('revert-object-history', async () => {
			await this.loadObjectHistory();
			const historyEntries = this.objectHistory.history[id] ?? [];
			const historyEntry = historyEntries.find((entry) => entry.id === historyEntryId);
			if (!historyEntry) return null;

			const current = await this.getObject(id);
			if (current) {
				await this.appendObjectHistory(current, 'revert');
			}

			const reverted = cloneVaultObject({
				...historyEntry.object,
				id,
				updatedAt: nowISO(),
			});
			const noteId = createNoteId(String(reverted.id));
			const existingNote = await this.getNote(noteId);
			const note = vaultObjectToNote(reverted, existingNote, { syncMarkdown: true });
			await this.saveNoteInternal(note, true);
			await this.resolveAndIndexLinks(note.id, note.content);

			await this.loadObjects();
			if (this.objects.objects[reverted.id]) {
				delete this.objects.objects[reverted.id];
				await this.saveObjects();
			}
			return this.getObject(id);
		});
	}

	// --- Settings ---

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		try {
			const data = await fs.readFile(this.settingsPath, 'utf-8');
			const settings = JSON.parse(data) as Partial<AppSettings>;
			return normalizeSettingValue(key, settings[key] ?? DEFAULT_SETTINGS[key]);
		} catch {
			return normalizeSettingValue(key, DEFAULT_SETTINGS[key]);
		}
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		let settings: Partial<AppSettings> & { version?: number } = {};
		try {
			const data = await fs.readFile(this.settingsPath, 'utf-8');
			settings = JSON.parse(data) as Partial<AppSettings> & { version?: number };
		} catch {
			// No existing settings file
		}
		await this.withWriteJournal('set-setting', async () => {
			settings[key] = normalizeSettingValue(key, value);
			await this.writeSettingsMetadata(settings);
		});
	}

	async getNoteTemplates(): Promise<NoteTemplate[]> {
		await this.seedTemplateAndSnippetLibraryIfEmpty();
		const templateFiles = await this.listMarkdownFilesInDir(this.templatesDir);
		const builtInById = new Map(DND_TEMPLATES.map((template) => [template.id, template]));
		const usedIds = new Set<string>();
		const templates: NoteTemplate[] = [];

		for (const filePath of templateFiles) {
			const content = await fs.readFile(filePath, 'utf-8');
			const relativePath = path.relative(this.templatesDir, filePath).replace(/\\/g, '/');
			const baseId = path.basename(filePath, '.md');
			const { scope, scopeFolder } = this.parseTemplateScope(relativePath);
			const builtIn = builtInById.get(baseId);
			const fallbackFolder = scopeFolder ?? '/';

			let id = baseId;
			if (usedIds.has(id)) {
				const slug = slugify(relativePath.replace(/\.md$/i, '').replace(/\//g, '-'));
				id = slug || `${baseId}-${templates.length + 1}`;
			}
			let collisionCounter = 2;
			while (usedIds.has(id)) {
				id = `${baseId}-${collisionCounter}`;
				collisionCounter += 1;
			}
			usedIds.add(id);

			templates.push({
				id,
				name: builtIn?.name ?? (toTitleCaseFromSlug(baseId) || baseId),
				description:
					builtIn?.description ??
					(scope === 'global'
						? 'Global note template'
						: `Template scoped to ${scopeFolder ?? fallbackFolder}`),
				icon: builtIn?.icon ?? 'T',
				content,
				defaultTags: builtIn ? [...builtIn.defaultTags] : [],
				defaultFolder: builtIn?.defaultFolder ?? fallbackFolder,
				scope,
				scopeFolder,
				titleTemplate: builtIn?.titleTemplate,
				sourcePath: relativePath,
			});
		}

		return templates.sort((a, b) => a.name.localeCompare(b.name));
	}

	async getReusableSnippets(): Promise<ReusableSnippet[]> {
		await this.seedTemplateAndSnippetLibraryIfEmpty();
		const snippetFiles = await this.listMarkdownFilesInDir(this.snippetsDir);
		const builtInById = new Map(REUSABLE_SNIPPETS.map((snippet) => [snippet.id, snippet]));
		const usedIds = new Set<string>();
		const snippets: ReusableSnippet[] = [];

		for (const filePath of snippetFiles) {
			const content = await fs.readFile(filePath, 'utf-8');
			const relativePath = path.relative(this.snippetsDir, filePath).replace(/\\/g, '/');
			const baseId = path.basename(filePath, '.md');
			const builtIn = builtInById.get(baseId);

			let id = baseId;
			if (usedIds.has(id)) {
				const slug = slugify(relativePath.replace(/\.md$/i, '').replace(/\//g, '-'));
				id = slug || `${baseId}-${snippets.length + 1}`;
			}
			let collisionCounter = 2;
			while (usedIds.has(id)) {
				id = `${baseId}-${collisionCounter}`;
				collisionCounter += 1;
			}
			usedIds.add(id);

			snippets.push({
				id,
				name: builtIn?.name ?? (toTitleCaseFromSlug(baseId) || baseId),
				description: builtIn?.description ?? 'Reusable snippet',
				content,
				sourcePath: relativePath,
			});
		}

		return snippets.sort((a, b) => a.name.localeCompare(b.name));
	}

	async createSafetySnapshot(reason = 'manual'): Promise<SafetySnapshot> {
		return this.withWriteJournal('create-safety-snapshot', async () => {
			const createdAt = nowISO();
			const snapshot: SafetySnapshot = {
				id: randomUUID(),
				createdAt,
				reason,
				noteCount: Object.keys(this.index.notes).length,
			};
			const payload: SnapshotStore = {
				version: SNAPSHOT_STORE_VERSION,
				createdAt,
				reason,
				notes: await this.getAllNotes({ includeDeleted: true }),
				index: this.index,
				sessionBoards: this.sessionBoards,
				objects: this.objects,
				objectHistory: this.objectHistory,
				mcpChangeLog: await this.loadMcpChangeLog(),
			};

			await fs.mkdir(this.backupsDir, { recursive: true });
			await writeJsonAtomic(this.snapshotFilePath(snapshot.id), payload);

			const manifest = await this.loadSnapshotManifest();
			manifest.snapshots.push(snapshot);
			manifest.snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			await this.pruneSnapshots(manifest);
			await this.saveSnapshotManifest(manifest);
			return snapshot;
		});
	}

	async listSafetySnapshots(): Promise<SafetySnapshot[]> {
		const manifest = await this.loadSnapshotManifest();
		const sorted = [...manifest.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		// Augment each entry with the snapshot file size (best-effort).
		return Promise.all(
			sorted.map(async (snapshot) => {
				try {
					const stat = await fs.stat(this.snapshotFilePath(snapshot.id));
					return { ...snapshot, sizeBytes: stat.size };
				} catch {
					return { ...snapshot, sizeBytes: 0 };
				}
			}),
		);
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return this.withWriteJournal('restore-deleted-from-snapshot', async () => {
			const raw = await fs.readFile(this.snapshotFilePath(snapshotId), 'utf-8');
			const snapshot = JSON.parse(raw) as Partial<SnapshotStore>;
			const snapshotNotes = Array.isArray(snapshot.notes) ? snapshot.notes : [];
			let restored = 0;
			let skipped = 0;

			for (const entry of snapshotNotes) {
				const note = entry as Note;
				if (!note || typeof note.id !== 'string' || note.deleted) continue;

				const current = await this.getNote(createNoteId(note.id));
				if (current && !current.deleted) {
					skipped += 1;
					continue;
				}

				const recovered: Note = {
					...note,
					deleted: false,
					deletedAt: null,
					visibility: normalizeContentVisibility(note.visibility),
					updatedAt: nowISO(),
				};
				await this.saveNoteInternal(recovered, false);
				await this.resolveAndIndexLinks(recovered.id, recovered.content);
				restored += 1;
			}

			if (restored > 0) {
				await this.saveIndex();
			}

			return { restored, skipped };
		});
	}

	// --- Bulk ---

	async importNotes(notes: Note[]): Promise<ImportResult> {
		return this.withWriteJournal('import-notes', async () => {
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
					errors.push(
						`Failed to import "${note.title}": ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			}

			if (imported > 0) {
				await this.saveIndex();
				await this.maybeCreateScheduledSnapshot('import-notes');
			}

			return { imported, skipped, errors };
		});
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
		visibility: ContentVisibility;
		createdAt: string;
		updatedAt: string;
		deleted: boolean;
		deletedAt: string | null;
	}> {
		return Object.entries(this.index.notes).map(([id, entry]) => {
			const folder = createFolderId(entry.folder);
			return {
				id,
				title: entry.title,
				folder: entry.folder,
				tags: entry.tags,
				visibility: normalizeContentVisibility(entry.visibility),
				createdAt: entry.createdAt,
				updatedAt: entry.updatedAt,
				deleted: entry.deleted,
				deletedAt: entry.deletedAt,
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
		resolvedBy?: 'id' | 'title' | 'alias';
		resolvedAlias?: string | null;
		contextSnippet?: string | null;
	}> {
		const allLinks: Array<{
			sourceId: string;
			targetId: string;
			displayText: string;
			position: number;
			resolvedBy?: 'id' | 'title' | 'alias';
			resolvedAlias?: string | null;
			contextSnippet?: string | null;
		}> = [];
		for (const [sourceId, links] of Object.entries(this.index.links)) {
			for (const link of links) {
				allLinks.push({
					sourceId,
					targetId: link.targetId,
					displayText: link.displayText,
					position: link.position,
					resolvedBy: link.resolvedBy,
					resolvedAlias: link.resolvedAlias ?? null,
					contextSnippet: link.contextSnippet ?? null,
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

	private appendMcpAudit(
		change: McpChangeRecord,
		entry: {
			actor: string;
			action: 'staged' | 'approved' | 'rejected' | 'auto_approved' | 'conflict_blocked';
			reason: string;
			notes?: string;
		},
	): void {
		const audit = change.audit ?? [];
		audit.push({
			at: nowISO(),
			actor: entry.actor,
			action: entry.action,
			reason: entry.reason,
			notes: entry.notes,
		});
		change.audit = audit;
	}

	private resolveMcpAgentId(agentId?: string): string {
		const candidate = agentId?.trim() ?? process.env.DNDTOOLS_MCP_AGENT?.trim() ?? '';
		return candidate || DEFAULT_MCP_AGENT_ID;
	}

	private async getMcpPolicyBehavior(agentId: string): Promise<McpPolicyBehavior> {
		const settings = normalizeMcpPolicySettings(await this.getSetting('mcpPolicySettings'));
		const presetId = settings.perAgent[agentId] ?? settings.defaultPresetId;
		return MCP_POLICY_BEHAVIORS[presetId];
	}

	private shouldAutoApprove(
		behavior: McpPolicyBehavior,
		change: McpChangeRecord,
	): { autoApprove: boolean; reason: string } {
		const previewed = withMcpChangePreview(change);
		const structural = previewed.preview?.semantic.structural ?? change.type !== 'update';
		if (structural && behavior.requireReviewStructural) {
			return {
				autoApprove: false,
				reason: `${behavior.label} requires review for structural edits`,
			};
		}
		if (structural && !behavior.requireReviewStructural) {
			return {
				autoApprove: true,
				reason: `${behavior.label} allows trusted structural auto-approval`,
			};
		}
		if (!structural && behavior.autoApproveNonStructural) {
			return {
				autoApprove: true,
				reason: `${behavior.label} auto-approves non-structural edits`,
			};
		}
		return {
			autoApprove: false,
			reason: `${behavior.label} requires manual review`,
		};
	}

	private async getPendingChangesWithConflicts(
		changeLog: McpChangeLog,
	): Promise<McpChangeRecord[]> {
		const pending = changeLog.changes
			.filter((change) => change.status === 'pending')
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		const byNoteId = new Map<string, McpChangeRecord[]>();
		for (const change of pending) {
			const bucket = byNoteId.get(change.noteId);
			if (bucket) {
				bucket.push(change);
			} else {
				byNoteId.set(change.noteId, [change]);
			}
		}

		const conflictsById = new Map<string, McpChangeRecord['conflict']>();
		for (const [noteId, changes] of byNoteId.entries()) {
			let simulatedLive = await this.getNote(createNoteId(noteId));
			let blockedBy: McpChangeRecord['conflict'] = null;
			for (const change of changes) {
				if (blockedBy) {
					conflictsById.set(change.id, {
						reason: 'target_changed_since_stage',
						details: `Earlier pending change conflict blocks this change: ${blockedBy.details}`,
						detectedAt: nowISO(),
					});
					continue;
				}

				const before = change.before?.note ?? null;
				const after = change.after?.note ?? null;
				let conflict: McpChangeRecord['conflict'] = null;

				if (!before && simulatedLive) {
					conflict = {
						reason: 'target_exists',
						details: 'Expected to create a new note, but a note already exists with this id.',
						detectedAt: nowISO(),
					};
				} else if (before && !simulatedLive) {
					conflict = {
						reason: 'target_missing',
						details:
							'Expected a note snapshot for this staged change, but the live note is missing.',
						detectedAt: nowISO(),
					};
				} else if (before && simulatedLive && !noteMatchesSnapshot(simulatedLive, before)) {
					conflict = {
						reason: 'target_changed_since_stage',
						details:
							'Live note content changed after staging; review and re-stage to avoid overwriting newer edits.',
						detectedAt: nowISO(),
					};
				} else if (!after && !simulatedLive) {
					conflict = {
						reason: 'target_already_deleted',
						details: 'Delete operation is stale because the live note no longer exists.',
						detectedAt: nowISO(),
					};
				}

				if (conflict) {
					blockedBy = conflict;
					conflictsById.set(change.id, conflict);
					continue;
				}

				simulatedLive = after ? cloneNoteSnapshot(after) : null;
			}
		}

		return pending.map((change) => ({
			...withMcpChangePreview(change),
			conflict: conflictsById.get(change.id) ?? null,
		}));
	}

	async getMcpChangeLog(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		return [...changeLog.changes];
	}

	async getPendingMcpChanges(): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		return this.getPendingChangesWithConflicts(changeLog);
	}

	async getMcpAuditTrail(limit = 120): Promise<McpChangeRecord[]> {
		const changeLog = await this.loadMcpChangeLog();
		return changeLog.changes
			.filter((change) => change.status !== 'pending')
			.sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
			.slice(0, Math.max(1, limit))
			.map((change) => withMcpChangePreview(change));
	}

	async getMcpPolicySettings(): Promise<McpPolicySettings> {
		return normalizeMcpPolicySettings(await this.getSetting('mcpPolicySettings'));
	}

	async setMcpPolicySettings(settings: McpPolicySettings): Promise<McpPolicySettings> {
		const normalized = normalizeMcpPolicySettings(settings);
		await this.setSetting('mcpPolicySettings', normalized);
		return normalized;
	}

	async recordMcpChange(
		change: Omit<
			McpChangeRecord,
			'id' | 'createdAt' | 'resolvedAt' | 'status' | 'source' | 'conflict' | 'policy' | 'audit'
		>,
	): Promise<McpChangeRecord> {
		return this.withWriteJournal('record-mcp-change', async () => {
			const changeLog = await this.loadMcpChangeLog();
			const agentId = this.resolveMcpAgentId(change.agentId);
			const policyBehavior = await this.getMcpPolicyBehavior(agentId);
			const record: McpChangeRecord = {
				id: randomUUID(),
				createdAt: nowISO(),
				resolvedAt: null,
				source: 'mcp',
				status: 'pending',
				...change,
				agentId,
			};
			const policyDecision = this.shouldAutoApprove(policyBehavior, record);
			record.policy = {
				presetId: policyBehavior.presetId,
				decision: policyDecision.autoApprove ? 'auto_approved' : 'pending_review',
				reason: policyDecision.reason,
			};
			this.appendMcpAudit(record, {
				actor: `agent:${agentId}`,
				action: 'staged',
				reason: `Staged via ${policyBehavior.label}`,
			});

			const hasExistingPendingForNote = changeLog.changes.some(
				(entry) => entry.status === 'pending' && entry.noteId === record.noteId,
			);
			if (policyDecision.autoApprove && !hasExistingPendingForNote) {
				await this.applyMcpChange(record);
				record.status = 'approved';
				record.resolvedAt = nowISO();
				record.policy.decision = 'auto_approved';
				this.appendMcpAudit(record, {
					actor: `policy:${policyBehavior.presetId}`,
					action: 'auto_approved',
					reason: policyDecision.reason,
				});
			}

			changeLog.changes.push(record);
			await this.saveMcpChangeLog(changeLog);
			return withMcpChangePreview(record);
		});
	}

	async approveMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		return this.withWriteJournal('approve-mcp-change', async () => {
			const changeLog = await this.loadMcpChangeLog();
			const target = changeLog.changes.find(
				(entry) => entry.id === changeId && entry.status === 'pending',
			);
			if (!target) {
				return null;
			}

			const pending = await this.getPendingChangesWithConflicts(changeLog);
			const pendingById = new Map(pending.map((change) => [change.id, change]));

			const related = changeLog.changes
				.filter(
					(entry) =>
						entry.status === 'pending' &&
						entry.noteId === target.noteId &&
						entry.createdAt <= target.createdAt,
				)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

			for (const change of related) {
				const conflict = pendingById.get(change.id)?.conflict;
				if (conflict) {
					this.appendMcpAudit(change, {
						actor: 'desktop-user',
						action: 'conflict_blocked',
						reason: 'Approval blocked due to live-edit conflict',
						notes: conflict.details,
					});
					await this.saveMcpChangeLog(changeLog);
					throw new Error(`Conflict detected for "${change.title}": ${conflict.details}`);
				}
			}

			for (const change of related) {
				await this.applyMcpChange(change);
				change.status = 'approved';
				change.resolvedAt = nowISO();
				this.appendMcpAudit(change, {
					actor: 'desktop-user',
					action: 'approved',
					reason: 'Approved in Settings MCP review',
				});
			}

			await this.saveMcpChangeLog(changeLog);
			return withMcpChangePreview(target);
		});
	}

	async approveAllMcpChanges(): Promise<McpChangeRecord[]> {
		return this.withWriteJournal('approve-all-mcp-changes', async () => {
			const changeLog = await this.loadMcpChangeLog();
			const pending = changeLog.changes.filter((change) => change.status === 'pending');
			const pendingWithConflicts = await this.getPendingChangesWithConflicts(changeLog);
			const conflictsById = new Map(
				pendingWithConflicts.map((change) => [change.id, change.conflict ?? null]),
			);
			const approved: McpChangeRecord[] = [];

			for (const change of pending) {
				const conflict = conflictsById.get(change.id);
				if (conflict) {
					this.appendMcpAudit(change, {
						actor: 'desktop-user',
						action: 'conflict_blocked',
						reason: 'Approve all skipped conflict',
						notes: conflict.details,
					});
					continue;
				}
				await this.applyMcpChange(change);
				change.status = 'approved';
				change.resolvedAt = nowISO();
				this.appendMcpAudit(change, {
					actor: 'desktop-user',
					action: 'approved',
					reason: 'Approved via batch review',
				});
				approved.push(change);
			}

			await this.saveMcpChangeLog(changeLog);
			return approved.map((change) => withMcpChangePreview(change));
		});
	}

	async rejectMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		return this.withWriteJournal('reject-mcp-change', async () => {
			const changeLog = await this.loadMcpChangeLog();
			const change = changeLog.changes.find(
				(entry) => entry.id === changeId && entry.status === 'pending',
			);
			if (!change) {
				return null;
			}

			change.status = 'rejected';
			change.resolvedAt = nowISO();
			this.appendMcpAudit(change, {
				actor: 'desktop-user',
				action: 'rejected',
				reason: 'Rejected in Settings MCP review',
			});
			await this.saveMcpChangeLog(changeLog);
			return withMcpChangePreview(change);
		});
	}

	async rejectAllMcpChanges(): Promise<McpChangeRecord[]> {
		return this.withWriteJournal('reject-all-mcp-changes', async () => {
			const changeLog = await this.loadMcpChangeLog();
			const pending = changeLog.changes.filter((change) => change.status === 'pending');
			for (const change of pending) {
				change.status = 'rejected';
				change.resolvedAt = nowISO();
				this.appendMcpAudit(change, {
					actor: 'desktop-user',
					action: 'rejected',
					reason: 'Rejected via batch review',
				});
			}
			await this.saveMcpChangeLog(changeLog);
			return pending.map((change) => withMcpChangePreview(change));
		});
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
		const resolutionEntries = Object.entries(this.index.notes)
			.filter(([, entry]) => !entry.deleted)
			.map(([id, entry]) => ({
				id,
				title: entry.title,
				updatedAt: entry.updatedAt,
				aliases: entry.aliases ?? [],
			}));

		for (const wl of extracted) {
			if (wl.targetIdHint) {
				const target = await this.getNote(createNoteId(wl.targetIdHint));
				if (!target) continue;
				links.push({
					sourceId: noteId,
					targetId: target.id,
					displayText: wl.displayText,
					position: wl.position,
					resolvedBy: 'id',
					resolvedAlias: null,
					contextSnippet: buildTwoSentenceContextSnippetAtPosition(content, wl.position),
				});
				continue;
			}

			const candidates = resolveLinkCandidates(wl.title, resolutionEntries);
			if (candidates.length !== 1) continue;
			const target = candidates[0]!;
			links.push({
				sourceId: noteId,
				targetId: createNoteId(target.id),
				displayText: wl.displayText,
				position: wl.position,
				resolvedBy: target.matchedBy,
				resolvedAlias: target.matchedAlias ?? null,
				contextSnippet: buildTwoSentenceContextSnippetAtPosition(content, wl.position),
			});
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
