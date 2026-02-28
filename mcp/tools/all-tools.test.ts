// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTools } from '../tools/index.js';
import { MCP_TOOL_CONTRACTS } from './shared/contracts.js';
import { parseToolEnvelope, type ToolResult } from './shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
type ToolName = keyof typeof MCP_TOOL_CONTRACTS;

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

function buildValidInputs(tmpDir: string): Record<ToolName, Record<string, unknown>> {
	return {
		list_notes: { includeDeleted: false, limit: 10 },
		read_note: { id: 'note-1' },
		create_note: { title: 'Created', content: 'text', folder: '/', tags: [], frontmatter: {} },
		update_note: {
			id: 'note-1',
			title: 'Alpha Updated',
			content: 'next',
			frontmatterMode: 'merge',
		},
		delete_note: { id: 'note-2', permanent: false },
		restore_note: { id: 'note-2' },
		search_notes: { query: 'alpha', limit: 5 },
		get_backlinks: { id: 'note-1' },
		get_tags: {},
		get_vault_summary: {},
		get_campaign_health: { staleAfterDays: 45, maxGapExamples: 5 },
		get_coverage_gaps: { staleAfterDays: 45, limit: 5 },
		get_stale_notes: { staleAfterDays: 45, limit: 5 },
		get_session_prep_bundle: { focusTag: 'tag', staleAfterDays: 45, recentLimit: 5, boardLimit: 3 },
		get_recap_generation_bundle: { noteLimit: 5, objectLimit: 5, boardLimit: 5 },
		get_continuity_check_bundle: { staleAfterDays: 45, maxExamples: 5 },
		get_folder_tree: {},
		get_recent_activity: { limit: 10 },
		get_link_graph: { includeDeleted: false, includeIsolated: true },
		vault_health_check: {},
		list_session_boards: {},
		create_session_board: { name: 'New Board', description: '', noteIds: ['note-1'] },
		update_session_board: {
			boardId: 'board-1',
			name: 'Updated Board',
			description: '',
			tiles: [],
			addNoteIds: [],
		},
		delete_session_board: { boardId: 'board-1' },
		suggest_related_board_notes: { noteIds: ['note-1'], limit: 5 },
		create_stat_block_object: {
			name: 'Goblin',
			summary: '',
			tags: [],
			abilities: {},
			traits: [],
			actions: [],
			reactions: [],
			legendaryActions: [],
		},
		create_character_object: {
			name: 'Aria',
			summary: '',
			tags: [],
			abilities: {},
			goals: [],
			bonds: [],
			flaws: [],
		},
		create_image_object: { name: 'Map', summary: '', tags: [], url: 'file:///map.png' },
		create_character_sheet_note: {
			name: 'Sheet',
			summary: '',
			tags: [],
			abilities: {},
			goals: [],
			bonds: [],
			flaws: [],
		},
		create_stat_block_note: {
			name: 'Ogre',
			summary: '',
			tags: [],
			abilities: {},
			traits: [],
			actions: [],
			reactions: [],
			legendaryActions: [],
		},
		list_objects: { limit: 20 },
		read_object: { id: 'obj-1' },
		update_object: { id: 'obj-1', name: 'Obj One+', data: {}, dataMode: 'merge' },
		delete_object: { id: 'obj-1' },
		embed_object_in_note: {
			noteId: 'note-1',
			objectId: 'obj-1',
			position: 'append',
			renderView: 'card',
			allowCycle: true,
		},
		embed_note_in_note: {
			noteId: 'note-1',
			targetNoteId: 'note-2',
			position: 'append',
			renderView: 'card',
			allowCycle: true,
		},
		import_image_note: {
			sourcePath: path.join(tmpDir, 'fixture.png'),
			name: 'Fixture',
			summary: '',
			tags: [],
			assetFolder: '/assets/images',
			noteFolder: '/objects/image',
			moveFile: false,
			overwrite: false,
		},
	};
}

