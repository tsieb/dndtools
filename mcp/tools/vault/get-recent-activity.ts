import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView } from '../shared/storage-view.js';

export function registerGetRecentActivityTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_recent_activity',
		'List recently updated notes, optionally filtered by ISO date.',
		{
			limit: z.number().int().min(1).max(200).optional().default(20),
			since: z.string().optional().describe('ISO timestamp filter, inclusive lower bound'),
		},
		async ({ limit, since }) => {
			const entries = (await getIndexEntriesView(storage))
				.filter((entry) => !entry.deleted)
				.filter((entry) => (since ? entry.updatedAt >= since : true))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, limit)
				.map((entry) => ({
					id: entry.id,
					title: entry.title,
					folder: entry.folder,
					tags: entry.tags,
					createdAt: entry.createdAt,
					updatedAt: entry.updatedAt,
				}));

			return jsonResult(entries);
		},
	);
}
