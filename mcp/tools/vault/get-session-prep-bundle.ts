import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildVaultIntelligence, DEFAULT_STALE_AFTER_DAYS } from './vault-intelligence.js';
import { collectCalendarEventEntries } from '../../../src/lib/domain/world-calendar-events.js';
import {
	formatWorldDate,
	normalizeWorldCalendar,
	parseWorldDateInput,
} from '../../../src/lib/domain/world-calendar.js';

function parseTimestamp(value: string): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function pickActiveLocationNoteId(
	boards: Awaited<ReturnType<FileSystemAdapter['getSessionBoards']>>,
): string | null {
	const sortedBoards = [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	for (const board of sortedBoards) {
		const locationItems = (board.sessionContext?.items ?? [])
			.filter((item) => item.category === 'location')
			.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
		if (locationItems.length > 0) {
			return String(locationItems[0]!.noteId);
		}
	}
	return null;
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
			worldDate: z.union([z.string().min(1), z.number().int()]).optional(),
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
		async ({ focusTag, worldDate, staleAfterDays, recentLimit, boardLimit }) => {
			const [insights, notes, boards, worldCalendarRaw, mapObjects] = await Promise.all([
				buildVaultIntelligence(storage, {
					staleAfterDays,
					maxExamples: Math.max(recentLimit, boardLimit),
				}),
				storage.getAllNotes(),
				storage.getSessionBoards(),
				storage.getSetting('worldCalendar'),
				storage.getAllObjects({ type: 'map' }),
			]);
			const worldCalendar = normalizeWorldCalendar(worldCalendarRaw);
			const parsedWorldDate = parseWorldDateInput(worldCalendar, worldDate);
			const effectiveWorldDateOffset = parsedWorldDate?.dayOffset ?? worldCalendar.currentDayOffset;

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
			const activeLocationNoteId = pickActiveLocationNoteId(boards);
			const activeMap =
				activeLocationNoteId === null
					? null
					: (mapObjects
							.filter((object) => object.type === 'map')
							.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
							.find((object) => object.data.areaNoteId === activeLocationNoteId) ?? null);

			const continuityFlags = insights.coverageGaps
				.filter((gap) => gap.severity === 'high' || gap.severity === 'medium')
				.slice(0, 6);
			const calendarHighlights = collectCalendarEventEntries(activeNotes, worldCalendar, {
				fromDayOffset: effectiveWorldDateOffset - 30,
				toDayOffset: effectiveWorldDateOffset + 90,
			})
				.slice(0, recentLimit)
				.map((event) => ({
					noteId: event.noteId,
					title: event.title,
					kind: event.kind,
					dayOffset: event.dayOffset,
					dateShort: formatWorldDate(worldCalendar, event.dayOffset, 'short'),
					dateIso: formatWorldDate(worldCalendar, event.dayOffset, 'iso'),
					summary: event.summary,
				}));

			return jsonResult({
				bundle: 'session_prep',
				generatedAt: insights.generatedAt,
				worldDate: {
					dayOffset: effectiveWorldDateOffset,
					short: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'short'),
					iso: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'iso'),
				},
				focusTag: normalizedFocusTag ?? null,
				campaignHealth: insights.campaignHealth,
				recentScopedNotes,
				staleScopedNotes,
				calendarHighlights,
				boardContext,
				activeMap: activeMap
					? {
							id: String(activeMap.id),
							name: activeMap.name,
							filePath: activeMap.data.filePath,
							areaNoteId: activeMap.data.areaNoteId ?? null,
							tags: activeMap.tags,
							updatedAt: activeMap.updatedAt,
							scale: activeMap.data.scale ?? null,
							grid: activeMap.data.grid ?? null,
							initialViewport: activeMap.data.initialViewport ?? null,
						}
					: null,
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
