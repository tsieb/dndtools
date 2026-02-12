import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from './storage.js';
import { createNoteId } from '../src/lib/types/note.js';

/** Register all MCP resources on the server */
export function registerResources(server: McpServer, storage: FileSystemAdapter): void {
	// --- note://{id} ---
	server.resource(
		'note',
		new ResourceTemplate('note://{id}', { list: undefined }),
		async (uri, params) => {
			const id = params.id as string;
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
		},
	);

	// --- vault://structure ---
	server.resource('vault-structure', 'vault://structure', async (uri) => {
		const notes = await storage.getAllNotes();
		const folders = new Map<string, number>();

		for (const note of notes) {
			const folder = String(note.folder);
			folders.set(folder, (folders.get(folder) ?? 0) + 1);
		}

		const structure = {
			totalNotes: notes.length,
			folders: Array.from(folders.entries())
				.map(([path, count]) => ({ path, noteCount: count }))
				.sort((a, b) => a.path.localeCompare(b.path)),
		};

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(structure, null, 2),
				},
			],
		};
	});

	// --- vault://tags ---
	server.resource('vault-tags', 'vault://tags', async (uri) => {
		const tags = await storage.getTagCounts();

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(tags, null, 2),
				},
			],
		};
	});
}
