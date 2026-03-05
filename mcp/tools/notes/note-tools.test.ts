// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerCreateNoteTool } from './create-note.js';
import { registerDeleteNoteTool } from './delete-note.js';
import { registerListNotesTool } from './list-notes.js';
import { registerReadNoteTool } from './read-note.js';
import { registerRestoreNoteTool } from './restore-note.js';
import { createFolderId, createNoteId, type Note } from '../../../src/lib/types/note.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}
}

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-1'),
		title: 'Alpha',
		content: 'Alpha content',
		folder: createFolderId('/'),
		tags: ['session'],
		frontmatter: {},
		visibility: 'dm_only',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function dataOf<T>(result: ToolResult): T {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(true);
	if (!envelope || !envelope.ok) {
		throw new Error('Expected successful tool envelope');
	}
	return envelope.data as T;
}

function expectError(
	result: ToolResult,
	code: string,
	messageIncludes?: string,
): { code: string; message: string } {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(false);
	if (!envelope || envelope.ok) {
		throw new Error('Expected error tool envelope');
	}
	expect(envelope.error.code).toBe(code);
	if (messageIncludes) {
		expect(envelope.error.message).toContain(messageIncludes);
	}
	return envelope.error;
}

describe('notes MCP tools', () => {
	it('create_note rejects empty inputs when neither title nor template is provided', async () => {
		const server = new MockMcpServer();
		registerCreateNoteTool(
			server as never,
			{
				getNoteTemplates: vi.fn().mockResolvedValue([]),
				getSetting: vi.fn().mockResolvedValue({}),
			} as never,
		);

		const handler = server.handlers.get('create_note');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({});
		expectError(result, 'MCP_INVALID_INPUT', 'title is required');
	});

	it('create_note renders templates with overrides and strips protected frontmatter keys', async () => {
		const noteStore = new Map<string, Note>();
		const saveNote = vi.fn(async (note: Note) => {
			noteStore.set(String(note.id), note);
		});
		const getNote = vi.fn(async (id: Note['id']) => noteStore.get(String(id)) ?? null);
		const resolveAndIndexLinks = vi.fn(async () => undefined);

		const server = new MockMcpServer();
		registerCreateNoteTool(
			server as never,
			{
				getNoteTemplates: vi.fn().mockResolvedValue([
					{
						id: 'session-template',
						name: 'Session Template',
						description: 'Recap scaffold',
						icon: 'T',
						content:
							'# Session {{session_number}} - {{campaign_name}}\nCast: {{character_names_csv}}',
						defaultTags: ['session', 'recap'],
						defaultFolder: '/sessions',
						scope: 'global',
						scopeFolder: null,
					},
				]),
				getSetting: vi.fn(async (key: string) => {
					if (key === 'templateContext') {
						return {
							campaignName: 'Base Campaign',
							sessionNumber: 7,
							characterNames: ['Ari'],
						};
					}
					if (key === 'worldCalendar') return null;
					return null;
				}),
				saveNote,
				getNote,
				resolveAndIndexLinks,
			} as never,
		);

		const handler = server.handlers.get('create_note');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({
			templateId: 'session-template',
			templateContext: {
				campaignName: 'Override Campaign',
				sessionNumber: 22,
				characterNames: ['Lia', 'Brom'],
			},
			visibility: 'shared',
			frontmatter: {
				visibility: 'public',
				arc: 'Road to Phandalin',
			},
		});

		const payload = dataOf<{ id: string; folder: string; tags: string[]; visibility: string }>(
			result,
		);
		expect(payload.folder).toBe('/sessions');
		expect(payload.tags).toEqual(['session', 'recap']);
		expect(payload.visibility).toBe('shared');
		expect(saveNote).toHaveBeenCalledTimes(1);
		expect(resolveAndIndexLinks).toHaveBeenCalledTimes(1);

		const saved = [...noteStore.values()][0];
		expect(saved?.title).toContain('Session Template');
		expect(saved?.content).toContain('Cast: Lia, Brom');
		expect(saved?.frontmatter).toEqual({ arc: 'Road to Phandalin' });
	});

	it('read_note supports title lookup and validates missing lookup keys', async () => {
		const note = makeNote({
			id: createNoteId('note-read'),
			title: 'Read Target',
			content: 'Read me fully',
		});
		const server = new MockMcpServer();
		registerReadNoteTool(
			server as never,
			{
				getNote: vi.fn().mockResolvedValue(note),
				resolveTitle: vi.fn().mockResolvedValue(note),
			} as never,
		);

		const handler = server.handlers.get('read_note');
		expect(handler).toBeTypeOf('function');

		const missingLookup = await handler!({});
		expectError(missingLookup, 'MCP_INTERNAL_ERROR', 'Either id or title');

		const byTitle = await handler!({ title: 'read target' });
		const payload = dataOf<{ id: string; title: string; content: string }>(byTitle);
		expect(payload.id).toBe('note-read');
		expect(payload.title).toBe('Read Target');
		expect(payload.content).toContain('Read me fully');
	});

	it('list_notes applies folder and tag filters and enforces limit', async () => {
		const folderNotes = [
			makeNote({
				id: createNoteId('note-folder-1'),
				title: 'Folder One',
				folder: createFolderId('/arc'),
			}),
			makeNote({
				id: createNoteId('note-folder-2'),
				title: 'Folder Two',
				folder: createFolderId('/arc'),
			}),
		];
		const tagNotes = [
			makeNote({ id: createNoteId('note-tag-1'), title: 'Tag One', tags: ['npc'] }),
			makeNote({ id: createNoteId('note-tag-2'), title: 'Tag Two', tags: ['npc'] }),
		];
		const getNotesByFolder = vi.fn().mockResolvedValue(folderNotes);
		const getNotesByTag = vi.fn().mockResolvedValue(tagNotes);
		const getAllNotes = vi.fn().mockResolvedValue([makeNote()]);

		const server = new MockMcpServer();
		registerListNotesTool(
			server as never,
			{
				getNotesByFolder,
				getNotesByTag,
				getAllNotes,
			} as never,
		);

		const handler = server.handlers.get('list_notes');
		expect(handler).toBeTypeOf('function');

		const byFolder = await handler!({ folder: '/arc', limit: 1 });
		const folderPayload = dataOf<Array<{ id: string; title: string }>>(byFolder);
		expect(folderPayload).toHaveLength(1);
		expect(folderPayload[0]?.id).toBe('note-folder-1');
		expect(getNotesByFolder).toHaveBeenCalledTimes(1);

		const byTag = await handler!({ tag: 'npc', limit: 2 });
		const tagPayload = dataOf<Array<{ id: string; title: string }>>(byTag);
		expect(tagPayload.map((entry) => entry.id)).toEqual(['note-tag-1', 'note-tag-2']);
		expect(getNotesByTag).toHaveBeenCalledTimes(1);

		await handler!({ includeDeleted: true, limit: 5 });
		expect(getAllNotes).toHaveBeenCalledWith({ includeDeleted: true });
	});

	it('delete_note and restore_note toggle soft-delete status with idempotent restore behavior', async () => {
		const notes = new Map<string, Note>([
			[
				'note-delete',
				makeNote({
					id: createNoteId('note-delete'),
					title: 'Delete Target',
				}),
			],
		]);
		const getNote = vi.fn(async (id: Note['id']) => notes.get(String(id)) ?? null);
		const deleteNote = vi.fn(async (id: Note['id'], permanent: boolean) => {
			const note = notes.get(String(id));
			if (!note) return;
			if (permanent) {
				notes.delete(String(id));
				return;
			}
			notes.set(String(id), {
				...note,
				deleted: true,
				deletedAt: '2026-02-01T00:00:00.000Z',
			});
		});
		const restoreNote = vi.fn(async (id: Note['id']) => {
			const note = notes.get(String(id));
			if (!note) return;
			notes.set(String(id), {
				...note,
				deleted: false,
				deletedAt: null,
			});
		});

		const server = new MockMcpServer();
		registerDeleteNoteTool(
			server as never,
			{
				getNote,
				deleteNote,
			} as never,
		);
		registerRestoreNoteTool(
			server as never,
			{
				getNote,
				restoreNote,
			} as never,
		);

		const deleteHandler = server.handlers.get('delete_note');
		const restoreHandler = server.handlers.get('restore_note');
		expect(deleteHandler).toBeTypeOf('function');
		expect(restoreHandler).toBeTypeOf('function');

		const deleted = await deleteHandler!({ id: 'note-delete', permanent: false });
		const deletedPayload = dataOf<{ id: string; status: string; permanent: boolean }>(deleted);
		expect(deletedPayload).toMatchObject({
			id: 'note-delete',
			status: 'trashed',
			permanent: false,
		});
		expect(deleteNote).toHaveBeenCalledTimes(1);

		const restored = await restoreHandler!({ id: 'note-delete' });
		const restoredPayload = dataOf<{ id: string; status: string; changed: boolean }>(restored);
		expect(restoredPayload).toMatchObject({ id: 'note-delete', status: 'active', changed: true });
		expect(restoreNote).toHaveBeenCalledTimes(1);

		const secondRestore = await restoreHandler!({ id: 'note-delete' });
		const secondPayload = dataOf<{ changed: boolean }>(secondRestore);
		expect(secondPayload.changed).toBe(false);
	});
});
