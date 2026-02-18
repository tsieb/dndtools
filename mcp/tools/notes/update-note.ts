import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { Note } from '../../../src/lib/types/note.js';
import { createFolderId, createNoteId } from '../../../src/lib/types/note.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { frontmatterSchema } from '../shared/frontmatter.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerUpdateNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'update_note',
		'Update an existing note by id. Only provided fields are changed.',
		{
			id: z.string().min(1).describe('Note id'),
			title: z.string().optional(),
			content: z.string().optional(),
			folder: z.string().optional(),
			tags: z.array(z.string()).optional(),
			frontmatter: frontmatterSchema.optional(),
			frontmatterMode: z.enum(['merge', 'replace']).optional().default('merge'),
		},
		async ({ id, title, content, folder, tags, frontmatter, frontmatterMode }) => {
			const existing = await storage.getNote(createNoteId(id));
			if (!existing) {
				return errorResult('Note not found.');
			}

			const nextFrontmatter =
				frontmatter === undefined
					? existing.frontmatter
					: frontmatterMode === 'replace'
						? frontmatter
						: { ...existing.frontmatter, ...frontmatter };

			const updated: Note = {
				...existing,
				title: title ?? existing.title,
				content: content ?? existing.content,
				folder: folder ? createFolderId(folder) : existing.folder,
				tags: tags ?? existing.tags,
				frontmatter: nextFrontmatter,
				updatedAt: nowISO(),
			};

			await storage.saveNote(updated);
			const persisted = (await storage.getNote(updated.id)) ?? updated;
			if (content !== undefined || title !== undefined || folder !== undefined) {
				await storage.resolveAndIndexLinks(persisted.id, persisted.content);
			}

			return jsonResult({
				id: persisted.id,
				title: persisted.title,
				folder: persisted.folder,
				filePath: persisted.filePath ?? null,
				tags: persisted.tags,
				updatedAt: persisted.updatedAt,
			});
		},
	);
}
