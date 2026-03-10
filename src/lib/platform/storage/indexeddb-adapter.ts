import Dexie, { type Table } from 'dexie';
import { buildObjectRelationshipGraph } from '$lib/domain/object-relationships.js';
import { lintVaultObjects } from '$lib/domain/object-validation.js';
import { buildRelatedNoteSuggestions } from '$lib/domain/related-note-suggestions.js';
import { resolveLinkTargetId, extractAliasesFromFrontmatter } from '$lib/domain/link-resolution.js';
import { REUSABLE_SNIPPETS } from '$lib/domain/snippets.js';
import { DND_TEMPLATES } from '$lib/domain/templates.js';
import { normalizeSyncConflictStrategy, normalizeSyncEngineState } from '$lib/domain/sync.js';
import { normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import { normalizeThemeSetting } from '$lib/domain/theme.js';
import { normalizeNoteReadingWidth, normalizeUiDensity } from '$lib/domain/appearance.js';
import {
	createNoteId,
	type FolderId,
	type Link,
	type Note,
	type NoteId,
	type TagEntry,
} from '$lib/types/note.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from '$lib/types/object.js';
import {
	DEFAULT_SETTINGS,
	normalizeFeatureSettings,
	normalizeOnboardingSettings,
	normalizeSeenSpotlights,
	type AppSettings,
} from '$lib/types/settings.js';
import {
	createSessionBoardId,
	type RelatedNoteSuggestion,
	type SessionBoard,
	type SessionBoardId,
} from '$lib/types/session-board.js';
import type { NoteTemplate, ReusableSnippet } from '$lib/types/template-library.js';
import type {
	ImportResult,
	SafetySnapshot,
	SnapshotRestoreResult,
	StorageAdapter,
} from '$lib/types/storage.js';
import {
	DEFAULT_SESSION_STATE,
	normalizeSessionState,
	type SessionState,
} from '$lib/types/session-state.js';
import { nowISO } from '$lib/utils/date.js';

const HISTORY_LIMIT = 100;
const SNAPSHOT_LIMIT = 20;
const CHANGELOG_LIMIT = 500;
const DEFAULT_VAULT_NAMESPACE = 'browser-default';
const SESSION_STATE_KEY = '__session_state__';

interface AdapterOptions {
	dbName?: string;
	vaultNamespace?: string;
}

interface LinkRow {
	id?: number;
	sourceId: string;
	targetId: string;
	displayText: string;
	position: number;
	resolvedBy?: 'id' | 'title' | 'alias';
	resolvedAlias?: string | null;
	contextSnippet?: string | null;
}

interface StoredSetting {
	key: string;
	value: unknown;
}

interface SnapshotRecord extends SafetySnapshot {
	notes: Note[];
}

interface ChangelogEntry {
	id: string;
	createdAt: string;
	entityType: 'note' | 'link' | 'session_board' | 'object' | 'setting' | 'snapshot' | 'bulk';
	action: string;
	entityId: string;
	payload?: unknown;
}

class IndexedDbVaultDatabase extends Dexie {
	notes!: Table<Note, string>;
	links!: Table<LinkRow, number>;
	sessionBoards!: Table<SessionBoard, string>;
	objects!: Table<VaultObject, string>;
	objectHistory!: Table<VaultObjectHistoryEntry, string>;
	settings!: Table<StoredSetting, string>;
	snapshots!: Table<SnapshotRecord, string>;
	changelog!: Table<ChangelogEntry, string>;

	constructor(dbName: string) {
		super(dbName);
		this.version(1).stores({
			notes: '&id, deleted, updatedAt, folder, *tags, title',
			links: '++id, sourceId, targetId',
			sessionBoards: '&id, updatedAt',
			objects: '&id, type, updatedAt, name',
			objectHistory: '&id, objectId, recordedAt',
			settings: '&key',
			snapshots: '&id, createdAt',
			changelog: '&id, createdAt, entityType, action, entityId',
		});
	}
}

function deepCopy<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeNamespace(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function createDatabaseName(namespace: string): string {
	const safe = sanitizeNamespace(namespace) || DEFAULT_VAULT_NAMESPACE;
	return `dndtools-indexeddb-${safe}`;
}

function normalizeFolder(folder: FolderId): string {
	const raw = String(folder).trim().replace(/\\/g, '/');
	if (raw === '/') return '/';
	const trimmed = raw.replace(/\/+$/, '').replace(/^\/?/, '/');
	return trimmed || '/';
}

function noteMatchesFolder(note: Note, folder: FolderId): boolean {
	return normalizeFolder(note.folder) === normalizeFolder(folder);
}

function noteMatchesTag(note: Note, tag: string): boolean {
	return note.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase());
}

function compareUpdatedDesc<T extends { updatedAt: string }>(a: T, b: T): number {
	return b.updatedAt.localeCompare(a.updatedAt);
}

function createSnapshotId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `snapshot-${crypto.randomUUID()}`;
	}
	return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createObjectHistoryId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `objhist-${crypto.randomUUID()}`;
	}
	return `objhist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createChangelogId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `changelog-${crypto.randomUUID()}`;
	}
	return `changelog-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function objectsEqual(left: VaultObject, right: VaultObject): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeSettingValue<K extends keyof AppSettings>(
	key: K,
	value: unknown,
): AppSettings[K] {
	const fallback = deepCopy(DEFAULT_SETTINGS[key]);
	if (value === undefined) {
		return fallback;
	}

	switch (key) {
		case 'theme':
			return normalizeThemeSetting(value) as AppSettings[K];
		case 'uiDensity':
			return normalizeUiDensity(value) as AppSettings[K];
		case 'noteReadingWidth':
			return normalizeNoteReadingWidth(value) as AppSettings[K];
		case 'syncConflictStrategy':
			return normalizeSyncConflictStrategy(value) as AppSettings[K];
		case 'syncEngineState':
			return normalizeSyncEngineState(value) as AppSettings[K];
		case 'worldCalendar':
			return normalizeWorldCalendar(value ?? fallback) as AppSettings[K];
		case 'featureSettings':
			return normalizeFeatureSettings(value) as AppSettings[K];
		case 'onboarding':
			return normalizeOnboardingSettings(value) as AppSettings[K];
		case 'seenSpotlights':
			return normalizeSeenSpotlights(value) as AppSettings[K];
		default:
			return deepCopy(value) as AppSettings[K];
	}
}

