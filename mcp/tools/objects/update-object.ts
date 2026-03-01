import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createVaultObjectId } from '../../../src/lib/types/object.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	normalizeEncounterData,
	normalizeFactionData,
	normalizeCharacterData,
	normalizeImageData,
	normalizeItemData,
	normalizeLocationData,
	normalizeNpcData,
	normalizeObjectRelationships,
	normalizeQuestData,
	normalizeStatBlockData,
	normalizeTimelineEventData,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';
import { objectRelationshipSchema } from '../shared/object-schema.js';

export function registerUpdateObjectTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'update_object',
		'Update an existing embeddable note-object by id. Supports metadata and structured data updates.',
		{
			id: z.string().min(1).describe('Object id'),
			name: z.string().optional(),
			summary: z.string().optional(),
			tags: z.array(z.string()).optional(),
			relationships: z.array(objectRelationshipSchema).optional(),
			data: z.record(z.string(), z.unknown()).optional(),
			dataMode: z.enum(['merge', 'replace']).optional().default('merge'),
		},
		async ({ id, name, summary, tags, relationships, data, dataMode }) => {
			const existing = await storage.getObject(createVaultObjectId(id));
			if (!existing) {
				return errorResult('Object not found.');
			}

			const rawData =
				data === undefined
					? existing.data
					: dataMode === 'replace'
						? data
						: { ...existing.data, ...data };

			const updated = {
				...existing,
				name: name ?? existing.name,
				summary: summary ?? existing.summary,
				tags: tags ?? existing.tags,
				relationships:
					relationships === undefined
						? existing.relationships
						: normalizeObjectRelationships(relationships),
				updatedAt: nowISO(),
			};

			switch (existing.type) {
				case 'stat_block':
					updated.data = normalizeStatBlockData(rawData);
					break;
				case 'character':
					updated.data = normalizeCharacterData(rawData);
					break;
				case 'image':
					updated.data = normalizeImageData(rawData);
					break;
				case 'npc':
					updated.data = normalizeNpcData(rawData);
					break;
				case 'location':
					updated.data = normalizeLocationData(rawData);
					break;
				case 'faction':
					updated.data = normalizeFactionData(rawData);
					break;
				case 'quest':
					updated.data = normalizeQuestData(rawData);
					break;
				case 'item':
					updated.data = normalizeItemData(rawData);
					break;
				case 'encounter':
					updated.data = normalizeEncounterData(rawData);
					break;
				case 'timeline_event':
					updated.data = normalizeTimelineEventData(rawData);
					break;
			}

			if (!updated.summary.trim()) {
				updated.summary = summarizeVaultObject(updated);
			}

			await storage.saveObject(updated);
			const persisted = (await storage.getObject(updated.id)) ?? updated;
			return jsonResult({
				...objectSummary(persisted),
				embed: formatNoteEmbed({ id: persisted.id }, persisted.name, { view: 'card' }),
			});
		},
	);
}
