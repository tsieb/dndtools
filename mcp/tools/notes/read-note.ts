import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerReadNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'read_note',
		'Read a note by id or title and return full markdown plus metadata.',
		{
			id: z.string().optional().describe('Note id'),
			title: z.string().optional().describe('Case-insensitive note title'),
		},
		async ({ id, title }) => {
			if (!id && !title) {
				return errorResult('Either id or title must be provided.');
			}

			const note = id
				? await storage.getNote(createNoteId(id))
				: await storage.resolveTitle(title ?? '');

			if (!note) {
				return errorResult('Note not found.');
			}

			return jsonResult({
				id: note.id,
				title: note.title,
				folder: note.folder,
				filePath: note.filePath ?? null,
				tags: note.tags,
				visibility: note.visibility,
				frontmatter: note.frontmatter,
				content: note.content,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				deleted: note.deleted,
				pinned: note.pinned,
			});
		},
	);
}
