import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';

export function registerGetStaleNotesTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_stale_notes',
		'Return stale notes based on an update-age threshold for continuity and recap hygiene.',
		{
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			limit: z.number().int().min(1).max(200).optional().default(50),
		},
		async ({ staleAfterDays, limit }) => {
			const insights = await buildVaultIntelligence(storage, {
				staleAfterDays,
				maxExamples: limit,
			});

			return jsonResult({
				generatedAt: insights.generatedAt,
				staleAfterDays: insights.staleAfterDays,
				totalStaleNotes: insights.metrics.staleNotes,
				staleNotes: insights.staleNotes.slice(0, limit),
			});
		},
	);
}
