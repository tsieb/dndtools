import type {
	SessionBoardLayout,
	SessionBoardPreviewDepth,
	SessionBoardStyle,
	SessionBoardTemplate,
	SessionBoardTile,
	SessionBoardTileStyle,
	SessionBoardTimerState,
} from '../types/session-board.js';
import { createDefaultCombatState, normalizeCombatState } from './combat-tracker.js';

const MIN_COLUMNS = 8;
const MAX_COLUMNS = 32;
const MAX_GRID_ROWS = 200;
const MIN_ROW_HEIGHT = 70;
const MAX_ROW_HEIGHT = 220;
const MIN_ROWS = 6;
const MAX_ROWS = 240;
const MIN_GAP = 0;
const MAX_GAP = 28;
const MIN_TILE_WIDTH = 2;
const MAX_TILE_HEIGHT = 8;
const MIN_TILE_HEIGHT = 2;
const MIN_TILE_OPACITY = 0.2;
const MAX_TILE_OPACITY = 1;
const MIN_TILE_SCALE = 0.5;
const MAX_TILE_SCALE = 2.5;
const MIN_PREVIEW_LINES = 1;
const MAX_PREVIEW_LINES = 40;

export const DEFAULT_SESSION_BOARD_LAYOUT: SessionBoardLayout = {
	columns: 12,
	rowHeight: 120,
	minRows: 12,
	gap: 12,
};

export const DEFAULT_NOTE_PREVIEW_DEPTH: SessionBoardPreviewDepth = 'summary';
export const DEFAULT_NOTE_PREVIEW_LINES = 8;
export const DEFAULT_TIMER_COUNTDOWN_MS = 60 * 60 * 1000;

