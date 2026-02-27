import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView, getLinkEntriesView } from '../shared/storage-view.js';
import { buildLinkGraphQualityReport } from '../../../src/lib/domain/link-graph-intelligence.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkTargetId,
} from '../../../src/lib/domain/link-resolution.js';

export function registerGetLinkGraphTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_link_graph',
		'Return the vault link graph as nodes and directed edges.',
		{
			includeDeleted: z.boolean().optional().default(false),
			includeIsolated: z.boolean().optional().default(true),
			folderFilter: z.string().optional(),
			tagFilter: z.string().optional(),
			includeQuality: z.boolean().optional().default(true),
		},
		async ({ includeDeleted, includeIsolated, folderFilter, tagFilter, includeQuality }) => {
			const normalizedFolder = folderFilter?.trim().toLowerCase() ?? '';
			const normalizedTag = tagFilter?.trim().toLowerCase() ?? '';
			const entries = (await getIndexEntriesView(storage))
				.filter((entry) => includeDeleted || !entry.deleted)
				.filter((entry) =>
					normalizedFolder
						? entry.folder.toLowerCase() === normalizedFolder ||
							entry.folder.toLowerCase().startsWith(`${normalizedFolder}/`)
						: true,
				)
				.filter((entry) =>
					normalizedTag ? entry.tags.some((tag) => tag.toLowerCase() === normalizedTag) : true,
				);
			const nodeIdSet = new Set(entries.map((entry) => entry.id));
			const links = (await getLinkEntriesView(storage))
				.filter((link) => nodeIdSet.has(link.sourceId))
				.filter((link) => nodeIdSet.has(link.targetId));

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

			const quality = includeQuality
				? (() => {
						const notesInScopePromise = storage
							.getAllNotes({ includeDeleted: true })
							.then((notes) =>
								notes
									.filter((note) => includeDeleted || !note.deleted)
									.filter((note) => nodeIdSet.has(String(note.id))),
							);
						return notesInScopePromise.then((notesInScope) => {
							const resolutionEntries = notesInScope.map((note) => ({
								id: String(note.id),
								title: note.title,
								updatedAt: note.updatedAt,
								aliases: extractAliasesFromFrontmatter(note.frontmatter),
							}));
							const report = buildLinkGraphQualityReport({
								notes: notesInScope,
								resolveTitle: (title) => resolveLinkTargetId(title, resolutionEntries),
							});
							return {
								orphanCount: report.orphanNoteIds.length,
								orphanNoteIds: report.orphanNoteIds,
								deadLinkCount: report.deadLinks.length,
								deadLinks: report.deadLinks,
								highCentrality: report.highCentrality,
							};
						});
					})()
				: Promise.resolve(null);

			return jsonResult({
				nodeCount: nodes.length,
				edgeCount: edges.length,
				nodes,
				edges,
				quality: await quality,
			});
		},
	);
}
