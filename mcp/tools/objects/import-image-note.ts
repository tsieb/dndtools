import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { ImageObject } from '../../../src/lib/types/object.js';
import { createFolderId, createNoteId } from '../../../src/lib/types/note.js';
import { generateVaultObjectId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { slugify } from '../../../src/lib/utils/slug.js';
import {
	normalizeImageData,
	normalizeObjectRelationships,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';

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

function normalizeVaultFolder(folder: string): string {
	return folder.replace(/^\/+/, '').replace(/\\/g, '/');
}

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
			relationships: z
				.array(
					z.object({
						type: z.enum(['parent', 'child', 'ally', 'enemy', 'appears_in_session']),
						targetId: z.string().optional(),
						sessionId: z.string().optional(),
						description: z.string().optional(),
					}),
				)
				.optional()
				.default([]),
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
			let stats;
			try {
				stats = await fs.stat(sourceAbs);
			} catch {
				return errorResult('Source image file was not found.');
			}
			if (!stats.isFile()) {
				return errorResult('Source path is not a file.');
			}

			const ext = path.extname(sourceAbs).toLowerCase();
			if (!IMAGE_EXTENSIONS.has(ext)) {
				return errorResult('Unsupported image extension.');
			}

			const baseName = input.name?.trim() || path.basename(sourceAbs, ext);
			const slugBase = slugify(baseName) || 'image';
			const targetFolderRel = normalizeVaultFolder(input.assetFolder);
			const vaultDir = await Promise.resolve(storage.getVaultDir());
			const targetDir = path.join(vaultDir, targetFolderRel);
			await fs.mkdir(targetDir, { recursive: true });

			let filename = `${slugBase}${ext}`;
			let destinationAbs = path.join(targetDir, filename);
			if (!input.overwrite) {
				let counter = 2;
				for (;;) {
					try {
						await fs.access(destinationAbs);
						filename = `${slugBase}-${counter}${ext}`;
						destinationAbs = path.join(targetDir, filename);
						counter += 1;
					} catch {
						break;
					}
				}
			}

			if (input.moveFile) {
				await fs.rename(sourceAbs, destinationAbs);
			} else {
				await fs.copyFile(sourceAbs, destinationAbs);
			}

			const now = nowISO();
			const object: ImageObject = {
				id: generateVaultObjectId(),
				type: 'image',
				name: baseName,
				summary: input.summary,
				tags: input.tags,
				relationships: normalizeObjectRelationships(input.relationships),
				data: normalizeImageData({
					url: asFileUri(destinationAbs),
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

			const relativeAssetPath = `${targetFolderRel}/${filename}`.replace(/\/+/g, '/');

			return jsonResult({
				id: object.id,
				type: object.type,
				name: object.name,
				summary: object.summary,
				tags: object.tags,
				filePath: relativeAssetPath,
				url: object.data.url,
				embed: formatNoteEmbed({ id: object.id }, object.name, { view: 'card' }),
			});
		},
	);
}
