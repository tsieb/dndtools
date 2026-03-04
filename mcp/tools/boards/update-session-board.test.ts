// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerUpdateSessionBoardTool } from './update-session-board.js';
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

describe('update_session_board tool', () => {
	it('returns error when board is missing', async () => {
		const server = new MockMcpServer();
		registerUpdateSessionBoardTool(
			server as never,
			{ getSessionBoard: vi.fn().mockResolvedValue(null) } as never,
		);
		const result = await server.handler?.({ boardId: 'missing' });
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(false);
	});
});
