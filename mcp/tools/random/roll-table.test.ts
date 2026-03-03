// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerRollTableTool } from './roll-table.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}
}

describe('roll_table MCP tool', () => {
	it('rolls a vault random-table note', async () => {
		const server = new MockMcpServer();
		registerRollTableTool(
			server as never,
			{
				getAllNotes: async () => [
					{
						id: 'table-1',
						title: 'Loot Table',
						content: '```random-table\n2 | Common loot\n1 | Rare loot\n```',
						tags: ['random-table'],
						folder: '/tables',
						updatedAt: '2026-03-03T00:00:00.000Z',
					},
				],
			} as never,
		);
		const handler = server.handlers.get('roll_table');
		expect(handler).toBeTypeOf('function');

		const envelope = parseToolEnvelope(
			await handler!({ name: 'Loot Table', includeSystem: false, maxDepth: 4 }),
		);
		expect(envelope?.ok).toBe(true);
		if (!envelope || !envelope.ok) return;
		const data = envelope.data as { tableName: string; result: string; trace: unknown[] };
		expect(data.tableName).toBe('Loot Table');
		expect(data.result.length).toBeGreaterThan(0);
		expect(data.trace.length).toBeGreaterThan(0);
	});

	it('returns MCP_NOT_FOUND when requested table is missing', async () => {
		const server = new MockMcpServer();
		registerRollTableTool(server as never, { getAllNotes: async () => [] } as never);
		const handler = server.handlers.get('roll_table');
		expect(handler).toBeTypeOf('function');

		const envelope = parseToolEnvelope(await handler!({ name: 'Missing', includeSystem: false }));
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.code).toBe('MCP_NOT_FOUND');
	});

	it('returns MCP_INVALID_INPUT for cyclic nested table references', async () => {
		const server = new MockMcpServer();
		registerRollTableTool(
			server as never,
			{
				getAllNotes: async () => [
					{
						id: 'table-a',
						title: 'A',
						content: '```random-table\n1 | {{table: B}}\n```',
						tags: ['random-table'],
						folder: '/tables',
						updatedAt: '2026-03-03T00:00:00.000Z',
					},
					{
						id: 'table-b',
						title: 'B',
						content: '```random-table\n1 | {{table: A}}\n```',
						tags: ['random-table'],
						folder: '/tables',
						updatedAt: '2026-03-03T00:00:00.000Z',
					},
				],
			} as never,
		);
		const handler = server.handlers.get('roll_table');
		expect(handler).toBeTypeOf('function');

		const envelope = parseToolEnvelope(await handler!({ name: 'A', includeSystem: false }));
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.code).toBe('MCP_INVALID_INPUT');
	});
});
