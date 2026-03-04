// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerRestoreNoteTool } from './restore-note.js';
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

describe('restore_note tool', () => {
	it('does nothing for already-active notes', async () => {
		const restoreNote = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerRestoreNoteTool(
			server as never,
			{
				getNote: vi.fn().mockResolvedValue({ id: 'n1', title: 'A', deleted: false }),
				restoreNote,
			} as never,
		);
		const result = await server.handler?.({ id: 'n1' });
		expect(restoreNote).not.toHaveBeenCalled();
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope?.ok).toBe(true);
	});
});
