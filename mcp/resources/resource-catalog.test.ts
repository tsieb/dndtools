// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerResourceCatalog } from './resource-catalog.js';
import { registerResources } from './index.js';
import { RESOURCE_URIS, RESOURCE_URI_VERSION } from './uri-strategy.js';

type ResourceHandler = (...args: unknown[]) => Promise<{
	contents: Array<{ uri: string; mimeType: string; text: string }>;
}>;

class MockMcpServer {
	resources = new Map<string, { uri: unknown; handler: ResourceHandler }>();

	resource(name: string, uri: unknown, handler: ResourceHandler): void {
		this.resources.set(name, { uri, handler });
	}
}

describe('resource catalog', () => {
	it('publishes discoverability metadata for canonical resource URIs', async () => {
		const server = new MockMcpServer();
		registerResourceCatalog(server as never);

		const entry = server.resources.get('vault-resource-catalog');
		expect(entry).toBeTruthy();

		const result = await entry?.handler(new URL(RESOURCE_URIS.resourceCatalog));
		const payload = JSON.parse(result?.contents[0]?.text ?? '{}') as {
			version?: string;
			resources?: Array<{ canonicalUri: string; id: string; legacyUris?: string[] }>;
		};

		expect(payload.version).toBe(RESOURCE_URI_VERSION);
		expect(payload.resources?.length).toBeGreaterThan(0);
		expect(
			payload.resources?.every((resource) => resource.canonicalUri.startsWith('dndtools://v1/')),
		).toBe(true);
		expect(payload.resources?.find((resource) => resource.id === 'note')?.legacyUris).toContain(
			'note://{id}',
		);
	});

	it('registers canonical and legacy resource aliases', () => {
		const server = new MockMcpServer();
		registerResources(
			server as never,
			{
				getNote: async () => null,
				getAllNotes: async () => [],
				getTagCounts: async () => [],
			} as never,
		);

		expect([...server.resources.keys()]).toEqual([
			'note',
			'note-legacy',
			'vault-structure',
			'vault-structure-legacy',
			'vault-tags',
			'vault-tags-legacy',
			'vault-resource-catalog',
		]);
	});
});
