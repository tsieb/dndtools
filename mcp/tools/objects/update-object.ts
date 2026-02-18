import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createVaultObjectId } from '../../../src/lib/types/object.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	normalizeCharacterData,
	normalizeImageData,
	normalizeStatBlockData,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';

export function registerUpdateObjectTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'update_object',
		'Update an existing embeddable note-object by id. Supports metadata and structured data updates.',
		{
			id: z.string().min(1).describe('Object id'),
			name: z.string().optional(),
			summary: z.string().optional(),
			tags: z.array(z.string()).optional(),
			data: z.record(z.string(), z.unknown()).optional(),
			dataMode: z.enum(['merge', 'replace']).optional().default('merge'),
		},
		async ({ id, name, summary, tags, data, dataMode }) => {
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

