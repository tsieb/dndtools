import { nowISO } from '$lib/utils/date.js';
import type { Note } from '$lib/types/note.js';
import {
	SYNC_ENGINE_STATE_VERSION,
	createDefaultSyncEngineState,
	type SyncConflictReason,
	type SyncConflictRecord,
	type SyncConflictResolution,
	type SyncConflictStrategy,
	type SyncEngineState,
	type SyncQueueEntry,
} from '$lib/types/sync.js';

function deepCopy<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeOptionalText(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function normalizeNote(value: unknown): Note | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== 'string') return null;
	if (typeof value.title !== 'string') return null;
	if (typeof value.content !== 'string') return null;
	if (typeof value.folder !== 'string') return null;
	if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== 'string')) return null;
	if (!isRecord(value.frontmatter)) return null;
	if (typeof value.visibility !== 'string') return null;
	if (typeof value.createdAt !== 'string') return null;
	if (typeof value.updatedAt !== 'string') return null;
	if (typeof value.deleted !== 'boolean') return null;
	if (value.deletedAt !== null && typeof value.deletedAt !== 'string') return null;
	if (typeof value.pinned !== 'boolean') return null;
	if (value.pinnedAt !== null && typeof value.pinnedAt !== 'string') return null;
	const filePath = value.filePath;
	if (filePath !== undefined && typeof filePath !== 'string') return null;
	return deepCopy(value as unknown as Note);
}

function normalizeQueueEntry(value: unknown): SyncQueueEntry | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== 'string') return null;
	if (typeof value.createdAt !== 'string') return null;
	if (typeof value.updatedAt !== 'string') return null;
	if (typeof value.entityType !== 'string') return null;
	if (typeof value.operation !== 'string') return null;
	if (typeof value.entityId !== 'string') return null;
	if (typeof value.attempts !== 'number' || !Number.isFinite(value.attempts)) return null;
	const ancestorNote = normalizeNote(value.ancestorNote);
	const localNote = normalizeNote(value.localNote);
	if (value.ancestorNote !== null && ancestorNote === null) return null;
	if (value.localNote !== null && localNote === null) return null;
	return {
		id: value.id,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		entityType: value.entityType as SyncQueueEntry['entityType'],
		operation: value.operation as SyncQueueEntry['operation'],
		entityId: value.entityId,
		ancestorNote,
		localNote,
		attempts: Math.max(0, Math.trunc(value.attempts)),
		lastError: normalizeOptionalText(value.lastError),
	};
}

function normalizeConflict(value: unknown): SyncConflictRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== 'string') return null;
	if (typeof value.queueEntryId !== 'string') return null;
	if (typeof value.noteId !== 'string') return null;
	if (typeof value.title !== 'string') return null;
	if (typeof value.detectedAt !== 'string') return null;
	if (typeof value.reason !== 'string') return null;
	const ancestorNote = normalizeNote(value.ancestorNote);
	const localNote = normalizeNote(value.localNote);
	const remoteNote = normalizeNote(value.remoteNote);
	if (value.ancestorNote !== null && ancestorNote === null) return null;
	if (value.localNote !== null && localNote === null) return null;
	if (value.remoteNote !== null && remoteNote === null) return null;
	return {
		id: value.id,
		queueEntryId: value.queueEntryId,
		noteId: value.noteId,
		title: value.title,
		detectedAt: value.detectedAt,
		reason: value.reason as SyncConflictRecord['reason'],
		ancestorNote,
		localNote,
		remoteNote,
	};
}

function normalizeRemoteNotes(value: unknown): Record<string, Note> {
	if (!isRecord(value)) return {};
	const notes: Record<string, Note> = {};
	for (const [noteId, entry] of Object.entries(value)) {
		const normalized = normalizeNote(entry);
		if (normalized) {
			notes[noteId] = normalized;
		}
	}
	return notes;
}

export function normalizeSyncConflictStrategy(value: unknown): SyncConflictStrategy {
	return value === 'use_latest' ? 'use_latest' : 'manual';
}

