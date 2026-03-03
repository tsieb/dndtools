import type { NoteId } from './note.js';
import type { VaultObjectId } from './object.js';

/** Branded type for Session Board IDs */
export type SessionBoardId = string & { readonly __brand: 'SessionBoardId' };

export function createSessionBoardId(id: string): SessionBoardId {
	return id as SessionBoardId;
}

export type SessionBoardTileType = 'note' | 'calendar' | 'timer' | 'combat' | 'dice';
export type SessionBoardPreviewDepth = 'title' | 'summary' | 'full';
export type SessionBoardTimerMode = 'elapsed' | 'countdown';
export type CombatantOutcome = 'active' | 'fell' | 'fled';
export type SessionContextCategory = 'npc' | 'location' | 'quest' | 'party';

export interface SessionBoardDeathSaves {
	successes: number;
	failures: number;
}

export interface SessionBoardLinkedStatsPreview {
	size?: string;
	creatureType?: string;
	alignment?: string;
	challengeRating?: string;
	speed?: string;
	proficiencyBonus?: string;
	className?: string;
	level?: number;
	traits: string[];
	actions: string[];
	reactions: string[];
	legendaryActions: string[];
}

export interface SessionBoardCombatant {
	id: string;
	name: string;
	initiative: number | null;
	initiativeModifier: number;
	tieRank: number;
	ready: boolean;
	delayed: boolean;
	isPlayerCharacter: boolean;
	currentHp: number | null;
	maxHp: number | null;
	armorClass: number | null;
	conditions: string[];
	concentration: boolean;
	deathSaves: SessionBoardDeathSaves;
	outcome: CombatantOutcome;
	damageDealt: number;
	linkedObjectId?: VaultObjectId;
	linkedObjectType?: 'stat_block' | 'character';
	linkedObjectName?: string;
	statsPreview?: SessionBoardLinkedStatsPreview;
	statsExpanded?: boolean;
}

export interface SessionBoardCombatState {
	encounterName: string;
	systemId: string;
	round: number;
	activeCombatantId: string | null;
	combatants: SessionBoardCombatant[];
	notes: string;
	loot: string;
	startedAt: string | null;
	endedAt: string | null;
	lastLogNoteId: NoteId | null;
}

export interface SessionBoardTimerState {
	mode: SessionBoardTimerMode;
	running: boolean;
	accumulatedMs: number;
	startedAtMs: number | null;
	countdownMs: number;
	lapsMs: number[];
	minimalDisplay: boolean;
}

export interface SessionBoardTile {
	id: string;
	type?: SessionBoardTileType;
	noteId?: NoteId;
	previewDepth?: SessionBoardPreviewDepth;
	previewLineCount?: number;
	timer?: SessionBoardTimerState;
	combat?: SessionBoardCombatState;
	/** 0-indexed grid column start */
	x: number;
	/** 0-indexed grid row start */
	y: number;
	/** Width in grid columns */
	w: number;
	/** Height in grid rows */
	h: number;
	style?: SessionBoardTileStyle;
}

export type SessionBoardNoteTile = SessionBoardTile;
export type SessionBoardCalendarTile = SessionBoardTile;
export type SessionBoardTimerTile = SessionBoardTile;
export type SessionBoardCombatTile = SessionBoardTile;
export type SessionBoardDiceTile = SessionBoardTile;

export interface SessionBoardTileStyle {
	backgroundColor?: string;
	borderColor?: string;
	borderWidth?: number;
	borderRadius?: number;
	opacity?: number;
	scale?: number;
}

export interface SessionBoardLayout {
	columns: number;
	rowHeight: number;
	minRows: number;
	gap: number;
}

export interface SessionBoardStyle {
	backgroundColor?: string;
	backgroundPattern?: 'none' | 'grid' | 'dots';
	sectionTintColor?: string;
	sectionTintOpacity?: number;
}

export interface SessionContextItem {
	noteId: NoteId;
	category: SessionContextCategory;
	pinnedAt: string;
}

export interface SessionContextState {
	collapsed: boolean;
	items: SessionContextItem[];
}

export interface SessionBoardTemplate {
	id: string;
	name: string;
	description: string;
	tiles: SessionBoardTile[];
	layout?: SessionBoardLayout;
	style?: SessionBoardStyle;
	builtIn?: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface SessionBoard {
	id: SessionBoardId;
	name: string;
	description: string;
	tiles: SessionBoardTile[];
	layout?: SessionBoardLayout;
	style?: SessionBoardStyle;
	sessionContext?: SessionContextState;
	createdAt: string;
	updatedAt: string;
}

export interface RelatedNoteSuggestion {
	noteId: NoteId;
	score: number;
	linkedTo: NoteId[];
	sharedTags: string[];
}
