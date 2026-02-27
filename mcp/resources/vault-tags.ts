import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileSystemAdapter } from '../storage.js';
import { LEGACY_RESOURCE_URIS, RESOURCE_URIS } from './uri-strategy.js';
import { jsonResourceResult } from './shared/contracts.js';

const tagCountSchema = z
	.object({
		name: z.string().min(1),
		count: z.number().int().nonnegative(),
	})
	.strict();

export function registerVaultTagsResource(server: McpServer, storage: FileSystemAdapter): void {
	const readTags = async (uri: URL) => {
		const tags = await storage.getTagCounts();
		return jsonResourceResult(uri.href, tags, z.array(tagCountSchema));
	};

	server.resource('vault-tags', RESOURCE_URIS.vaultTags, readTags);
	server.resource('vault-tags-legacy', LEGACY_RESOURCE_URIS.vaultTags, readTags);
}
