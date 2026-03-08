import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
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
	normalizeMobileVaultRoot,
	resolveConfiguredMobileVaultRoot,
} from '$lib/platform/mobile-vault-root.js';
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
import { DEFAULT_SETTINGS, type AppSettings } from '$lib/types/settings.js';
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

const STATE_VERSION = 1;
const HISTORY_LIMIT = 100;

interface SnapshotRecord extends SafetySnapshot {
	notes: Note[];
}

interface CapacitorVaultState {
	version: number;
	notes: Note[];
	linksBySource: Record<string, Link[]>;
	sessionBoards: SessionBoard[];
	objects: VaultObject[];
	objectHistory: VaultObjectHistoryEntry[];
	settings: AppSettings;
	safetySnapshots: SnapshotRecord[];
	sessionState: SessionState;
}

interface AdapterOptions {
	directory?: Directory;
	vaultRoot?: string;
}

function deepCopy<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultState(): CapacitorVaultState {
	return {
		version: STATE_VERSION,
		notes: [],
		linksBySource: {},
		sessionBoards: [],
		objects: [],
		objectHistory: [],
		settings: deepCopy(DEFAULT_SETTINGS),
		safetySnapshots: [],
		sessionState: deepCopy(DEFAULT_SESSION_STATE),
	};
}

function normalizeSettings(raw: unknown): AppSettings {
	if (!raw || typeof raw !== 'object') {
		return deepCopy(DEFAULT_SETTINGS);
	}
	const source = raw as Partial<AppSettings>;
	const base = deepCopy(DEFAULT_SETTINGS);
	return {
		...base,
		...source,
		theme: normalizeThemeSetting(source.theme),
		uiDensity: normalizeUiDensity(source.uiDensity),
		noteReadingWidth: normalizeNoteReadingWidth(source.noteReadingWidth),
		editor: {
			...base.editor,
			...(source.editor ?? {}),
		},
		defaultSort: {
			...base.defaultSort,
			...(source.defaultSort ?? {}),
		},
		onboarding: {
			...base.onboarding,
			...(source.onboarding ?? {}),
			completedSteps: Array.isArray(source.onboarding?.completedSteps)
				? source.onboarding.completedSteps
				: base.onboarding.completedSteps,
			dismissedTips: Array.isArray(source.onboarding?.dismissedTips)
				? source.onboarding.dismissedTips
				: base.onboarding.dismissedTips,
		},
		templateContext: {
			...base.templateContext,
			...(source.templateContext ?? {}),
			characterNames: Array.isArray(source.templateContext?.characterNames)
				? source.templateContext.characterNames
				: base.templateContext.characterNames,
		},
		mcpPolicySettings: {
			...base.mcpPolicySettings,
			...(source.mcpPolicySettings ?? {}),
			perAgent:
				source.mcpPolicySettings &&
				typeof source.mcpPolicySettings === 'object' &&
				source.mcpPolicySettings.perAgent &&
				typeof source.mcpPolicySettings.perAgent === 'object'
					? source.mcpPolicySettings.perAgent
					: base.mcpPolicySettings.perAgent,
		},
		syncConflictStrategy: normalizeSyncConflictStrategy(source.syncConflictStrategy),
		syncEngineState: normalizeSyncEngineState(source.syncEngineState),
		savedSearches: Array.isArray(source.savedSearches) ? source.savedSearches : base.savedSearches,
		diceMacros: Array.isArray(source.diceMacros) ? source.diceMacros : base.diceMacros,
		boardTemplates: Array.isArray(source.boardTemplates)
			? source.boardTemplates
			: base.boardTemplates,
		worldCalendar: normalizeWorldCalendar(source.worldCalendar ?? base.worldCalendar),
	};
}