export class IndexedDbStorageAdapter implements StorageAdapter {
	private readonly database: IndexedDbVaultDatabase;

	constructor(options: AdapterOptions = {}) {
		const namespace = options.vaultNamespace ?? DEFAULT_VAULT_NAMESPACE;
		const dbName = options.dbName ?? createDatabaseName(namespace);
		this.database = new IndexedDbVaultDatabase(dbName);
	}

	async initialize(): Promise<void> {
		await this.database.open();
	}

	async close(): Promise<void> {
		this.database.close();
	}

	private toLink(row: LinkRow): Link {
		return {
			sourceId: createNoteId(row.sourceId),
			targetId: createNoteId(row.targetId),
			displayText: row.displayText,
			position: row.position,
			resolvedBy: row.resolvedBy,
			resolvedAlias: row.resolvedAlias ?? null,
			contextSnippet: row.contextSnippet ?? null,
		};
	}

	private async trimHistory(): Promise<void> {
		const staleKeys = await this.database.objectHistory
			.orderBy('recordedAt')
			.reverse()
			.offset(HISTORY_LIMIT)
			.primaryKeys();
		if (staleKeys.length > 0) {
			await this.database.objectHistory.bulkDelete(staleKeys as string[]);
		}
	}

	private async trimSnapshots(): Promise<void> {
		const staleKeys = await this.database.snapshots
			.orderBy('createdAt')
			.reverse()
			.offset(SNAPSHOT_LIMIT)
			.primaryKeys();
		if (staleKeys.length > 0) {
			await this.database.snapshots.bulkDelete(staleKeys as string[]);
		}
	}

