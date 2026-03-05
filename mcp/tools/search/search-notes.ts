import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { notesInMapScope } from '../../../src/lib/domain/map-atlas.js';
import type { MapObject } from '../../../src/lib/types/object.js';
import { jsonResult } from '../shared/response.js';

export function registerSearchNotesTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'search_notes',
		'Search notes by title, tags, and body content with weighted scoring.',
		{
			query: z.string().min(1).describe('Search query'),
			limit: z.number().int().min(1).max(200).optional().default(20),
			mapId: z
				.string()
				.min(1)
				.optional()
				.describe('Optional map id; filters to notes geographically contained within this map.'),
		},
		async ({ query, limit, mapId }) => {
			const results = await storage.searchNotes(query);
			const normalizedMapId = mapId?.trim();
			let filteredResults = results;
			if (normalizedMapId) {
				const mapObjects = (await storage.getAllObjects({ type: 'map' })).filter(
					(object): object is MapObject => object.type === 'map',
				);
				if (!mapObjects.some((map) => String(map.id) === normalizedMapId)) {
					return jsonResult([]);
				}
				const scopedNoteIds = new Set(
					notesInMapScope(
						results.map(({ note }) => note),
						mapObjects,
						normalizedMapId,
					).map((note) => String(note.id)),
				);
				filteredResults = results.filter(({ note }) => scopedNoteIds.has(String(note.id)));
			}
			const payload = filteredResults.slice(0, limit).map(({ note, score }) => ({
				id: note.id,
				title: note.title,
				folder: note.folder,
				filePath: note.filePath ?? null,
				tags: note.tags,
				score,
				snippet: note.content.slice(0, 240),
			}));

			return jsonResult(payload);
		},
	);
}
