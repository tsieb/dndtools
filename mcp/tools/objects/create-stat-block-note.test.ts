// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateStatBlockNoteTool } from './create-stat-block-note.js';
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

describe('create_stat_block_note tool', () => {
	it('persists object and returns success envelope', async () => {
		const saveObject = vi.fn(async () => undefined);
		const getObject = vi.fn(async () => null);
		const server = new MockMcpServer();
		registerCreateStatBlockNoteTool(server as never, { saveObject, getObject } as never);
		const result = await server.handler?.({
			name: 'Goblin',
			summary: '',
			tags: [],
			visibility: 'dm_only',
			relationships: [],
			abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
		});
		expect(saveObject).toHaveBeenCalledTimes(1);
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(true);
	});
});