function normalizeState(raw: unknown): CapacitorVaultState {
	if (!raw || typeof raw !== 'object') {
		return createDefaultState();
	}
	const source = raw as Partial<CapacitorVaultState>;
	return {
		version: STATE_VERSION,
		notes: Array.isArray(source.notes) ? source.notes : [],
		linksBySource:
			source.linksBySource && typeof source.linksBySource === 'object'
				? (source.linksBySource as Record<string, Link[]>)
				: {},
		sessionBoards: Array.isArray(source.sessionBoards) ? source.sessionBoards : [],
		objects: Array.isArray(source.objects) ? source.objects : [],
		objectHistory: Array.isArray(source.objectHistory) ? source.objectHistory : [],
		settings: normalizeSettings(source.settings),
		safetySnapshots: Array.isArray(source.safetySnapshots) ? source.safetySnapshots : [],
		sessionState: normalizeSessionState(source.sessionState),
	};
}

function isMissingPathError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not exist|no such file|ENOENT|missing/i.test(message);
}

function matchesNoteId(id: NoteId, candidate: NoteId): boolean {
	return String(id) === String(candidate);
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
	return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createObjectHistoryId(): string {
	return `objhist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function objectsEqual(left: VaultObject, right: VaultObject): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export class CapacitorStorageAdapter implements StorageAdapter {
	private state: CapacitorVaultState | null = null;
	private writeQueue: Promise<unknown> = Promise.resolve();
	private readonly directory: Directory;
	private readonly vaultRoot: string;
	private readonly statePath: string;

	constructor(options: AdapterOptions = {}) {
		this.directory = options.directory ?? Directory.Data;
		this.vaultRoot = normalizeMobileVaultRoot(
			options.vaultRoot ?? resolveConfiguredMobileVaultRoot(),
		);
		this.statePath = `${this.vaultRoot}/state.json`;
	}

	async initialize(): Promise<void> {
		await this.ensureLoaded();
	}

	async close(): Promise<void> {
		// No-op: Capacitor handles lifecycle and file descriptors.
	}

	private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.writeQueue.then(operation, operation);
		this.writeQueue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	private async ensureLoaded(): Promise<CapacitorVaultState> {
		if (this.state) {
			return this.state;
		}

		await Filesystem.mkdir({
			path: this.vaultRoot,
			directory: this.directory,
			recursive: true,
		}).catch(() => undefined);

		try {
			const file = await Filesystem.readFile({
				path: this.statePath,
				directory: this.directory,
				encoding: Encoding.UTF8,
			});
			const parsed = JSON.parse(String(file.data));
			this.state = normalizeState(parsed);
		} catch (error) {
			if (!isMissingPathError(error)) {
				throw error;
			}
			this.state = createDefaultState();
			await this.persistState();
		}

		return this.state;
	}

	private async persistState(): Promise<void> {
		if (!this.state) return;
		await Filesystem.writeFile({
			path: this.statePath,
			directory: this.directory,
			encoding: Encoding.UTF8,
			recursive: true,
			data: JSON.stringify(this.state, null, 2),
		});
	}

	private async mutateState<T>(
		operation: (state: CapacitorVaultState) => T | Promise<T>,
	): Promise<T> {
		return this.withWriteLock(async () => {
			const state = await this.ensureLoaded();
			const result = await operation(state);
			state.version = STATE_VERSION;
			await this.persistState();
			return result;
		});
	}

	private async readState<T>(
		operation: (state: CapacitorVaultState) => T | Promise<T>,
	): Promise<T> {
		const state = await this.ensureLoaded();
		return operation(state);
	}

	private flattenLinks(state: CapacitorVaultState): Link[] {
		const allLinks: Link[] = [];
		for (const [sourceId, links] of Object.entries(state.linksBySource)) {
			for (const link of links) {
				allLinks.push({
					...link,
					sourceId: createNoteId(sourceId),
				});
			}
		}
		return allLinks;
	}

	private addObjectHistory(
		state: CapacitorVaultState,
		object: VaultObject,
		reason: VaultObjectHistoryEntry['reason'],
	): void {
		state.objectHistory.unshift({
			id: createObjectHistoryId(),
			objectId: object.id,
			recordedAt: nowISO(),
			reason,
			object: deepCopy(object),
		});
		if (state.objectHistory.length > HISTORY_LIMIT) {
			state.objectHistory = state.objectHistory.slice(0, HISTORY_LIMIT);
		}
	}

	async getNote(id: NoteId): Promise<Note | null> {
		return this.readState((state) => {
			const note = state.notes.find((entry) => matchesNoteId(entry.id, id));
			return note ? deepCopy(note) : null;
		});
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		return this.readState((state) =>
			state.notes
				.filter((entry) => options?.includeDeleted || !entry.deleted)
				.sort(compareUpdatedDesc)
				.map((entry) => deepCopy(entry)),
		);
	}

	async saveNote(note: Note): Promise<void> {
		await this.mutateState((state) => {
			const next = deepCopy(note);
			const index = state.notes.findIndex((entry) => matchesNoteId(entry.id, note.id));
			if (index >= 0) {
				state.notes[index] = next;
			} else {
				state.notes.push(next);
			}
		});
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		await this.mutateState((state) => {
			const index = state.notes.findIndex((entry) => matchesNoteId(entry.id, id));
			if (index < 0) return;

			if (permanent) {
				state.notes.splice(index, 1);
				delete state.linksBySource[String(id)];
				for (const [sourceId, links] of Object.entries(state.linksBySource)) {
					state.linksBySource[sourceId] = links.filter(
						(link) => String(link.targetId) !== String(id),
					);
				}
				return;
			}

			const existing = state.notes[index];
			if (!existing) return;
			const timestamp = nowISO();
			state.notes[index] = {
				...existing,
				deleted: true,
				deletedAt: timestamp,
				updatedAt: timestamp,
			};
		});
	}

	async restoreNote(id: NoteId): Promise<void> {
		await this.mutateState((state) => {
			const index = state.notes.findIndex((entry) => matchesNoteId(entry.id, id));
			if (index < 0) return;
			const existing = state.notes[index];
			if (!existing) return;
			state.notes[index] = {
				...existing,
				deleted: false,
				deletedAt: null,
				updatedAt: nowISO(),
			};
		});
	}

	async getNotesByFolder(folder: FolderId): Promise<Note[]> {
		return this.readState((state) =>
			state.notes
				.filter((entry) => !entry.deleted && noteMatchesFolder(entry, folder))
				.sort(compareUpdatedDesc)
				.map((entry) => deepCopy(entry)),
		);
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		return this.readState((state) =>
			state.notes
				.filter((entry) => !entry.deleted && noteMatchesTag(entry, tag))
				.sort(compareUpdatedDesc)
				.map((entry) => deepCopy(entry)),
		);
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		return this.readState((state) =>
			state.notes
				.filter((entry) => !entry.deleted)
				.sort(compareUpdatedDesc)
				.slice(0, Math.max(0, limit))
				.map((entry) => deepCopy(entry)),
		);
	}

	async getDeletedNotes(): Promise<Note[]> {
		return this.readState((state) =>
			state.notes
				.filter((entry) => entry.deleted)
				.sort(compareUpdatedDesc)
				.map((entry) => deepCopy(entry)),
		);
	}

	async resolveTitle(title: string): Promise<Note | null> {
		return this.readState((state) => {
			const entries = state.notes
				.filter((entry) => !entry.deleted)
				.map((entry) => ({
					id: String(entry.id),
					title: entry.title,
					updatedAt: entry.updatedAt,
					aliases: extractAliasesFromFrontmatter(entry.frontmatter),
				}));
			const resolved = resolveLinkTargetId(title, entries);
			if (!resolved) return null;
			const note = state.notes.find((entry) => String(entry.id) === String(resolved));
			return note ? deepCopy(note) : null;
		});
	}

	async getLinksFrom(noteId: NoteId): Promise<Link[]> {
		return this.readState((state) => deepCopy(state.linksBySource[String(noteId)] ?? []));
	}

	async getLinksTo(noteId: NoteId): Promise<Link[]> {
		return this.readState((state) =>
			this.flattenLinks(state)
				.filter((entry) => String(entry.targetId) === String(noteId))
				.map((entry) => deepCopy(entry)),
		);
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		await this.mutateState((state) => {
			state.linksBySource[String(noteId)] = deepCopy(links);
		});
	}

	async getAllLinks(): Promise<Link[]> {
		return this.readState((state) => this.flattenLinks(state).map((entry) => deepCopy(entry)));
	}

	async getSessionBoards(): Promise<SessionBoard[]> {
		return this.readState((state) =>
			state.sessionBoards.sort(compareUpdatedDesc).map((entry) => deepCopy(entry)),
		);
	}

	async getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		return this.readState((state) => {
			const board = state.sessionBoards.find((entry) => String(entry.id) === String(id));
			return board ? deepCopy(board) : null;
		});
	}

	async saveSessionBoard(board: SessionBoard): Promise<void> {
		await this.mutateState((state) => {
			const index = state.sessionBoards.findIndex((entry) => String(entry.id) === String(board.id));
			const timestamp = nowISO();
			const normalized: SessionBoard = {
				...deepCopy(board),
				id: createSessionBoardId(String(board.id)),
				createdAt: board.createdAt || timestamp,
				updatedAt: timestamp,
			};
			if (index >= 0) {
				state.sessionBoards[index] = normalized;
			} else {
				state.sessionBoards.push(normalized);
			}
		});
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		await this.mutateState((state) => {
			state.sessionBoards = state.sessionBoards.filter((entry) => String(entry.id) !== String(id));
		});
	}

	async suggestRelatedNotes(noteIds: NoteId[], limit = 8): Promise<RelatedNoteSuggestion[]> {
		return this.readState((state) =>
			buildRelatedNoteSuggestions({
				notes: state.notes.filter((entry) => !entry.deleted),
				links: this.flattenLinks(state),
				selectedNoteIds: noteIds,
				limit,
			}),
		);
	}

	async getObject(id: VaultObjectId): Promise<VaultObject | null> {
		return this.readState((state) => {
			const object = state.objects.find((entry) => String(entry.id) === String(id));
			return object ? deepCopy(object) : null;
		});
	}

	async getAllObjects(options?: {
		type?: VaultObjectType;
		query?: string;
	}): Promise<VaultObject[]> {
		return this.readState((state) => {
			const query = options?.query?.trim().toLowerCase();
			return state.objects
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
		});
	}

	async saveObject(object: VaultObject): Promise<void> {
		await this.mutateState((state) => {
			const index = state.objects.findIndex((entry) => String(entry.id) === String(object.id));
			const next = deepCopy(object);
			if (index >= 0) {
				const current = state.objects[index];
				if (current && !objectsEqual(current, next)) {
					this.addObjectHistory(state, current, 'save');
				}
				state.objects[index] = next;
				return;
			}
			state.objects.push(next);
		});
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		await this.mutateState((state) => {
			const index = state.objects.findIndex((entry) => String(entry.id) === String(id));
			if (index < 0) return;
			const existing = state.objects[index];
			if (existing) {
				this.addObjectHistory(state, existing, 'delete');
			}
			state.objects.splice(index, 1);
		});
	}

	async getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		return this.readState((state) => buildObjectRelationshipGraph(state.objects));
	}

	async lintObjects(): Promise<ObjectLintIssue[]> {
		return this.readState((state) => lintVaultObjects(state.objects));
	}

	async getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		return this.readState((state) =>
			state.objectHistory
				.filter((entry) => String(entry.objectId) === String(id))
				.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
				.slice(0, Math.max(1, options?.limit ?? 50))
				.map((entry) => deepCopy(entry)),
		);
	}

	async revertObjectToHistory(
		id: VaultObjectId,
		historyEntryId: string,
	): Promise<VaultObject | null> {
		return this.mutateState((state) => {
			const historyEntry = state.objectHistory.find(
				(entry) => String(entry.objectId) === String(id) && entry.id === historyEntryId,
			);
			if (!historyEntry) return null;

			const current = state.objects.find((entry) => String(entry.id) === String(id));
			if (current) {
				this.addObjectHistory(state, current, 'revert');
			}

			const reverted: VaultObject = {
				...deepCopy(historyEntry.object),
				id,
				updatedAt: nowISO(),
			};
			const index = state.objects.findIndex((entry) => String(entry.id) === String(id));
			if (index >= 0) {
				state.objects[index] = reverted;
			} else {
				state.objects.push(reverted);
			}
			return deepCopy(reverted);
		});
	}

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		return this.readState((state) => {
			const value = state.settings[key] ?? DEFAULT_SETTINGS[key];
			return deepCopy(value) as AppSettings[K];
		});
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		await this.mutateState((state) => {
			state.settings = {
				...state.settings,
				[key]: deepCopy(value),
			};
		});
	}

	async getNoteTemplates(): Promise<NoteTemplate[]> {
		return deepCopy([...DND_TEMPLATES]);
	}

	async getReusableSnippets(): Promise<ReusableSnippet[]> {
		return deepCopy([...REUSABLE_SNIPPETS]);
	}

	async createSafetySnapshot(reason = 'manual'): Promise<SafetySnapshot> {
		return this.mutateState((state) => {
			const notes = deepCopy(state.notes);
			const sizeBytes = new TextEncoder().encode(JSON.stringify(notes)).length;
			const snapshot: SnapshotRecord = {
				id: createSnapshotId(),
				createdAt: nowISO(),
				reason,
				noteCount: notes.length,
				sizeBytes,
				notes,
			};
			state.safetySnapshots.unshift(snapshot);
			state.safetySnapshots = state.safetySnapshots.slice(0, 20);
			return {
				id: snapshot.id,
				createdAt: snapshot.createdAt,
				reason: snapshot.reason,
				noteCount: snapshot.noteCount,
				sizeBytes: snapshot.sizeBytes,
			};
		});
	}

	async listSafetySnapshots(): Promise<SafetySnapshot[]> {
		return this.readState((state) =>
			state.safetySnapshots
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
				.map((entry) => ({
					id: entry.id,
					createdAt: entry.createdAt,
					reason: entry.reason,
					noteCount: entry.noteCount,
					sizeBytes: entry.sizeBytes,
				})),
		);
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return this.mutateState((state) => {
			const snapshot = state.safetySnapshots.find((entry) => entry.id === snapshotId);
			if (!snapshot) {
				return { restored: 0, skipped: 0 };
			}

			let restored = 0;
			let skipped = 0;
			for (const candidate of snapshot.notes) {
				if (candidate.deleted) continue;
				const index = state.notes.findIndex((entry) => String(entry.id) === String(candidate.id));
				if (index < 0) {
					state.notes.push({
						...deepCopy(candidate),
						deleted: false,
						deletedAt: null,
						updatedAt: nowISO(),
					});
					restored += 1;
					continue;
				}

				const current = state.notes[index];
				if (!current) continue;
				if (!current.deleted) {
					skipped += 1;
					continue;
				}
				state.notes[index] = {
					...deepCopy(candidate),
					deleted: false,
					deletedAt: null,
					updatedAt: nowISO(),
				};
				restored += 1;
			}
			return { restored, skipped };
		});
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		return this.mutateState((state) => {
			let imported = 0;
			let skipped = 0;
			const errors: string[] = [];

			for (const note of notes) {
				try {
					const exists = state.notes.some((entry) => String(entry.id) === String(note.id));
					if (exists) {
						skipped += 1;
						continue;
					}
					state.notes.push(deepCopy(note));
					imported += 1;
				} catch (error) {
					errors.push(
						`Failed to import "${note.title}": ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			return { imported, skipped, errors };
		});
	}

	async exportAllNotes(): Promise<Note[]> {
		return this.readState((state) => state.notes.map((entry) => deepCopy(entry)));
	}

	async getNoteCount(): Promise<number> {
		return this.readState((state) => state.notes.filter((entry) => !entry.deleted).length);
	}

	async getTagCounts(): Promise<TagEntry[]> {
		return this.readState((state) => {
			const counts = new Map<string, number>();
			for (const note of state.notes) {
				if (note.deleted) continue;
				for (const tag of note.tags) {
					counts.set(tag, (counts.get(tag) ?? 0) + 1);
				}
			}
			return [...counts.entries()]
				.map(([name, count]) => ({ name, count }))
				.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
		});
	}

	async getSessionState(): Promise<SessionState> {
		return this.readState((state) => normalizeSessionState(state.sessionState));
	}

	async saveSessionState(state: SessionState): Promise<void> {
		await this.mutateState((current) => {
			current.sessionState = normalizeSessionState(state);
		});
	}
}
