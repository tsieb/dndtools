// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileSystemAdapter } from './storage.js';
import { createNoteId, createFolderId } from '../src/lib/types/note.js';
import { nowISO } from '../src/lib/utils/date.js';
import { generateNoteId } from '../src/lib/utils/id.js';
import type { Note } from '../src/lib/types/note.js';

function testNote(overrides: Partial<Note> = {}): Note {
	const now = nowISO();
	return {
		id: generateNoteId(),
		title: 'Test Note',
		content: 'Hello world',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		...overrides,
	};
}

describe('FileSystemAdapter', () => {
	let tmpDir: string;
	let adapter: FileSystemAdapter;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-test-'));
		adapter = new FileSystemAdapter(tmpDir);
		await adapter.initialize();
	});

	afterEach(async () => {
		await adapter.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	describe('lifecycle', () => {
		it('creates vault directory and .vault on initialize', async () => {
			const stat = await fs.stat(path.join(tmpDir, '.vault'));
			expect(stat.isDirectory()).toBe(true);
		});

		it('creates index.json on initialize', async () => {
			const indexPath = path.join(tmpDir, '.vault', 'index.json');
			const stat = await fs.stat(indexPath);
			expect(stat.isFile()).toBe(true);
		});
	});

	describe('note CRUD', () => {
		it('saves and retrieves a note', async () => {
			const note = testNote({ title: 'My First Note' });
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.title).toBe('My First Note');
			expect(retrieved!.content).toBe('Hello world');
		});

		it('creates a markdown file on disk', async () => {
			const note = testNote({ title: 'Disk File' });
			await adapter.saveNote(note);

			const files = await fs.readdir(tmpDir);
			const mdFiles = files.filter((f) => f.endsWith('.md'));
			expect(mdFiles.length).toBe(1);
			expect(mdFiles[0]).toBe('disk-file.md');
		});

		it('saves notes in subdirectories for folders', async () => {
			const note = testNote({
				title: 'Barthen',
				folder: createFolderId('/campaign/npcs'),
			});
			await adapter.saveNote(note);

			const filePath = path.join(tmpDir, 'campaign', 'npcs', 'barthen.md');
			const stat = await fs.stat(filePath);
			expect(stat.isFile()).toBe(true);
		});

		it('updates an existing note', async () => {
			const note = testNote({ title: 'Original' });
			await adapter.saveNote(note);

			const updated: Note = { ...note, content: 'Updated content', updatedAt: nowISO() };
			await adapter.saveNote(updated);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.content).toBe('Updated content');
		});

		it('soft-deletes a note', async () => {
			const note = testNote();
			await adapter.saveNote(note);

			await adapter.deleteNote(note.id);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.deleted).toBe(true);
			expect(retrieved!.deletedAt).toBeTruthy();
		});

		it('permanently deletes a note', async () => {
			const note = testNote({ title: 'To Delete' });
			await adapter.saveNote(note);

			await adapter.deleteNote(note.id, true);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).toBeNull();

			// File should be gone
			const files = await fs.readdir(tmpDir);
			const mdFiles = files.filter((f) => f.endsWith('.md'));
			expect(mdFiles.length).toBe(0);
		});

		it('restores a soft-deleted note', async () => {
			const note = testNote();
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);
			await adapter.restoreNote(note.id);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved!.deleted).toBe(false);
			expect(retrieved!.deletedAt).toBeNull();
		});
	});

	describe('queries', () => {
		it('gets all active notes (excludes deleted)', async () => {
			const note1 = testNote({ title: 'Active' });
			const note2 = testNote({ title: 'Deleted' });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);
			await adapter.deleteNote(note2.id);

			const notes = await adapter.getAllNotes();
			expect(notes.length).toBe(1);
			expect(notes[0]!.title).toBe('Active');
		});

		it('gets notes by folder', async () => {
			const note1 = testNote({ title: 'Root Note', folder: createFolderId('/') });
			const note2 = testNote({ title: 'NPC Note', folder: createFolderId('/npcs') });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);

			const npcNotes = await adapter.getNotesByFolder(createFolderId('/npcs'));
			expect(npcNotes.length).toBe(1);
			expect(npcNotes[0]!.title).toBe('NPC Note');
		});

		it('gets notes by tag', async () => {
			const note1 = testNote({ title: 'Tagged', tags: ['npc', 'phandalin'] });
			const note2 = testNote({ title: 'Untagged', tags: [] });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);

			const tagged = await adapter.getNotesByTag('npc');
			expect(tagged.length).toBe(1);
			expect(tagged[0]!.title).toBe('Tagged');
		});

		it('gets recent notes sorted by updatedAt', async () => {
			const note1 = testNote({ title: 'Older', updatedAt: '2025-01-01T00:00:00Z' });
			const note2 = testNote({ title: 'Newer', updatedAt: '2025-06-01T00:00:00Z' });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);

			const recent = await adapter.getRecentNotes(10);
			expect(recent[0]!.title).toBe('Newer');
			expect(recent[1]!.title).toBe('Older');
		});

		it('resolves a note by title (case-insensitive)', async () => {
			const note = testNote({ title: "Barthen's Provisions" });
			await adapter.saveNote(note);

			const resolved = await adapter.resolveTitle("barthen's provisions");
			expect(resolved).not.toBeNull();
			expect(resolved!.id).toBe(note.id);
		});

		it('returns null for unresolved title', async () => {
			const resolved = await adapter.resolveTitle('Nonexistent Note');
			expect(resolved).toBeNull();
		});
	});

	describe('links', () => {
		it('stores and retrieves forward links', async () => {
			const source = testNote({ title: 'Source' });
			const target = testNote({ title: 'Target' });
			await adapter.saveNote(source);
			await adapter.saveNote(target);

			await adapter.setLinksFrom(source.id, [
				{
					sourceId: source.id,
					targetId: target.id,
					displayText: 'Target',
					position: 10,
				},
			]);

			const links = await adapter.getLinksFrom(source.id);
			expect(links.length).toBe(1);
			expect(links[0]!.targetId).toBe(target.id);
		});

		it('retrieves backlinks', async () => {
			const source = testNote({ title: 'Source' });
			const target = testNote({ title: 'Target' });
			await adapter.saveNote(source);
			await adapter.saveNote(target);

			await adapter.setLinksFrom(source.id, [
				{
					sourceId: source.id,
					targetId: target.id,
					displayText: 'Target',
					position: 10,
				},
			]);

			const backlinks = await adapter.getLinksTo(target.id);
			expect(backlinks.length).toBe(1);
			expect(backlinks[0]!.sourceId).toBe(source.id);
		});
	});

	describe('settings', () => {
		it('returns default for missing settings', async () => {
			const theme = await adapter.getSetting('theme');
			expect(theme).toBe('system');
		});

		it('saves and retrieves settings', async () => {
			await adapter.setSetting('theme', 'dark');
			const theme = await adapter.getSetting('theme');
			expect(theme).toBe('dark');
		});
	});

	describe('stats', () => {
		it('counts active notes', async () => {
			const note1 = testNote({ title: 'One' });
			const note2 = testNote({ title: 'Two' });
			const note3 = testNote({ title: 'Deleted' });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);
			await adapter.saveNote(note3);
			await adapter.deleteNote(note3.id);

			const count = await adapter.getNoteCount();
			expect(count).toBe(2);
		});

		it('counts tags across notes', async () => {
			const note1 = testNote({ title: 'One', tags: ['npc', 'phandalin'] });
			const note2 = testNote({ title: 'Two', tags: ['npc', 'location'] });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);

			const tags = await adapter.getTagCounts();
			const npcTag = tags.find((t) => t.name === 'npc');
			expect(npcTag?.count).toBe(2);
		});
	});

	describe('search', () => {
		it('finds notes by title match', async () => {
			const note = testNote({ title: "Barthen's Provisions", content: 'A general store.' });
			await adapter.saveNote(note);

			const results = await adapter.searchNotes('barthen');
			expect(results.length).toBe(1);
			expect(results[0]!.note.title).toBe("Barthen's Provisions");
		});

		it('finds notes by content match', async () => {
			const note = testNote({ title: 'Some Note', content: 'The dragon attacked the village.' });
			await adapter.saveNote(note);

			const results = await adapter.searchNotes('dragon');
			expect(results.length).toBe(1);
		});

		it('returns empty for no matches', async () => {
			const note = testNote({ title: 'Hello', content: 'World' });
			await adapter.saveNote(note);

			const results = await adapter.searchNotes('nonexistent');
			expect(results.length).toBe(0);
		});
	});

	describe('import/export', () => {
		it('exports all notes including deleted', async () => {
			const note1 = testNote({ title: 'Active' });
			const note2 = testNote({ title: 'Deleted' });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);
			await adapter.deleteNote(note2.id);

			const exported = await adapter.exportAllNotes();
			expect(exported.length).toBe(2);
		});

		it('imports notes and skips duplicates', async () => {
			const note1 = testNote({ title: 'Existing' });
			await adapter.saveNote(note1);

			const note2 = testNote({ title: 'New Note' });
			const result = await adapter.importNotes([note1, note2]);

			expect(result.imported).toBe(1);
			expect(result.skipped).toBe(1);
			expect(result.errors.length).toBe(0);
		});
	});

	describe('index rebuild', () => {
		it('rebuilds index from files on disk', async () => {
			const note = testNote({ title: 'Persisted' });
			await adapter.saveNote(note);
			await adapter.close();

			// Delete the index to force rebuild
			const indexPath = path.join(tmpDir, '.vault', 'index.json');
			await fs.writeFile(indexPath, JSON.stringify({ version: 1, notes: {}, links: {} }));

			// Reinitialize
			const newAdapter = new FileSystemAdapter(tmpDir);
			await newAdapter.initialize();

			const retrieved = await newAdapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.title).toBe('Persisted');

			await newAdapter.close();
		});
	});
});