function deterministicEnvelope(result: ToolResult): string {
	const envelope = parseToolEnvelope(result);
	expect(envelope).toBeTruthy();
	return JSON.stringify(envelope);
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
		const validInputs = buildValidInputs(tmpDir);

		const contractNames = Object.keys(MCP_TOOL_CONTRACTS).sort();
		const fixtureNames = Object.keys(validInputs).sort();
		expect(fixtureNames).toEqual(contractNames);

		const writeContracts = Object.entries(MCP_TOOL_CONTRACTS).filter(
			([, contract]) => contract.permission !== 'read-only',
		);
		const readContracts = Object.entries(MCP_TOOL_CONTRACTS).filter(
			([, contract]) => contract.permission === 'read-only',
		);
		expect(writeContracts.length).toBeGreaterThan(0);
		expect(readContracts.length).toBeGreaterThan(0);

		let writeSuccesses = 0;
		let readSuccesses = 0;

		for (const [toolName, input] of Object.entries(validInputs) as Array<
			[ToolName, Record<string, unknown>]
		>) {
			const server = new MockMcpServer();
			registerTools(server as never, makeStorage(tmpDir) as never, { writeMode: 'direct' });
			const handler = server.handlers.get(toolName);
			expect(handler, `Missing handler for ${toolName}`).toBeTypeOf('function');

			const result = await handler!(input);
			const envelope = parseToolEnvelope(result);
			expect(envelope, `Invalid envelope for ${toolName}`).toBeTruthy();
			expect(envelope?.ok, `Expected success for ${toolName}: ${JSON.stringify(envelope)}`).toBe(
				true,
			);
			if (!envelope || !envelope.ok) continue;

			const contract = MCP_TOOL_CONTRACTS[toolName];
			expect(contract, `Missing contract for ${toolName}`).toBeDefined();
			const validation = contract.responseSchema.safeParse(envelope.data);
			expect(validation.success, `Invalid contract payload for ${toolName}`).toBe(true);

			if (contract.permission === 'read-only') {
				readSuccesses += 1;
			} else {
				writeSuccesses += 1;
			}
		}

		expect(writeSuccesses / writeContracts.length).toBe(1);
		expect(readSuccesses / readContracts.length).toBeGreaterThanOrEqual(0.9);
	});

	it('rejects unknown top-level input keys for every tool', async () => {
		const server = new MockMcpServer();
		registerTools(server as never, makeStorage(tmpDir) as never, { writeMode: 'direct' });
		const validInputs = buildValidInputs(tmpDir);

		for (const [toolName, input] of Object.entries(validInputs)) {
			const handler = server.handlers.get(toolName);
			expect(handler).toBeTypeOf('function');

			const result = await handler!({ ...input, unexpectedField: true });
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
		const validInputs = buildValidInputs(tmpDir);

		for (const [toolName, input] of Object.entries(validInputs)) {
			const handler = server.handlers.get(toolName);
			expect(handler).toBeTypeOf('function');
			const result = await handler!(input);
			const envelope = parseToolEnvelope(result);
			expect(envelope).toBeTruthy();
			const contract = MCP_TOOL_CONTRACTS[toolName];

			if (contract.permission === 'write-direct') {
				expect(envelope?.ok).toBe(false);
				if (!envelope || envelope.ok) continue;
				expect(envelope.error.code).toBe('MCP_PERMISSION_DENIED');
			} else {
				expect(envelope?.ok, `Expected success for ${toolName}: ${JSON.stringify(envelope)}`).toBe(
					true,
				);
			}
		}
	});

	it('handles empty-vault read operations without crashing', async () => {
		const validInputs = buildValidInputs(tmpDir);
		const emptyStorage = makeStorage(tmpDir);
		emptyStorage.getAllNotes = async () => [];
		emptyStorage.getNotesByFolder = async () => [];
		emptyStorage.getNotesByTag = async () => [];
		emptyStorage.getRecentNotes = async () => [];
		emptyStorage.getDeletedNotes = async () => [];
		emptyStorage.getTagCounts = async () => [];
		emptyStorage.searchNotes = async () => [];
		emptyStorage.getIndexEntries = async () => [];
		emptyStorage.getAllLinksFromIndex = async () => [];
		emptyStorage.getFolderTree = async () => [];
		emptyStorage.getAllObjects = async () => [];
		emptyStorage.getSessionBoards = async () => [];
		emptyStorage.suggestRelatedNotes = async () => [];
		emptyStorage.getNote = async () => null;
		emptyStorage.getObject = async () => null;
		emptyStorage.getLinksTo = async () => [];
		emptyStorage.resolveTitle = async () => null;

		const emptyServer = new MockMcpServer();
		registerTools(emptyServer as never, emptyStorage as never, { writeMode: 'direct' });
		const allowedNotFound = new Set<ToolName>(['read_note', 'read_object', 'get_backlinks']);

		for (const [toolName, contract] of Object.entries(MCP_TOOL_CONTRACTS) as Array<
			[ToolName, (typeof MCP_TOOL_CONTRACTS)[ToolName]]
		>) {
			if (contract.permission !== 'read-only') continue;
			const handler = emptyServer.handlers.get(toolName);
			expect(handler).toBeTypeOf('function');
			const envelope = parseToolEnvelope(await handler!(validInputs[toolName]));
			expect(envelope).toBeTruthy();
			if (!envelope) continue;
			if (envelope.ok) {
				const validation = contract.responseSchema.safeParse(envelope.data);
				expect(validation.success, `Invalid empty-vault payload for ${toolName}`).toBe(true);
				continue;
			}

			expect(allowedNotFound.has(toolName), `${toolName} returned unexpected error`).toBe(true);
			expect(envelope.error.code).toBe('MCP_NOT_FOUND');
		}
	});

	it('returns deterministic missing-note envelopes for note-id tools', async () => {
		const server = new MockMcpServer();
		registerTools(server as never, makeStorage(tmpDir) as never, { writeMode: 'direct' });
		const missingNoteInputs: Array<[ToolName, Record<string, unknown>]> = [
			['read_note', { id: 'missing-note' }],
			['update_note', { id: 'missing-note', content: 'next' }],
			['delete_note', { id: 'missing-note', permanent: false }],
			['restore_note', { id: 'missing-note' }],
			['get_backlinks', { id: 'missing-note' }],
		];

		for (const [toolName, input] of missingNoteInputs) {
			const handler = server.handlers.get(toolName);
			expect(handler).toBeTypeOf('function');
			const first = await handler!(input);
			const second = await handler!(input);
			const firstEnvelope = deterministicEnvelope(first);
			const secondEnvelope = deterministicEnvelope(second);
			expect(secondEnvelope).toBe(firstEnvelope);
			const parsed = parseToolEnvelope(first);
			expect(parsed?.ok).toBe(false);
			if (!parsed || parsed.ok) continue;
			expect(parsed.error.code).toBe('MCP_NOT_FOUND');
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

	it('coalesces concurrent idempotency-key writes for retry-safe create', async () => {
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
			title: 'Concurrent Retry Safe',
			content: 'payload',
			folder: '/',
			idempotencyKey: 'req-concurrent-1',
		};
		const responses = await Promise.all(
			Array.from({ length: 5 }).map(async () => parseToolEnvelope(await createHandler!(input))),
		);
		const canonical = JSON.stringify(responses[0]);
		for (const response of responses) {
			expect(response?.ok).toBe(true);
			expect(JSON.stringify(response)).toBe(canonical);
		}
		expect(saveNoteCalls).toBe(1);
	});
});
