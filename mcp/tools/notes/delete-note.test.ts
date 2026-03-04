// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerDeleteNoteTool } from './delete-note.js';
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

describe('delete_note tool', () => {
	it('returns not found error when note does not exist', async () => {
		const server = new MockMcpServer();
		registerDeleteNoteTool(server as never, { getNote: vi.fn().mockResolvedValue(null) } as never);
		const result = await server.handler?.({ id: 'missing' });
		const envelope = result ? parseToolEnvelope(result) : null;
		expect(envelope?.ok).toBe(false);
	});

	it('soft deletes by default', async () => {
		const deleteNote = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerDeleteNoteTool(
			server as never,
			{ getNote: vi.fn().mockResolvedValue({ id: 'n1', title: 'A' }), deleteNote } as never,
		);
		const result = await server.handler?.({ id: 'n1' });
		expect(deleteNote).toHaveBeenCalledWith('n1', undefined);
		expect(parseToolEnvelope(result as ToolResult)?.ok).toBe(true);
	});
});
