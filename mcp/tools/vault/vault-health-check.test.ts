// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerVaultHealthCheckTool } from './vault-health-check.js';
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

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-1'),
		title: 'Alpha',
		content: 'Alpha content',
		folder: createFolderId('/lore'),
		tags: ['lore'],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function parseJson(result: ToolResult): Record<string, unknown> {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return {};
	return envelope.data as Record<string, unknown>;
}

function getBrokenLinkIssues(result: ToolResult): Array<Record<string, unknown>> {
	const payload = parseJson(result);
	const issues = payload.issues;
	if (!Array.isArray(issues)) return [];
	return issues.filter(
		(issue): issue is Record<string, unknown> =>
			!!issue &&
			typeof issue === 'object' &&
			'type' in issue &&
			(issue as { type?: unknown }).type === 'broken_link',
	);
}

describe('vault_health_check tool', () => {
	it('does not flag escaped wikilinks, object refs, or valid id/title links as broken', async () => {
		const server = new MockMcpServer();
		registerVaultHealthCheckTool(
			server as never,
			{
				getAllNotes: async () => [
					makeNote({
						id: createNoteId('note-1'),
						title: 'Alpha',
						content: String.raw`Literal \[[Ghost]].
Valid [[Beta]] and [[note:note-2|Beta]].
Ignored object ![[obj:character:abc123|Aria]].
Escaped display [[Beta|Alias with \| and \] chars]].
Broken [[Missing]].`,
					}),
					makeNote({
						id: createNoteId('note-2'),
						title: 'Beta',
						content: 'Backlink to [[Alpha]]',
					}),
				],
				getAllLinksFromIndex: () => [
					{ sourceId: 'note-1', targetId: 'note-2', displayText: 'Beta', position: 0 },
					{ sourceId: 'note-2', targetId: 'note-1', displayText: 'Alpha', position: 0 },
				],
			} as never,
		);

		const result = await server.handler?.({});
		expect(result).toBeTruthy();
		const broken = getBrokenLinkIssues(result as ToolResult);
		expect(broken).toHaveLength(1);
		expect(broken[0]?.detail).toContain('[[Missing]]');
	});

	it('flags unresolved note-id links as broken', async () => {
		const server = new MockMcpServer();
		registerVaultHealthCheckTool(
			server as never,
			{
				getAllNotes: async () => [
					makeNote({
						id: createNoteId('note-1'),
						title: 'Alpha',
						content: 'Broken id [[note:missing-id|Ghost]].',
					}),
					makeNote({
						id: createNoteId('note-2'),
						title: 'Beta',
						content: 'No links.',
					}),
				],
				getAllLinksFromIndex: () => [
					{ sourceId: 'note-1', targetId: 'note-2', displayText: 'Beta', position: 0 },
					{ sourceId: 'note-2', targetId: 'note-1', displayText: 'Alpha', position: 0 },
				],
			} as never,
		);

		const result = await server.handler?.({});
		expect(result).toBeTruthy();
		const broken = getBrokenLinkIssues(result as ToolResult);
		expect(broken).toHaveLength(1);
		expect(broken[0]?.detail).toContain('[[Ghost]]');
	});
});