const BUILT_IN_TEMPLATE_TIMESTAMP = '2026-03-02T00:00:00.000Z';

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
	return clamp(Math.round(value), min, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createDefaultTimerState(): SessionBoardTimerState {
	return {
		mode: 'elapsed',
		running: false,
		accumulatedMs: 0,
		startedAtMs: null,
		countdownMs: DEFAULT_TIMER_COUNTDOWN_MS,
		lapsMs: [],
		minimalDisplay: false,
	};
}

export function normalizeSessionBoardLayout(
	value: Partial<SessionBoardLayout> | undefined,
): SessionBoardLayout {
	return {
		columns: clampInt(
			value?.columns ?? DEFAULT_SESSION_BOARD_LAYOUT.columns,
			MIN_COLUMNS,
			MAX_COLUMNS,
		),
		rowHeight: clampInt(
			value?.rowHeight ?? DEFAULT_SESSION_BOARD_LAYOUT.rowHeight,
			MIN_ROW_HEIGHT,
			MAX_ROW_HEIGHT,
		),
		minRows: clampInt(value?.minRows ?? DEFAULT_SESSION_BOARD_LAYOUT.minRows, MIN_ROWS, MAX_ROWS),
		gap: clampInt(value?.gap ?? DEFAULT_SESSION_BOARD_LAYOUT.gap, MIN_GAP, MAX_GAP),
	};
}

export function normalizeSessionBoardStyle(
	value: SessionBoardStyle | undefined,
): SessionBoardStyle | undefined {
	if (!value) return undefined;
	return {
		backgroundColor: value.backgroundColor,
		backgroundPattern: value.backgroundPattern ?? 'none',
		sectionTintColor: value.sectionTintColor,
		sectionTintOpacity: clamp(value.sectionTintOpacity ?? 0, 0, 0.75),
	};
}

export function normalizeSessionBoardTileStyle(
	style: SessionBoardTileStyle | undefined,
): SessionBoardTileStyle | undefined {
	if (!style) return undefined;
	const normalized: SessionBoardTileStyle = {};
	if (style.backgroundColor !== undefined) normalized.backgroundColor = style.backgroundColor;
	if (style.borderColor !== undefined) normalized.borderColor = style.borderColor;
	if (style.borderWidth !== undefined) {
		normalized.borderWidth = clampInt(style.borderWidth, 0, 8);
	}
	if (style.borderRadius !== undefined) {
		normalized.borderRadius = clampInt(style.borderRadius, 0, 36);
	}
	if (style.opacity !== undefined) {
		normalized.opacity = clamp(style.opacity, MIN_TILE_OPACITY, MAX_TILE_OPACITY);
	}
	if (style.scale !== undefined) {
		normalized.scale = clamp(style.scale, MIN_TILE_SCALE, MAX_TILE_SCALE);
	}
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizePreviewDepth(value: unknown): SessionBoardPreviewDepth {
	return value === 'title' || value === 'summary' || value === 'full'
		? value
		: DEFAULT_NOTE_PREVIEW_DEPTH;
}

export function normalizePreviewLineCount(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_NOTE_PREVIEW_LINES;
	return clampInt(value, MIN_PREVIEW_LINES, MAX_PREVIEW_LINES);
}

export function normalizeSessionBoardTimerState(value: unknown): SessionBoardTimerState {
	const defaults = createDefaultTimerState();
	if (!isRecord(value)) return defaults;
	const countdownMs =
		typeof value.countdownMs === 'number' && Number.isFinite(value.countdownMs)
			? Math.max(0, Math.round(value.countdownMs))
			: defaults.countdownMs;
	const lapsRaw = Array.isArray(value.lapsMs) ? value.lapsMs : [];
	return {
		mode: value.mode === 'countdown' ? 'countdown' : 'elapsed',
		running: value.running === true,
		accumulatedMs:
			typeof value.accumulatedMs === 'number' && Number.isFinite(value.accumulatedMs)
				? Math.max(0, Math.round(value.accumulatedMs))
				: 0,
		startedAtMs:
			typeof value.startedAtMs === 'number' && Number.isFinite(value.startedAtMs)
				? Math.round(value.startedAtMs)
				: null,
		countdownMs,
		lapsMs: lapsRaw
			.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
			.slice(0, 200)
			.map((entry) => Math.max(0, Math.round(entry))),
		minimalDisplay: value.minimalDisplay === true,
	};
}

export function normalizeSessionBoardTile(tile: SessionBoardTile, columns = 12): SessionBoardTile {
	const clampedColumns = clampInt(columns, MIN_COLUMNS, MAX_COLUMNS);
	const w = clampInt(tile.w, MIN_TILE_WIDTH, clampedColumns);
	const h = clampInt(tile.h, MIN_TILE_HEIGHT, MAX_TILE_HEIGHT);
	const x = clampInt(tile.x, 0, clampedColumns - w);
	const y = clampInt(tile.y, 0, MAX_GRID_ROWS);
	const common = {
		id: tile.id,
		x,
		y,
		w,
		h,
		style: normalizeSessionBoardTileStyle(tile.style),
	};

	if (tile.type === 'calendar') {
		return {
			...common,
			type: 'calendar',
		};
	}
	if (tile.type === 'timer') {
		return {
			...common,
			type: 'timer',
			timer: normalizeSessionBoardTimerState(tile.timer),
		};
	}
	if (tile.type === 'combat') {
		return {
			...common,
			type: 'combat',
			combat: normalizeCombatState(tile.combat ?? createDefaultCombatState()),
		};
	}
	const noteId =
		typeof tile.noteId === 'string' && tile.noteId.trim().length > 0 ? tile.noteId : undefined;
	return {
		...common,
		type: 'note',
		noteId,
		previewDepth: normalizePreviewDepth(tile.previewDepth),
		previewLineCount: normalizePreviewLineCount(tile.previewLineCount),
	};
}

function normalizeTemplate(
	template: SessionBoardTemplate,
	defaultBuiltIn: boolean,
): SessionBoardTemplate {
	const layout = normalizeSessionBoardLayout(template.layout);
	return {
		id: template.id.trim(),
		name: template.name.trim() || 'Session Template',
		description: template.description.trim(),
		tiles: template.tiles
			.filter((tile) => !!tile && typeof tile.id === 'string' && tile.id.trim().length > 0)
			.map((tile) => normalizeSessionBoardTile(tile, layout.columns)),
		layout,
		style: normalizeSessionBoardStyle(template.style),
		builtIn: template.builtIn ?? defaultBuiltIn,
		createdAt: template.createdAt || BUILT_IN_TEMPLATE_TIMESTAMP,
		updatedAt: template.updatedAt || BUILT_IN_TEMPLATE_TIMESTAMP,
	};
}

const BUILT_IN_TEMPLATE_SEED = [
	{
		id: 'built-in-combat-scene',
		name: 'Combat Scene',
		description: 'Initiative, combat notes, and a tactical timer for fast turn flow.',
		tiles: [
			{ id: 'combat-timer', type: 'timer', x: 0, y: 0, w: 3, h: 2 },
			{
				id: 'combat-initiative',
				type: 'combat',
				x: 3,
				y: 0,
				w: 6,
				h: 4,
				combat: createDefaultCombatState(BUILT_IN_TEMPLATE_TIMESTAMP),
			},
			{ id: 'combat-opposition', type: 'note', x: 9, y: 0, w: 3, h: 4, previewDepth: 'summary' },
			{ id: 'combat-arena', type: 'note', x: 0, y: 2, w: 5, h: 4, previewDepth: 'full' },
			{ id: 'combat-objectives', type: 'note', x: 5, y: 4, w: 7, h: 3, previewDepth: 'summary' },
		],
		layout: { ...DEFAULT_SESSION_BOARD_LAYOUT },
		style: { backgroundPattern: 'grid', sectionTintColor: '#9a3412', sectionTintOpacity: 0.08 },
		builtIn: true,
		createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
		updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
	},
	{
		id: 'built-in-npc-encounter',
		name: 'NPC Encounter',
		description: 'Conversation-focused layout for key NPCs, motives, and clues.',
		tiles: [
			{ id: 'npc-primary', type: 'note', x: 0, y: 0, w: 5, h: 4, previewDepth: 'summary' },
			{ id: 'npc-supporting', type: 'note', x: 5, y: 0, w: 4, h: 4, previewDepth: 'summary' },
			{ id: 'npc-threads', type: 'note', x: 9, y: 0, w: 3, h: 4, previewDepth: 'summary' },
			{ id: 'npc-location', type: 'note', x: 0, y: 4, w: 7, h: 3, previewDepth: 'full' },
			{ id: 'npc-clock', type: 'timer', x: 7, y: 4, w: 5, h: 3 },
		],
		layout: { ...DEFAULT_SESSION_BOARD_LAYOUT },
		style: { backgroundPattern: 'dots', sectionTintColor: '#075985', sectionTintOpacity: 0.08 },
		builtIn: true,
		createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
		updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
	},
	{
		id: 'built-in-exploration',
		name: 'Exploration',
		description: 'Map beats, discoveries, and travel pacing for open-ended play.',
		tiles: [
			{ id: 'explore-location', type: 'note', x: 0, y: 0, w: 6, h: 4, previewDepth: 'full' },
			{ id: 'explore-discoveries', type: 'note', x: 6, y: 0, w: 3, h: 4, previewDepth: 'summary' },
			{ id: 'explore-threats', type: 'note', x: 9, y: 0, w: 3, h: 4, previewDepth: 'summary' },
			{ id: 'explore-calendar', type: 'calendar', x: 0, y: 4, w: 4, h: 3 },
			{ id: 'explore-clock', type: 'timer', x: 4, y: 4, w: 4, h: 3 },
			{ id: 'explore-loot', type: 'note', x: 8, y: 4, w: 4, h: 3, previewDepth: 'summary' },
		],
		layout: { ...DEFAULT_SESSION_BOARD_LAYOUT },
		style: { backgroundPattern: 'grid', sectionTintColor: '#166534', sectionTintOpacity: 0.08 },
		builtIn: true,
		createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
		updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
	},
	{
		id: 'built-in-town-visit',
		name: 'Town Visit',
		description: 'Track district details, faction hooks, and session pace in settlements.',
		tiles: [
			{ id: 'town-overview', type: 'note', x: 0, y: 0, w: 4, h: 4, previewDepth: 'summary' },
			{ id: 'town-npcs', type: 'note', x: 4, y: 0, w: 4, h: 4, previewDepth: 'summary' },
			{ id: 'town-quests', type: 'note', x: 8, y: 0, w: 4, h: 4, previewDepth: 'summary' },
			{ id: 'town-rumors', type: 'note', x: 0, y: 4, w: 6, h: 3, previewDepth: 'full' },
			{ id: 'town-calendar', type: 'calendar', x: 6, y: 4, w: 3, h: 3 },
			{ id: 'town-timer', type: 'timer', x: 9, y: 4, w: 3, h: 3 },
		],
		layout: { ...DEFAULT_SESSION_BOARD_LAYOUT },
		style: { backgroundPattern: 'dots', sectionTintColor: '#854d0e', sectionTintOpacity: 0.08 },
		builtIn: true,
		createdAt: BUILT_IN_TEMPLATE_TIMESTAMP,
		updatedAt: BUILT_IN_TEMPLATE_TIMESTAMP,
	},
] satisfies SessionBoardTemplate[];

export const BUILT_IN_SESSION_BOARD_TEMPLATES: readonly SessionBoardTemplate[] =
	BUILT_IN_TEMPLATE_SEED.map((template) => normalizeTemplate(template, true));

export function normalizeBoardTemplatesSetting(value: unknown): SessionBoardTemplate[] {
	if (!Array.isArray(value)) {
		return [...BUILT_IN_SESSION_BOARD_TEMPLATES];
	}

	const templates: SessionBoardTemplate[] = [];
	for (const rawTemplate of value) {
		if (!isRecord(rawTemplate)) continue;
		if (typeof rawTemplate.id !== 'string' || rawTemplate.id.trim().length === 0) continue;
		if (typeof rawTemplate.name !== 'string') continue;
		if (!Array.isArray(rawTemplate.tiles)) continue;
		const template: SessionBoardTemplate = {
			id: rawTemplate.id,
			name: rawTemplate.name,
			description: typeof rawTemplate.description === 'string' ? rawTemplate.description : '',
			tiles: rawTemplate.tiles as SessionBoardTile[],
			layout: isRecord(rawTemplate.layout)
				? normalizeSessionBoardLayout(rawTemplate.layout as Partial<SessionBoardLayout>)
				: undefined,
			style: isRecord(rawTemplate.style) ? (rawTemplate.style as SessionBoardStyle) : undefined,
			builtIn: rawTemplate.builtIn === true,
			createdAt:
				typeof rawTemplate.createdAt === 'string'
					? rawTemplate.createdAt
					: BUILT_IN_TEMPLATE_TIMESTAMP,
			updatedAt:
				typeof rawTemplate.updatedAt === 'string'
					? rawTemplate.updatedAt
					: BUILT_IN_TEMPLATE_TIMESTAMP,
		};
		templates.push(normalizeTemplate(template, false));
	}

	const byId = new Map<string, SessionBoardTemplate>();
	for (const template of BUILT_IN_SESSION_BOARD_TEMPLATES) {
		byId.set(template.id, template);
	}
	for (const template of templates) {
		if (template.builtIn) continue;
		byId.set(template.id, template);
	}
	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function cloneTemplateForBoard(template: SessionBoardTemplate): SessionBoardTemplate {
	return {
		...template,
		layout: template.layout ? { ...template.layout } : undefined,
		style: template.style ? { ...template.style } : undefined,
		tiles: template.tiles.map((tile) => ({
			...tile,
			style: tile.style ? { ...tile.style } : undefined,
			timer:
				tile.type === 'timer' && tile.timer
					? { ...tile.timer, lapsMs: [...tile.timer.lapsMs] }
					: tile.timer,
			combat:
				tile.type === 'combat' && tile.combat
					? {
							...tile.combat,
							combatants: tile.combat.combatants.map((combatant) => ({
								...combatant,
								conditions: [...combatant.conditions],
								deathSaves: { ...combatant.deathSaves },
								statsPreview: combatant.statsPreview
									? {
											...combatant.statsPreview,
											traits: [...combatant.statsPreview.traits],
											actions: [...combatant.statsPreview.actions],
											reactions: [...combatant.statsPreview.reactions],
											legendaryActions: [...combatant.statsPreview.legendaryActions],
										}
									: undefined,
							})),
						}
					: tile.combat,
		})),
	};
}
