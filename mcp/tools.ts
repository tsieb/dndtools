import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from './storage.js';
import { createNoteId, createFolderId } from '../src/lib/types/note.js';
import { generateNoteId } from '../src/lib/utils/id.js';
import { nowISO } from '../src/lib/utils/date.js';
import type { Note } from '../src/lib/types/note.js';

/** Register all MCP tools on the server */
export function registerTools(server: McpServer, storage: FileSystemAdapter): void {
	// --- list_notes ---
	server.tool(
		'list_notes',
		'List notes with optional filters (folder, tag, limit). Returns metadata, not full content.',
		{
			folder: z.string().optional().describe('Filter by folder path (e.g., "/campaign/npcs")'),
			tag: z.string().optional().describe('Filter by tag name'),
			limit: z.number().optional().default(50).describe('Max number of notes to return'),
			includeDeleted: z
				.boolean()
				.optional()
				.default(false)
				.describe('Include soft-deleted notes'),
		},
		async ({ folder, tag, limit, includeDeleted }) => {
			let notes: Note[];

			if (folder) {
				notes = await storage.getNotesByFolder(createFolderId(folder));
			} else if (tag) {
				notes = await storage.getNotesByTag(tag);
			} else {
				notes = await storage.getAllNotes({ includeDeleted });
			}

			const limited = notes.slice(0, limit);
			const summaries = limited.map((n) => ({
				id: n.id,
				title: n.title,
				folder: n.folder,
				tags: n.tags,
				updatedAt: n.updatedAt,
				deleted: n.deleted,
			}));

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(summaries, null, 2),
					},
				],
			};
		},
	);

	// --- read_note ---
	server.tool(
		'read_note',
		'Read a note by ID or title. Returns the full note including content.',
		{
			id: z.string().optional().describe('Note ID (nanoid)'),
			title: z.string().optional().describe('Note title (case-insensitive lookup)'),
		},
		async ({ id, title }) => {
			let note: Note | null = null;

			if (id) {
				note = await storage.getNote(createNoteId(id));
			} else if (title) {
				note = await storage.resolveTitle(title);
			}

			if (!note) {
				return {
					content: [{ type: 'text' as const, text: 'Note not found' }],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								id: note.id,
								title: note.title,
								folder: note.folder,
								tags: note.tags,
								content: note.content,
								createdAt: note.createdAt,
								updatedAt: note.updatedAt,
								deleted: note.deleted,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// --- create_note ---
	server.tool(
		'create_note',
		'Create a new note with title, content, optional folder and tags.',
		{
			title: z.string().describe('Note title'),
			content: z.string().optional().default('').describe('Markdown content'),
			folder: z.string().optional().default('/').describe('Folder path (e.g., "/campaign/npcs")'),
			tags: z.array(z.string()).optional().default([]).describe('Tags (without # prefix)'),
		},
		async ({ title, content, folder, tags }) => {
			const now = nowISO();
			const note: Note = {
				id: generateNoteId(),
				title,
				content,
				folder: createFolderId(folder),
				tags,
				frontmatter: {},
				createdAt: now,
				updatedAt: now,
				deleted: false,
				deletedAt: null,
			};

			await storage.saveNote(note);
			await storage.resolveAndIndexLinks(note.id, note.content);

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{ id: note.id, title: note.title, folder: note.folder, tags: note.tags },
							null,
							2,
						),
					},
				],
			};
		},
	);

	// --- update_note ---
	server.tool(
		'update_note',
		'Update an existing note. Only provided fields are changed.',
		{
			id: z.string().describe('Note ID to update'),
			title: z.string().optional().describe('New title'),
			content: z.string().optional().describe('New markdown content'),
			folder: z.string().optional().describe('New folder path'),
			tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
		},
		async ({ id, title, content, folder, tags }) => {
			const note = await storage.getNote(createNoteId(id));
			if (!note) {
				return {
					content: [{ type: 'text' as const, text: 'Note not found' }],
					isError: true,
				};
			}

			const updated: Note = {
				...note,
				title: title ?? note.title,
				content: content ?? note.content,
				folder: folder ? createFolderId(folder) : note.folder,
				tags: tags ?? note.tags,
				updatedAt: nowISO(),
			};

			await storage.saveNote(updated);

			if (content !== undefined) {
				await storage.resolveAndIndexLinks(updated.id, updated.content);
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(
							{
								id: updated.id,
								title: updated.title,
								folder: updated.folder,
								tags: updated.tags,
								updatedAt: updated.updatedAt,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// --- delete_note ---
	server.tool(
		'delete_note',
		'Delete a note. Soft-deletes by default (recoverable). Use permanent=true to remove permanently.',
		{
			id: z.string().describe('Note ID to delete'),
			permanent: z
				.boolean()
				.optional()
				.default(false)
				.describe('Permanently delete (not recoverable)'),
		},
		async ({ id, permanent }) => {
			const note = await storage.getNote(createNoteId(id));
			if (!note) {
				return {
					content: [{ type: 'text' as const, text: 'Note not found' }],
					isError: true,
				};
			}

			await storage.deleteNote(createNoteId(id), permanent);

			return {
				content: [
					{
						type: 'text' as const,
						text: `Note "${note.title}" ${permanent ? 'permanently deleted' : 'moved to trash'}`,
					},
				],
			};
		},
	);

	// --- search_notes ---
	server.tool(
		'search_notes',
		'Search notes by text query. Searches titles, tags, and content.',
		{
			query: z.string().describe('Search query text'),
			limit: z.number().optional().default(20).describe('Max results to return'),
		},
		async ({ query, limit }) => {
			const results = await storage.searchNotes(query);
			const limited = results.slice(0, limit);

			const summaries = limited.map((r) => ({
				id: r.note.id,
				title: r.note.title,
				folder: r.note.folder,
				tags: r.note.tags,
				score: r.score,
				snippet: r.note.content.slice(0, 200),
			}));

			return {
				content: [
					{
						type: 'text' as const,
						text:
							summaries.length > 0
								? JSON.stringify(summaries, null, 2)
								: `No results for "${query}"`,
					},
				],
			};
		},
	);

	// --- get_backlinks ---
	server.tool(
		'get_backlinks',
		'Get all notes that link to a given note via wikilinks.',
		{
			id: z.string().describe('Note ID to find backlinks for'),
		},
		async ({ id }) => {
			const noteId = createNoteId(id);
			const note = await storage.getNote(noteId);
			if (!note) {
				return {
					content: [{ type: 'text' as const, text: 'Note not found' }],
					isError: true,
				};
			}

			const backlinks = await storage.getLinksTo(noteId);
			const results: Array<{ sourceId: string; sourceTitle: string; displayText: string }> = [];

			for (const link of backlinks) {
				const sourceNote = await storage.getNote(link.sourceId);
				results.push({
					sourceId: link.sourceId,
					sourceTitle: sourceNote?.title ?? 'Unknown',
					displayText: link.displayText,
				});
			}

			return {
				content: [
					{
						type: 'text' as const,
						text:
							results.length > 0
								? JSON.stringify(results, null, 2)
								: `No backlinks found for "${note.title}"`,
					},
				],
			};
		},
	);

	// --- get_tags ---
	server.tool(
		'get_tags',
		'List all tags used across the vault with their usage counts.',
		{},
		async () => {
			const tags = await storage.getTagCounts();

			return {
				content: [
					{
						type: 'text' as const,
						text:
							tags.length > 0
								? JSON.stringify(tags, null, 2)
								: 'No tags found in vault',
					},
				],
			};
		},
	);
}
