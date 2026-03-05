// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetBacklinksTool } from './get-backlinks.js';
import { createFolderId, createNoteId, type Note } from '../../../src/lib/types/note.js';
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

function makeNote(id: string, title: string, content: string): Note {
	return {
		id: createNoteId(id),
		title,
		content,
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

describe('get_backlinks tool', () => {
	it('includes alias match metadata when backlink was resolved through an alias', async () => {
		const target = makeNote('note-city', 'City of Splendors', '# City');
		const source = makeNote('note-log', 'Session Log', 'Met in [[Waterdeep]].');
		const server = new MockMcpServer();
		registerGetBacklinksTool(
			server as never,
			{
				getNote: async (id) => {
					if (String(id) === String(target.id)) return target;
					if (String(id) === String(source.id)) return source;
					return null;
				},
				getLinksTo: async () => [
					{
						sourceId: source.id,
						targetId: target.id,
						displayText: 'Waterdeep',
						position: 8,
						resolvedBy: 'alias',
						resolvedAlias: 'Waterdeep',
						contextSnippet: 'Met in Waterdeep where the market never sleeps.',
					},
				],
				getAllObjects: async () => [],
			} as never,
		);

		const result = await server.handler?.({ id: String(target.id) });
		const envelope = parseToolEnvelope(result as ToolResult);
		if (!envelope || !envelope.ok) {
			throw new Error('Expected a successful tool response');
		}

		expect(envelope.data).toMatchObject([
			{
				sourceId: source.id,
				sourceTitle: source.title,
				kind: 'wikilink',
				matchedByAlias: true,
				matchedAlias: 'Waterdeep',
				contextSnippet: 'Met in Waterdeep where the market never sleeps.',
			},
		]);
	});

	it('includes map placement backlinks for linked POIs', async () => {
		const target = makeNote('note-castle', 'Cragmaw Castle', '# Cragmaw');
		const server = new MockMcpServer();
		registerGetBacklinksTool(
			server as never,
			{
				getNote: async (id) => (String(id) === String(target.id) ? target : null),
				getLinksTo: async () => [],
				getAllObjects: async () => [
					{
						id: 'map-1',
						type: 'map',
						name: 'Sword Coast',
						summary: '',
						tags: ['map'],
						visibility: 'dm_only',
						relationships: [],
						data: {
							filePath: '.vault/assets/maps/sword-coast.png',
							pois: [
								{
									id: 'poi-castle',
									label: 'Cragmaw Castle',
									category: 'dungeon',
									x: 0.42,
									y: 0.66,
									linkedNoteId: String(target.id),
								},
							],
						},
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
					},
				],
			} as never,
		);

		const result = await server.handler?.({ id: String(target.id) });
		const envelope = parseToolEnvelope(result as ToolResult);
		if (!envelope || !envelope.ok) {
			throw new Error('Expected a successful tool response');
		}

		expect(envelope.data).toMatchObject([
			{
				kind: 'map_placement',
				mapId: 'map-1',
				mapName: 'Sword Coast',
				poiId: 'poi-castle',
				coordinates: { x: 0.42, y: 0.66 },
			},
		]);
	});

	it('returns not found when the target note does not exist', async () => {
		const server = new MockMcpServer();
		registerGetBacklinksTool(
			server as never,
			{
				getNote: async () => null,
				getLinksTo: async () => [],
				getAllObjects: async () => [],
			} as never,
		);

		const result = await server.handler?.({ id: 'missing-note' });
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope).toMatchObject({
			ok: false,
			error: {
				code: 'MCP_NOT_FOUND',
			},
		});
	});
});
