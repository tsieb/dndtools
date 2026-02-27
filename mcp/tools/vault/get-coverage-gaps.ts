import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';

export function registerGetCoverageGapsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_coverage_gaps',
		'List campaign coverage gaps (linking, taxonomy, freshness) with remediation guidance.',
		{
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			limit: z.number().int().min(1).max(100).optional().default(20),
		},
		async ({ staleAfterDays, limit }) => {
			const insights = await buildVaultIntelligence(storage, {
				staleAfterDays,
				maxExamples: limit,
			});

			return jsonResult({
				generatedAt: insights.generatedAt,
				staleAfterDays: insights.staleAfterDays,
				totalGaps: insights.coverageGaps.length,
				coverageGaps: insights.coverageGaps.slice(0, limit),
			});
		},
	);
}
