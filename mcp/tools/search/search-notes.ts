import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult, textResult } from '../shared/response.js';

export function registerSearchNotesTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'search_notes',
		'Search notes by title, tags, and body content with weighted scoring.',
		{
			query: z.string().min(1).describe('Search query'),
			limit: z.number().int().min(1).max(200).optional().default(20),
		},
		async ({ query, limit }) => {
			const results = await storage.searchNotes(query);
			const payload = results.slice(0, limit).map(({ note, score }) => ({
				id: note.id,
				title: note.title,
				folder: note.folder,
				filePath: note.filePath ?? null,
				tags: note.tags,
				score,
				snippet: note.content.slice(0, 240),
			}));

			if (payload.length === 0) {
				return textResult(`No results for "${query}".`);
			}

			return jsonResult(payload);
		},
	);
}
