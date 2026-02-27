import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';

function parseTimestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function registerGetSessionPrepBundleTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'get_session_prep_bundle',
		'Build a session-prep bundle with priority notes, stale risks, and board context.',
		{
			focusTag: z.string().min(1).optional(),
			staleAfterDays: z
				.number()
				.int()
				.min(1)
				.max(3650)
				.optional()
				.default(DEFAULT_STALE_AFTER_DAYS),
			recentLimit: z.number().int().min(1).max(100).optional().default(12),
			boardLimit: z.number().int().min(1).max(25).optional().default(8),
		},
		async ({ focusTag, staleAfterDays, recentLimit, boardLimit }) => {
			const [insights, notes, boards] = await Promise.all([
				buildVaultIntelligence(storage, {
					staleAfterDays,
					maxExamples: Math.max(recentLimit, boardLimit),
				}),
				storage.getAllNotes(),
				storage.getSessionBoards(),
			]);

			const normalizedFocusTag = focusTag?.trim().toLowerCase();
			const activeNotes = notes.filter((note) => !note.deleted);
			const scopedNotes = normalizedFocusTag
				? activeNotes.filter((note) =>
						note.tags.some((tag) => tag.toLowerCase() === normalizedFocusTag),
					)
				: activeNotes;

			const recentScopedNotes = [...scopedNotes]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, recentLimit)
				.map((note) => ({
					id: note.id,
					title: note.title,
					folder: note.folder,
					tags: note.tags,
					updatedAt: note.updatedAt,
				}));

			const staleCutoff = Date.now() - staleAfterDays * 24 * 60 * 60 * 1000;
			const staleScopedNotes = scopedNotes
				.filter((note) => parseTimestamp(note.updatedAt) <= staleCutoff)
				.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
				.slice(0, recentLimit)
				.map((note) => ({
					id: note.id,
					title: note.title,
					folder: note.folder,
					tags: note.tags,
					updatedAt: note.updatedAt,
				}));

			const boardContext = [...boards]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, boardLimit)
				.map((board) => ({
					id: board.id,
					name: board.name,
					updatedAt: board.updatedAt,
					tileCount: board.tiles.length,
				}));

			const continuityFlags = insights.coverageGaps
				.filter((gap) => gap.severity === 'high' || gap.severity === 'medium')
				.slice(0, 6);

			return jsonResult({
				bundle: 'session_prep',
				generatedAt: insights.generatedAt,
				focusTag: normalizedFocusTag ?? null,
				campaignHealth: insights.campaignHealth,
				recentScopedNotes,
				staleScopedNotes,
				boardContext,
				continuityFlags,
				recommendedToolFlow: [
					'get_campaign_health',
					'get_coverage_gaps',
					'search_notes',
					'read_note',
				],
				safeOperatingPattern:
					'Keep edits staged by default; use this bundle to prioritize what to inspect before mutation.',
			});
		},
	);
}
