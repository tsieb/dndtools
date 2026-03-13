import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { ImageObject } from '../../../src/lib/types/object.js';
import { createFolderId, createNoteId } from '../../../src/lib/types/note.js';
import { generateVaultObjectId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	normalizeImageData,
	normalizeObjectRelationships,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';
import { objectRelationshipSchema } from '../shared/object-schema.js';

const IMAGE_EXTENSIONS = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.svg',
	'.bmp',
	'.avif',
]);

function asFileUri(filePath: string): string {
	return `file:///${encodeURI(filePath.replace(/\\/g, '/'))}`;
}

export function registerImportImageNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'import_image_note',
		'Copy or move a local image file into the vault and create an embeddable image note.',
		{
			sourcePath: z.string().min(1).describe('Path to a local image file'),
			name: z.string().optional().describe('Optional image note name (defaults to filename)'),
			summary: z.string().optional().default(''),
			tags: z.array(z.string()).optional().default([]),
			visibility: z.enum(['dm_only', 'shared', 'public']).optional().default('dm_only'),
			relationships: z.array(objectRelationshipSchema).optional().default([]),
			assetFolder: z.string().optional().default('/assets/images'),
			noteFolder: z.string().optional().default('/objects/image'),
			alt: z.string().optional(),
			caption: z.string().optional(),
			credit: z.string().optional(),
			moveFile: z.boolean().optional().default(false),
			overwrite: z.boolean().optional().default(false),
		},
		async (input) => {
			const sourceAbs = path.resolve(input.sourcePath);
			const ext = path.extname(sourceAbs).toLowerCase();
			if (!IMAGE_EXTENSIONS.has(ext)) {
				return errorResult('Unsupported image extension.');
			}

			const baseName = input.name?.trim() || path.basename(sourceAbs, ext);
			let imported;
			try {
				imported = await storage.importAssetFile({
					sourcePath: sourceAbs,
					targetFolder: input.assetFolder,
					suggestedName: baseName,
					moveFile: input.moveFile,
					overwrite: input.overwrite,
				});
			} catch (error) {
				if (error instanceof Error && error.message === 'Source path is not a file.') {
					return errorResult('Source path is not a file.');
				}
				return errorResult('Source image file was not found.');
			}

			const now = nowISO();
			const object: ImageObject = {
				id: generateVaultObjectId(),
				type: 'image',
				name: baseName,
				summary: input.summary,
				tags: input.tags,
				visibility: input.visibility,
				relationships: normalizeObjectRelationships(input.relationships),
				data: normalizeImageData({
					url: asFileUri(imported.absolutePath),
					alt: input.alt,
					caption: input.caption,
					credit: input.credit,
				}),
				createdAt: now,
				updatedAt: now,
			};
			if (!object.summary.trim()) {
				object.summary = summarizeVaultObject(object);
			}

			await storage.saveObject(object);
			const note = await storage.getNote(createNoteId(String(object.id)));
			if (note) {
				await storage.saveNote({
					...note,
					folder: createFolderId(input.noteFolder),
					updatedAt: nowISO(),
				});
			}

			return jsonResult({
				id: object.id,
				type: object.type,
				name: object.name,
				summary: object.summary,
				tags: object.tags,
				filePath: imported.relativePath,
				url: object.data.url,
				embed: formatNoteEmbed({ id: object.id }, object.name, { view: 'card' }),
			});
		},
	);
}
