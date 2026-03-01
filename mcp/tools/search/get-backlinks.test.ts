// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetBacklinksTool } from './get-backlinks.js';
import { createFolderId, createNoteId, type Note } from '../../../src/lib/types/note.js';
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

function makeNote(id: string, title: string, content: string): Note {
	return {
		id: createNoteId(id),
		title,
		content,
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

describe('get_backlinks tool', () => {
	it('includes alias match metadata when backlink was resolved through an alias', async () => {
		const target = makeNote('note-city', 'City of Splendors', '# City');
		const source = makeNote('note-log', 'Session Log', 'Met in [[Waterdeep]].');
		const server = new MockMcpServer();
		registerGetBacklinksTool(
			server as never,
			{
				getNote: async (id) => {
					if (String(id) === String(target.id)) return target;
					if (String(id) === String(source.id)) return source;
					return null;
				},
				getLinksTo: async () => [
					{
						sourceId: source.id,
						targetId: target.id,
						displayText: 'Waterdeep',
						position: 8,
						resolvedBy: 'alias',
						resolvedAlias: 'Waterdeep',
					},
				],
			} as never,
		);

		const result = await server.handler?.({ id: String(target.id) });
		const envelope = parseToolEnvelope(result as ToolResult);
		if (!envelope || !envelope.ok) {
			throw new Error('Expected a successful tool response');
		}

		expect(envelope.data).toMatchObject([
			{
				sourceId: source.id,
				sourceTitle: source.title,
				matchedByAlias: true,
				matchedAlias: 'Waterdeep',
			},
		]);
	});

	it('returns not found when the target note does not exist', async () => {
		const server = new MockMcpServer();
		registerGetBacklinksTool(
			server as never,
			{
				getNote: async () => null,
				getLinksTo: async () => [],
			} as never,
		);

		const result = await server.handler?.({ id: 'missing-note' });
		const envelope = parseToolEnvelope(result as ToolResult);
		expect(envelope).toMatchObject({
			ok: false,
			error: {
				code: 'MCP_NOT_FOUND',
			},
		});
	});
});
