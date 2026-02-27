import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';

export function registerGetCampaignHealthTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_campaign_health',
		'Return campaign health scoring and supporting quality metrics for agent planning.',
		{
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			maxGapExamples: z.number().int().min(1).max(50).optional().default(8),
		},
		async ({ staleAfterDays, maxGapExamples }) => {
			const insights = await buildVaultIntelligence(storage, {
				staleAfterDays,
				maxExamples: maxGapExamples,
			});

			return jsonResult({
				generatedAt: insights.generatedAt,
				staleAfterDays: insights.staleAfterDays,
				campaignHealth: insights.campaignHealth,
				metrics: insights.metrics,
				topCoverageGaps: insights.coverageGaps.slice(0, maxGapExamples),
			});
		},
	);
}
