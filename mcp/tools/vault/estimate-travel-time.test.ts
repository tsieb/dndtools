// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerEstimateTravelTimeTool } from './estimate-travel-time.js';
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

describe('estimate_travel_time tool', () => {
	it('returns 5e pace estimates for a configured map route', async () => {
		const server = new MockMcpServer();
		registerEstimateTravelTimeTool(
			server as never,
			{
				getObject: async () => ({
					id: 'map-1',
					type: 'map',
					name: 'Sword Coast',
					summary: '',
					tags: ['map'],
					visibility: 'dm_only',
					relationships: [],
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
					data: {
						filePath: '.vault/assets/maps/sword-coast.png',
						width: 1000,
						height: 500,
						scale: {
							unitsPerGridSquare: 1,
							unitLabel: 'mi',
						},
						grid: {
							type: 'square',
							visible: true,
							originX: 0,
							originY: 0,
							cellSize: 50,
						},
						routes: [
							{
								id: 'route-north-road',
								name: 'North Road',
								style: 'straight',
								waypoints: [
									{ x: 0.1, y: 0.2 },
									{ x: 0.5, y: 0.2 },
									{ x: 0.8, y: 0.4 },
								],
							},
						],
					},
				}),
			} as never,
		);

		const result = await server.handler?.({ mapId: 'map-1', routeName: 'North Road' });
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope?.ok).toBe(true);
		if (!envelope || !envelope.ok) return;

		const payload = envelope.data as {
			map: { id: string };
			route: { name: string; waypointCount: number };
			pace: { normal: { hours: number } };
		};
		expect(payload.map.id).toBe('map-1');
		expect(payload.route.name).toBe('North Road');
		expect(payload.route.waypointCount).toBe(3);
		expect(payload.pace.normal.hours).toBeGreaterThan(0);
	});

	it('returns MCP_NOT_FOUND when the route does not exist', async () => {
		const server = new MockMcpServer();
		registerEstimateTravelTimeTool(
			server as never,
			{
				getObject: async () => ({
					id: 'map-1',
					type: 'map',
					name: 'Sword Coast',
					summary: '',
					tags: ['map'],
					visibility: 'dm_only',
					relationships: [],
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
					data: {
						filePath: '.vault/assets/maps/sword-coast.png',
						width: 1000,
						height: 500,
						scale: {
							unitsPerGridSquare: 1,
							unitLabel: 'mi',
						},
						grid: {
							type: 'square',
							visible: true,
							originX: 0,
							originY: 0,
							cellSize: 50,
						},
						routes: [],
					},
				}),
			} as never,
		);

		const result = await server.handler?.({ mapId: 'map-1', routeName: 'Missing Route' });
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.code).toBe('MCP_NOT_FOUND');
	});
});