	private async recordChangelog(
		entityType: ChangelogEntry['entityType'],
		action: string,
		entityId: string,
		payload?: unknown,
	): Promise<void> {
		await this.database.changelog.put({
			id: createChangelogId(),
			createdAt: nowISO(),
			entityType,
			action,
			entityId,
			payload: payload === undefined ? undefined : deepCopy(payload),
		});
		const staleKeys = await this.database.changelog
			.orderBy('createdAt')
			.reverse()
			.offset(CHANGELOG_LIMIT)
			.primaryKeys();
		if (staleKeys.length > 0) {
			await this.database.changelog.bulkDelete(staleKeys as string[]);
		}
	}

	private async addObjectHistory(
		object: VaultObject,
		reason: VaultObjectHistoryEntry['reason'],
	): Promise<void> {
		await this.database.objectHistory.put({
			id: createObjectHistoryId(),
			objectId: object.id,
			recordedAt: nowISO(),
			reason,
			object: deepCopy(object),
		});
		await this.trimHistory();
	}

	async getNote(id: NoteId): Promise<Note | null> {
		const note = await this.database.notes.get(String(id));
		return note ? deepCopy(note) : null;
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes
			.filter((entry) => options?.includeDeleted || !entry.deleted)
			.sort(compareUpdatedDesc)
			.map((entry) => deepCopy(entry));
	}

