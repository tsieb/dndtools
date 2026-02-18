import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { errorResult, textResult } from '../shared/response.js';

export function registerDeleteNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'delete_note',
		'Delete a note by id. Soft-delete by default; permanent=true removes the file.',
		{
			id: z.string().min(1).describe('Note id'),
			permanent: z.boolean().optional().default(false),
		},
		async ({ id, permanent }) => {
			const note = await storage.getNote(createNoteId(id));
			if (!note) {
				return errorResult('Note not found.');
			}

			await storage.deleteNote(note.id, permanent);
			return textResult(
				permanent
					? `Permanently deleted "${note.title}".`
					: `Moved "${note.title}" to trash.`,
			);
		},
	);
}
