// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetVaultSummaryTool } from './get-vault-summary.js';
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

function parsePayload(result: ToolResult): Record<string, unknown> {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return {};
	return envelope.data as Record<string, unknown>;
}

describe('get_vault_summary tool', () => {
	it('includes campaign health, coverage gaps, and stale-note insights', async () => {
		const server = new MockMcpServer();
		registerGetVaultSummaryTool(
			server as never,
			{
				getIndexEntries: () => [
					{
						id: 'note-1',
						title: 'Alpha',
						folder: '/',
						tags: [],
						createdAt: '2025-12-01T00:00:00.000Z',
						updatedAt: '2025-12-15T00:00:00.000Z',
						deleted: false,
						deletedAt: null,
					},
				],
				getAllLinksFromIndex: () => [],
				getTagCounts: async () => [{ name: 'lore', count: 1 }],
				getAllObjects: async () => [{ id: 'obj-1', type: 'character' }],
				getSessionBoards: async () => [],
			} as never,
		);

		const result = await server.handler?.({});
		expect(result).toBeTruthy();
		const payload = parsePayload(result as ToolResult);

		expect(payload).toHaveProperty('campaignHealth');
		expect(payload).toHaveProperty('coverageGaps');
		expect(payload).toHaveProperty('staleThresholdDays');
		expect(payload).toHaveProperty('staleNotes');
	});
});
