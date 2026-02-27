// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerResources } from './index.js';
import { resourceResponseSchema } from './shared/contracts.js';

type ResourceHandler = (uri: URL, params?: Record<string, unknown>) => Promise<unknown>;

class MockMcpServer {
	handlers = new Map<string, ResourceHandler>();

	resource(
		name: string,
		_uriOrTemplate: unknown,
		handler: (uri: URL, params: Record<string, unknown>) => Promise<unknown>,
	): void {
		this.handlers.set(name, handler);
	}
}

function makeStorage(): Record<string, (...args: unknown[]) => Promise<unknown>> {
	return {
		getNote: async (id) =>
			String(id) === 'note-1'
				? {
						id: 'note-1',
						title: 'Alpha',
						content: '# Alpha',
					}
				: null,
		getAllNotes: async () => [
			{ id: 'note-1', folder: '/', deleted: false },
			{ id: 'note-2', folder: '/lore', deleted: false },
		],
		getTagCounts: async () => [
			{ name: 'lore', count: 1 },
			{ name: 'npc', count: 2 },
		],
	};
}

describe('MCP resource contracts', () => {
	it('returns schema-valid responses for every registered resource', async () => {
		const server = new MockMcpServer();
		registerResources(server as never, makeStorage() as never);

		const resourceRuns: Array<{
			name: string;
			uri: URL;
			params?: Record<string, unknown>;
		}> = [
			{ name: 'note', uri: new URL('dndtools://v1/notes/note-1'), params: { id: 'note-1' } },
			{ name: 'note-legacy', uri: new URL('note://note-1'), params: { id: 'note-1' } },
			{ name: 'vault-structure', uri: new URL('dndtools://v1/vault/structure') },
			{ name: 'vault-structure-legacy', uri: new URL('vault://structure') },
			{ name: 'vault-tags', uri: new URL('dndtools://v1/vault/tags') },
			{ name: 'vault-tags-legacy', uri: new URL('vault://tags') },
			{ name: 'vault-resource-catalog', uri: new URL('dndtools://v1/resources/catalog') },
		];

		for (const run of resourceRuns) {
			const handler = server.handlers.get(run.name);
			expect(handler, `Missing handler for resource ${run.name}`).toBeTypeOf('function');
			const result = await handler!(run.uri, run.params ?? {});
			const validation = resourceResponseSchema.safeParse(result);
			expect(validation.success, `Invalid resource response for ${run.name}`).toBe(true);
		}
	});

	it('validates note resource params strictly', async () => {
		const server = new MockMcpServer();
		registerResources(server as never, makeStorage() as never);
		const handler = server.handlers.get('note');
		expect(handler).toBeTypeOf('function');

		const result = await handler!(new URL('dndtools://v1/notes/missing'), {});
		const parsed = resourceResponseSchema.parse(result);
		expect(parsed.contents[0]?.mimeType).toBe('text/plain');
		expect(parsed.contents[0]?.text).toBe('Invalid note resource id.');
	});
});
