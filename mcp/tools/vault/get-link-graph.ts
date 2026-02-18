import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView, getLinkEntriesView } from '../shared/storage-view.js';

export function registerGetLinkGraphTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_link_graph',
		'Return the vault link graph as nodes and directed edges.',
		{
			includeDeleted: z.boolean().optional().default(false),
			includeIsolated: z.boolean().optional().default(true),
		},
		async ({ includeDeleted, includeIsolated }) => {
			const entries = (await getIndexEntriesView(storage)).filter(
				(entry) => includeDeleted || !entry.deleted,
			);
			const links = (await getLinkEntriesView(storage))
				.filter((link) => entries.some((entry) => entry.id === link.sourceId))
				.filter((link) => entries.some((entry) => entry.id === link.targetId));

			const connected = new Set<string>();
			for (const link of links) {
				connected.add(link.sourceId);
				connected.add(link.targetId);
			}

			const nodes = entries
				.filter((entry) => includeIsolated || connected.has(entry.id))
				.map((entry) => ({
					id: entry.id,
					title: entry.title,
					folder: entry.folder,
					tags: entry.tags,
					deleted: entry.deleted,
				}));

			const edges = links.map((link) => ({
				sourceId: link.sourceId,
				targetId: link.targetId,
				displayText: link.displayText,
				position: link.position,
			}));

			return jsonResult({
				nodeCount: nodes.length,
				edgeCount: edges.length,
				nodes,
				edges,
			});
		},
	);
}
