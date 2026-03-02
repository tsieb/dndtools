import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { collectCalendarEventEntries } from '../../../src/lib/domain/world-calendar-events.js';
import {
	formatWorldDate,
	normalizeWorldCalendar,
	parseWorldDateInput,
} from '../../../src/lib/domain/world-calendar.js';
import { errorResult, jsonResult } from '../shared/response.js';

const worldDateInputSchema = z.union([z.string().min(1), z.number().int()]);

export function registerGetCalendarEventsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_calendar_events',
		'Return timeline events and session notes that fall within an in-world date range.',
		{
			dateRange: z
				.object({
					from: worldDateInputSchema,
					to: worldDateInputSchema.optional(),
				})
				.strict(),
			includeKinds: z
				.array(z.enum(['timeline_event', 'session_note']))
				.optional()
				.default([]),
			limit: z.number().int().min(1).max(500).optional().default(200),
		},
		async ({ dateRange, includeKinds, limit }) => {
			const [notes, worldCalendarRaw] = await Promise.all([
				storage.getAllNotes(),
				storage.getSetting('worldCalendar'),
			]);
			const worldCalendar = normalizeWorldCalendar(worldCalendarRaw);
			const fromDate = parseWorldDateInput(worldCalendar, dateRange.from);
			const toDate = parseWorldDateInput(worldCalendar, dateRange.to ?? dateRange.from);
			if (!fromDate || !toDate) {
				return errorResult('Invalid world date range.', {
					code: 'MCP_INVALID_INPUT',
					hint: 'Use a day offset integer or YYYY-MM-DD world date format.',
					tool: 'get_calendar_events',
				});
			}
			const fromDayOffset = Math.min(fromDate.dayOffset, toDate.dayOffset);
			const toDayOffset = Math.max(fromDate.dayOffset, toDate.dayOffset);
			const kindFilter = includeKinds.length > 0 ? new Set(includeKinds) : null;

			const events = collectCalendarEventEntries(notes, worldCalendar, {
				fromDayOffset,
				toDayOffset,
			})
				.filter((event) => (kindFilter ? kindFilter.has(event.kind) : true))
				.slice(0, limit)
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
				dateRange: {
					fromDayOffset,
					toDayOffset,
					fromShort: formatWorldDate(worldCalendar, fromDayOffset, 'short'),
					toShort: formatWorldDate(worldCalendar, toDayOffset, 'short'),
					fromIso: formatWorldDate(worldCalendar, fromDayOffset, 'iso'),
					toIso: formatWorldDate(worldCalendar, toDayOffset, 'iso'),
				},
				totalEvents: events.length,
				events,
			});
		},
	);
}
