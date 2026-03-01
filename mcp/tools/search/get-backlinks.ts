import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { buildContextSnippetAtPosition } from '../../../src/lib/domain/backlink-context.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerGetBacklinksTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'get_backlinks',
		'Return all notes that link to a target note.',
		{
			id: z.string().min(1).describe('Target note id'),
		},
		async ({ id }) => {
			const target = await storage.getNote(createNoteId(id));
			if (!target) {
				return errorResult('Note not found.');
			}

			const backlinks = await storage.getLinksTo(target.id);

			const results = await Promise.all(
				backlinks.map(async (link) => {
					const source = await storage.getNote(link.sourceId);
					return {
						sourceId: link.sourceId,
						sourceTitle: source?.title ?? 'Unknown',
						displayText: link.displayText,
						position: link.position,
						matchedByAlias: link.resolvedBy === 'alias',
						matchedAlias: link.resolvedBy === 'alias' ? (link.resolvedAlias ?? null) : null,
						contextSnippet: source
							? buildContextSnippetAtPosition(source.content, link.position)
							: 'Linked reference unavailable.',
					};
				}),
			);

			return jsonResult(results);
		},
	);
}
