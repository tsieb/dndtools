import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import {
	chooseLatestNote,
	detectNoteConflictReason,
	normalizeSyncConflictStrategy,
	normalizeSyncEngineState,
	resolveConflictNote,
	notesEqual,
} from './sync.js';
import type { SyncConflictRecord } from '$lib/types/sync.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-sync'),
		title: 'Sync Note',
		content: 'Original',
		folder: createFolderId('/'),
		tags: ['sync'],
		frontmatter: {},
		visibility: 'dm_only',
		createdAt: '2026-03-01T00:00:00.000Z',
		updatedAt: '2026-03-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function makeConflict(overrides: Partial<SyncConflictRecord> = {}): SyncConflictRecord {
	return {
		id: 'conflict-1',
		queueEntryId: 'queue-1',
		noteId: 'note-sync',
		title: 'Sync Note',
		detectedAt: '2026-03-02T00:00:00.000Z',
		reason: 'remote_updated_since_ancestor',
		ancestorNote: makeNote(),
		localNote: makeNote({
			content: 'Local edit',
			updatedAt: '2026-03-02T00:00:00.000Z',
		}),
		remoteNote: makeNote({
			content: 'Remote edit',
			updatedAt: '2026-03-03T00:00:00.000Z',
		}),
		...overrides,
	};
}

describe('sync domain', () => {
	it('normalizes unknown conflict strategy to manual', () => {
		expect(normalizeSyncConflictStrategy('manual')).toBe('manual');
		expect(normalizeSyncConflictStrategy('use_latest')).toBe('use_latest');
		expect(normalizeSyncConflictStrategy('anything-else')).toBe('manual');
	});

	it('detects conflict when remote changed since ancestor', () => {
		const ancestor = makeNote();
		const local = makeNote({
			content: 'Local edit',
			updatedAt: '2026-03-02T00:00:00.000Z',
		});
		const remote = makeNote({
			content: 'Remote edit',
			updatedAt: '2026-03-03T00:00:00.000Z',
		});
		expect(detectNoteConflictReason({ ancestor, local, remote })).toBe(
			'remote_updated_since_ancestor',
		);
	});

	it('does not report conflict when remote is unchanged', () => {
		const ancestor = makeNote();
		const local = makeNote({
			content: 'Local edit',
			updatedAt: '2026-03-02T00:00:00.000Z',
		});
		const remote = makeNote();
		expect(detectNoteConflictReason({ ancestor, local, remote })).toBeNull();
	});

	it('uses newer updatedAt for use_latest resolution', () => {
		const conflict = makeConflict();
		const latest = resolveConflictNote(conflict, 'use_latest');
		expect(latest?.content).toBe('Remote edit');
		expect(latest?.updatedAt).toBe('2026-03-03T00:00:00.000Z');
	});

	it('applies merged content and clears deleted markers', () => {
		const conflict = makeConflict({
			localNote: makeNote({
				content: 'Local deleted body',
				deleted: true,
				deletedAt: '2026-03-03T00:00:00.000Z',
			}),
		});
		const merged = resolveConflictNote(conflict, 'use_merged', 'Merged body');
		expect(merged?.content).toBe('Merged body');
		expect(merged?.deleted).toBe(false);
		expect(merged?.deletedAt).toBeNull();
	});

	it('normalizes invalid engine state payload to defaults', () => {
		const normalized = normalizeSyncEngineState({
			queue: [{ bad: 'shape' }],
			conflicts: [{ bad: 'shape' }],
			remoteNotes: { a: { bad: 'shape' } },
			lastSyncAt: 123,
			lastSyncError: false,
		});
		expect(normalized.queue).toEqual([]);
		expect(normalized.conflicts).toEqual([]);
		expect(normalized.remoteNotes).toEqual({});
		expect(normalized.lastSyncAt).toBeNull();
		expect(normalized.lastSyncError).toBeNull();
	});

	it('compares equivalent notes deterministically', () => {
		const first = makeNote();
		const second = makeNote();
		expect(notesEqual(first, second)).toBe(true);
		expect(notesEqual(first, makeNote({ content: 'Changed' }))).toBe(false);
		expect(chooseLatestNote(first, second)?.content).toBe('Original');
	});
});
