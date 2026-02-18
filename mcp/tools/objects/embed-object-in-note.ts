import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { createVaultObjectId } from '../../../src/lib/types/object.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { errorResult, jsonResult } from '../shared/response.js';
import { applyEmbedAtPosition, wouldCreateEmbedCycle } from '../shared/embed-note.js';

export function registerEmbedObjectInNoteTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'embed_object_in_note',
		'Insert a reusable object embed into a note using the rich embed syntax.',
		{
			noteId: z.string().min(1).describe('Target note id'),
			objectId: z.string().min(1).describe('Object id'),
			label: z.string().optional().describe('Optional embed label override'),
			position: z.enum(['append', 'prepend']).optional().default('append'),
			renderView: z.enum(['card', 'inline', 'content']).optional().default('card'),
			open: z.boolean().optional(),
			maxDepth: z.number().int().min(1).max(12).optional(),
			allowCycle: z.boolean().optional().default(false),
		},
		async ({ noteId, objectId, label, position, renderView, open, maxDepth, allowCycle }) => {
			const note = await storage.getNote(createNoteId(noteId));
			if (!note) {
				return errorResult('Note not found.');
			}

			const object = await storage.getObject(createVaultObjectId(objectId));
			if (!object) {
				return errorResult('Object not found.');
			}

			if (!allowCycle && (await wouldCreateEmbedCycle(storage, String(note.id), String(object.id)))) {
				return errorResult(
					'Embedding this object would create an embed cycle. Set allowCycle=true to override.',
				);
			}

			const embed = formatNoteEmbed({ id: object.id }, label ?? object.name, {
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
				targetNoteId: object.id,
				objectId: object.id,
				embed,
				position,
				renderView,
			});
		},
	);
}
