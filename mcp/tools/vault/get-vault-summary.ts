import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView, getLinkEntriesView } from '../shared/storage-view.js';

export function registerGetVaultSummaryTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_vault_summary',
		'Get vault-level metrics: counts, top tags, folder distribution, and recent notes.',
		{},
		async () => {
			const entries = await getIndexEntriesView(storage);
			const entryById = new Map(entries.map((entry) => [entry.id, entry]));
			const activeEntries = entries.filter((entry) => !entry.deleted);
			const deletedEntries = entries.length - activeEntries.length;
			const [links, tags, objects] = await Promise.all([
				getLinkEntriesView(storage),
				storage.getTagCounts(),
				storage.getAllObjects(),
			]);

			const folderCounts = new Map<string, number>();
			for (const entry of activeEntries) {
				folderCounts.set(entry.folder, (folderCounts.get(entry.folder) ?? 0) + 1);
			}

			const outgoing = new Set<string>();
			const incoming = new Set<string>();
			for (const link of links) {
				outgoing.add(link.sourceId);
				incoming.add(link.targetId);
			}

			const orphanCount = activeEntries.filter(
				(entry) => !incoming.has(entry.id) && !outgoing.has(entry.id),
			).length;

			const mostLinked = new Map<string, number>();
			for (const link of links) {
				mostLinked.set(link.targetId, (mostLinked.get(link.targetId) ?? 0) + 1);
			}

			const topLinkedNotes = [...mostLinked.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10)
				.map(([id, count]) => {
					const entry = entryById.get(id);
					return {
						id,
						title: entry?.title ?? 'Unknown',
						incomingLinks: count,
					};
				});

			const recentActivity = [...activeEntries]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, 10)
				.map((entry) => ({
					id: entry.id,
					title: entry.title,
					updatedAt: entry.updatedAt,
				}));

			const objectTypeCounts = new Map<string, number>();
			for (const object of objects) {
				objectTypeCounts.set(object.type, (objectTypeCounts.get(object.type) ?? 0) + 1);
			}

			return jsonResult({
				totalNotes: activeEntries.length,
				deletedNotes: deletedEntries,
				totalLinks: links.length,
				totalObjects: objects.length,
				orphanNotes: orphanCount,
				folders: [...folderCounts.entries()]
					.map(([path, noteCount]) => ({ path, noteCount }))
					.sort((a, b) => a.path.localeCompare(b.path)),
				topTags: tags.slice(0, 20),
				topLinkedNotes,
				recentActivity,
				objectTypes: [...objectTypeCounts.entries()]
					.map(([type, count]) => ({ type, count }))
					.sort((a, b) => a.type.localeCompare(b.type)),
			});
		},
	);
}
