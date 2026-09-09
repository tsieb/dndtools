import type { CommandResult, listCharactersForActor } from '@dndtools/core';
import type { MessageKey } from '../i18n';

/**
 * The encounter builder's draft model: the row shape the dialog edits, the roster helpers that seed
 * it, and the presentation constants for difficulty and ambush.
 *
 * A pure move out of `EncounterBuilder.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). Nothing here touches React or dispatches anything; it is the data half of the
 * dialog, unchanged apart from being exported.
 */

export type RosterCharacter = ReturnType<typeof listCharactersForActor>[number];

export function extractId(result: CommandResult, key: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		const value = (event as Record<string, unknown>)[key];
		if (typeof value === 'string') return value;
	}
	return null;
}

let draftKeySeq = 0;

/** The draft key for an ad-hoc quick-added foe: unique within the session, stable while editing. */
export function nextQuickDraftKey(): string {
	draftKeySeq += 1;
	return `quick-${draftKeySeq}`;
}

export interface DraftRow {
	key: string;
	/** The tracker combatant kind — vault PCs stay `character` (live sheet mirroring); foes are instances. */
	kind: 'character' | 'npc' | 'monster';
	name: string;
	characterId: string | null;
	maxHp: number;
	ac: number;
	/** Kept as text so blank can mean "auto-roll" (locally at start; core 1d20 on mid-combat add). */
	initiative: string;
	cr: number;
	quantity: number;
	hidden: boolean;
	dexMod: number;
}

export function dexModOf(c: RosterCharacter): number {
	const dex = typeof c.abilityScores?.dex === 'number' ? c.abilityScores.dex : 10;
	return Math.floor((dex - 10) / 2);
}

export function rowFromCharacter(c: RosterCharacter): DraftRow {
	// Vault PCs join as `character` combatants (the core mirrors their live sheet HP). NPC/monster
	// sheets seed per-encounter instances instead — three goblins must not share one sheet.
	const kind = c.kind === 'pc' ? 'character' : c.kind === 'monster' ? 'monster' : 'npc';
	const data = c.data as Record<string, unknown>;
	return {
		key: `char-${c.id}`,
		kind,
		name: c.name,
		characterId: c.id,
		maxHp: c.combat?.maxHp ?? 0,
		ac: c.combat?.ac ?? 10,
		initiative: '',
		cr: typeof data.cr === 'number' ? (data.cr as number) : 1,
		quantity: 1,
		hidden: false,
		dexMod: dexModOf(c),
	};
}

export const DIFFICULTY_BADGE: Record<
	string,
	'neutral' | 'success' | 'info' | 'warning' | 'error'
> = {
	trivial: 'neutral',
	easy: 'success',
	medium: 'info',
	hard: 'warning',
	deadly: 'error',
};

export const KIND_GROUPS: { label: MessageKey; match: (c: RosterCharacter) => boolean }[] = [
	{ label: 'encounter.group.party', match: (c) => c.kind === 'pc' },
	{ label: 'encounter.group.npcs', match: (c) => c.kind === 'npc' || c.kind === 'sidekick' },
	{ label: 'encounter.group.monsters', match: (c) => c.kind === 'monster' },
];

/** The core's difficulty token rendered in the reader's language. */
export const DIFFICULTY_LABEL: Record<string, MessageKey> = {
	trivial: 'encounter.difficulty.trivial',
	easy: 'encounter.difficulty.easy',
	medium: 'encounter.difficulty.medium',
	hard: 'encounter.difficulty.hard',
	deadly: 'encounter.difficulty.deadly',
};

/**
 * RC-SES-3.5 — how the encounter opens. `none` leaves initiative to the table (blank ⇒ auto-roll);
 * the other two seed the initiative block and hidden flags FROM THE MARCHING ORDER, so the front
 * rank acts first within the surprise round. Applying a mode writes real values into the visible
 * initiative fields — nothing is applied invisibly at submit time.
 */
export type AmbushMode = 'none' | 'party-ambushes' | 'party-surprised';

/** The initiative a seeded side starts at; the other side starts below it. Deterministic. */
export const AMBUSH_TOP = 30;
export const AMBUSH_BOTTOM = 10;
