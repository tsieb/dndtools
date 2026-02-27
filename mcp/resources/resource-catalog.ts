import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RESOURCE_DISCOVERABILITY, RESOURCE_URIS, RESOURCE_URI_VERSION } from './uri-strategy.js';
import { jsonResourceResult } from './shared/contracts.js';

const resourceCatalogSchema = z
	.object({
		version: z.string().min(1),
		generatedAt: z.string().min(1),
		resources: z.array(
			z
				.object({
					id: z.enum(['note', 'vault-structure', 'vault-tags', 'resource-catalog']),
					title: z.string().min(1),
					description: z.string().min(1),
					canonicalUri: z.string().min(1),
					legacyUris: z.array(z.string()),
					mimeType: z.string().min(1),
					stability: z.literal('stable'),
					useCases: z.array(z.string().min(1)),
				})
				.strict(),
		),
	})
	.strict();

export function registerResourceCatalog(server: McpServer): void {
	server.resource('vault-resource-catalog', RESOURCE_URIS.resourceCatalog, async (uri) => {
		return jsonResourceResult(
			uri.href,
			{
				version: RESOURCE_URI_VERSION,
				generatedAt: new Date().toISOString(),
				resources: RESOURCE_DISCOVERABILITY,
			},
			resourceCatalogSchema,
		);
	});
}
