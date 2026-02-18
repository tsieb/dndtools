import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { VaultObjectType } from '../../../src/lib/types/object.js';
import { formatNoteEmbed } from '../../../src/lib/services/object-embeds.js';
import { jsonResult, textResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';

export function registerListObjectsTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'list_objects',
		'List embeddable note-objects (stat blocks, character sheets, images) with optional filtering.',
		{
			type: z.enum(['stat_block', 'character', 'image']).optional(),
			query: z.string().optional(),
			limit: z.number().int().min(1).max(200).optional().default(50),
		},
		async ({ type, query, limit }) => {
			const objects = await storage.getAllObjects({
				type: type as VaultObjectType | undefined,
				query,
			});
			const payload = objects.slice(0, limit).map((object) => ({
				...objectSummary(object),
				embed: formatNoteEmbed({ id: object.id }, object.name, { view: 'card' }),
			}));

			if (payload.length === 0) {
				return textResult('No objects found.');
			}

			return jsonResult(payload);
		},
	);
}

