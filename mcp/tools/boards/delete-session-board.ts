import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createSessionBoardId } from '../../../src/lib/types/session-board.js';
import { jsonResult } from '../shared/response.js';

export function registerDeleteSessionBoardTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'delete_session_board',
		'Delete a session board by id.',
		{
			boardId: z.string().min(1),
		},
		async ({ boardId }) => {
			await storage.deleteSessionBoard(createSessionBoardId(boardId));
			return jsonResult({ ok: true, boardId });
		},
	);
}

