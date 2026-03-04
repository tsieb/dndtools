// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetLinkGraphTool } from './get-link-graph.js';
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

function payload(result: ToolResult): Record<string, unknown> {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return {};
	return envelope.data as Record<string, unknown>;
}

describe('get_link_graph tool', () => {
	it('includes map nodes and map/location relationship edges', async () => {
		const server = new MockMcpServer();
		registerGetLinkGraphTool(
			server as never,
			{
				getIndexEntries: () => [
					{
						id: 'loc-note',
						title: 'Cragmaw Castle',
						folder: '/locations',
						filePath: '/locations/cragmaw-castle.md',
						tags: ['location'],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
						deleted: false,
						deletedAt: null,
					},
				],
				getAllLinksFromIndex: () => [],
				getAllObjects: async () => [
					{
						id: 'map-1',
						type: 'map',
						name: 'Cragmaw Floorplan',
						summary: '',
						tags: ['dungeon'],
						visibility: 'dm_only',
						relationships: [],
						data: {
							filePath: '.vault/assets/maps/cragmaw-floorplan.png',
							areaNoteId: 'loc-note',
						},
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z',
					},
				],
			} as never,
		);

		const result = await server.handler?.({ includeQuality: false, includeIsolated: true });
		expect(result).toBeTruthy();
		const data = payload(result as ToolResult);
		const nodes = (data.nodes as Array<Record<string, unknown>>) ?? [];
		const edges = (data.edges as Array<Record<string, unknown>>) ?? [];

		expect(nodes.some((node) => node.id === 'map-1' && node.kind === 'map')).toBe(true);
		expect(edges.some((edge) => edge.kind === 'map_area' && edge.sourceId === 'map-1')).toBe(true);
		expect(
			edges.some(
				(edge) =>
					edge.kind === 'location_map' && edge.sourceId === 'loc-note' && edge.targetId === 'map-1',
			),
		).toBe(true);
	});
});
