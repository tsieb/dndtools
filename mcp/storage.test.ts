// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileSystemAdapter } from './storage.js';
import { StagedMcpAdapter } from './staged-storage.js';
import { createFolderId, createNoteId } from '../src/lib/types/note.js';
import { createSessionBoardId } from '../src/lib/types/session-board.js';
import { nowISO } from '../src/lib/utils/date.js';
import { generateNoteId } from '../src/lib/utils/id.js';
import type { Note } from '../src/lib/types/note.js';
import type { VaultObject } from '../src/lib/types/object.js';
import { createVaultObjectId } from '../src/lib/types/object.js';

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
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function testObject(overrides: Partial<VaultObject> = {}): VaultObject {
	const now = nowISO();
	return {
		id: createVaultObjectId('obj-test'),
		type: 'character',
		name: 'Test Character',
		summary: 'Human Fighter 3',
		tags: ['npc'],
		data: {
			ancestry: 'Human',
			className: 'Fighter',
			level: 3,
			goals: [],
			bonds: [],
			flaws: [],
		},
		createdAt: now,
		updatedAt: now,
		...overrides,
	} as VaultObject;
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

	describe('metadata integrity', () => {
		it('reports and repairs corrupted metadata files', async () => {
			const indexPath = path.join(tmpDir, '.vault', 'index.json');
			await fs.writeFile(indexPath, '{"broken":', 'utf-8');

			const report = await adapter.getMetadataIntegrityReport();
			expect(report.healthy).toBe(false);
			expect(report.issues.some((issue) => issue.file === 'index.json')).toBe(true);

			const repaired = await adapter.repairMetadataIntegrity();
			expect(repaired.repairApplied).toBe(true);
			expect(repaired.issues.some((issue) => issue.file === 'index.json' && issue.repaired)).toBe(
				true,
			);

			const after = await adapter.getMetadataIntegrityReport();
			expect(after.healthy).toBe(true);
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

		it('preserves custom frontmatter fields', async () => {
			const note = testNote({
				title: 'With Frontmatter',
				frontmatter: {
					arc: 'Cragmaw',
					danger_level: 3,
					dm_notes: { revealAfter: 'Session 4' },
				},
			});
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.frontmatter).toEqual({
				arc: 'Cragmaw',
				danger_level: 3,
				dm_notes: { revealAfter: 'Session 4' },
			});
		});

		it('keeps managed frontmatter keys authoritative', async () => {
			const note = testNote({
				title: 'Canonical Title',
				tags: ['npc'],
				pinned: true,
				pinnedAt: '2026-01-01T00:00:00.000Z',
				frontmatter: {
					title: 'Ignored Override',
					tags: ['wrong'],
					pinned: false,
					session: 7,
				},
			});
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.title).toBe('Canonical Title');
			expect(retrieved!.tags).toEqual(['npc']);
			expect(retrieved!.pinned).toBe(true);
			expect(retrieved!.pinnedAt).toBe('2026-01-01T00:00:00.000Z');
			expect(retrieved!.frontmatter).toEqual({ session: 7 });
		});

		it('persists pin metadata', async () => {
			const note = testNote({
				title: 'Pinned',
				pinned: true,
				pinnedAt: '2026-02-17T12:00:00.000Z',
			});
			await adapter.saveNote(note);

			const retrieved = await adapter.getNote(note.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved!.pinned).toBe(true);
			expect(retrieved!.pinnedAt).toBe('2026-02-17T12:00:00.000Z');
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

	describe('objects', () => {
		it('saves and retrieves an object', async () => {
			const object = testObject();
			await adapter.saveObject(object);

			const retrieved = await adapter.getObject(object.id);
			expect(retrieved).not.toBeNull();
			expect(retrieved?.name).toBe('Test Character');
			const projectedNote = await adapter.getNote(createNoteId(String(object.id)));
			expect(projectedNote?.title).toBe('Test Character');
		});

		it('lists objects with filtering', async () => {
			await adapter.saveObject(testObject());
			await adapter.saveObject(
				testObject({
					id: createVaultObjectId('obj-image'),
					type: 'image',
					name: 'Map',
					summary: 'Dungeon map',
					data: { url: 'https://example.com/map.png' },
				}),
			);

			const characters = await adapter.getAllObjects({ type: 'character' });
			expect(characters).toHaveLength(1);
			expect(characters[0]?.type).toBe('character');
		});
	});

	describe('session boards', () => {
		it('persists session boards to vault metadata', async () => {
			const now = nowISO();
			const board = {
				id: createSessionBoardId('board-1'),
				name: 'Session Zero',
				description: 'Character hooks',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			};
			await adapter.saveSessionBoard(board);

			const loaded = await adapter.getSessionBoard(board.id);
			expect(loaded).not.toBeNull();
			expect(loaded!.name).toBe('Session Zero');
		});

		it('suggests related notes', async () => {
			const a = testNote({ title: 'A', tags: ['quest'] });
			const b = testNote({ title: 'B', tags: ['quest'] });
			await adapter.saveNote(a);
			await adapter.saveNote(b);
			await adapter.setLinksFrom(a.id, [
				{ sourceId: a.id, targetId: b.id, displayText: 'B', position: 0 },
			]);

			const suggestions = await adapter.suggestRelatedNotes([a.id], 5);
			expect(suggestions.some((entry) => entry.noteId === b.id)).toBe(true);
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

	describe('getIndexEntries', () => {
		it('returns all note entries from the index', async () => {
			const note1 = testNote({ title: 'Alpha' });
			const note2 = testNote({ title: 'Beta', tags: ['npc'] });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);

			const entries = adapter.getIndexEntries();
			expect(entries.length).toBe(2);

			const titles = entries.map((e) => e.title);
			expect(titles).toContain('Alpha');
			expect(titles).toContain('Beta');
		});

		it('includes deleted notes', async () => {
			const note = testNote({ title: 'To Delete' });
			await adapter.saveNote(note);
			await adapter.deleteNote(note.id);

			const entries = adapter.getIndexEntries();
			const entry = entries.find((e) => e.id === note.id);
			expect(entry).toBeDefined();
			expect(entry!.deleted).toBe(true);
		});
	});

	describe('getAllLinksFromIndex', () => {
		it('returns all links from the index', async () => {
			const source = testNote({ title: 'Source' });
			const target = testNote({ title: 'Target' });
			await adapter.saveNote(source);
			await adapter.saveNote(target);

			await adapter.setLinksFrom(source.id, [
				{
					sourceId: source.id,
					targetId: target.id,
					displayText: 'Target',
					position: 0,
				},
			]);

			const allLinks = adapter.getAllLinksFromIndex();
			expect(allLinks.length).toBe(1);
			expect(allLinks[0]!.sourceId).toBe(source.id);
			expect(allLinks[0]!.targetId).toBe(target.id);
		});

		it('returns empty array when no links exist', () => {
			const allLinks = adapter.getAllLinksFromIndex();
			expect(allLinks).toEqual([]);
		});
	});

	describe('getFolderTree', () => {
		it('returns folder hierarchy with note counts', async () => {
			const note1 = testNote({ title: 'Root', folder: createFolderId('/') });
			const note2 = testNote({ title: 'NPC 1', folder: createFolderId('/npcs') });
			const note3 = testNote({ title: 'NPC 2', folder: createFolderId('/npcs') });
			const note4 = testNote({ title: 'Location', folder: createFolderId('/locations') });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);
			await adapter.saveNote(note3);
			await adapter.saveNote(note4);

			const tree = adapter.getFolderTree();
			expect(tree.length).toBe(3);

			const npcsFolder = tree.find((f) => f.path === '/npcs');
			expect(npcsFolder?.noteCount).toBe(2);

			const rootFolder = tree.find((f) => f.path === '/');
			expect(rootFolder?.noteCount).toBe(1);
		});

		it('excludes deleted notes from counts', async () => {
			const note1 = testNote({ title: 'Active', folder: createFolderId('/npcs') });
			const note2 = testNote({ title: 'Deleted', folder: createFolderId('/npcs') });
			await adapter.saveNote(note1);
			await adapter.saveNote(note2);
			await adapter.deleteNote(note2.id);

			const tree = adapter.getFolderTree();
			const npcsFolder = tree.find((f) => f.path === '/npcs');
			expect(npcsFolder?.noteCount).toBe(1);
		});
	});

	describe('mcp staged changelog', () => {
		it('records pending mcp changes and applies them on approval', async () => {
			const note = testNote({ title: 'Pending Approval' });

			await adapter.recordMcpChange({
				type: 'create',
				noteId: note.id,
				title: note.title,
				summary: 'Create note',
				before: null,
				after: { note },
			});

			const pending = await adapter.getPendingMcpChanges();
			expect(pending.length).toBe(1);
			expect(pending[0]?.preview).toBeDefined();
			expect(pending[0]?.preview?.compactDiff).toContain('+Hello world');
			expect(pending[0]?.preview?.summary).toContain('Lines: +');
			expect(await adapter.getNote(note.id)).toBeNull();

			await adapter.approveMcpChange(pending[0]!.id);
			const applied = await adapter.getNote(note.id);
			expect(applied?.title).toBe('Pending Approval');
			expect((await adapter.getPendingMcpChanges()).length).toBe(0);
		});

		it('staged adapter exposes virtual notes before approval', async () => {
			const staged = new StagedMcpAdapter(tmpDir);
			await staged.initialize();
			const note = testNote({ title: 'Virtual Note' });

			await staged.saveNote(note);
			const fromStaged = await staged.getNote(note.id);
			expect(fromStaged?.title).toBe('Virtual Note');
			expect(await adapter.getNote(note.id)).toBeNull();

			const approved = await adapter.approveAllMcpChanges();
			expect(approved.length).toBe(1);
			expect((await adapter.getNote(note.id))?.title).toBe('Virtual Note');

			await staged.close();
		});

		it('staged adapter persists objects directly', async () => {
			const staged = new StagedMcpAdapter(tmpDir);
			await staged.initialize();
			const object = testObject({ id: createVaultObjectId('obj-staged') });

			await staged.saveObject(object);
			const fromBase = await adapter.getObject(object.id);
			expect(fromBase?.name).toBe('Test Character');

			await staged.close();
		});
	});
});
