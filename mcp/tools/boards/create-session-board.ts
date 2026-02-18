import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { createSessionBoardId } from '../../../src/lib/types/session-board.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { jsonResult } from '../shared/response.js';

function buildInitialTiles(noteIds: string[]): Array<{
	id: string;
	noteId: ReturnType<typeof createNoteId>;
	x: number;
	y: number;
	w: number;
	h: number;
}> {
	const columns = 3;
	const width = 4;
	const height = 3;

	return noteIds.map((noteId, index) => {
		const col = index % columns;
		const row = Math.floor(index / columns);
		return {
			id: nanoid(10),
			noteId: createNoteId(noteId),
			x: col * width,
			y: row * height,
			w: width,
			h: height,
		};
	});
}

export function registerCreateSessionBoardTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'create_session_board',
		'Create a new session board dashboard and optionally seed it with notes.',
		{
			name: z.string().min(1).max(80),
			description: z.string().max(300).optional().default(''),
			noteIds: z.array(z.string().min(1)).optional().default([]),
		},
		async ({ name, description, noteIds }) => {
			const now = nowISO();
			const board = {
				id: createSessionBoardId(nanoid()),
				name: name.trim(),
				description: description.trim(),
				tiles: buildInitialTiles(noteIds),
				layout: {
					columns: 12,
					rowHeight: 120,
					minRows: 12,
					gap: 12,
				},
				style: {
					backgroundPattern: 'none' as const,
				},
				createdAt: now,
				updatedAt: now,
			};

			await storage.saveSessionBoard(board);
			return jsonResult(board);
		},
	);
}
