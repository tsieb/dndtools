import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { DndToolsDB } from './database.js';
import { IndexedDBAdapter } from './indexeddb-adapter.js';
import { createNewNote } from '$lib/utils/note-factory.js';
import { createNoteId, createFolderId, type NoteId } from '$lib/types/note.js';

describe('IndexedDBAdapter', () => {
	let adapter: IndexedDBAdapter;
	let testDb: DndToolsDB;

	beforeEach(async () => {
		testDb = new DndToolsDB();
		adapter = new IndexedDBAdapter(testDb);
		await adapter.initialize();
	});

	afterEach(async () => {
		adapter.close();
		await Dexie.delete('dndtools');
	});

	describe('Note CRUD', () => {
		it('saves and retrieves a note', async () => {
			const note = createNewNote({ title: 'Test Note', content: '# Hello' });
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.title).toBe('Test Note');
			expect(retrieved!.content).toBe('# Hello');
		});

		it('returns null for non-existent note', async () => {
			const result = await adapter.getNote(createNoteId('nonexistent'));
			expect(result).toBeNull();
		});

		it('updates an existing note', async () => {
			const note = createNewNote({ title: 'Original' });
			await adapter.saveNote(note);

			note.title = 'Updated';
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.title).toBe('Updated');
		});

		it('lists all active notes', async () => {
			await adapter.saveNote(createNewNote({ title: 'Note 1' }));
			await adapter.saveNote(createNewNote({ title: 'Note 2' }));

			const notes = await adapter.getAllNotes();
			expect(notes).toHaveLength(2);
		});

		it('excludes deleted notes by default', async () => {
			const note = createNewNote({ title: 'To Delete' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);

			const notes = await adapter.getAllNotes();
			expect(notes).toHaveLength(0);
		});

		it('includes deleted notes when requested', async () => {
			const note = createNewNote({ title: 'To Delete' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);

			const notes = await adapter.getAllNotes({ includeDeleted: true });
			expect(notes).toHaveLength(1);
			expect(notes[0]!.deleted).toBe(true);
		});
	});

	describe('Soft delete and restore', () => {
		it('soft deletes a note', async () => {
			const note = createNewNote({ title: 'Delete Me' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.deleted).toBe(true);
			expect(retrieved!.deletedAt).not.toBeNull();
		});

		it('restores a deleted note', async () => {
			const note = createNewNote({ title: 'Restore Me' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);
			await adapter.restoreNote(note.id);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.deleted).toBe(false);
			expect(retrieved!.deletedAt).toBeNull();
		});

		it('permanently deletes a note', async () => {
			const note = createNewNote({ title: 'Gone Forever' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id, true);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).toBeNull();
		});

		it('lists deleted notes', async () => {
			const note = createNewNote({ title: 'In Trash' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);

			const deleted = await adapter.getDeletedNotes();
			expect(deleted).toHaveLength(1);
			expect(deleted[0]!.title).toBe('In Trash');
		});
	});

	describe('Queries', () => {
		it('gets notes by folder', async () => {
			const folder = createFolderId('/campaign/npcs');
			await adapter.saveNote(createNewNote({ title: 'NPC 1', folder }));
			await adapter.saveNote(createNewNote({ title: 'NPC 2', folder }));
			await adapter.saveNote(createNewNote({ title: 'Other' }));

			const notes = await adapter.getNotesByFolder(folder);
			expect(notes).toHaveLength(2);
		});

		it('gets notes by tag', async () => {
			await adapter.saveNote(createNewNote({ title: 'Tagged', tags: ['npc', 'waterdeep'] }));
			await adapter.saveNote(createNewNote({ title: 'Also Tagged', tags: ['npc'] }));
			await adapter.saveNote(createNewNote({ title: 'Not Tagged', tags: ['location'] }));

			const notes = await adapter.getNotesByTag('npc');
			expect(notes).toHaveLength(2);
		});

		it('gets recent notes in order', async () => {
			const note1 = createNewNote({ title: 'Older' });
			note1.updatedAt = '2025-01-01T00:00:00.000Z';
			await adapter.saveNote(note1);

			const note2 = createNewNote({ title: 'Newer' });
			note2.updatedAt = '2025-06-01T00:00:00.000Z';
			await adapter.saveNote(note2);

			const recent = await adapter.getRecentNotes(1);
			expect(recent).toHaveLength(1);
			expect(recent[0]!.title).toBe('Newer');
		});

		it('resolves note by title (case-insensitive)', async () => {
			await adapter.saveNote(createNewNote({ title: 'Elminster the Sage' }));

			const result = await adapter.resolveTitle('elminster the sage');
			expect(result).not.toBeNull();
			expect(result!.title).toBe('Elminster the Sage');
		});

		it('returns null for unresolved title', async () => {
			const result = await adapter.resolveTitle('nonexistent');
			expect(result).toBeNull();
		});
	});

	describe('Links', () => {
		it('stores and retrieves links from a note', async () => {
			const sourceId = createNoteId('source');
			const targetId = createNoteId('target');

			await adapter.setLinksFrom(sourceId, [
				{ sourceId, targetId, displayText: 'Target Note', position: 10 },
			]);

			const links = await adapter.getLinksFrom(sourceId);
			expect(links).toHaveLength(1);
			expect(links[0]!.targetId).toBe(targetId);
		});

		it('retrieves backlinks to a note', async () => {
			const sourceId = createNoteId('source');
			const targetId = createNoteId('target');

			await adapter.setLinksFrom(sourceId, [
				{ sourceId, targetId, displayText: 'Target', position: 0 },
			]);

			const backlinks = await adapter.getLinksTo(targetId);
			expect(backlinks).toHaveLength(1);
			expect(backlinks[0]!.sourceId).toBe(sourceId);
		});

		it('replaces links on update', async () => {
			const sourceId = createNoteId('source');
			const target1 = createNoteId('target1');
			const target2 = createNoteId('target2');

			await adapter.setLinksFrom(sourceId, [
				{ sourceId, targetId: target1, displayText: 'T1', position: 0 },
			]);

			await adapter.setLinksFrom(sourceId, [
				{ sourceId, targetId: target2, displayText: 'T2', position: 0 },
			]);

			const links = await adapter.getLinksFrom(sourceId);
			expect(links).toHaveLength(1);
			expect(links[0]!.targetId).toBe(target2);
		});
	});

	describe('Settings', () => {
		it('returns default for unset setting', async () => {
			const theme = await adapter.getSetting('theme');
			expect(theme).toBe('system');
		});

		it('saves and retrieves a setting', async () => {
			await adapter.setSetting('theme', 'dark');
			const theme = await adapter.getSetting('theme');
			expect(theme).toBe('dark');
		});
	});

	describe('Stats', () => {
		it('counts active notes', async () => {
			await adapter.saveNote(createNewNote({ title: 'A' }));
			await adapter.saveNote(createNewNote({ title: 'B' }));
			const deleted = createNewNote({ title: 'C' });
			await adapter.saveNote(deleted);
			await adapter.deleteNote(deleted.id);

			const count = await adapter.getNoteCount();
			expect(count).toBe(2);
		});

		it('aggregates tag counts', async () => {
			await adapter.saveNote(createNewNote({ tags: ['npc', 'waterdeep'] }));
			await adapter.saveNote(createNewNote({ tags: ['npc', 'location'] }));

			const tags = await adapter.getTagCounts();
			const npcTag = tags.find((t) => t.name === 'npc');
			expect(npcTag!.count).toBe(2);
		});
	});

	describe('Import/Export', () => {
		it('imports notes', async () => {
			const notes = [createNewNote({ title: 'Import 1' }), createNewNote({ title: 'Import 2' })];

			const result = await adapter.importNotes(notes);
			expect(result.imported).toBe(2);
			expect(result.skipped).toBe(0);
		});

		it('skips duplicate imports', async () => {
			const note = createNewNote({ title: 'Existing' });
			await adapter.saveNote(note);

			const result = await adapter.importNotes([note]);
			expect(result.imported).toBe(0);
			expect(result.skipped).toBe(1);
		});

		it('exports all active notes', async () => {
			await adapter.saveNote(createNewNote({ title: 'Active' }));
			const deleted = createNewNote({ title: 'Deleted' });
			await adapter.saveNote(deleted);
			await adapter.deleteNote(deleted.id);

			const exported = await adapter.exportAllNotes();
			expect(exported).toHaveLength(1);
			expect(exported[0]!.title).toBe('Active');
		});
	});
});
