// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateCharacterSheetNoteTool } from './create-character-sheet-note.js';
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

describe('create_character_sheet_note tool', () => {
	it('persists character object', async () => {
		const saveObject = vi.fn(async () => undefined);
		const getObject = vi.fn(async () => null);
		const server = new MockMcpServer();
		registerCreateCharacterSheetNoteTool(server as never, { saveObject, getObject } as never);
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
