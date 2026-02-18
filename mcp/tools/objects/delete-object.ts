import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createVaultObjectId } from '../../../src/lib/types/object.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerDeleteObjectTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'delete_object',
		'Delete an embeddable note-object by id. Existing embeds remain but render as missing.',
		{
			id: z.string().min(1).describe('Object id'),
		},
		async ({ id }) => {
			const objectId = createVaultObjectId(id);
			const existing = await storage.getObject(objectId);
			if (!existing) {
				return errorResult('Object not found.');
			}

			await storage.deleteObject(objectId);
			return jsonResult({
				id: existing.id,
				type: existing.type,
				name: existing.name,
				deleted: true,
			});
		},
	);
}

