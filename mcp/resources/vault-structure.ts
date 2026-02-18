import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';

export function registerVaultStructureResource(server: McpServer, storage: FileSystemAdapter): void {
	server.resource('vault-structure', 'vault://structure', async (uri) => {
		const notes = await storage.getAllNotes();
		const counts = new Map<string, number>();

		for (const note of notes) {
			if (note.deleted) continue;
			counts.set(note.folder, (counts.get(note.folder) ?? 0) + 1);
		}

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(
						{
							totalNotes: notes.filter((note) => !note.deleted).length,
							folders: [...counts.entries()]
								.map(([path, noteCount]) => ({ path, noteCount }))
								.sort((a, b) => a.path.localeCompare(b.path)),
						},
						null,
						2,
					),
				},
			],
		};
	});
}
