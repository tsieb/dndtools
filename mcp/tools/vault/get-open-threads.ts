import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';
import { buildOpenThreadsReport } from '../../../src/lib/domain/open-threads.js';
import { normalizeWorldCalendar } from '../../../src/lib/domain/world-calendar.js';

const includeKindSchema = z.enum(['quests', 'npcs', 'timeline_events']);

export function registerGetOpenThreadsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_open_threads',
		'Return derived open campaign threads across quests, NPC states, and pending timeline events.',
		{
			limitPerType: z.number().int().min(1).max(200).optional().default(25),
			includeKinds: z.array(includeKindSchema).optional().default([]),
			arcTag: z.string().min(1).optional(),
		},
		async ({ limitPerType, includeKinds, arcTag }) => {
			const resolvedLimitPerType = limitPerType ?? 25;
			const resolvedIncludeKinds = includeKinds ?? [];
			const [notes, objects, worldCalendarRaw] = await Promise.all([
				storage.getAllNotes(),
				storage.getAllObjects(),
				storage.getSetting('worldCalendar'),
			]);
			const calendar = normalizeWorldCalendar(worldCalendarRaw);
			const report = buildOpenThreadsReport(notes, calendar, objects);
			const includeSet = resolvedIncludeKinds.length > 0 ? new Set(resolvedIncludeKinds) : null;
			const arcFilter = arcTag?.trim().toLowerCase();

			const quests = (includeSet && !includeSet.has('quests') ? [] : report.quests).slice(
				0,
				resolvedLimitPerType,
			);
			const npcs = (includeSet && !includeSet.has('npcs') ? [] : report.npcs).slice(
				0,
				resolvedLimitPerType,
			);
			const timelineEvents = (
				includeSet && !includeSet.has('timeline_events') ? [] : report.timelineEvents
			)
				.filter((entry) =>
					arcFilter ? (entry.arcTag ?? '').trim().toLowerCase() === arcFilter : true,
				)
				.slice(0, resolvedLimitPerType);

			return jsonResult({
				generatedAt: report.generatedAt,
				totals: {
					quests: quests.length,
					npcs: npcs.length,
					timelineEvents: timelineEvents.length,
					all: quests.length + npcs.length + timelineEvents.length,
				},
				quests,
				npcs,
				timelineEvents,
			});
		},
	);
}
