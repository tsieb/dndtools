// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerUpdateNoteTool } from './update-note.js';
import { createFolderId, createNoteId, type Note } from '../../../src/lib/types/note.js';
import type { ToolResult } from '../shared/response.js';

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
		content: 'Hello',
		folder: createFolderId('/'),
		tags: ['npc'],
		frontmatter: { session: 1 },
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
	return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('update_note tool', () => {
	it('returns an error payload when note does not exist', async () => {
		const server = new MockMcpServer();
		registerUpdateNoteTool(
			server as never,
			{
				getNote: vi.fn().mockResolvedValue(null),
			} as never,
		);

		const result = await server.handler?.({ id: 'missing', title: 'Next' });
		expect(result?.isError).toBe(true);
		expect(result?.content[0]?.text).toBe('Note not found.');
	});

	it('merges frontmatter by default and reindexes on content/title/folder changes', async () => {
		const existing = makeNote();
		const saveNote = vi.fn(async () => undefined);
		const resolveAndIndexLinks = vi.fn(async () => undefined);
		const getNote = vi
			.fn()
			.mockResolvedValueOnce(existing)
			.mockResolvedValueOnce(
				makeNote({
					title: 'Alpha Prime',
					content: 'Updated',
					folder: createFolderId('/sessions'),
					frontmatter: { session: 1, arc: 'Cragmaw' },
				}),
			);
		const storage = { getNote, saveNote, resolveAndIndexLinks };

		const server = new MockMcpServer();
		registerUpdateNoteTool(server as never, storage as never);
		const result = await server.handler?.({
			id: 'note-1',
			title: 'Alpha Prime',
			content: 'Updated',
			folder: '/sessions',
			frontmatter: { arc: 'Cragmaw' },
		});

		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(saveNote.mock.calls[0]?.[0]).toMatchObject({
			frontmatter: { session: 1, arc: 'Cragmaw' },
			folder: '/sessions',
		});
		expect(resolveAndIndexLinks).toHaveBeenCalledWith(createNoteId('note-1'), 'Updated');
		expect(parseJson(result as ToolResult)).toMatchObject({
			id: 'note-1',
			title: 'Alpha Prime',
			folder: '/sessions',
		});
	});

	it('supports replace mode and skips reindex for metadata-only updates', async () => {
		const existing = makeNote();
		const saveNote = vi.fn(async () => undefined);
		const resolveAndIndexLinks = vi.fn(async () => undefined);
		const getNote = vi
			.fn()
			.mockResolvedValueOnce(existing)
			.mockResolvedValueOnce(
				makeNote({
					tags: ['location'],
					frontmatter: { scene: 'Market' },
				}),
			);
		const server = new MockMcpServer();
		registerUpdateNoteTool(
			server as never,
			{ getNote, saveNote, resolveAndIndexLinks } as never,
		);

		await server.handler?.({
			id: 'note-1',
			tags: ['location'],
			frontmatter: { scene: 'Market' },
			frontmatterMode: 'replace',
		});

		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(saveNote.mock.calls[0]?.[0]).toMatchObject({
			tags: ['location'],
			frontmatter: { scene: 'Market' },
		});
		expect(resolveAndIndexLinks).not.toHaveBeenCalled();
	});
});
