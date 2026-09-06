/**
 * CharBuilder builder-rules data and small pure helpers.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { DRAFT_BACKGROUND_OPTIONS, DRAFT_CLASS_OPTIONS, type CommandResult } from '@dndtools/core';
import type { MessageKey } from '../../i18n';

// ── Builder rules kit — inlined from the design prototype's `campaign-extras.js` (DNDX.builder).
// Static 5e reference data (not campaign mock): races, classes, backgrounds, score methods, and the
// point-buy cost table (which matches the core's CHAR-002 POINT_BUY_COST exactly).
export interface BuilderRace {
	id: string;
	name: string;
	sub: string;
	traits: string;
}
export interface BuilderClass {
	id: string;
	name: string;
	hd: string;
	primary: string;
	saves: string;
	sub: string;
}
export interface BuilderBackground {
	id: string;
	name: string;
	skills: string;
}
export type ScoreMethod = 'standard' | 'pointbuy' | 'manual';
export interface BuilderMethod {
	id: ScoreMethod;
	label: MessageKey;
	note: MessageKey;
}
export type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export const BUILDER: {
	races: BuilderRace[];
	classes: BuilderClass[];
	backgrounds: BuilderBackground[];
	abilityKeys: AbilityKey[];
	methods: BuilderMethod[];
	standardArray: number[];
	pointCost: Record<number, number>;
} = {
	races: [
		{
			id: 'human',
			name: 'Human',
			sub: '+1 to all abilities',
			traits: 'Versatile, extra skill & feat (variant).',
		},
		{
			id: 'dwarf',
			name: 'Dwarf',
			sub: '+2 CON',
			traits: 'Darkvision, poison resilience, stonecunning.',
		},
		{ id: 'elf', name: 'Elf', sub: '+2 DEX', traits: 'Darkvision, fey ancestry, trance.' },
		{
			id: 'half-elf',
			name: 'Half-elf',
			sub: '+2 CHA, +1 ×2',
			traits: 'Darkvision, fey ancestry, two skills.',
		},
		{ id: 'halfling', name: 'Halfling', sub: '+2 DEX', traits: 'Lucky, brave, nimble.' },
		{
			id: 'tiefling',
			name: 'Tiefling',
			sub: '+2 CHA, +1 INT',
			traits: 'Darkvision, hellish resistance, infernal legacy.',
		},
		{
			id: 'dragonborn',
			name: 'Dragonborn',
			sub: '+2 STR, +1 CHA',
			traits: 'Breath weapon, damage resistance.',
		},
		{ id: 'gnome', name: 'Gnome', sub: '+2 INT', traits: 'Darkvision, gnome cunning.' },
	],
	classes: [
		{
			id: 'fighter',
			name: 'Fighter',
			hd: 'd10',
			primary: 'STR or DEX',
			saves: 'STR, CON',
			sub: 'Battle Master, Champion, Eldritch Knight',
		},
		{
			id: 'cleric',
			name: 'Cleric',
			hd: 'd8',
			primary: 'WIS',
			saves: 'WIS, CHA',
			sub: 'Life, Light, War, Tempest',
		},
		{
			id: 'rogue',
			name: 'Rogue',
			hd: 'd8',
			primary: 'DEX',
			saves: 'DEX, INT',
			sub: 'Thief, Assassin, Arcane Trickster',
		},
		{
			id: 'wizard',
			name: 'Wizard',
			hd: 'd6',
			primary: 'INT',
			saves: 'INT, WIS',
			sub: 'Evocation, Abjuration, Divination',
		},
		{
			id: 'ranger',
			name: 'Ranger',
			hd: 'd10',
			primary: 'DEX & WIS',
			saves: 'STR, DEX',
			sub: 'Hunter, Beast Master',
		},
		{
			id: 'barbarian',
			name: 'Barbarian',
			hd: 'd12',
			primary: 'STR',
			saves: 'STR, CON',
			sub: 'Berserker, Totem Warrior',
		},
		{ id: 'bard', name: 'Bard', hd: 'd8', primary: 'CHA', saves: 'DEX, CHA', sub: 'Lore, Valor' },
		{
			id: 'paladin',
			name: 'Paladin',
			hd: 'd10',
			primary: 'STR & CHA',
			saves: 'WIS, CHA',
			sub: 'Devotion, Vengeance',
		},
		{ id: 'druid', name: 'Druid', hd: 'd8', primary: 'WIS', saves: 'INT, WIS', sub: 'Land, Moon' },
		{
			id: 'warlock',
			name: 'Warlock',
			hd: 'd8',
			primary: 'CHA',
			saves: 'WIS, CHA',
			sub: 'Fiend, Archfey, Great Old One',
		},
		{
			id: 'sorcerer',
			name: 'Sorcerer',
			hd: 'd6',
			primary: 'CHA',
			saves: 'CON, CHA',
			sub: 'Draconic, Wild Magic',
		},
		{
			id: 'monk',
			name: 'Monk',
			hd: 'd8',
			primary: 'DEX & WIS',
			saves: 'STR, DEX',
			sub: 'Open Hand, Shadow',
		},
	],
	backgrounds: [
		{ id: 'acolyte', name: 'Acolyte', skills: 'Insight, Religion' },
		{ id: 'soldier', name: 'Soldier', skills: 'Athletics, Intimidation' },
		{ id: 'criminal', name: 'Criminal', skills: 'Deception, Stealth' },
		{ id: 'sage', name: 'Sage', skills: 'Arcana, History' },
		{ id: 'folk-hero', name: 'Folk Hero', skills: 'Animal Handling, Survival' },
		{ id: 'charlatan', name: 'Charlatan', skills: 'Deception, Sleight of Hand' },
		{ id: 'noble', name: 'Noble', skills: 'History, Persuasion' },
		{ id: 'sailor', name: 'Sailor', skills: 'Athletics, Perception' },
	],
	abilityKeys: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
	methods: [
		{
			id: 'standard',
			label: 'charBuilder.method.standard',
			note: 'charBuilder.method.standardNote',
		},
		{
			id: 'pointbuy',
			label: 'charBuilder.method.pointBuy',
			note: 'charBuilder.method.pointBuyNote',
		},
		{ id: 'manual', label: 'charBuilder.method.manual', note: 'charBuilder.method.manualNote' },
	],
	standardArray: [15, 14, 13, 12, 10, 8],
	// 5e point-buy cost: score → points (matches the core's CHAR-002 table).
	pointCost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
};

export type CharKind = 'pc' | 'npc' | 'monster' | 'sidekick';
export const KINDS: { id: CharKind; label: MessageKey; icon: string }[] = [
	{ id: 'pc', label: 'characters.kind.pc', icon: 'characters-person' },
	{ id: 'npc', label: 'characters.kind.npc', icon: 'group' },
	{ id: 'monster', label: 'characters.kind.monster', icon: 'sword' },
	{ id: 'sidekick', label: 'characters.kind.sidekick', icon: 'heart' },
];
export const KIND_LABEL: Record<CharKind, MessageKey> = {
	pc: 'characters.kind.pc',
	npc: 'characters.kind.npc',
	monster: 'characters.kind.monster',
	sidekick: 'characters.kind.sidekick',
};
export const KIND_TONE: Record<CharKind, string> = {
	pc: 'success',
	npc: 'info',
	monster: 'error',
	sidekick: 'warning',
};
export const ALIGNMENTS = [
	'Lawful good',
	'Neutral good',
	'Chaotic good',
	'Lawful neutral',
	'Neutral',
	'Chaotic neutral',
	'Lawful evil',
	'Neutral evil',
	'Chaotic evil',
	'Unaligned',
];

// The class/background ids the core guided PC flow accepts (CHAR-002); everything else is rejected
// at finalize, so the PC path only offers these.
export const CORE_PC_CLASSES = new Set(DRAFT_CLASS_OPTIONS.map((o) => o.value));
export const CORE_PC_BACKGROUNDS = new Set(DRAFT_BACKGROUND_OPTIONS.map((o) => o.value));

/** The character "portrait tone" gradient — single source for the builder's preview swatch and the
 *  roster's CharCard header (Characters.tsx imports this instead of duplicating the raw hexes). */
export const portraitGradient = (deg: number) => `linear-gradient(${deg}deg,#2a2117,#14100b)`;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const modOf = (n: number) => {
	const m = Math.floor((Number(n) - 10) / 2);
	return (m >= 0 ? '+' : '') + m;
};

export interface AttackRow {
	name: string;
	kind: string;
	hit: string;
	dmg: string;
	type: string;
}

export const STEPS = [
	{ id: 'identity', title: 'charBuilder.step.identity', icon: 'characters-person' },
	{ id: 'class', title: 'charBuilder.step.class', icon: 'shield' },
	{ id: 'stats', title: 'charBuilder.step.stats', icon: 'dice' },
	{ id: 'kit', title: 'charBuilder.step.kit', icon: 'sword' },
	{ id: 'bio', title: 'charBuilder.step.bio', icon: 'note-edit' },
	{ id: 'review', title: 'charBuilder.step.review', icon: 'check' },
] as const satisfies readonly { id: string; title: MessageKey; icon: string }[];

/** Pull a string field off the first emitted event of a given kind (mirrors demo-seed). */
export function eventField(result: CommandResult, kind: string, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			const value = (event as Record<string, unknown>)[field];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}
