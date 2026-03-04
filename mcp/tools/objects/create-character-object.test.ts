// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateCharacterObjectTool } from './create-character-object.js';
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

describe('create_character_object tool', () => {
	it('creates object and returns success', async () => {
		const saveObject = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerCreateCharacterObjectTool(
			server as never,
			{ saveObject, getObject: vi.fn(async () => null) } as never,
		);
		const result = await server.handler?.({
			name: 'Aldric',
			summary: '',
			tags: [],
			visibility: 'dm_only',
			relationships: [],
		});
		expect(saveObject).toHaveBeenCalledTimes(1);
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(true);
	});
});
