// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateNoteTool } from './create-note.js';
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

describe('create_note tool', () => {
	it('returns invalid-input error when title and templateId are both missing', async () => {
		const server = new MockMcpServer();
		registerCreateNoteTool(server as never, {} as never);
		const result = await server.handler?.({ content: 'Body' });
		const envelope = result ? parseToolEnvelope(result) : null;
		expect(envelope?.ok).toBe(false);
		if (!envelope || envelope.ok) return;
		expect(envelope.error.code).toBe('MCP_INVALID_INPUT');
	});

	it('creates and indexes a note when valid title is provided', async () => {
		const saveNote = vi.fn(async () => undefined);
		const getNote = vi.fn(async (id: string) => ({ id, title: 'Created', folder: '/', tags: [] }));
		const resolveAndIndexLinks = vi.fn(async () => undefined);
		const server = new MockMcpServer();
		registerCreateNoteTool(
			server as never,
			{
				saveNote,
				getNote,
				resolveAndIndexLinks,
			} as never,
		);

		const result = await server.handler?.({ title: 'Created', content: 'Hello [[world]]' });
		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(resolveAndIndexLinks).toHaveBeenCalledTimes(1);
		const envelope = result ? parseToolEnvelope(result) : null;
		expect(envelope?.ok).toBe(true);
	});
});
