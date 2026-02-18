import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';
import { createNoteId } from '../../src/lib/types/note.js';

export function registerNoteResource(server: McpServer, storage: FileSystemAdapter): void {
	server.resource('note', new ResourceTemplate('note://{id}', { list: undefined }), async (uri, params) => {
		const id = String(params.id ?? '');
		const note = await storage.getNote(createNoteId(id));
		if (!note) {
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: 'text/plain',
						text: 'Note not found',
					},
				],
			};
		}

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'text/markdown',
					text: note.content,
				},
			],
		};
	});
}
