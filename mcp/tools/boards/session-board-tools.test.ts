// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateSessionBoardTool } from './create-session-board.js';
import { registerDeleteSessionBoardTool } from './delete-session-board.js';
import { registerListSessionBoardsTool } from './list-session-boards.js';
import { registerSuggestRelatedBoardNotesTool } from './suggest-related-board-notes.js';
import { registerUpdateSessionBoardTool } from './update-session-board.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

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

function dataOf<T>(result: ToolResult): T {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(true);
	if (!envelope || !envelope.ok) throw new Error('Expected successful envelope');
	return envelope.data as T;
}

function expectError(result: ToolResult, code: string, messageIncludes?: string): void {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(false);
	if (!envelope || envelope.ok) throw new Error('Expected error envelope');
	expect(envelope.error.code).toBe(code);
	if (messageIncludes) expect(envelope.error.message).toContain(messageIncludes);
}

function makeBoard(
	id: string,
	overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
	return {
		id,
		name: 'Board One',
		description: 'Coverage board',
		tiles: [
			{
				id: 'tile-1',
				type: 'note',
				noteId: 'note-1',
				x: 0,
				y: 0,
				w: 4,
				h: 3,
			},
		],
		layout: {
			columns: 12,
			rowHeight: 120,
			minRows: 12,
			gap: 12,
		},
		style: {
			backgroundPattern: 'none',
		},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('session board MCP tools', () => {
	it('create_session_board seeds tiled note layout in row-major 3-column order', async () => {
		const saveSessionBoard = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerCreateSessionBoardTool(
			server as never,
			{
				saveSessionBoard,
			} as never,
		);

		const handler = server.handlers.get('create_session_board');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			name: 'Session Plan',
			description: 'Plan board',
			noteIds: ['note-a', 'note-b', 'note-c', 'note-d'],
		});
		const payload = dataOf<{ tiles: Array<Record<string, unknown>> }>(result);
		expect(payload.tiles).toHaveLength(4);
		expect(payload.tiles[0]).toMatchObject({ noteId: 'note-a', x: 0, y: 0, w: 4, h: 3 });
		expect(payload.tiles[1]).toMatchObject({ noteId: 'note-b', x: 4, y: 0, w: 4, h: 3 });
		expect(payload.tiles[2]).toMatchObject({ noteId: 'note-c', x: 8, y: 0, w: 4, h: 3 });
		expect(payload.tiles[3]).toMatchObject({ noteId: 'note-d', x: 0, y: 3, w: 4, h: 3 });
		expect(saveSessionBoard).toHaveBeenCalledTimes(1);
	});

	it('update_session_board merges metadata and deduplicates addNoteIds', async () => {
		const boards = new Map<string, Record<string, unknown>>([['board-1', makeBoard('board-1')]]);
		const getSessionBoard = vi.fn(async (id: string) => boards.get(String(id)) ?? null);
		const saveSessionBoard = vi.fn(async (board: Record<string, unknown>) => {
			boards.set(String(board.id), board);
		});
		const server = new MockMcpServer();
		registerUpdateSessionBoardTool(
			server as never,
			{
				getSessionBoard,
				saveSessionBoard,
			} as never,
		);

		const handler = server.handlers.get('update_session_board');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			boardId: 'board-1',
			name: '  Updated Board  ',
			layout: { rowHeight: 140 },
			style: { backgroundPattern: 'grid' },
			addNoteIds: ['note-1', 'note-2', 'note-3'],
		});
		const payload = dataOf<{
			name: string;
			layout: Record<string, number>;
			style: Record<string, string>;
			tiles: Array<{ noteId?: string; type: string }>;
		}>(result);

		expect(payload.name).toBe('Updated Board');
		expect(payload.layout).toMatchObject({ columns: 12, rowHeight: 140, minRows: 12, gap: 12 });
		expect(payload.style).toMatchObject({ backgroundPattern: 'grid' });
		expect(
			payload.tiles
				.filter((tile) => tile.type === 'note' && tile.noteId)
				.map((tile) => tile.noteId),
		).toEqual(['note-1', 'note-2', 'note-3']);
		expect(saveSessionBoard).toHaveBeenCalledTimes(1);
	});

	it('update_session_board returns MCP_NOT_FOUND for unknown board ids', async () => {
		const server = new MockMcpServer();
		registerUpdateSessionBoardTool(
			server as never,
			{
				getSessionBoard: vi.fn().mockResolvedValue(null),
			} as never,
		);
		const handler = server.handlers.get('update_session_board');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({ boardId: 'missing-board' });
		expectError(result, 'MCP_NOT_FOUND', 'Session board not found');
	});

	it('suggest_related_board_notes derives seeds from board tiles and handles missing boards', async () => {
		const getSessionBoard = vi
			.fn()
			.mockResolvedValueOnce(
				makeBoard('board-1', {
					tiles: [
						{ id: 'tile-1', type: 'note', noteId: 'note-1', x: 0, y: 0, w: 4, h: 3 },
						{ id: 'tile-2', type: 'note', noteId: 'note-2', x: 4, y: 0, w: 4, h: 3 },
						{ id: 'tile-3', type: 'timer', x: 8, y: 0, w: 4, h: 3 },
					],
				}),
			)
			.mockResolvedValueOnce(null);
		const suggestRelatedNotes = vi
			.fn()
			.mockResolvedValue([
				{ noteId: 'note-4', score: 0.92, linkedTo: ['note-1'], sharedTags: ['quest'] },
			]);
		const server = new MockMcpServer();
		registerSuggestRelatedBoardNotesTool(
			server as never,
			{
				getSessionBoard,
				suggestRelatedNotes,
			} as never,
		);

		const handler = server.handlers.get('suggest_related_board_notes');
		expect(handler).toBeTypeOf('function');
		const ok = await handler!({ boardId: 'board-1', noteIds: [], limit: 5 });
		const suggestions = dataOf<Array<{ noteId: string }>>(ok);
		expect(suggestions.map((entry) => entry.noteId)).toEqual(['note-4']);
		expect(suggestRelatedNotes).toHaveBeenCalledWith(
			[createNoteId('note-1'), createNoteId('note-2')],
			5,
		);

		const missing = await handler!({ boardId: 'missing-board', noteIds: [], limit: 5 });
		expectError(missing, 'MCP_NOT_FOUND', 'Session board not found');
	});

	it('list_session_boards and delete_session_board reflect board lifecycle updates', async () => {
		const boards = new Map<string, Record<string, unknown>>([
			['board-1', makeBoard('board-1')],
			['board-2', makeBoard('board-2', { name: 'Board Two' })],
		]);
		const getSessionBoards = vi.fn(async () => [...boards.values()]);
		const deleteSessionBoard = vi.fn(async (id: string) => {
			boards.delete(String(id));
		});

		const server = new MockMcpServer();
		registerListSessionBoardsTool(
			server as never,
			{
				getSessionBoards,
			} as never,
		);
		registerDeleteSessionBoardTool(
			server as never,
			{
				deleteSessionBoard,
			} as never,
		);

		const listHandler = server.handlers.get('list_session_boards');
		const deleteHandler = server.handlers.get('delete_session_board');
		expect(listHandler).toBeTypeOf('function');
		expect(deleteHandler).toBeTypeOf('function');

		const before = dataOf<Array<{ id: string }>>(await listHandler!({}));
		expect(before.map((entry) => entry.id)).toEqual(['board-1', 'board-2']);

		const deleted = dataOf<{ ok: boolean; boardId: string }>(
			await deleteHandler!({ boardId: 'board-1' }),
		);
		expect(deleted).toEqual({ ok: true, boardId: 'board-1' });
		expect(deleteSessionBoard).toHaveBeenCalledWith('board-1');

		const after = dataOf<Array<{ id: string }>>(await listHandler!({}));
		expect(after.map((entry) => entry.id)).toEqual(['board-2']);
		expect(getSessionBoards).toHaveBeenCalledTimes(2);
	});
});