	async saveNote(note: Note): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.notes,
			this.database.changelog,
			async () => {
				await this.database.notes.put(deepCopy(note));
				await this.recordChangelog('note', 'save', String(note.id), {
					title: note.title,
					updatedAt: note.updatedAt,
				});
			},
		);
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.notes,
			this.database.links,
			this.database.changelog,
			async () => {
				const existing = await this.database.notes.get(String(id));
				if (!existing) return;

				if (permanent) {
					await this.database.notes.delete(String(id));
					const sourceLinkIds = await this.database.links
						.where('sourceId')
						.equals(String(id))
						.primaryKeys();
					const targetLinkIds = await this.database.links
						.where('targetId')
						.equals(String(id))
						.primaryKeys();
					await this.database.links.bulkDelete([
						...(sourceLinkIds as number[]),
						...(targetLinkIds as number[]),
					]);
					await this.recordChangelog('note', 'delete_permanent', String(id));
					return;
				}

				const timestamp = nowISO();
				await this.database.notes.put({
					...existing,
					deleted: true,
					deletedAt: timestamp,
					updatedAt: timestamp,
				});
				await this.recordChangelog('note', 'delete_soft', String(id));
			},
		);
	}

	async restoreNote(id: NoteId): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.notes,
			this.database.changelog,
			async () => {
				const existing = await this.database.notes.get(String(id));
				if (!existing) return;
				await this.database.notes.put({
					...existing,
					deleted: false,
					deletedAt: null,
					updatedAt: nowISO(),
				});
				await this.recordChangelog('note', 'restore', String(id));
			},
		);
	}

	async getNotesByFolder(folder: FolderId): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes
			.filter((entry) => !entry.deleted && noteMatchesFolder(entry, folder))
			.sort(compareUpdatedDesc)
			.map((entry) => deepCopy(entry));
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes
			.filter((entry) => !entry.deleted && noteMatchesTag(entry, tag))
			.sort(compareUpdatedDesc)
			.map((entry) => deepCopy(entry));
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes
			.filter((entry) => !entry.deleted)
			.sort(compareUpdatedDesc)
			.slice(0, Math.max(0, limit))
			.map((entry) => deepCopy(entry));
	}

	async getDeletedNotes(): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes
			.filter((entry) => entry.deleted)
			.sort(compareUpdatedDesc)
			.map((entry) => deepCopy(entry));
	}

	async resolveTitle(title: string): Promise<Note | null> {
		const notes = await this.database.notes.toArray();
		const entries = notes
			.filter((entry) => !entry.deleted)
			.map((entry) => ({
				id: String(entry.id),
				title: entry.title,
				updatedAt: entry.updatedAt,
				aliases: extractAliasesFromFrontmatter(entry.frontmatter),
			}));
		const resolved = resolveLinkTargetId(title, entries);
		if (!resolved) return null;
		const note = notes.find((entry) => String(entry.id) === String(resolved));
		return note ? deepCopy(note) : null;
	}

	async getLinksFrom(noteId: NoteId): Promise<Link[]> {
		const rows = await this.database.links
			.where('sourceId')
			.equals(String(noteId))
			.sortBy('position');
		return rows.map((row) => this.toLink(row));
	}

	async getLinksTo(noteId: NoteId): Promise<Link[]> {
		const rows = await this.database.links.where('targetId').equals(String(noteId)).toArray();
		return rows
			.sort((left, right) => left.position - right.position)
			.map((row) => this.toLink(row));
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.links,
			this.database.changelog,
			async () => {
				const existing = await this.database.links
					.where('sourceId')
					.equals(String(noteId))
					.primaryKeys();
				if (existing.length > 0) {
					await this.database.links.bulkDelete(existing as number[]);
				}
				if (links.length > 0) {
					await this.database.links.bulkAdd(
						links.map((entry) => ({
							sourceId: String(noteId),
							targetId: String(entry.targetId),
							displayText: entry.displayText,
							position: entry.position,
							resolvedBy: entry.resolvedBy,
							resolvedAlias: entry.resolvedAlias ?? null,
							contextSnippet: entry.contextSnippet ?? null,
						})),
					);
				}
				await this.recordChangelog('link', 'set_links_from', String(noteId), {
					linkCount: links.length,
				});
			},
		);
	}

	async getAllLinks(): Promise<Link[]> {
		const rows = await this.database.links.toArray();
		return rows.map((row) => this.toLink(row));
	}

	async getSessionBoards(): Promise<SessionBoard[]> {
		const boards = await this.database.sessionBoards.toArray();
		return boards.sort(compareUpdatedDesc).map((entry) => deepCopy(entry));
	}

	async getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		const board = await this.database.sessionBoards.get(String(id));
		return board ? deepCopy(board) : null;
	}

	async saveSessionBoard(board: SessionBoard): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.sessionBoards,
			this.database.changelog,
			async () => {
				const timestamp = nowISO();
				const normalized: SessionBoard = {
					...deepCopy(board),
					id: createSessionBoardId(String(board.id)),
					createdAt: board.createdAt || timestamp,
					updatedAt: timestamp,
				};
				await this.database.sessionBoards.put(normalized);
				await this.recordChangelog('session_board', 'save', String(board.id));
			},
		);
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.sessionBoards,
			this.database.changelog,
			async () => {
				await this.database.sessionBoards.delete(String(id));
				await this.recordChangelog('session_board', 'delete', String(id));
			},
		);
	}

	async suggestRelatedNotes(noteIds: NoteId[], limit = 8): Promise<RelatedNoteSuggestion[]> {
		const [notes, links] = await Promise.all([this.database.notes.toArray(), this.getAllLinks()]);
		return buildRelatedNoteSuggestions({
			notes: notes.filter((entry) => !entry.deleted),
			links,
			selectedNoteIds: noteIds,
			limit,
		});
	}

	async getObject(id: VaultObjectId): Promise<VaultObject | null> {
		const object = await this.database.objects.get(String(id));
		return object ? deepCopy(object) : null;
	}

	async getAllObjects(options?: {
		type?: VaultObjectType;
		query?: string;
	}): Promise<VaultObject[]> {
		const query = options?.query?.trim().toLowerCase();
		const objects = await this.database.objects.toArray();
		return objects
			.filter((entry) => !options?.type || entry.type === options.type)
			.filter((entry) => {
				if (!query) return true;
				const haystack = [entry.name, entry.summary, entry.tags.join(' '), entry.type]
					.join(' ')
					.toLowerCase();
				return haystack.includes(query);
			})
			.sort(compareUpdatedDesc)
			.map((entry) => deepCopy(entry));
	}

	async saveObject(object: VaultObject): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.objects,
			this.database.objectHistory,
			this.database.changelog,
			async () => {
				const existing = await this.database.objects.get(String(object.id));
				const next = deepCopy(object);
				if (existing && !objectsEqual(existing, next)) {
					await this.addObjectHistory(existing, 'save');
				}
				await this.database.objects.put(next);
				await this.recordChangelog('object', 'save', String(object.id), {
					type: object.type,
				});
			},
		);
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.objects,
			this.database.objectHistory,
			this.database.changelog,
			async () => {
				const existing = await this.database.objects.get(String(id));
				if (!existing) return;
				await this.addObjectHistory(existing, 'delete');
				await this.database.objects.delete(String(id));
				await this.recordChangelog('object', 'delete', String(id));
			},
		);
	}

	async getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		const objects = await this.database.objects.toArray();
		return buildObjectRelationshipGraph(objects);
	}

	async lintObjects(): Promise<ObjectLintIssue[]> {
		const objects = await this.database.objects.toArray();
		return lintVaultObjects(objects);
	}

	async getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		const entries = await this.database.objectHistory
			.where('objectId')
			.equals(String(id))
			.toArray();
		return entries
			.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
			.slice(0, Math.max(1, options?.limit ?? 50))
			.map((entry) => deepCopy(entry));
	}

	async revertObjectToHistory(
		id: VaultObjectId,
		historyEntryId: string,
	): Promise<VaultObject | null> {
		return this.database.transaction(
			'rw',
			this.database.objects,
			this.database.objectHistory,
			this.database.changelog,
			async () => {
				const historyEntry = await this.database.objectHistory.get(historyEntryId);
				if (!historyEntry || String(historyEntry.objectId) !== String(id)) {
					return null;
				}

				const current = await this.database.objects.get(String(id));
				if (current) {
					await this.addObjectHistory(current, 'revert');
				}

				const reverted: VaultObject = {
					...deepCopy(historyEntry.object),
					id,
					updatedAt: nowISO(),
				};
				await this.database.objects.put(reverted);
				await this.recordChangelog('object', 'revert', String(id), {
					historyEntryId,
				});
				return deepCopy(reverted);
			},
		);
	}

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		const record = await this.database.settings.get(String(key));
		return normalizeSettingValue(key, record?.value);
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		await this.database.transaction(
			'rw',
			this.database.settings,
			this.database.changelog,
			async () => {
				const normalized = normalizeSettingValue(key, value);
				await this.database.settings.put({
					key: String(key),
					value: deepCopy(normalized),
				});
				await this.recordChangelog('setting', 'set', String(key));
			},
		);
	}

	async getNoteTemplates(): Promise<NoteTemplate[]> {
		return deepCopy([...DND_TEMPLATES]);
	}

	async getReusableSnippets(): Promise<ReusableSnippet[]> {
		return deepCopy([...REUSABLE_SNIPPETS]);
	}

	async createSafetySnapshot(reason = 'manual'): Promise<SafetySnapshot> {
		return this.database.transaction(
			'rw',
			this.database.notes,
			this.database.snapshots,
			this.database.changelog,
			async () => {
				const notes = (await this.database.notes.toArray()).map((entry) => deepCopy(entry));
				const sizeBytes = new TextEncoder().encode(JSON.stringify(notes)).length;
				const snapshot: SnapshotRecord = {
					id: createSnapshotId(),
					createdAt: nowISO(),
					reason,
					noteCount: notes.length,
					sizeBytes,
					notes,
				};
				await this.database.snapshots.put(snapshot);
				await this.trimSnapshots();
				await this.recordChangelog('snapshot', 'create', snapshot.id, {
					reason,
					noteCount: notes.length,
				});
				return {
					id: snapshot.id,
					createdAt: snapshot.createdAt,
					reason: snapshot.reason,
					noteCount: snapshot.noteCount,
					sizeBytes: snapshot.sizeBytes,
				};
			},
		);
	}

	async listSafetySnapshots(): Promise<SafetySnapshot[]> {
		const snapshots = await this.database.snapshots.toArray();
		return snapshots
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.map((entry) => ({
				id: entry.id,
				createdAt: entry.createdAt,
				reason: entry.reason,
				noteCount: entry.noteCount,
				sizeBytes: entry.sizeBytes,
			}));
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return this.database.transaction(
			'rw',
			this.database.notes,
			this.database.snapshots,
			this.database.changelog,
			async () => {
				const snapshot = await this.database.snapshots.get(snapshotId);
				if (!snapshot) {
					return { restored: 0, skipped: 0 };
				}

				let restored = 0;
				let skipped = 0;
				for (const candidate of snapshot.notes) {
					if (candidate.deleted) continue;
					const existing = await this.database.notes.get(String(candidate.id));
					if (!existing) {
						await this.database.notes.put({
							...deepCopy(candidate),
							deleted: false,
							deletedAt: null,
							updatedAt: nowISO(),
						});
						restored += 1;
						continue;
					}
					if (!existing.deleted) {
						skipped += 1;
						continue;
					}
					await this.database.notes.put({
						...deepCopy(candidate),
						deleted: false,
						deletedAt: null,
						updatedAt: nowISO(),
					});
					restored += 1;
				}
				await this.recordChangelog('bulk', 'restore_snapshot', snapshotId, {
					restored,
					skipped,
				});
				return { restored, skipped };
			},
		);
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		return this.database.transaction(
			'rw',
			this.database.notes,
			this.database.changelog,
			async () => {
				let imported = 0;
				let skipped = 0;
				const errors: string[] = [];

				for (const note of notes) {
					try {
						const existing = await this.database.notes.get(String(note.id));
						if (existing) {
							skipped += 1;
							continue;
						}
						await this.database.notes.put(deepCopy(note));
						imported += 1;
					} catch (error) {
						errors.push(
							`Failed to import "${note.title}": ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}

				if (imported > 0) {
					await this.recordChangelog('bulk', 'import_notes', `import-${Date.now()}`, {
						imported,
						skipped,
						errors: errors.length,
					});
				}
				return { imported, skipped, errors };
			},
		);
	}

	async exportAllNotes(): Promise<Note[]> {
		const notes = await this.database.notes.toArray();
		return notes.map((entry) => deepCopy(entry));
	}

	async getNoteCount(): Promise<number> {
		const notes = await this.database.notes.toArray();
		return notes.filter((entry) => !entry.deleted).length;
	}

	async getTagCounts(): Promise<TagEntry[]> {
		const notes = await this.database.notes.toArray();
		const counts = new Map<string, number>();
		for (const note of notes) {
			if (note.deleted) continue;
			for (const tag of note.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
		return [...counts.entries()]
			.map(([name, count]) => ({ name, count }))
			.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
	}

	async getSessionState(): Promise<SessionState> {
		const record = await this.database.settings.get(SESSION_STATE_KEY);
		if (!record) return { ...DEFAULT_SESSION_STATE };
		return normalizeSessionState(record.value);
	}

	async saveSessionState(state: SessionState): Promise<void> {
		const normalized = normalizeSessionState(state);
		await this.database.transaction(
			'rw',
			this.database.settings,
			this.database.changelog,
			async () => {
				await this.database.settings.put({
					key: SESSION_STATE_KEY,
					value: deepCopy(normalized),
				});
				await this.recordChangelog(
					'setting',
					'session_state_update',
					SESSION_STATE_KEY,
					normalized,
				);
			},
		);
	}
}
