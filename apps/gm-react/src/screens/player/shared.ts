import type {
	AdvancementState,
	CharacterInventory,
	CharacterResources,
	CharacterView,
	EligibilityResult,
	EncumbranceState,
	JournalEntryView,
	PartyOverview,
} from '@dndtools/core';
import { CONDITIONS } from '../../ds';

/**
 * Shared vocabulary for the owner character sheet: the ability/condition label maps, the small
 * formatting helpers and the two types every panel in this folder takes. Split out of the former
 * 2,677-line `screens/Player.tsx` unchanged — see `../../app/character/abilities` for the three
 * helpers that are genuinely common with the read-only player app.
 */

export const ABIL_LABEL: Record<string, string> = {
	str: 'STR',
	dex: 'DEX',
	con: 'CON',
	int: 'INT',
	wis: 'WIS',
	cha: 'CHA',
};
export const ABIL_FULL: Record<string, string> = {
	STR: 'Strength',
	DEX: 'Dexterity',
	CON: 'Constitution',
	INT: 'Intelligence',
	WIS: 'Wisdom',
	CHA: 'Charisma',
};
const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration',
	blessed: 'blessed',
	prone: 'prone',
	poisoned: 'poisoned',
	stunned: 'stunned',
	frightened: 'frightened',
	restrained: 'restrained',
	grappled: 'grappled',
	invisible: 'invisible',
	paralyzed: 'paralyzed',
	unconscious: 'unconscious',
	charmed: 'charmed',
	blinded: 'blinded',
	deafened: 'deafened',
	petrified: 'petrified',
	incapacitated: 'incapacitated',
	exhaustion: 'exhaustion',
};
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export function condKey(s: string): string | null {
	const C = (CONDITIONS as any) || {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

/** The journal-entry kinds the core accepts (schemas/commands.ts `journalEntryKindSchema`). */
export const JOURNAL_KINDS = [
	{ value: 'note', label: 'Note' },
	{ value: 'bookmark', label: 'Bookmark' },
	{ value: 'npc-impression', label: 'NPC impression' },
	{ value: 'personal-quest', label: 'Personal quest' },
	{ value: 'session-highlight', label: 'Session highlight' },
];

/** Core data resolved for the active actor, plus the chosen PC id used by every write below. */
export interface PlayerData {
	characterId: string | null;
	view: CharacterView | null;
	resources: CharacterResources | null;
	/** Every PC this actor may see (the switcher's options — a player may control multiple PCs). */
	pcs: { id: string; name: string }[];
	/** Pure derived reads (after the visibility gate): passive perception + effective prof bonus. */
	passive: number | null;
	profBonus: number | null;
	journal: JournalEntryView[];
	canAuthorJournal: boolean;
	/** I10 S10.1.3 / S10.4.2 — the durable structured inventory + the DERIVED encumbrance read model. */
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	/** Owner-or-DM: whether the active actor may mutate this character's equipment/currency. */
	canManageInventory: boolean;
	party: PartyOverview;
	/** Real advancement standing from the CHAR-009 model (level, xp, staged draft). */
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	/** DM, or a granted character `owner` — the CHAR-009 command authority (re-checked by the core). */
	canAdvance: boolean;
	isDm: boolean;
}

export type Dispatch = (command: any) => Promise<boolean>;
