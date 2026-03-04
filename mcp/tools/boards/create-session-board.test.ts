// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateSessionBoardTool } from './create-session-board.js';
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

describe('create_session_board tool', () => {
	it('creates board and seeds tiles from noteIds', async () => {
		const saveSessionBoard = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerCreateSessionBoardTool(server as never, { saveSessionBoard } as never);
		const result = await server.handler?.({ name: 'S1', description: '', noteIds: ['a', 'b'] });
		expect(saveSessionBoard).toHaveBeenCalledTimes(1);
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope?.ok).toBe(true);
	});
});
