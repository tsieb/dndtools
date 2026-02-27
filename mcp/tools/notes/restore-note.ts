import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerRestoreNoteTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'restore_note',
		'Restore a soft-deleted note from trash.',
		{
			id: z.string().min(1).describe('Note id'),
		},
		async ({ id }) => {
			const note = await storage.getNote(createNoteId(id));
			if (!note) {
				return errorResult('Note not found.');
			}
			if (!note.deleted) {
				return jsonResult({
					id: note.id,
					title: note.title,
					status: 'active' as const,
					changed: false,
				});
			}

			await storage.restoreNote(note.id);
			return jsonResult({
				id: note.id,
				title: note.title,
				status: 'active' as const,
				changed: true,
			});
		},
	);
}
