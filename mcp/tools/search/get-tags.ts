import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult, textResult } from '../shared/response.js';

export function registerGetTagsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool('get_tags', 'List all tags and usage counts.', {}, async () => {
		const tags = await storage.getTagCounts();
		if (tags.length === 0) {
			return textResult('No tags found.');
		}
		return jsonResult(tags);
	});
}
