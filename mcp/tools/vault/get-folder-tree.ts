import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getFolderTreeView } from '../shared/storage-view.js';

export function registerGetFolderTreeTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_folder_tree',
		'Return folder paths, note counts, and immediate subfolder relationships.',
		{},
		async () => {
			return jsonResult(await getFolderTreeView(storage));
		},
	);
}
