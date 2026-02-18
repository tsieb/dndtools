import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createFolderId } from '../../../src/lib/types/note.js';
import { jsonResult } from '../shared/response.js';
import { noteSummary } from '../shared/note-summary.js';

export function registerListNotesTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'list_notes',
		'List notes with optional filters (folder, tag, includeDeleted, limit). Returns note metadata without full content.',
		{
			folder: z.string().optional().describe('Folder path filter, e.g. "/campaign/npcs"'),
			tag: z.string().optional().describe('Tag filter without # prefix'),
			includeDeleted: z.boolean().optional().default(false),
			limit: z.number().int().min(1).max(500).optional().default(100),
		},
		async ({ folder, tag, includeDeleted, limit }) => {
			let notes;

			if (folder) {
				notes = await storage.getNotesByFolder(createFolderId(folder));
			} else if (tag) {
				notes = await storage.getNotesByTag(tag);
			} else {
				notes = await storage.getAllNotes({ includeDeleted });
			}

			return jsonResult(notes.slice(0, limit).map(noteSummary));
		},
	);
}
