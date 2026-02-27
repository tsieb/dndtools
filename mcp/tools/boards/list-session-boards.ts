import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';

export function registerListSessionBoardsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'list_session_boards',
		'List all session boards with layout metadata.',
		{},
		async () => {
			const boards = await storage.getSessionBoards();
			return jsonResult(boards);
		},
	);
}
