import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import {
	buildVaultIntelligence,
	DEFAULT_MAX_EXAMPLES,
	DEFAULT_STALE_AFTER_DAYS,
} from './vault-intelligence.js';

export function registerGetContinuityCheckBundleTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'get_continuity_check_bundle',
		'Build a continuity-check bundle with health scoring, stale risks, and link hotspots.',
		{
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			maxExamples: z.number().int().min(1).max(100).optional().default(DEFAULT_MAX_EXAMPLES),
		},
		async ({ staleAfterDays, maxExamples }) => {
			const insights = await buildVaultIntelligence(storage, { staleAfterDays, maxExamples });

			const continuityRisks = insights.coverageGaps.filter(
				(gap) =>
					gap.severity === 'high' || gap.key === 'duplicate_titles' || gap.key === 'stale_notes',
			);

			return jsonResult({
				bundle: 'continuity_check',
				generatedAt: insights.generatedAt,
				campaignHealth: insights.campaignHealth,
				continuityRisks: continuityRisks.slice(0, maxExamples),
				linkHotspots: insights.topLinkedNotes.slice(0, maxExamples),
				staleNotes: insights.staleNotes.slice(0, maxExamples),
				recommendedToolFlow: [
					'get_campaign_health',
					'get_coverage_gaps',
					'get_backlinks',
					'read_note',
				],
				agentChecklist: [
					'Confirm duplicate titles are intentionally distinct before generating narrative.',
					'Check stale notes for outdated facts before session recap.',
					'Use backlinks on hotspot notes to validate canonical source-of-truth entries.',
				],
			});
		},
	);
}
