import type { NoteId } from './note.js';

/** Branded type for Session Board IDs */
export type SessionBoardId = string & { readonly __brand: 'SessionBoardId' };

export function createSessionBoardId(id: string): SessionBoardId {
	return id as SessionBoardId;
}

export type SessionBoardTileType = 'note' | 'calendar' | 'timer';
export type SessionBoardPreviewDepth = 'title' | 'summary' | 'full';
export type SessionBoardTimerMode = 'elapsed' | 'countdown';

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
	createdAt: string;
	updatedAt: string;
}

export interface RelatedNoteSuggestion {
	noteId: NoteId;
	score: number;
	linkedTo: NoteId[];
	sharedTags: string[];
}
