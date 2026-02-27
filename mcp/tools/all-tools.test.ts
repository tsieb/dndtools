// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTools } from '../tools/index.js';
import { MCP_TOOL_CONTRACTS } from './shared/contracts.js';
import { parseToolEnvelope, type ToolResult } from './shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}
}

function makeNote(id: string, title: string): Record<string, unknown> {
	return {
		id,
		title,
		content: `${title} content with [[Beta]]`,
		folder: '/',
		filePath: `${title.toLowerCase()}.md`,
		tags: ['tag'],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

function makeStorage(vaultDir: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
	const notes = new Map<string, Record<string, unknown>>([
		['note-1', makeNote('note-1', 'Alpha')],
		['note-2', makeNote('note-2', 'Beta')],
	]);
	const objects = new Map<string, Record<string, unknown>>([
		[
			'obj-1',
			{
				id: 'obj-1',
				type: 'character',
				name: 'Obj One',
				summary: 'Summary',
				tags: [],
				relationships: [],
				data: {},
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			},
		],
	]);
	const boards = new Map<string, Record<string, unknown>>([
		[
			'board-1',
			{
				id: 'board-1',
				name: 'Board One',
				description: '',
				tiles: [{ id: 'tile-1', noteId: 'note-1', x: 0, y: 0, w: 4, h: 3 }],
				layout: { columns: 12, rowHeight: 120, minRows: 12, gap: 12 },
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			},
		],
	]);

	return {
		getVaultDir: () => vaultDir,
		getNote: async (id) => notes.get(String(id)) ?? null,
		getAllNotes: async () => [...notes.values()],
		getNotesByFolder: async () => [...notes.values()],
		getNotesByTag: async () => [...notes.values()],
		getRecentNotes: async () => [...notes.values()],
		getDeletedNotes: async () => [...notes.values()].filter((note) => note.deleted),
		saveNote: async (note) => {
			const typed = note as Record<string, unknown>;
			notes.set(String(typed.id), typed);
			return undefined;
		},
		deleteNote: async (id, permanent) => {
			if (permanent) {
				notes.delete(String(id));
				return undefined;
			}
			const next = notes.get(String(id));
			if (next) next.deleted = true;
			return undefined;
		},
		restoreNote: async (id) => {
			const next = notes.get(String(id));
			if (next) next.deleted = false;
			return undefined;
		},
		resolveTitle: async (title) =>
			[...notes.values()].find(
				(note) => String(note.title).toLowerCase() === String(title).toLowerCase(),
			) ?? null,
		setLinksFrom: async () => undefined,
		resolveAndIndexLinks: async () => undefined,
		getLinksTo: async () => [
			{ sourceId: 'note-2', targetId: 'note-1', displayText: 'Alpha', position: 0 },
		],
		getTagCounts: async () => [{ name: 'tag', count: 2 }],
		searchNotes: async () => [...notes.values()].map((note) => ({ note, score: 10 })),
		getIndexEntries: async () =>
			[...notes.values()].map((note) => ({
				id: note.id,
				title: note.title,
				folder: note.folder,
				filePath: note.filePath,
				tags: note.tags,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				deleted: note.deleted,
				deletedAt: note.deletedAt,
			})),
		getAllLinksFromIndex: async () => [
			{ sourceId: 'note-1', targetId: 'note-2', displayText: 'Beta', position: 0 },
		],
		getFolderTree: async () => [{ path: '/', noteCount: notes.size, subfolders: [] }],
		getAllObjects: async () => [...objects.values()],
		getObject: async (id) => objects.get(String(id)) ?? null,
		saveObject: async (object) => {
			const typed = object as Record<string, unknown>;
			objects.set(String(typed.id), typed);
			notes.set(String(typed.id), makeNote(String(typed.id), String(typed.name ?? 'Object')));
			return undefined;
		},
		deleteObject: async (id) => {
			objects.delete(String(id));
			return undefined;
		},
		getSessionBoards: async () => [...boards.values()],
		getSessionBoard: async (id) => boards.get(String(id)) ?? null,
		saveSessionBoard: async (board) => {
			const typed = board as Record<string, unknown>;
			boards.set(String(typed.id), typed);
			return undefined;
		},
		deleteSessionBoard: async (id) => {
			boards.delete(String(id));
			return undefined;
		},
		suggestRelatedNotes: async () => [
			{
				noteId: 'note-2',
				score: 0.8,
				linkedTo: ['note-1'],
				sharedTags: ['tag'],
			},
		],
	};
}

function validRuns(tmpDir: string): Array<{ name: string; input: Record<string, unknown> }> {
	return [
		{ name: 'list_notes', input: { includeDeleted: false, limit: 10 } },
		{ name: 'read_note', input: { id: 'note-1' } },
		{
			name: 'create_note',
			input: { title: 'Created', content: 'text', folder: '/', tags: [], frontmatter: {} },
		},
		{
			name: 'update_note',
			input: { id: 'note-1', title: 'Alpha Updated', content: 'next', frontmatterMode: 'merge' },
		},
		{ name: 'delete_note', input: { id: 'note-2', permanent: false } },
		{ name: 'restore_note', input: { id: 'note-2' } },
		{ name: 'search_notes', input: { query: 'alpha', limit: 5 } },
		{ name: 'get_backlinks', input: { id: 'note-1' } },
		{ name: 'get_tags', input: {} },
		{ name: 'get_vault_summary', input: {} },
		{ name: 'get_campaign_health', input: { staleAfterDays: 45, maxGapExamples: 5 } },
		{ name: 'get_coverage_gaps', input: { staleAfterDays: 45, limit: 5 } },
		{ name: 'get_stale_notes', input: { staleAfterDays: 45, limit: 5 } },
		{
			name: 'get_session_prep_bundle',
			input: { focusTag: 'tag', staleAfterDays: 45, recentLimit: 5, boardLimit: 3 },
		},
		{
			name: 'get_recap_generation_bundle',
			input: { noteLimit: 5, objectLimit: 5, boardLimit: 5 },
		},
		{ name: 'get_continuity_check_bundle', input: { staleAfterDays: 45, maxExamples: 5 } },
		{ name: 'get_folder_tree', input: {} },
		{ name: 'get_recent_activity', input: { limit: 10 } },
		{ name: 'get_link_graph', input: { includeDeleted: false, includeIsolated: true } },
		{ name: 'vault_health_check', input: {} },
		{ name: 'list_session_boards', input: {} },
		{
			name: 'create_session_board',
			input: { name: 'New Board', description: '', noteIds: ['note-1'] },
		},
		{
			name: 'update_session_board',
			input: {
				boardId: 'board-1',
				name: 'Updated Board',
				description: '',
				tiles: [],
				addNoteIds: [],
			},
		},
		{ name: 'suggest_related_board_notes', input: { noteIds: ['note-1'], limit: 5 } },
		{
			name: 'create_stat_block_object',
			input: {
				name: 'Goblin',
				summary: '',
				tags: [],
				abilities: {},
				traits: [],
				actions: [],
				reactions: [],
				legendaryActions: [],
			},
		},
		{
			name: 'create_character_object',
			input: {
				name: 'Aria',
				summary: '',
				tags: [],
				abilities: {},
				goals: [],
				bonds: [],
				flaws: [],
			},
		},
		{
			name: 'create_image_object',
			input: { name: 'Map', summary: '', tags: [], url: 'file:///map.png' },
		},
		{
			name: 'create_character_sheet_note',
			input: {
				name: 'Sheet',
				summary: '',
				tags: [],
				abilities: {},
				goals: [],
				bonds: [],
				flaws: [],
			},
		},
		{
			name: 'create_stat_block_note',
			input: {
				name: 'Ogre',
				summary: '',
				tags: [],
				abilities: {},
				traits: [],
				actions: [],
				reactions: [],
				legendaryActions: [],
			},
		},
		{ name: 'list_objects', input: { limit: 20 } },
		{ name: 'read_object', input: { id: 'obj-1' } },
		{
			name: 'update_object',
			input: { id: 'obj-1', name: 'Obj One+', data: {}, dataMode: 'merge' },
		},
		{
			name: 'embed_object_in_note',
			input: {
				noteId: 'note-1',
				objectId: 'obj-1',
				position: 'append',
				renderView: 'card',
				allowCycle: true,
			},
		},
		{
			name: 'embed_note_in_note',
			input: {
				noteId: 'note-1',
				targetNoteId: 'note-2',
				position: 'append',
				renderView: 'card',
				allowCycle: true,
			},
		},
		{
			name: 'import_image_note',
			input: {
				sourcePath: path.join(tmpDir, 'fixture.png'),
				name: 'Fixture',
				summary: '',
				tags: [],
				assetFolder: '/assets/images',
				noteFolder: '/objects/image',
				moveFile: false,
				overwrite: false,
			},
		},
		{ name: 'delete_object', input: { id: 'obj-1' } },
		{ name: 'delete_session_board', input: { boardId: 'board-1' } },
	];
}

describe('MCP tool contracts', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-tools-'));
		await fs.writeFile(path.join(tmpDir, 'fixture.png'), Buffer.from([137, 80, 78, 71]));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('registers every tool and returns schema-valid success payloads', async () => {
		const server = new MockMcpServer();
		const storage = makeStorage(tmpDir);
		registerTools(server as never, storage as never, { writeMode: 'direct' });

		for (const run of validRuns(tmpDir)) {
			const handler = server.handlers.get(run.name);
			expect(handler, `Missing handler for ${run.name}`).toBeTypeOf('function');

			const result = await handler!(run.input);
			const envelope = parseToolEnvelope(result);
			expect(envelope, `Invalid envelope for ${run.name}`).toBeTruthy();
			expect(envelope?.ok, `Expected success for ${run.name}: ${JSON.stringify(envelope)}`).toBe(
				true,
			);
			if (!envelope || !envelope.ok) continue;

			const contract = MCP_TOOL_CONTRACTS[run.name];
			expect(contract, `Missing contract for ${run.name}`).toBeDefined();
			const validation = contract.responseSchema.safeParse(envelope.data);
			expect(validation.success, `Invalid contract payload for ${run.name}`).toBe(true);
		}
	});

	it('rejects unknown top-level input keys for every tool', async () => {
		const server = new MockMcpServer();
		registerTools(server as never, makeStorage(tmpDir) as never, { writeMode: 'direct' });

		for (const run of validRuns(tmpDir)) {
			const handler = server.handlers.get(run.name);
			expect(handler).toBeTypeOf('function');

			const result = await handler!({ ...run.input, unexpectedField: true });
			const envelope = parseToolEnvelope(result);
			expect(envelope).toBeTruthy();
			expect(envelope?.ok).toBe(false);
			if (!envelope || envelope.ok) continue;
			expect(envelope.error.code).toBe('MCP_INVALID_INPUT');
		}
	});

	it('enforces staged/direct permission boundaries', async () => {
		const server = new MockMcpServer();
		registerTools(server as never, makeStorage(tmpDir) as never, { writeMode: 'staged' });

		for (const run of validRuns(tmpDir)) {
			const handler = server.handlers.get(run.name);
			expect(handler).toBeTypeOf('function');
			const result = await handler!(run.input);
			const envelope = parseToolEnvelope(result);
			expect(envelope).toBeTruthy();
			const contract = MCP_TOOL_CONTRACTS[run.name];

			if (contract.permission === 'write-direct') {
				expect(envelope?.ok).toBe(false);
				if (!envelope || envelope.ok) continue;
				expect(envelope.error.code).toBe('MCP_PERMISSION_DENIED');
			} else {
				expect(envelope?.ok, `Expected success for ${run.name}: ${JSON.stringify(envelope)}`).toBe(
					true,
				);
			}
		}
	});

	it('supports idempotency-key retries for non-idempotent tools', async () => {
		const storage = makeStorage(tmpDir);
		let saveNoteCalls = 0;
		const originalSaveNote = storage.saveNote;
		storage.saveNote = async (...args: unknown[]) => {
			saveNoteCalls += 1;
			return originalSaveNote(...args);
		};

		const server = new MockMcpServer();
		registerTools(server as never, storage as never, { writeMode: 'direct' });
		const createHandler = server.handlers.get('create_note');
		expect(createHandler).toBeTypeOf('function');

		const input = {
			title: 'Retry Safe',
			content: 'payload',
			folder: '/',
			idempotencyKey: 'req-123',
		};
		const first = parseToolEnvelope(await createHandler!(input));
		const second = parseToolEnvelope(await createHandler!(input));

		expect(first?.ok).toBe(true);
		expect(second?.ok).toBe(true);
		if (!first || !second || !first.ok || !second.ok) return;

		expect(second.data).toEqual(first.data);
		expect(saveNoteCalls).toBe(1);
	});
});
