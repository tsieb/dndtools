import { nanoid } from 'nanoid';
import { getStorage } from '$lib/platform/storage/index.js';
import { nowISO } from '$lib/utils/date.js';
import { generateSessionBoardId } from '$lib/utils/id.js';
import type { NoteId } from '$lib/types/note.js';
import type {
	SessionBoard,
	SessionBoardId,
	SessionBoardTile,
	RelatedNoteSuggestion,
} from '$lib/types/session-board.js';

const GRID_COLUMNS = 12;
const DEFAULT_TILE_W = 4;
const DEFAULT_TILE_H = 3;
const MAX_GRID_ROWS = 200;
const DEFAULT_LAYOUT = {
	columns: GRID_COLUMNS,
	rowHeight: 120,
	minRows: 12,
	gap: 12,
} as const;

function normalizeTileStyle(style: SessionBoardTile['style']): SessionBoardTile['style'] {
	if (!style) return undefined;
	const normalized: NonNullable<SessionBoardTile['style']> = {};
	if (style.backgroundColor !== undefined) normalized.backgroundColor = style.backgroundColor;
	if (style.borderColor !== undefined) normalized.borderColor = style.borderColor;
	if (style.borderWidth !== undefined) {
		normalized.borderWidth = Math.max(0, Math.min(8, Math.round(style.borderWidth)));
	}
	if (style.borderRadius !== undefined) {
		normalized.borderRadius = Math.max(0, Math.min(36, Math.round(style.borderRadius)));
	}
	if (style.opacity !== undefined) {
		normalized.opacity = Math.max(0.2, Math.min(1, style.opacity));
	}
	if (style.scale !== undefined) {
		normalized.scale = Math.max(0.5, Math.min(2.5, style.scale));
	}
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function collides(a: SessionBoardTile, b: SessionBoardTile): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findNextOpenPosition(
	tiles: SessionBoardTile[],
	w = DEFAULT_TILE_W,
	h = DEFAULT_TILE_H,
	columns = GRID_COLUMNS,
): { x: number; y: number } {
	for (let y = 0; y <= MAX_GRID_ROWS; y += 1) {
		for (let x = 0; x <= columns - w; x += 1) {
			const probe: SessionBoardTile = {
				id: '__probe__',
				type: 'note',
				x,
				y,
				w,
				h,
			};
			if (!tiles.some((tile) => collides(probe, tile))) {
				return { x, y };
			}
		}
	}

	const fallbackY = Math.max(0, ...tiles.map((tile) => tile.y + tile.h));
	return { x: 0, y: fallbackY };
}

function clampTile(tile: SessionBoardTile, columns = GRID_COLUMNS): SessionBoardTile {
	const w = Math.max(2, Math.min(columns, Math.round(tile.w)));
	const h = Math.max(2, Math.min(8, Math.round(tile.h)));
	const x = Math.max(0, Math.min(columns - w, Math.round(tile.x)));
	const y = Math.max(0, Math.min(MAX_GRID_ROWS, Math.round(tile.y)));
	return {
		...tile,
		x,
		y,
		w,
		h,
		style: normalizeTileStyle(tile.style),
	};
}

function normalizeBoard(board: SessionBoard, updates?: Partial<SessionBoard>): SessionBoard {
	const layout = {
		columns: Math.max(
			8,
			Math.min(
				32,
				Math.round(updates?.layout?.columns ?? board.layout?.columns ?? DEFAULT_LAYOUT.columns),
			),
		),
		rowHeight: Math.max(
			70,
			Math.min(
				220,
				Math.round(
					updates?.layout?.rowHeight ?? board.layout?.rowHeight ?? DEFAULT_LAYOUT.rowHeight,
				),
			),
		),
		minRows: Math.max(
			6,
			Math.min(
				240,
				Math.round(updates?.layout?.minRows ?? board.layout?.minRows ?? DEFAULT_LAYOUT.minRows),
			),
		),
		gap: Math.max(
			0,
			Math.min(28, Math.round(updates?.layout?.gap ?? board.layout?.gap ?? DEFAULT_LAYOUT.gap)),
		),
	};

	const style = updates?.style
		? {
				...board.style,
				...updates.style,
			}
		: board.style;

	return {
		...board,
		...updates,
		layout,
		style,
		tiles: (updates?.tiles ?? board.tiles).map((tile) => clampTile(tile, layout.columns)),
	};
}

class SessionBoardsState {
	boards = $state<SessionBoard[]>([]);
	activeBoardId = $state<SessionBoardId | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	suggestions = $state<RelatedNoteSuggestion[]>([]);
	suggestionsLoading = $state(false);

	activeBoard = $derived.by<SessionBoard | null>(() => {
		if (!this.activeBoardId) return null;
		return this.boards.find((board) => board.id === this.activeBoardId) ?? null;
	});

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const boards = await getStorage().getSessionBoards();
			this.boards = boards;
			if (boards.length > 0 && !this.activeBoardId) {
				this.activeBoardId = boards[0]!.id;
			} else if (this.activeBoardId && !boards.some((board) => board.id === this.activeBoardId)) {
				this.activeBoardId = boards[0]?.id ?? null;
			}
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}

	async createBoard(name: string, description = ''): Promise<SessionBoard> {
		const now = nowISO();
		const board: SessionBoard = {
			id: generateSessionBoardId(),
			name: name.trim() || 'Session Board',
			description: description.trim(),
			tiles: [],
			layout: { ...DEFAULT_LAYOUT },
			createdAt: now,
			updatedAt: now,
		};
		await getStorage().saveSessionBoard(board);
		this.boards = [board, ...this.boards];
		this.activeBoardId = board.id;
		return board;
	}

	async updateBoard(id: SessionBoardId, updates: Partial<SessionBoard>): Promise<void> {
		const current = this.boards.find((board) => board.id === id);
		if (!current) return;
		const normalized = normalizeBoard(current, updates);
		const updated: SessionBoard = {
			...normalized,
			name: updates.name?.trim() || current.name,
			description: updates.description?.trim() ?? current.description,
			updatedAt: nowISO(),
		};
		await getStorage().saveSessionBoard(updated);
		this.boards = this.boards
			.map((board) => (board.id === id ? updated : board))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async deleteBoard(id: SessionBoardId): Promise<void> {
		await getStorage().deleteSessionBoard(id);
		this.boards = this.boards.filter((board) => board.id !== id);
		if (this.activeBoardId === id) {
			this.activeBoardId = this.boards[0]?.id ?? null;
		}
		this.suggestions = [];
	}

	setActiveBoard(id: SessionBoardId | null): void {
		this.activeBoardId = id;
		this.suggestions = [];
	}

	async addNoteToBoard(boardId: SessionBoardId, noteId: NoteId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		if (board.tiles.some((tile) => tile.type !== 'calendar' && tile.noteId === noteId)) return;

		const position = findNextOpenPosition(
			board.tiles,
			DEFAULT_TILE_W,
			DEFAULT_TILE_H,
			board.layout?.columns ?? GRID_COLUMNS,
		);
		const tile: SessionBoardTile = {
			id: nanoid(10),
			type: 'note',
			noteId,
			x: position.x,
			y: position.y,
			w: DEFAULT_TILE_W,
			h: DEFAULT_TILE_H,
		};
		await this.updateBoard(boardId, {
			tiles: [...board.tiles, tile],
		});
	}

	async addCalendarTile(boardId: SessionBoardId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const existingCalendar = board.tiles.find((tile) => tile.type === 'calendar');
		if (existingCalendar) return;

		const position = findNextOpenPosition(
			board.tiles,
			DEFAULT_TILE_W,
			DEFAULT_TILE_H,
			board.layout?.columns ?? GRID_COLUMNS,
		);
		const tile: SessionBoardTile = {
			id: nanoid(10),
			type: 'calendar',
			x: position.x,
			y: position.y,
			w: DEFAULT_TILE_W,
			h: DEFAULT_TILE_H,
		};
		await this.updateBoard(boardId, {
			tiles: [...board.tiles, tile],
		});
	}

	async removeTile(boardId: SessionBoardId, tileId: string): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		await this.updateBoard(boardId, {
			tiles: board.tiles.filter((tile) => tile.id !== tileId),
		});
	}

	async updateTile(
		boardId: SessionBoardId,
		tileId: string,
		updates: Partial<SessionBoardTile>,
	): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const columns = board.layout?.columns ?? GRID_COLUMNS;
		const tiles = board.tiles.map((tile) =>
			tile.id === tileId ? clampTile({ ...tile, ...updates }, columns) : tile,
		);
		await this.updateBoard(boardId, { tiles });
	}

	async suggestForBoard(boardId: SessionBoardId, limit = 8): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) {
			this.suggestions = [];
			return;
		}

		const seedNoteIds = board.tiles
			.filter((tile): tile is SessionBoardTile & { noteId: NoteId } => !!tile.noteId)
			.map((tile) => tile.noteId);
		if (seedNoteIds.length === 0) {
			this.suggestions = [];
			return;
		}

		this.suggestionsLoading = true;
		try {
			this.suggestions = await getStorage().suggestRelatedNotes(seedNoteIds, limit);
		} finally {
			this.suggestionsLoading = false;
		}
	}
}

export const sessionBoardsState = new SessionBoardsState();
