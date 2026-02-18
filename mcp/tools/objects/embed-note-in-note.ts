import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { formatNoteEmbed } from '../../../src/lib/services/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';
import { applyEmbedAtPosition, wouldCreateEmbedCycle } from '../shared/embed-note.js';

export function registerEmbedNoteInNoteTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'embed_note_in_note',
		'Embed any note into another note with render metadata and cycle protection.',
		{
			noteId: z.string().min(1).describe('Target note id receiving the embed'),
			targetNoteId: z.string().min(1).describe('Note id to embed'),
			label: z.string().optional().describe('Optional label override for the embed card'),
			position: z.enum(['append', 'prepend']).optional().default('append'),
			renderView: z.enum(['card', 'inline', 'content']).optional().default('card'),
			open: z.boolean().optional(),
			maxDepth: z.number().int().min(1).max(12).optional(),
			allowCycle: z.boolean().optional().default(false),
		},
		async ({ noteId, targetNoteId, label, position, renderView, open, maxDepth, allowCycle }) => {
			const note = await storage.getNote(createNoteId(noteId));
			if (!note) {
				return errorResult('Target note not found.');
			}

			const target = await storage.getNote(createNoteId(targetNoteId));
			if (!target) {
				return errorResult('Embedded note not found.');
			}

			if (!allowCycle && (await wouldCreateEmbedCycle(storage, String(note.id), String(target.id)))) {
				return errorResult(
					'Embedding this note would create an embed cycle. Set allowCycle=true to override.',
				);
			}

			const embed = formatNoteEmbed({ id: target.id }, label ?? target.title, {
				view: renderView,
				open,
				maxDepth,
			});
			const nextContent = applyEmbedAtPosition(note.content, embed, position);
			const updated = {
				...note,
				content: nextContent,
				updatedAt: nowISO(),
			};
			await storage.saveNote(updated);
			await storage.resolveAndIndexLinks(updated.id, updated.content);

			return jsonResult({
				noteId: updated.id,
				targetNoteId: target.id,
				embed,
				position,
				renderView,
			});
		},
	);
}

