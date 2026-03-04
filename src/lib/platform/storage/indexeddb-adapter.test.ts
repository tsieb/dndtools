import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNoteId, type Note } from '$lib/types/note.js';
import { createVaultObjectId, type VaultObject } from '$lib/types/object.js';
import { IndexedDbStorageAdapter } from './indexeddb-adapter.js';

const DB_NAME = 'dndtools-indexeddb-adapter-test';

function note(seed: string, overrides: Partial<Note> = {}): Note {
	const timestamp = `2026-03-04T00:00:0${seed}Z`;
	return {
		id: createNoteId(`note-${seed}`),
		title: `Note ${seed}`,
		content: `# Note ${seed}`,
		folder: '/notes' as Note['folder'],
		tags: [],
		frontmatter: {},
		visibility: 'dm_only',
		createdAt: timestamp,
		updatedAt: timestamp,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function npcObject(name: string): VaultObject {
	return {
		id: createVaultObjectId('obj-npc-1'),
		type: 'npc',
		name,
		summary: `${name} summary`,
		tags: ['npc'],
		visibility: 'dm_only',
		relationships: [],
		createdAt: '2026-03-04T00:00:00Z',
		updatedAt: '2026-03-04T00:00:00Z',
		data: {
			role: 'ally',
			goals: [],
			secrets: [],
		},
	};
}

describe('IndexedDbStorageAdapter', () => {
	beforeEach(async () => {
		await Dexie.delete(DB_NAME);
	});

	afterEach(async () => {
		await Dexie.delete(DB_NAME);
	});

	it('persists notes in IndexedDB across adapter instances', async () => {
		const adapter = new IndexedDbStorageAdapter({ dbName: DB_NAME });
		await adapter.initialize();
		await adapter.saveNote(note('1'));
		await adapter.close();

		const nextAdapter = new IndexedDbStorageAdapter({ dbName: DB_NAME });
		await nextAdapter.initialize();
		const notes = await nextAdapter.getAllNotes();

		expect(notes).toHaveLength(1);
		expect(String(notes[0]?.id)).toBe('note-1');
		await nextAdapter.close();
	});

	it('computes related suggestions from IndexedDB-backed links', async () => {
		const adapter = new IndexedDbStorageAdapter({ dbName: DB_NAME });
		await adapter.initialize();
		const alpha = note('1', { tags: ['quest'] });
		const beta = note('2', { tags: ['quest'] });
		await adapter.saveNote(alpha);
		await adapter.saveNote(beta);
		await adapter.setLinksFrom(alpha.id, [
			{
				sourceId: alpha.id,
				targetId: beta.id,
				displayText: beta.title,
				position: 0,
			},
		]);

		const suggestions = await adapter.suggestRelatedNotes([alpha.id], 5);
		expect(suggestions.length).toBeGreaterThan(0);
		expect(String(suggestions[0]?.noteId)).toBe(String(beta.id));
		await adapter.close();
	});

	it('tracks object history and reverts object revisions', async () => {
		const adapter = new IndexedDbStorageAdapter({ dbName: DB_NAME });
		await adapter.initialize();
		await adapter.saveObject(npcObject('Arannis'));
		await adapter.saveObject(npcObject('Arannis the Bold'));

		const history = await adapter.getObjectHistory(createVaultObjectId('obj-npc-1'));
		expect(history).toHaveLength(1);
		expect(history[0]?.reason).toBe('save');
		expect(history[0]?.object.name).toBe('Arannis');

		const reverted = await adapter.revertObjectToHistory(
			createVaultObjectId('obj-npc-1'),
			history[0]!.id,
		);
		expect(reverted?.name).toBe('Arannis');
		await adapter.close();
	});

	it('restores deleted notes from snapshots', async () => {
		const adapter = new IndexedDbStorageAdapter({ dbName: DB_NAME });
		await adapter.initialize();
		const seed = note('4');
		await adapter.saveNote(seed);
		const snapshot = await adapter.createSafetySnapshot('test');
		await adapter.deleteNote(seed.id);

		const restoreResult = await adapter.restoreDeletedFromSnapshot(snapshot.id);
		const restored = await adapter.getNote(seed.id);

		expect(restoreResult.restored).toBe(1);
		expect(restored?.deleted).toBe(false);
		await adapter.close();
	});
});
