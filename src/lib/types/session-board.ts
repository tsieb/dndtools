import type { NoteId } from './note.js';
import type { VaultObjectId } from './object.js';
import type { MapFogState } from './map-fog.js';

/** Branded type for Session Board IDs */
export type SessionBoardId = string & { readonly __brand: 'SessionBoardId' };

export function createSessionBoardId(id: string): SessionBoardId {
	return id as SessionBoardId;
}

export type SessionBoardTileType =
	| 'note'
	| 'calendar'
	| 'timer'
	| 'combat'
	| 'encounter'
	| 'dice'
	| 'generator'
	| 'handouts';
export type SessionBoardPreviewDepth = 'title' | 'summary' | 'full';
export type SessionBoardTimerMode = 'elapsed' | 'countdown';
export type CombatantOutcome = 'active' | 'fell' | 'fled';
export type CombatMapTemplateShape = 'sphere' | 'cone' | 'line' | 'cube';
export type CombatMapHistoryKind = 'movement' | 'status' | 'terrain' | 'template' | 'sync' | 'fog';
export type SessionContextCategory = 'npc' | 'location' | 'quest' | 'party';
export type EncounterDifficulty =
	| 'trivial'
	| 'easy'
	| 'medium'
	| 'hard'
	| 'deadly'
	| 'overwhelming';
export type EncounterEnvironmentType = 'forest' | 'dungeon' | 'urban' | 'water' | 'aerial';
export type EncounterNotableRollKind =
	| 'critical_hit'
	| 'critical_failure'
	| 'death_save_success'
	| 'death_save_failure';

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
	startingHp?: number | null;
	linkedObjectId?: VaultObjectId;
	linkedObjectType?: 'stat_block' | 'character';
	linkedObjectName?: string;
	statsPreview?: SessionBoardLinkedStatsPreview;
	statsExpanded?: boolean;
}

export interface SessionBoardCombatLegendaryAction {
	id: string;
	name: string;
	cost: number;
	usedCount: number;
}

export interface SessionBoardCombatLegendaryTracker {
	combatantId: string;
	combatantName: string;
	chargesMax: number;
	chargesRemaining: number;
	actions: SessionBoardCombatLegendaryAction[];
}

export interface SessionBoardCombatLairAction {
	id: string;
	name: string;
	description?: string;
	autoTrigger: boolean;
	usedCount: number;
}

export interface SessionBoardCombatLairTracker {
	enabled: boolean;
	initiativeCount: number;
	lastTriggeredRound: number | null;
	actions: SessionBoardCombatLairAction[];
}

export interface SessionBoardCombatNotableRoll {
	id: string;
	kind: EncounterNotableRollKind;
	combatantName: string;
	combatantId?: string;
	round: number;
	note?: string;
	recordedAt: string;
}

export interface SessionBoardCombatMapToken {
	combatantId: string;
	x: number;
	y: number;
	imageUrl?: string;
	initials?: string;
}

export interface SessionBoardCombatMapTerrainCell {
	x: number;
	y: number;
}

export interface SessionBoardCombatMapTemplate {
	id: string;
	shape: CombatMapTemplateShape;
	originX: number;
	originY: number;
	targetX: number;
	targetY: number;
	radiusSquares?: number;
	widthSquares?: number;
	lengthSquares?: number;
	label?: string;
	createdAt: string;
}

export interface SessionBoardCombatMapHistoryEntry {
	id: string;
	at: string;
	kind: CombatMapHistoryKind;
	message: string;
	combatantId?: string;
}

export interface SessionBoardCombatMapState {
	mapId: string | null;
	tokens: SessionBoardCombatMapToken[];
	difficultTerrain: SessionBoardCombatMapTerrainCell[];
	templates: SessionBoardCombatMapTemplate[];
	selectedCombatantId: string | null;
	history: SessionBoardCombatMapHistoryEntry[];
	fogState?: MapFogState;
}

export interface SessionBoardCombatState {
	encounterName: string;
	systemId: string;
	round: number;
	activeCombatantId: string | null;
	combatants: SessionBoardCombatant[];
	legendaryTrackers: SessionBoardCombatLegendaryTracker[];
	lairTracker: SessionBoardCombatLairTracker;
	notableRolls: SessionBoardCombatNotableRoll[];
	mapState: SessionBoardCombatMapState;
	outcome: string;
	notes: string;
	loot: string;
	startedAt: string | null;
	endedAt: string | null;
	lastLogNoteId: NoteId | null;
}

export interface SessionBoardEncounterPartyMember {
	id: string;
	name: string;
	level: number;
	linkedObjectId?: VaultObjectId;
}

export interface SessionBoardEncounterLegendaryAction {
	id: string;
	name: string;
	cost: number;
	description?: string;
	usedCount: number;
}

export interface SessionBoardEncounterLairAction {
	id: string;
	name: string;
	description?: string;
	autoTrigger: boolean;
	usedCount: number;
}

export interface SessionBoardEncounterCombatantEntry {
	id: string;
	name: string;
	count: number;
	challengeRating: string;
	xpPerCreature: number;
	statBlockObjectId?: VaultObjectId;
	legendaryActions: SessionBoardEncounterLegendaryAction[];
	lairActions: SessionBoardEncounterLairAction[];
}

export interface SessionBoardEncounterChecklistItem {
	id: string;
	label: string;
	checked: boolean;
}

export interface SessionBoardEncounterBudget {
	easy: number;
	medium: number;
	hard: number;
	deadly: number;
	baseXp: number;
	adjustedXp: number;
	multiplier: number;
	difficulty: EncounterDifficulty;
}

export interface SessionBoardEncounterLegendaryTracker {
	combatantEntryId: string;
	combatantName: string;
	chargesMax: number;
	chargesRemaining: number;
	actions: SessionBoardEncounterLegendaryAction[];
}

export interface SessionBoardEncounterLairTracker {
	enabled: boolean;
	initiativeCount: number;
	lastTriggeredRound: number | null;
	actions: SessionBoardEncounterLairAction[];
}

export interface SessionBoardEncounterNotableRoll {
	id: string;
	kind: EncounterNotableRollKind;
	combatantName: string;
	combatantEntryId?: string;
	round: number;
	note?: string;
	recordedAt: string;
}

export interface SessionBoardEncounterState {
	encounterName: string;
	partyMembers: SessionBoardEncounterPartyMember[];
	combatants: SessionBoardEncounterCombatantEntry[];
	environmentType: EncounterEnvironmentType | null;
	environmentNoteId: NoteId | null;
	environmentName: string;
	tacticalChecklist: SessionBoardEncounterChecklistItem[];
	budget: SessionBoardEncounterBudget;
	round: number;
	activeCombatantEntryId: string | null;
	legendaryTrackers: SessionBoardEncounterLegendaryTracker[];
	lairTracker: SessionBoardEncounterLairTracker;
	notableRolls: SessionBoardEncounterNotableRoll[];
	notes: string;
	outcome: string;
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
	encounter?: SessionBoardEncounterState;
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
export type SessionBoardEncounterTile = SessionBoardTile;
export type SessionBoardDiceTile = SessionBoardTile;
export type SessionBoardGeneratorTile = SessionBoardTile;
export type SessionBoardHandoutTile = SessionBoardTile;

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
