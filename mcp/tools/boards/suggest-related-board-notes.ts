import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createSessionBoardId } from '../../../src/lib/types/session-board.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerSuggestRelatedBoardNotesTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'suggest_related_board_notes',
		'Suggest related notes to add to a session board based on links and shared tags.',
		{
			boardId: z.string().optional(),
			noteIds: z.array(z.string().min(1)).optional().default([]),
			limit: z.number().int().min(1).max(30).optional().default(8),
		},
		async ({ boardId, noteIds, limit }) => {
			let seedNoteIds = noteIds.map((id) => createNoteId(id));

			if (boardId) {
				const board = await storage.getSessionBoard(createSessionBoardId(boardId));
				if (!board) {
					return errorResult(`Session board not found: ${boardId}`);
				}
				seedNoteIds = board.tiles.map((tile) => tile.noteId);
			}

			const suggestions = await storage.suggestRelatedNotes(seedNoteIds, limit);
			return jsonResult(suggestions);
		},
	);
}

