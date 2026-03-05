import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import type { MapObject } from '../../../src/lib/types/object.js';
import { collectMapPlacementsForNote } from '../../../src/lib/domain/map-pois.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerGetBacklinksTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_backlinks',
		'Return all notes that link to a target note.',
		{
			id: z.string().min(1).describe('Target note id'),
		},
		async ({ id }) => {
			const target = await storage.getNote(createNoteId(id));
			if (!target) {
				return errorResult('Note not found.');
			}

			const backlinks = await storage.getLinksTo(target.id);
			const mapObjects = (await storage.getAllObjects({ type: 'map' })).filter(
				(object): object is MapObject => object.type === 'map',
			);
			const mapPlacements = collectMapPlacementsForNote(
				mapObjects,
				String(target.id),
				target.frontmatter,
			).map((placement) => ({
				sourceId: placement.mapId,
				sourceTitle: placement.mapName,
				displayText: placement.poiLabel,
				position: 0,
				kind: 'map_placement' as const,
				mapId: placement.mapId,
				mapName: placement.mapName,
				poiId: placement.poiId,
				coordinates: placement.coordinates,
				matchedByAlias: false,
				matchedAlias: null,
				contextSnippet: `Pinned on map at (${placement.coordinates.x.toFixed(3)}, ${placement.coordinates.y.toFixed(3)}).`,
			}));

			const results = await Promise.all(
				backlinks.map(async (link) => {
					const source = await storage.getNote(link.sourceId);
					return {
						sourceId: link.sourceId,
						sourceTitle: source?.title ?? 'Unknown',
						displayText: link.displayText,
						position: link.position,
						kind: 'wikilink' as const,
						matchedByAlias: link.resolvedBy === 'alias',
						matchedAlias: link.resolvedBy === 'alias' ? (link.resolvedAlias ?? null) : null,
						contextSnippet: link.contextSnippet ?? 'Linked reference unavailable.',
					};
				}),
			);

			return jsonResult([...results, ...mapPlacements]);
		},
	);
}
