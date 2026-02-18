import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';

export function registerVaultTagsResource(server: McpServer, storage: FileSystemAdapter): void {
	server.resource('vault-tags', 'vault://tags', async (uri) => {
		const tags = await storage.getTagCounts();
		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(tags, null, 2),
				},
			],
		};
	});
}
