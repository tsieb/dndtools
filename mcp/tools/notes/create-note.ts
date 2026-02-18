import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { Note } from '../../../src/lib/types/note.js';
import { createFolderId } from '../../../src/lib/types/note.js';
import { generateNoteId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { frontmatterSchema } from '../shared/frontmatter.js';
import { jsonResult } from '../shared/response.js';

export function registerCreateNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'create_note',
		'Create a new note with managed metadata and optional custom frontmatter.',
		{
			title: z.string().min(1).describe('Note title'),
			content: z.string().optional().default('').describe('Markdown content'),
			folder: z.string().optional().default('/').describe('Folder path'),
			tags: z.array(z.string()).optional().default([]).describe('Tag list without # prefix'),
			frontmatter: frontmatterSchema
				.optional()
				.default({})
				.describe('Custom frontmatter fields only'),
		},
		async ({ title, content, folder, tags, frontmatter }) => {
			const now = nowISO();
			const note: Note = {
				id: generateNoteId(),
				title,
				content,
				folder: createFolderId(folder),
				tags,
				frontmatter,
				createdAt: now,
				updatedAt: now,
				deleted: false,
				deletedAt: null,
				pinned: false,
				pinnedAt: null,
			};

			await storage.saveNote(note);
			const persisted = (await storage.getNote(note.id)) ?? note;
			await storage.resolveAndIndexLinks(persisted.id, persisted.content);

			return jsonResult({
				id: persisted.id,
				title: persisted.title,
				folder: persisted.folder,
				filePath: persisted.filePath ?? null,
				tags: persisted.tags,
			});
		},
	);
}
