import type { Note } from '$lib/types/note.js';
import type { StorageAdapter } from '$lib/types/storage.js';
import {
	createDefaultSyncEngineState,
	type SyncConflictRecord,
	type SyncConflictResolution,
	type SyncConflictStrategy,
	type SyncEngineState,
	type SyncIndicatorState,
	type SyncOpaqueQueueEntityType,
	type SyncQueueOperation,
	type SyncWriteTracker,
} from '$lib/types/sync.js';
import {
	chooseLatestNote,
	detectNoteConflictReason,
	normalizeSyncConflictStrategy,
	normalizeSyncEngineState,
	resolveConflictNote,
} from '$lib/domain/sync.js';
import { nowISO } from '$lib/utils/date.js';
import { createNoteId } from '$lib/types/note.js';
import { markSubsystemSuccess, reportRuntimeError } from '$lib/runtime/diagnostics.js';

const CONNECTIVITY_PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

function deepCopy<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function createEngineEntryId(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function noteTitleFromSnapshots(local: Note | null, remote: Note | null): string {
	return local?.title ?? remote?.title ?? 'Untitled note';
}

class SyncState implements SyncWriteTracker {
	initialized = $state(false);
	syncing = $state(false);
	online = $state(true);
	lastError = $state<string | null>(null);
	lastSyncAt = $state<string | null>(null);
	queueDepth = $state(0);
	conflictCount = $state(0);
	conflicts = $state<SyncConflictRecord[]>([]);
	conflictStrategy = $state<SyncConflictStrategy>('manual');

	indicator = $derived.by<SyncIndicatorState>(() => {
		if (this.syncing) return 'syncing';
		if (this.lastError || this.conflictCount > 0) return 'error';
		return this.online ? 'online' : 'offline';
	});

	private storage: StorageAdapter | null = null;
	private engine: SyncEngineState = createDefaultSyncEngineState();
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private connectivityTeardown: (() => void) | null = null;
	private stateWriteQueue: Promise<void> = Promise.resolve();

	private setEngine(next: SyncEngineState): void {
		this.engine = next;
		this.queueDepth = next.queue.length;
		this.conflicts = deepCopy(next.conflicts);
		this.conflictCount = next.conflicts.length;
		this.lastSyncAt = next.lastSyncAt;
		this.lastError = next.lastSyncError;
	}

	async initialize(storage: StorageAdapter): Promise<void> {
		this.storage = storage;
		const [strategy, engineState] = await Promise.all([
			storage.getSetting('syncConflictStrategy'),
			storage.getSetting('syncEngineState'),
		]);
		this.conflictStrategy = normalizeSyncConflictStrategy(strategy);
		this.setEngine(normalizeSyncEngineState(engineState));
		await this.ensureRemoteSeedIfEmpty();
		await this.persistEngineState();
		await this.persistConflictStrategy();

		this.installConnectivityListeners();
		await this.refreshConnectivity();
		this.initialized = true;
		if (this.online) {
			void this.processQueue();
		}
	}

	dispose(): void {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
		this.connectivityTeardown?.();
		this.connectivityTeardown = null;
	}

	async setConflictStrategy(next: SyncConflictStrategy): Promise<void> {
		this.conflictStrategy = next;
		await this.persistConflictStrategy();
		if (next === 'use_latest' && this.conflicts.length > 0) {
			await this.resolveAllWithLatest();
		}
	}

	async forceSync(): Promise<void> {
		await this.refreshConnectivity();
		await this.processQueue();
	}

	recordNoteUpsert(note: Note): void {
		const noteId = String(note.id);
		const now = nowISO();
		const existingIndex = this.engine.queue.findIndex(
			(entry) => entry.entityType === 'note' && entry.entityId === noteId,
		);
		const existing = existingIndex >= 0 ? this.engine.queue[existingIndex] : null;
		const ancestor = existing?.ancestorNote ?? this.engine.remoteNotes[noteId] ?? null;
		const entry = {
			id: existing?.id ?? createEngineEntryId('syncq'),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			entityType: 'note' as const,
			operation: 'note_upsert' as const,
			entityId: noteId,
			ancestorNote: ancestor ? deepCopy(ancestor) : null,
			localNote: deepCopy(note),
			attempts: existing?.attempts ?? 0,
			lastError: null,
		};
		const queue = [...this.engine.queue];
		if (existingIndex >= 0) {
			queue[existingIndex] = entry;
		} else {
			queue.push(entry);
		}
		this.setEngine({
			...this.engine,
			queue,
			lastSyncError: null,
		});
		void this.persistEngineState();
		if (this.online) {
			void this.processQueue();
		}
	}

	recordNotePermanentDelete(noteId: string): void {
		const now = nowISO();
		const existingIndex = this.engine.queue.findIndex(
			(entry) => entry.entityType === 'note' && entry.entityId === noteId,
		);
		const existing = existingIndex >= 0 ? this.engine.queue[existingIndex] : null;
		const ancestor = existing?.ancestorNote ?? this.engine.remoteNotes[noteId] ?? null;

		if (!ancestor) {
			if (existingIndex >= 0) {
				const queue = [...this.engine.queue];
				queue.splice(existingIndex, 1);
				this.setEngine({
					...this.engine,
					queue,
					lastSyncError: null,
				});
				void this.persistEngineState();
			}
			return;
		}

		const entry = {
			id: existing?.id ?? createEngineEntryId('syncq'),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			entityType: 'note' as const,
			operation: 'note_permanent_delete' as const,
			entityId: noteId,
			ancestorNote: deepCopy(ancestor),
			localNote: null,
			attempts: existing?.attempts ?? 0,
			lastError: null,
		};
		const queue = [...this.engine.queue];
		if (existingIndex >= 0) {
			queue[existingIndex] = entry;
		} else {
			queue.push(entry);
		}
		this.setEngine({
			...this.engine,
			queue,
			lastSyncError: null,
		});
		void this.persistEngineState();
		if (this.online) {
			void this.processQueue();
		}
	}

	recordOpaqueMutation(input: {
		operation: SyncQueueOperation;
		entityType: SyncOpaqueQueueEntityType;
		entityId: string;
	}): void {
		const now = nowISO();
		const queue = [
			...this.engine.queue,
			{
				id: createEngineEntryId('syncq'),
				createdAt: now,
				updatedAt: now,
				entityType: input.entityType,
				operation: input.operation,
				entityId: input.entityId,
				ancestorNote: null,
				localNote: null,
				attempts: 0,
				lastError: null,
			},
		];
		this.setEngine({
			...this.engine,
			queue,
			lastSyncError: null,
		});
		void this.persistEngineState();
		if (this.online) {
			void this.processQueue();
		}
	}

	async resolveConflict(
		conflictId: string,
		resolution: SyncConflictResolution,
		mergedContent?: string,
	): Promise<boolean> {
		const conflict = this.engine.conflicts.find((entry) => entry.id === conflictId);
		if (!conflict) return false;
		const resolved = resolveConflictNote(conflict, resolution, mergedContent);
		await this.applyLocalWinner(conflict.noteId, resolved);
		this.applyRemoteSnapshot(conflict.noteId, resolved);
		const conflicts = this.engine.conflicts.filter((entry) => entry.id !== conflictId);
		this.setEngine({
			...this.engine,
			conflicts,
			lastSyncAt: nowISO(),
			lastSyncError: null,
		});
		await this.persistEngineState();
		void this.processQueue();
		return true;
	}

	async resolveAllWithLatest(): Promise<void> {
		const pendingIds = this.engine.conflicts.map((entry) => entry.id);
		for (const conflictId of pendingIds) {
			await this.resolveConflict(conflictId, 'use_latest');
		}
	}

	private async ensureRemoteSeedIfEmpty(): Promise<void> {
		if (!this.storage) return;
		const hasRemoteNotes = Object.keys(this.engine.remoteNotes).length > 0;
		if (hasRemoteNotes || this.engine.queue.length > 0 || this.engine.conflicts.length > 0) return;
		const notes = await this.storage.getAllNotes({ includeDeleted: true });
		const remoteNotes: Record<string, Note> = {};
		for (const note of notes) {
			remoteNotes[String(note.id)] = deepCopy(note);
		}
		this.setEngine({
			...this.engine,
			remoteNotes,
		});
	}

	private installConnectivityListeners(): void {
		if (typeof window === 'undefined') {
			this.online = true;
			return;
		}
		if (this.connectivityTeardown) {
			return;
		}

		const onConnectivityChange = (): void => {
			void this.refreshConnectivity();
		};
		window.addEventListener('online', onConnectivityChange);
		window.addEventListener('offline', onConnectivityChange);
		this.pingTimer = setInterval(() => {
			void this.refreshConnectivity();
		}, CONNECTIVITY_PING_INTERVAL_MS);

		this.connectivityTeardown = () => {
			window.removeEventListener('online', onConnectivityChange);
			window.removeEventListener('offline', onConnectivityChange);
		};
	}

	private async refreshConnectivity(): Promise<void> {
		if (typeof navigator === 'undefined') {
			this.online = true;
			return;
		}

		if (!navigator.onLine) {
			this.online = false;
			return;
		}

		const pingHealthy = await this.pingConnectivity();
		this.online = navigator.onLine && pingHealthy;
		if (this.online) {
			void this.processQueue();
		}
	}

	private async pingConnectivity(): Promise<boolean> {
		if (typeof window === 'undefined' || typeof fetch === 'undefined') {
			return true;
		}

		if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
			return true;
		}

		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
			const response = await fetch(`/app-icon.svg?sync_ping=${Date.now()}`, {
				method: 'HEAD',
				cache: 'no-store',
				signal: controller.signal,
			});
			clearTimeout(timer);
			return response.ok;
		} catch {
			return false;
		}
	}

	private async processQueue(): Promise<void> {
		if (!this.storage || this.syncing || !this.online) {
			return;
		}
		this.syncing = true;
		let nextQueue: SyncEngineState['queue'] = [];
		let nextConflicts = [...this.engine.conflicts];
		const remoteNotes = { ...this.engine.remoteNotes };
		let hadError = false;

		for (const entry of this.engine.queue) {
			try {
				if (entry.entityType === 'note') {
					const remote = remoteNotes[entry.entityId] ?? null;
					const reason = detectNoteConflictReason({
						ancestor: entry.ancestorNote,
						local: entry.localNote,
						remote,
					});
					if (reason) {
						if (this.conflictStrategy === 'use_latest') {
							const winner = chooseLatestNote(entry.localNote, remote);
							await this.applyLocalWinner(entry.entityId, winner);
							if (winner) {
								remoteNotes[entry.entityId] = deepCopy(winner);
							} else {
								delete remoteNotes[entry.entityId];
							}
						} else {
							nextConflicts = [
								...nextConflicts,
								{
									id: createEngineEntryId('sync-conflict'),
									queueEntryId: entry.id,
									noteId: entry.entityId,
									title: noteTitleFromSnapshots(entry.localNote, remote),
									detectedAt: nowISO(),
									reason,
									ancestorNote: entry.ancestorNote ? deepCopy(entry.ancestorNote) : null,
									localNote: entry.localNote ? deepCopy(entry.localNote) : null,
									remoteNote: remote ? deepCopy(remote) : null,
								},
							];
						}
						continue;
					}
					if (entry.localNote) {
						remoteNotes[entry.entityId] = deepCopy(entry.localNote);
					} else {
						delete remoteNotes[entry.entityId];
					}
					continue;
				}
				// Non-note changes are treated as metadata sync events.
			} catch (error) {
				hadError = true;
				nextQueue = [
					...nextQueue,
					{
						...entry,
						attempts: entry.attempts + 1,
						lastError: error instanceof Error ? error.message : String(error),
						updatedAt: nowISO(),
					},
				];
			}
		}

		const nextState: SyncEngineState = {
			...this.engine,
			queue: nextQueue,
			conflicts: nextConflicts,
			remoteNotes,
			lastSyncAt: nowISO(),
			lastSyncError: hadError ? 'One or more sync operations failed.' : null,
		};
		this.setEngine(nextState);
		await this.persistEngineState();
		this.syncing = false;

		if (hadError) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SYNC_REPLAY_FAILED',
				error: nextState.lastSyncError ?? 'SYNC_REPLAY_FAILED',
				context: {
					queueDepth: nextState.queue.length,
					conflictCount: nextState.conflicts.length,
				},
			});
			return;
		}

		void markSubsystemSuccess('vault_sync');
	}

	private applyRemoteSnapshot(noteId: string, note: Note | null): void {
		const remoteNotes = { ...this.engine.remoteNotes };
		if (note) {
			remoteNotes[noteId] = deepCopy(note);
		} else {
			delete remoteNotes[noteId];
		}
		this.setEngine({
			...this.engine,
			remoteNotes,
		});
	}

	private async applyLocalWinner(noteId: string, note: Note | null): Promise<void> {
		if (!this.storage) return;
		if (!note) {
			const existing = await this.storage.getNote(createNoteId(noteId));
			if (existing) {
				await this.storage.deleteNote(existing.id, true);
			}
			return;
		}
		await this.storage.saveNote(note);
	}

	private async persistConflictStrategy(): Promise<void> {
		if (!this.storage) return;
		try {
			await this.storage.setSetting('syncConflictStrategy', this.conflictStrategy);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SYNC_STRATEGY_PERSIST_FAILED',
				error,
			});
		}
	}

	private async persistEngineState(): Promise<void> {
		if (!this.storage) return;
		const snapshot = deepCopy(this.engine);
		this.stateWriteQueue = this.stateWriteQueue.then(async () => {
			try {
				await this.storage?.setSetting('syncEngineState', snapshot);
			} catch (error) {
				void reportRuntimeError({
					category: 'storage',
					code: 'SYNC_ENGINE_STATE_PERSIST_FAILED',
					error,
				});
			}
		});
		await this.stateWriteQueue;
	}
}

export const syncState = new SyncState();