export function normalizeSyncEngineState(value: unknown): SyncEngineState {
	const fallback = createDefaultSyncEngineState();
	if (!isRecord(value)) {
		return fallback;
	}

	const queueRaw = Array.isArray(value.queue) ? value.queue : [];
	const conflictsRaw = Array.isArray(value.conflicts) ? value.conflicts : [];

	const queue = queueRaw
		.map(normalizeQueueEntry)
		.filter((entry): entry is SyncQueueEntry => !!entry);
	const conflicts = conflictsRaw
		.map(normalizeConflict)
		.filter((entry): entry is SyncConflictRecord => !!entry);

	return {
		version:
			typeof value.version === 'number' && value.version >= 1
				? Math.trunc(value.version)
				: SYNC_ENGINE_STATE_VERSION,
		queue,
		conflicts,
		remoteNotes: normalizeRemoteNotes(value.remoteNotes),
		lastSyncAt: normalizeOptionalText(value.lastSyncAt),
		lastSyncError: normalizeOptionalText(value.lastSyncError),
	};
}

export function notesEqual(left: Note | null, right: Note | null): boolean {
	if (!left && !right) return true;
	if (!left || !right) return false;
	return (
		String(left.id) === String(right.id) &&
		left.title === right.title &&
		left.content === right.content &&
		String(left.folder) === String(right.folder) &&
		left.filePath === right.filePath &&
		left.updatedAt === right.updatedAt &&
		left.createdAt === right.createdAt &&
		left.deleted === right.deleted &&
		left.deletedAt === right.deletedAt &&
		left.pinned === right.pinned &&
		left.pinnedAt === right.pinnedAt &&
		left.visibility === right.visibility &&
		JSON.stringify(left.tags) === JSON.stringify(right.tags) &&
		JSON.stringify(left.frontmatter) === JSON.stringify(right.frontmatter)
	);
}

export function detectNoteConflictReason(input: {
	ancestor: Note | null;
	local: Note | null;
	remote: Note | null;
}): SyncConflictReason | null {
	const { ancestor, local, remote } = input;

	if (!ancestor) {
		if (local && remote && !notesEqual(local, remote)) {
			return 'remote_created_during_local_create';
		}
		return null;
	}

	const remoteChanged = !notesEqual(remote, ancestor);
	const localChanged = !notesEqual(local, ancestor);
	if (!remoteChanged || !localChanged) {
		return null;
	}
	if (!remote) {
		return 'remote_deleted_since_ancestor';
	}
	return 'remote_updated_since_ancestor';
}

export function upsertNoteQueueEntry(
	queue: SyncQueueEntry[],
	entry: Omit<SyncQueueEntry, 'updatedAt'>,
): SyncQueueEntry[] {
	const next = [...queue];
	const index = next.findIndex(
		(candidate) => candidate.entityType === 'note' && candidate.entityId === entry.entityId,
	);
	if (index < 0) {
		next.push({
			...deepCopy(entry),
			updatedAt: entry.createdAt,
		});
		return next;
	}
	const existing = next[index];
	if (!existing) return next;
	next[index] = {
		...deepCopy(entry),
		createdAt: existing.createdAt,
		ancestorNote: existing.ancestorNote,
		updatedAt: nowISO(),
	};
	return next;
}

export function chooseLatestNote(local: Note | null, remote: Note | null): Note | null {
	if (!local && !remote) return null;
	if (!local) return deepCopy(remote);
	if (!remote) return deepCopy(local);
	return remote.updatedAt > local.updatedAt ? deepCopy(remote) : deepCopy(local);
}

export function resolveConflictNote(
	conflict: SyncConflictRecord,
	resolution: SyncConflictResolution,
	mergedContent?: string,
): Note | null {
	const local = conflict.localNote;
	const remote = conflict.remoteNote;
	const ancestor = conflict.ancestorNote;

	if (resolution === 'use_local') return deepCopy(local);
	if (resolution === 'use_remote') return deepCopy(remote);
	if (resolution === 'use_latest') return chooseLatestNote(local, remote);

	const base = deepCopy(local ?? remote ?? ancestor);
	if (!base) return null;
	base.content = mergedContent ?? base.content;
	base.updatedAt = nowISO();
	base.deleted = false;
	base.deletedAt = null;
	return base;
}
