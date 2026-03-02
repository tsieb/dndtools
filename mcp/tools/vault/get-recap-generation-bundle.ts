import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { getIndexEntriesView } from '../shared/storage-view.js';
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

function defaultSinceIso(now: Date): string {
	const days = 7 * 24 * 60 * 60 * 1000;
	return new Date(now.getTime() - days).toISOString();
}

function toIsoOrDefault(value: string | undefined, fallback: string): string {
	if (!value) return fallback;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

export function registerGetRecapGenerationBundleTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'get_recap_generation_bundle',
		'Build a recap-generation bundle containing recent note/object/board updates and tag momentum.',
		{
			since: z.string().optional().describe('ISO timestamp lower bound; defaults to 7 days ago'),
			worldDate: z.union([z.string().min(1), z.number().int()]).optional(),
			noteLimit: z.number().int().min(1).max(200).optional().default(30),
			objectLimit: z.number().int().min(1).max(100).optional().default(25),
			boardLimit: z.number().int().min(1).max(50).optional().default(20),
		},
		async ({ since, worldDate, noteLimit, objectLimit, boardLimit }) => {
			const now = new Date();
			const effectiveSince = toIsoOrDefault(since, defaultSinceIso(now));

			const [indexEntries, objects, boards, notes, worldCalendarRaw] = await Promise.all([
				getIndexEntriesView(storage),
				storage.getAllObjects(),
				storage.getSessionBoards(),
				storage.getAllNotes(),
				storage.getSetting('worldCalendar'),
			]);
			const worldCalendar = normalizeWorldCalendar(worldCalendarRaw);
			const parsedWorldDate = parseWorldDateInput(worldCalendar, worldDate);
			const effectiveWorldDateOffset = parsedWorldDate?.dayOffset ?? worldCalendar.currentDayOffset;

			const changedNotes = indexEntries
				.filter((entry) => !entry.deleted)
				.filter((entry) => parseTimestamp(entry.updatedAt) >= parseTimestamp(effectiveSince))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, noteLimit)
				.map((entry) => ({
					id: entry.id,
					title: entry.title,
					folder: entry.folder,
					tags: entry.tags,
					updatedAt: entry.updatedAt,
				}));

			const changedObjects = objects
				.filter((object) => parseTimestamp(object.updatedAt) >= parseTimestamp(effectiveSince))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, objectLimit)
				.map((object) => ({
					id: object.id,
					type: object.type,
					name: object.name,
					updatedAt: object.updatedAt,
				}));

			const changedBoards = boards
				.filter((board) => parseTimestamp(board.updatedAt) >= parseTimestamp(effectiveSince))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, boardLimit)
				.map((board) => ({
					id: board.id,
					name: board.name,
					updatedAt: board.updatedAt,
					tileCount: board.tiles.length,
				}));

			const tagMomentum = new Map<string, number>();
			for (const note of changedNotes) {
				for (const tag of note.tags) {
					tagMomentum.set(tag, (tagMomentum.get(tag) ?? 0) + 1);
				}
			}
			const changedNoteIds = new Set(changedNotes.map((note) => note.id));
			const calendarSummaries = collectCalendarEventEntries(notes, worldCalendar)
				.filter((event) => changedNoteIds.has(event.noteId))
				.slice(0, noteLimit)
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
				bundle: 'recap_generation',
				generatedAt: now.toISOString(),
				since: effectiveSince,
				worldDate: {
					dayOffset: effectiveWorldDateOffset,
					short: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'short'),
					iso: formatWorldDate(worldCalendar, effectiveWorldDateOffset, 'iso'),
				},
				changedNotes,
				changedObjects,
				changedBoards,
				calendarSummaries,
				tagMomentum: [...tagMomentum.entries()]
					.map(([tag, count]) => ({ tag, count }))
					.sort((a, b) => {
						if (b.count !== a.count) return b.count - a.count;
						return a.tag.localeCompare(b.tag);
					})
					.slice(0, 20),
				recapPromptTemplate: {
					objective: 'Generate a concise campaign recap from factual vault deltas.',
					constraints: [
						'Use only entities and events present in the bundle.',
						'Flag missing continuity details explicitly instead of inventing them.',
						'List unresolved threads as bullet points.',
					],
				},
			});
		},
	);
}
