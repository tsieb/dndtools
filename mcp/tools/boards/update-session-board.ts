import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { createSessionBoardId } from '../../../src/lib/types/session-board.js';
import { createNoteId } from '../../../src/lib/types/note.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import { errorResult, jsonResult } from '../shared/response.js';

const tileInput = z
	.object({
		id: z.string().min(1).optional(),
		type: z.enum(['note', 'calendar', 'timer', 'combat', 'dice']).optional(),
		noteId: z.string().min(1).optional(),
		previewDepth: z.enum(['title', 'summary', 'full']).optional(),
		previewLineCount: z.number().int().min(1).max(40).optional(),
		timer: z
			.object({
				mode: z.enum(['elapsed', 'countdown']),
				running: z.boolean(),
				accumulatedMs: z.number().int().min(0),
				startedAtMs: z.number().int().nullable(),
				countdownMs: z.number().int().min(0),
				lapsMs: z.array(z.number().int().min(0)).max(200),
				minimalDisplay: z.boolean(),
			})
			.strict()
			.optional(),
		combat: z.record(z.string(), z.unknown()).optional(),
		x: z.number().int().min(0).max(31),
		y: z.number().int().min(0).max(200),
		w: z.number().int().min(2).max(32),
		h: z.number().int().min(2).max(8),
		style: z
			.object({
				backgroundColor: z.string().optional(),
				borderColor: z.string().optional(),
				borderWidth: z.number().int().min(0).max(8).optional(),
				borderRadius: z.number().int().min(0).max(36).optional(),
				opacity: z.number().min(0.2).max(1).optional(),
				scale: z.number().min(0.5).max(2.5).optional(),
			})
			.strict()
			.optional(),
	})
	.superRefine((tile, ctx) => {
		if ((tile.type === 'timer' || tile.type === 'combat' || tile.type === 'dice') && tile.noteId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'noteId is only allowed on note tiles.',
				path: ['noteId'],
			});
		}
	})
	.strict();

export function registerUpdateSessionBoardTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'update_session_board',
		'Update session board metadata and tile layout.',
		{
			boardId: z.string().min(1),
			name: z.string().min(1).max(80).optional(),
			description: z.string().max(300).optional(),
			tiles: z.array(tileInput).optional(),
			layout: z
				.object({
					columns: z.number().int().min(8).max(32).optional(),
					rowHeight: z.number().int().min(70).max(220).optional(),
					minRows: z.number().int().min(6).max(240).optional(),
					gap: z.number().int().min(0).max(28).optional(),
				})
				.strict()
				.optional(),
			style: z
				.object({
					backgroundColor: z.string().optional(),
					backgroundPattern: z.enum(['none', 'grid', 'dots']).optional(),
					sectionTintColor: z.string().optional(),
					sectionTintOpacity: z.number().min(0).max(0.75).optional(),
				})
				.strict()
				.optional(),
			addNoteIds: z.array(z.string().min(1)).optional().default([]),
		},
		async ({ boardId, name, description, tiles, layout, style, addNoteIds }) => {
			const board = await storage.getSessionBoard(createSessionBoardId(boardId));
			if (!board) {
				return errorResult(`Session board not found: ${boardId}`);
			}

			const baseTiles = tiles
				? tiles.map((tile) => ({
						id: tile.id ?? nanoid(10),
						type: tile.type ?? 'note',
						noteId:
							(tile.type ?? 'note') === 'note' && tile.noteId
								? createNoteId(tile.noteId)
								: undefined,
						previewDepth: tile.previewDepth,
						previewLineCount: tile.previewLineCount,
						timer: tile.type === 'timer' ? tile.timer : undefined,
						combat: tile.type === 'combat' ? tile.combat : undefined,
						x: tile.x,
						y: tile.y,
						w: tile.w,
						h: tile.h,
						style: tile.style,
					}))
				: board.tiles.map((tile) => ({ ...tile }));

			if (addNoteIds.length > 0) {
				const usedNoteIds = new Set(baseTiles.map((tile) => tile.noteId));
				let nextY = Math.max(0, ...baseTiles.map((tile) => tile.y + tile.h));
				for (const noteId of addNoteIds) {
					const typed = createNoteId(noteId);
					if (usedNoteIds.has(typed)) continue;
					baseTiles.push({
						id: nanoid(10),
						type: 'note',
						noteId: typed,
						x: 0,
						y: nextY,
						w: 4,
						h: 3,
					});
					nextY += 3;
				}
			}

			const updated = {
				...board,
				name: name?.trim() ?? board.name,
				description: description?.trim() ?? board.description,
				tiles: baseTiles,
				layout: layout ? { ...(board.layout ?? {}), ...layout } : board.layout,
				style: style ? { ...(board.style ?? {}), ...style } : board.style,
				updatedAt: nowISO(),
			};
			await storage.saveSessionBoard(updated);
			return jsonResult(updated);
		},
	);
}
