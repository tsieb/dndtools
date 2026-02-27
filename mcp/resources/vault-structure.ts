import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileSystemAdapter } from '../storage.js';
import { LEGACY_RESOURCE_URIS, RESOURCE_URIS } from './uri-strategy.js';
import { jsonResourceResult } from './shared/contracts.js';

const vaultStructurePayloadSchema = z
	.object({
		totalNotes: z.number().int().nonnegative(),
		folders: z.array(
			z
				.object({
					path: z.string().min(1),
					noteCount: z.number().int().nonnegative(),
				})
				.strict(),
		),
	})
	.strict();

export function registerVaultStructureResource(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	const readStructure = async (uri: URL) => {
		const notes = await storage.getAllNotes();
		const counts = new Map<string, number>();

		for (const note of notes) {
			if (note.deleted) continue;
			counts.set(note.folder, (counts.get(note.folder) ?? 0) + 1);
		}

		return jsonResourceResult(
			uri.href,
			{
				totalNotes: notes.filter((note) => !note.deleted).length,
				folders: [...counts.entries()]
					.map(([path, noteCount]) => ({ path, noteCount }))
					.sort((a, b) => a.path.localeCompare(b.path)),
			},
			vaultStructurePayloadSchema,
		);
	};

	server.resource('vault-structure', RESOURCE_URIS.vaultStructure, readStructure);
	server.resource('vault-structure-legacy', LEGACY_RESOURCE_URIS.vaultStructure, readStructure);
}
