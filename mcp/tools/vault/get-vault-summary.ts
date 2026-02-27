import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView } from '../shared/storage-view.js';
import {
	buildVaultIntelligence,
	DEFAULT_MAX_EXAMPLES,
	DEFAULT_STALE_AFTER_DAYS,
} from './vault-intelligence.js';

export function registerGetVaultSummaryTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_vault_summary',
		'Get vault-level metrics with campaign health, coverage gaps, and stale-note insights.',
		{
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			maxExamples: z.number().int().min(1).max(200).optional().default(DEFAULT_MAX_EXAMPLES),
		},
		async ({ staleAfterDays, maxExamples }) => {
			const [entries, tags, objects, insights] = await Promise.all([
				getIndexEntriesView(storage),
				storage.getTagCounts(),
				storage.getAllObjects(),
				buildVaultIntelligence(storage, { staleAfterDays, maxExamples }),
			]);

			const folderCounts = new Map<string, number>();
			for (const entry of entries) {
				if (entry.deleted) continue;
				folderCounts.set(entry.folder, (folderCounts.get(entry.folder) ?? 0) + 1);
			}

			const objectTypeCounts = new Map<string, number>();
			for (const object of objects) {
				objectTypeCounts.set(object.type, (objectTypeCounts.get(object.type) ?? 0) + 1);
			}

			return jsonResult({
				totalNotes: insights.totals.activeNotes,
				deletedNotes: insights.totals.deletedNotes,
				totalLinks: insights.totals.links,
				totalObjects: insights.totals.objects,
				orphanNotes: insights.metrics.orphanNotes,
				folders: [...folderCounts.entries()]
					.map(([path, noteCount]) => ({ path, noteCount }))
					.sort((a, b) => a.path.localeCompare(b.path)),
				topTags: tags.slice(0, 20),
				topLinkedNotes: insights.topLinkedNotes,
				recentActivity: insights.recentNotes.map((note) => ({
					id: note.id,
					title: note.title,
					updatedAt: note.updatedAt,
				})),
				objectTypes: [...objectTypeCounts.entries()]
					.map(([type, count]) => ({ type, count }))
					.sort((a, b) => a.type.localeCompare(b.type)),
				campaignHealth: insights.campaignHealth,
				coverageGaps: insights.coverageGaps,
				staleThresholdDays: insights.staleAfterDays,
				staleNotes: insights.staleNotes,
			});
		},
	);
}
