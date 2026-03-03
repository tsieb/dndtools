import { nanoid } from 'nanoid';
import { getStorage } from '$lib/platform/storage/index.js';
import { nowISO } from '$lib/utils/date.js';
import { generateSessionBoardId } from '$lib/utils/id.js';
import type { NoteId } from '$lib/types/note.js';
import type {
	RelatedNoteSuggestion,
	SessionBoard,
	SessionBoardId,
	SessionBoardTemplate,
	SessionBoardTile,
} from '$lib/types/session-board.js';
import {
	DEFAULT_SESSION_CONTEXT,
	DEFAULT_SESSION_BOARD_LAYOUT,
	cloneTemplateForBoard,
	normalizeBoardTemplatesSetting,
	normalizeSessionBoardLayout,
	normalizeSessionContextState,
	normalizeSessionBoardStyle,
	normalizeSessionBoardTile,
} from '$lib/domain/session-board.js';
import { createDefaultCombatState } from '$lib/domain/combat-tracker.js';

const GRID_COLUMNS = DEFAULT_SESSION_BOARD_LAYOUT.columns;
const DEFAULT_TILE_W = 4;
const DEFAULT_TILE_H = 3;
const MAX_GRID_ROWS = 200;

function getTileType(tile: SessionBoardTile): 'note' | 'calendar' | 'timer' | 'combat' | 'dice' {
	switch (tile.type) {
		case 'calendar':
		case 'combat':
		case 'dice':
		case 'timer':
		case 'note':
			return tile.type;
		default:
			return 'note';
	}
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

function normalizeBoard(board: SessionBoard, updates?: Partial<SessionBoard>): SessionBoard {
	const layout = normalizeSessionBoardLayout({
		...(board.layout ?? DEFAULT_SESSION_BOARD_LAYOUT),
		...(updates?.layout ?? {}),
	});
	const nextTiles = (updates?.tiles ?? board.tiles).map((tile) =>
		normalizeSessionBoardTile(tile, layout.columns),
	);
	return {
		...board,
		...updates,
		layout,
		style: normalizeSessionBoardStyle(
			updates?.style ? { ...(board.style ?? {}), ...updates.style } : board.style,
		),
		sessionContext: normalizeSessionContextState(
			updates?.sessionContext ?? board.sessionContext ?? DEFAULT_SESSION_CONTEXT,
		),
		tiles: nextTiles,
	};
}

function cloneBoardTileForTemplate(tile: SessionBoardTile): SessionBoardTile {
	const type = getTileType(tile);
	if (type === 'note') {
		return {
			...tile,
			type: 'note',
			noteId: undefined,
		};
	}
	if (type === 'timer') {
		return {
			...tile,
			type: 'timer',
			timer: tile.timer
				? {
						...tile.timer,
						running: false,
						startedAtMs: null,
						lapsMs: [],
						accumulatedMs: 0,
					}
				: undefined,
		};
	}
	if (type === 'combat') {
		return {
			...tile,
			type: 'combat',
			combat: createDefaultCombatState(),
		};
	}
	if (type === 'dice') {
		return {
			...tile,
			type: 'dice',
		};
	}
	return {
		...tile,
		type: 'calendar',
	};
}

function instantiateTemplateTiles(template: SessionBoardTemplate): SessionBoardTile[] {
	const cloned = cloneTemplateForBoard(template);
	return cloned.tiles.map((tile) => {
		const normalized = normalizeSessionBoardTile(
			{
				...tile,
				id: nanoid(10),
			},
			cloned.layout?.columns ?? DEFAULT_SESSION_BOARD_LAYOUT.columns,
		);
		if ((normalized.type ?? 'note') === 'note') {
			return {
				...normalized,
				noteId: undefined,
			};
		}
		return normalized;
	});
}

class SessionBoardsState {
	boards = $state<SessionBoard[]>([]);
	activeBoardId = $state<SessionBoardId | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	suggestions = $state<RelatedNoteSuggestion[]>([]);
	suggestionsLoading = $state(false);

	templates = $state<SessionBoardTemplate[]>([]);
	templatesLoading = $state(false);
	templatesError = $state<string | null>(null);

	activeBoard = $derived.by<SessionBoard | null>(() => {
		if (!this.activeBoardId) return null;
		return this.boards.find((board) => board.id === this.activeBoardId) ?? null;
	});

	templateById = $derived.by<Map<string, SessionBoardTemplate>>(() => {
		return new Map(this.templates.map((template) => [template.id, template]));
	});

	customTemplates = $derived.by<SessionBoardTemplate[]>(() =>
		this.templates.filter((template) => !template.builtIn),
	);

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const storage = getStorage();
			const [boards, templatesRaw] = await Promise.all([
				storage.getSessionBoards(),
				storage.getSetting('boardTemplates'),
			]);
			this.boards = boards.map((board) => normalizeBoard(board));
			this.templates = normalizeBoardTemplatesSetting(templatesRaw);
			if (this.boards.length > 0 && !this.activeBoardId) {
				this.activeBoardId = this.boards[0]!.id;
			} else if (
				this.activeBoardId &&
				!this.boards.some((board) => board.id === this.activeBoardId)
			) {
				this.activeBoardId = this.boards[0]?.id ?? null;
			}
		} catch (error) {
			this.error = String(error);
		} finally {
			this.loading = false;
		}
	}

	private async persistTemplates(templates: SessionBoardTemplate[]): Promise<void> {
		const normalized = normalizeBoardTemplatesSetting(templates);
		await getStorage().setSetting('boardTemplates', normalized);
		this.templates = normalized;
	}

	async createBoard(name: string, description = '', templateId?: string): Promise<SessionBoard> {
		const now = nowISO();
		const template = templateId ? (this.templateById.get(templateId) ?? null) : null;
		const board: SessionBoard = {
			id: generateSessionBoardId(),
			name: name.trim() || 'Session Board',
			description: description.trim(),
			tiles: template ? instantiateTemplateTiles(template) : [],
			layout: template?.layout
				? normalizeSessionBoardLayout(template.layout)
				: { ...DEFAULT_SESSION_BOARD_LAYOUT },
			style: normalizeSessionBoardStyle(template?.style),
			sessionContext: { collapsed: false, items: [] },
			createdAt: now,
			updatedAt: now,
		};
		await getStorage().saveSessionBoard(board);
		this.boards = [board, ...this.boards];
		this.activeBoardId = board.id;
		return board;
	}

	async applyTemplateToBoard(boardId: SessionBoardId, templateId: string): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		const template = this.templateById.get(templateId);
		if (!board || !template) return;
		await this.updateBoard(boardId, {
			tiles: instantiateTemplateTiles(template),
			layout: template.layout ? normalizeSessionBoardLayout(template.layout) : board.layout,
			style: normalizeSessionBoardStyle(template.style),
		});
	}

	async saveTemplateFromBoard(
		boardId: SessionBoardId,
		name: string,
		description = '',
	): Promise<SessionBoardTemplate | null> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return null;
		const now = nowISO();
		const template: SessionBoardTemplate = {
			id: `custom-${nanoid(10)}`,
			name: name.trim() || `${board.name} Template`,
			description: description.trim(),
			tiles: board.tiles.map((tile) => cloneBoardTileForTemplate(tile)),
			layout: board.layout ? { ...board.layout } : { ...DEFAULT_SESSION_BOARD_LAYOUT },
			style: board.style ? { ...board.style } : undefined,
			builtIn: false,
			createdAt: now,
			updatedAt: now,
		};
		await this.persistTemplates([...this.templates, template]);
		return template;
	}

	async deleteTemplate(templateId: string): Promise<void> {
		const template = this.templateById.get(templateId);
		if (!template || template.builtIn) return;
		await this.persistTemplates(this.templates.filter((entry) => entry.id !== templateId));
	}

	setActiveBoard(id: SessionBoardId | null): void {
		this.activeBoardId = id;
		this.suggestions = [];
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

	async addNoteToBoard(boardId: SessionBoardId, noteId: NoteId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		if (board.tiles.some((tile) => (tile.type ?? 'note') === 'note' && tile.noteId === noteId))
			return;

		const emptySlot = board.tiles.find((tile) => (tile.type ?? 'note') === 'note' && !tile.noteId);
		if (emptySlot) {
			await this.updateTile(boardId, emptySlot.id, { noteId });
			return;
		}

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

	async addTimerTile(boardId: SessionBoardId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const position = findNextOpenPosition(
			board.tiles,
			DEFAULT_TILE_W,
			DEFAULT_TILE_H,
			board.layout?.columns ?? GRID_COLUMNS,
		);
		const tile: SessionBoardTile = {
			id: nanoid(10),
			type: 'timer',
			x: position.x,
			y: position.y,
			w: DEFAULT_TILE_W,
			h: DEFAULT_TILE_H,
		};
		await this.updateBoard(boardId, {
			tiles: [...board.tiles, tile],
		});
	}

	async addDiceTile(boardId: SessionBoardId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const position = findNextOpenPosition(board.tiles, 5, 4, board.layout?.columns ?? GRID_COLUMNS);
		const tile: SessionBoardTile = {
			id: nanoid(10),
			type: 'dice',
			x: position.x,
			y: position.y,
			w: 5,
			h: 4,
		};
		await this.updateBoard(boardId, {
			tiles: [...board.tiles, tile],
		});
	}

	async addCombatTile(boardId: SessionBoardId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const position = findNextOpenPosition(board.tiles, 6, 4, board.layout?.columns ?? GRID_COLUMNS);
		const tile: SessionBoardTile = {
			id: nanoid(10),
			type: 'combat',
			combat: createDefaultCombatState(),
			x: position.x,
			y: position.y,
			w: 6,
			h: 4,
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
			tile.id === tileId ? normalizeSessionBoardTile({ ...tile, ...updates }, columns) : tile,
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
			.filter(
				(tile): tile is SessionBoardTile & { noteId: NoteId } =>
					(tile.type ?? 'note') === 'note' && !!tile.noteId,
			)
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

	async setSessionContextCollapsed(boardId: SessionBoardId, collapsed: boolean): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const context = normalizeSessionContextState(board.sessionContext ?? DEFAULT_SESSION_CONTEXT);
		await this.updateBoard(boardId, {
			sessionContext: {
				...context,
				collapsed,
			},
		});
	}

	async pinSessionContextItem(
		boardId: SessionBoardId,
		noteId: NoteId,
		category: 'npc' | 'location' | 'quest' | 'party',
	): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const context = normalizeSessionContextState(board.sessionContext ?? DEFAULT_SESSION_CONTEXT);
		const now = nowISO();
		const nextItems = context.items.filter((item) => {
			if (item.noteId === noteId) return false;
			if ((category === 'location' || category === 'quest') && item.category === category) {
				return false;
			}
			return true;
		});
		nextItems.push({ noteId, category, pinnedAt: now });
		await this.updateBoard(boardId, {
			sessionContext: {
				...context,
				items: nextItems.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt)),
			},
		});
	}

	async unpinSessionContextItem(boardId: SessionBoardId, noteId: NoteId): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const context = normalizeSessionContextState(board.sessionContext ?? DEFAULT_SESSION_CONTEXT);
		await this.updateBoard(boardId, {
			sessionContext: {
				...context,
				items: context.items.filter((item) => item.noteId !== noteId),
			},
		});
	}

	async recategorizeSessionContextItem(
		boardId: SessionBoardId,
		noteId: NoteId,
		category: 'npc' | 'location' | 'quest' | 'party',
	): Promise<void> {
		const board = this.boards.find((entry) => entry.id === boardId);
		if (!board) return;
		const context = normalizeSessionContextState(board.sessionContext ?? DEFAULT_SESSION_CONTEXT);
		const existing = context.items.find((item) => item.noteId === noteId);
		if (!existing) return;
		const nextItems = context.items
			.filter((item) => item.noteId !== noteId)
			.filter((item) =>
				category === 'location' || category === 'quest' ? item.category !== category : true,
			);
		nextItems.push({ ...existing, category });
		await this.updateBoard(boardId, {
			sessionContext: {
				...context,
				items: nextItems.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt)),
			},
		});
	}
}

export const sessionBoardsState = new SessionBoardsState();
