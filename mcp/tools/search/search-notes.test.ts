// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerSearchNotesTool } from './search-notes.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handler: ToolHandler | null = null;

	tool(
		_name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handler = handler;
	}
}

function unwrap(result: ToolResult): unknown {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return null;
	return envelope.data;
}

describe('search_notes tool', () => {
	it('filters results by map scope when mapId is provided', async () => {
		const server = new MockMcpServer();
		registerSearchNotesTool(
			server as never,
			{
				searchNotes: async () => [
					{
						score: 20,
						note: {
							id: 'note-world',
							title: 'World Almanac',
							content: 'World note',
							folder: '/world',
							filePath: '/world/almanac.md',
							tags: ['world'],
							frontmatter: { mapId: 'map-world' },
						},
					},
					{
						score: 18,
						note: {
							id: 'note-city',
							title: 'Neverwinter',
							content: 'City note',
							folder: '/locations',
							filePath: '/locations/neverwinter.md',
							tags: ['city'],
							frontmatter: { mapId: 'map-city' },
						},
					},
					{
						score: 16,
						note: {
							id: 'note-poi',
							title: 'North Gate',
							content: 'Poi note',
							folder: '/locations',
							filePath: '/locations/north-gate.md',
							tags: ['location'],
							frontmatter: {},
						},
					},
				],
				getAllObjects: async () => [
					{
						id: 'map-world',
						type: 'map',
						name: 'World',
						summary: '',
						tags: ['map'],
						visibility: 'dm_only',
						relationships: [],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
						data: { filePath: '.vault/assets/maps/world.png' },
					},
					{
						id: 'map-region',
						type: 'map',
						name: 'Sword Coast',
						summary: '',
						tags: ['map'],
						visibility: 'dm_only',
						relationships: [],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
						data: { filePath: '.vault/assets/maps/region.png', parentMapId: 'map-world' },
					},
					{
						id: 'map-city',
						type: 'map',
						name: 'Neverwinter',
						summary: '',
						tags: ['map'],
						visibility: 'dm_only',
						relationships: [],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
						data: {
							filePath: '.vault/assets/maps/city.png',
							parentMapId: 'map-region',
							pois: [
								{
									id: 'poi-gate',
									label: 'North Gate',
									category: 'landmark',
									x: 0.2,
									y: 0.4,
									linkedNoteId: 'note-poi',
								},
							],
						},
					},
				],
			} as never,
		);

		const result = await server.handler?.({ query: 'note', limit: 10, mapId: 'map-region' });
		const payload = unwrap(result as ToolResult) as Array<Record<string, unknown>>;
		expect(payload.map((entry) => entry.id)).toEqual(['note-city', 'note-poi']);
	});

	it('returns an empty result set when mapId does not exist', async () => {
		const server = new MockMcpServer();
		registerSearchNotesTool(
			server as never,
			{
				searchNotes: async () => [
					{
						score: 5,
						note: {
							id: 'note-1',
							title: 'Alpha',
							content: 'Alpha content',
							folder: '/',
							filePath: '/alpha.md',
							tags: ['tag'],
							frontmatter: { mapId: 'map-world' },
						},
					},
				],
				getAllObjects: async () => [],
			} as never,
		);

		const result = await server.handler?.({ query: 'alpha', mapId: 'missing-map' });
		const payload = unwrap(result as ToolResult) as Array<Record<string, unknown>>;
		expect(payload).toEqual([]);
	});
});
