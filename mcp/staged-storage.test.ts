// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StagedMcpAdapter } from './staged-storage.js';
import { FileSystemAdapter } from './storage.js';
import { createFolderId, createNoteId, type Note } from '../src/lib/types/note.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId(`note-${Math.random().toString(36).slice(2, 10)}`),
		title: 'Test Note',
		content: '',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('StagedMcpAdapter', () => {
	let tmpDir: string;
	let base: FileSystemAdapter;
	let staged: StagedMcpAdapter;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-staged-'));
		base = new FileSystemAdapter(tmpDir);
		staged = new StagedMcpAdapter(tmpDir);
		await base.initialize();
		await staged.initialize();
	});

	afterEach(async () => {
		await staged.close();
		await base.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('assigns unique file paths for duplicate staged titles in the same folder', async () => {
		const a = makeNote({ id: createNoteId('note-a'), title: 'Goblin Den' });
		const b = makeNote({ id: createNoteId('note-b'), title: 'Goblin Den' });

		await staged.saveNote(a);
		await staged.saveNote(b);

		const noteA = await staged.getNote(a.id);
		const noteB = await staged.getNote(b.id);
		expect(noteA?.filePath).toBe('goblin-den.md');
		expect(noteB?.filePath).toBe('goblin-den-2.md');
	});

	it('keeps staged updates virtual until approval and applies latest content', async () => {
		const original = makeNote({
			id: createNoteId('note-virtual'),
			title: 'Virtual',
			content: 'v1',
		});
		await staged.saveNote(original);
		await staged.saveNote({ ...original, content: 'v2', updatedAt: '2026-01-02T00:00:00.000Z' });

		expect((await staged.getNote(original.id))?.content).toBe('v2');
		expect(await base.getNote(original.id)).toBeNull();
		expect((await base.getPendingMcpChanges()).length).toBe(2);

		await base.approveAllMcpChanges();
		expect((await base.getNote(original.id))?.content).toBe('v2');
	});

	it('derives links from staged content including note-id embeds', async () => {
		const target = makeNote({
			id: createNoteId('note-target'),
			title: 'Phandalin',
		});
		const source = makeNote({
			id: createNoteId('note-source'),
			title: 'Session 1',
			content: 'See ![[note:note-target|Town]] and [[Phandalin]].',
		});

		await staged.saveNote(target);
		await staged.saveNote(source);

		const links = await staged.getLinksFrom(source.id);
		expect(links).toHaveLength(2);
		expect(links.every((entry) => entry.targetId === target.id)).toBe(true);
	});

	it('excludes staged soft-deleted notes from active snapshots and search', async () => {
		const active = makeNote({
			id: createNoteId('note-active'),
			title: 'Active Note',
			content: 'contains dragon lore',
		});
		const trash = makeNote({
			id: createNoteId('note-trash'),
			title: 'Trash Note',
			content: 'contains dragon lore',
		});
		await staged.saveNote(active);
		await staged.saveNote(trash);
		await staged.deleteNote(trash.id);

		const activeNotes = await staged.getAllNotes();
		expect(activeNotes.map((note) => note.id)).toEqual([active.id]);

		const results = await staged.searchNotes('dragon');
		expect(results.map((entry) => entry.note.id)).toEqual([active.id]);
	});
});
