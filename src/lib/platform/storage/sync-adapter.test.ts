import { describe, expect, it, vi } from 'vitest';
import { SyncAwareStorageAdapter } from './sync-adapter.js';
import type { StorageAdapter } from '$lib/types/storage.js';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-sync-adapter'),
		title: 'Sync Adapter Note',
		content: 'Body',
		folder: createFolderId('/'),
		tags: [],
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

function makeBaseAdapter(note: Note): StorageAdapter {
	return {
		initialize: vi.fn(async () => undefined),
		close: vi.fn(async () => undefined),
		getNote: vi.fn(async () => note),
		getAllNotes: vi.fn(async () => []),
		saveNote: vi.fn(async () => undefined),
		deleteNote: vi.fn(async () => undefined),
		restoreNote: vi.fn(async () => undefined),
		getNotesByFolder: vi.fn(async () => []),
		getNotesByTag: vi.fn(async () => []),
		getRecentNotes: vi.fn(async () => []),
		getDeletedNotes: vi.fn(async () => []),
		resolveTitle: vi.fn(async () => null),
		getLinksFrom: vi.fn(async () => []),
		getLinksTo: vi.fn(async () => []),
		setLinksFrom: vi.fn(async () => undefined),
		getAllLinks: vi.fn(async () => []),
		getSessionBoards: vi.fn(async () => []),
		getSessionBoard: vi.fn(async () => null),
		saveSessionBoard: vi.fn(async () => undefined),
		deleteSessionBoard: vi.fn(async () => undefined),
		suggestRelatedNotes: vi.fn(async () => []),
		getObject: vi.fn(async () => null),
		getAllObjects: vi.fn(async () => []),
		saveObject: vi.fn(async () => undefined),
		deleteObject: vi.fn(async () => undefined),
		getObjectRelationshipGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
		lintObjects: vi.fn(async () => []),
		getObjectHistory: vi.fn(async () => []),
		revertObjectToHistory: vi.fn(async () => null),
		getSetting: vi.fn(async () => 'system'),
		setSetting: vi.fn(async () => undefined),
		getNoteTemplates: vi.fn(async () => []),
		getReusableSnippets: vi.fn(async () => []),
		createSafetySnapshot: vi.fn(async () => ({
			id: 'snapshot-1',
			createdAt: '2026-03-01T00:00:00.000Z',
			reason: 'manual',
			noteCount: 1,
		})),
		listSafetySnapshots: vi.fn(async () => []),
		restoreDeletedFromSnapshot: vi.fn(async () => ({ restored: 1, skipped: 0 })),
		importNotes: vi.fn(async () => ({ imported: 1, skipped: 0, errors: [] })),
		exportAllNotes: vi.fn(async () => []),
		getNoteCount: vi.fn(async () => 0),
		getTagCounts: vi.fn(async () => []),
	} as unknown as StorageAdapter;
}

describe('SyncAwareStorageAdapter', () => {
	it('tracks note upserts after save', async () => {
		const tracker = {
			recordNoteUpsert: vi.fn(),
			recordNotePermanentDelete: vi.fn(),
			recordOpaqueMutation: vi.fn(),
		};
		const note = makeNote();
		const base = makeBaseAdapter(note);
		const adapter = new SyncAwareStorageAdapter(base, tracker);

		await adapter.saveNote(note);
		await Promise.resolve();

		expect(tracker.recordNoteUpsert).toHaveBeenCalledTimes(1);
		expect(tracker.recordNoteUpsert).toHaveBeenCalledWith(note);
		expect(tracker.recordOpaqueMutation).not.toHaveBeenCalled();
	});

	it('tracks permanent note deletes separately', async () => {
		const tracker = {
			recordNoteUpsert: vi.fn(),
			recordNotePermanentDelete: vi.fn(),
			recordOpaqueMutation: vi.fn(),
		};
		const note = makeNote();
		const base = makeBaseAdapter(note);
		const adapter = new SyncAwareStorageAdapter(base, tracker);

		await adapter.deleteNote(note.id, true);

		expect(tracker.recordNotePermanentDelete).toHaveBeenCalledWith(String(note.id));
		expect(tracker.recordNoteUpsert).not.toHaveBeenCalled();
	});

	it('does not re-queue sync metadata settings writes', async () => {
		const tracker = {
			recordNoteUpsert: vi.fn(),
			recordNotePermanentDelete: vi.fn(),
			recordOpaqueMutation: vi.fn(),
		};
		const note = makeNote();
		const base = makeBaseAdapter(note);
		const adapter = new SyncAwareStorageAdapter(base, tracker);

		await adapter.setSetting('syncConflictStrategy', 'manual');
		await adapter.setSetting('syncEngineState', {
			version: 1,
			queue: [],
			conflicts: [],
			remoteNotes: {},
			lastSyncAt: null,
			lastSyncError: null,
		});

		expect(tracker.recordOpaqueMutation).not.toHaveBeenCalled();
	});

	it('queues non-sync settings updates as opaque mutations', async () => {
		const tracker = {
			recordNoteUpsert: vi.fn(),
			recordNotePermanentDelete: vi.fn(),
			recordOpaqueMutation: vi.fn(),
		};
		const note = makeNote();
		const base = makeBaseAdapter(note);
		const adapter = new SyncAwareStorageAdapter(base, tracker);

		await adapter.setSetting('theme', 'dark');

		expect(tracker.recordOpaqueMutation).toHaveBeenCalledWith({
			operation: 'setting_update',
			entityType: 'setting',
			entityId: 'theme',
		});
	});
});
