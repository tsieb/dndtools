import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createVaultObjectId } from '../../../src/lib/types/object.js';
import { formatNoteEmbed } from '../../../src/lib/services/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerReadObjectTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'read_object',
		'Read a single embeddable note-object by id, including structured payload and embed token.',
		{
			id: z.string().min(1).describe('Object id'),
		},
		async ({ id }) => {
			const object = await storage.getObject(createVaultObjectId(id));
			if (!object) {
				return errorResult('Object not found.');
			}

			return jsonResult({
				...object,
				embed: formatNoteEmbed({ id: object.id }, object.name, { view: 'card' }),
			});
		},
	);
}

