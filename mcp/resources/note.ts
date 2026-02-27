import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';
import { createNoteId } from '../../src/lib/types/note.js';
import { LEGACY_RESOURCE_URIS, RESOURCE_URIS } from './uri-strategy.js';
import { textResourceResult } from './shared/contracts.js';

const noteResourceParamsSchema = z.object({ id: z.string().min(1) }).strict();

export function registerNoteResource(server: McpServer, storage: FileSystemAdapter): void {
	const readNote = async (uri: URL, params: Record<string, unknown>) => {
		const parsedParams = noteResourceParamsSchema.safeParse(params);
		if (!parsedParams.success) {
			return textResourceResult(uri.href, 'text/plain', 'Invalid note resource id.');
		}

		const id = parsedParams.data.id;
		const note = await storage.getNote(createNoteId(id));
		if (!note) {
			return textResourceResult(uri.href, 'text/plain', 'Note not found');
		}

		return textResourceResult(uri.href, 'text/markdown', note.content);
	};

	server.resource(
		'note',
		new ResourceTemplate(RESOURCE_URIS.noteTemplate, { list: undefined }),
		readNote,
	);
	server.resource(
		'note-legacy',
		new ResourceTemplate(LEGACY_RESOURCE_URIS.noteTemplate, { list: undefined }),
		readNote,
	);
}
