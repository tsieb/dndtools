import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { ImageObject } from '../../../src/lib/types/object.js';
import { generateVaultObjectId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { normalizeImageData, summarizeVaultObject } from '../../../src/lib/services/objects.js';
import { formatNoteEmbed } from '../../../src/lib/services/object-embeds.js';
import { objectBaseSchema } from '../shared/object-schema.js';
import { jsonResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';

export function registerCreateImageObjectTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'create_image_object',
		'Create a reusable image note with metadata for embeds.',
		{
			...objectBaseSchema,
			url: z.string().min(1).describe('Image URL or vault-relative path'),
			alt: z.string().optional(),
			caption: z.string().optional(),
			credit: z.string().optional(),
			width: z.number().int().min(1).optional(),
			height: z.number().int().min(1).optional(),
		},
		async (input) => {
			const now = nowISO();
			const object: ImageObject = {
				id: generateVaultObjectId(),
				type: 'image',
				name: input.name,
				summary: input.summary,
				tags: input.tags,
				data: normalizeImageData({
					url: input.url,
					alt: input.alt,
					caption: input.caption,
					credit: input.credit,
					width: input.width,
					height: input.height,
				}),
				createdAt: now,
				updatedAt: now,
			};

			if (!object.summary.trim()) {
				object.summary = summarizeVaultObject(object);
			}

			await storage.saveObject(object);
			const persisted = (await storage.getObject(object.id)) ?? object;
			return jsonResult({
				...objectSummary(persisted),
				embed: formatNoteEmbed({ id: persisted.id }, persisted.name, { view: 'card' }),
			});
		},
	);
}

