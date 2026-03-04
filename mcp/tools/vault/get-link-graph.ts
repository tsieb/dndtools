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

function matchesFolderFilter(path: string, normalizedFolder: string): boolean {
	if (!normalizedFolder) return true;
	const normalizedPath = path.toLowerCase();
	if (normalizedFolder === '/') return true;
	return (
		normalizedPath === normalizedFolder ||
		normalizedPath.startsWith(`${normalizedFolder}/`) ||
		normalizedFolder.startsWith(`${normalizedPath}/`)
	);
}

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
				.filter((entry) => matchesFolderFilter(entry.folder, normalizedFolder))
				.filter((entry) =>
					normalizedTag ? entry.tags.some((tag) => tag.toLowerCase() === normalizedTag) : true,
				);
			const mapObjects = (await storage.getAllObjects({ type: 'map' }))
				.filter((object) => object.type === 'map')
				.filter(() => matchesFolderFilter('/maps', normalizedFolder))
				.filter((object) =>
					normalizedTag ? object.tags.some((tag) => tag.toLowerCase() === normalizedTag) : true,
				);

			const nodeIdSet = new Set(entries.map((entry) => entry.id));
			for (const mapObject of mapObjects) {
				nodeIdSet.add(String(mapObject.id));
			}
			const noteLinks = (await getLinkEntriesView(storage))
				.filter((link) => nodeIdSet.has(link.sourceId))
				.filter((link) => nodeIdSet.has(link.targetId));
			const mapLinks = mapObjects
				.filter(
					(object) => !!object.data.areaNoteId && nodeIdSet.has(String(object.data.areaNoteId)),
				)
				.flatMap((object) => {
					const mapId = String(object.id);
					const noteId = String(object.data.areaNoteId);
					return [
						{
							sourceId: mapId,
							targetId: noteId,
							displayText: 'area',
							position: 0,
							kind: 'map_area' as const,
						},
						{
							sourceId: noteId,
							targetId: mapId,
							displayText: 'map',
							position: 0,
							kind: 'location_map' as const,
						},
					];
				});
			const links = [
				...noteLinks.map((link) => ({
					sourceId: link.sourceId,
					targetId: link.targetId,
					displayText: link.displayText,
					position: link.position,
					kind: 'wikilink' as const,
				})),
				...mapLinks,
			];

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
					kind: 'note' as const,
				}))
				.concat(
					mapObjects
						.filter((object) => includeIsolated || connected.has(String(object.id)))
						.map((object) => ({
							id: String(object.id),
							title: object.name,
							folder: '/maps',
							tags: object.tags,
							deleted: false,
							kind: 'map' as const,
						})),
				);

			const edges = links.map((link) => ({
				sourceId: link.sourceId,
				targetId: link.targetId,
				displayText: link.displayText,
				position: link.position,
				kind: link.kind,
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
