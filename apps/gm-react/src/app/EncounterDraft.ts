import type { CommandResult, listCharactersForActor, listEncountersForActor } from '@dndtools/core';
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

/**
 * RC-SES-3.5 — seed initiative and hidden flags from the party's MARCHING ORDER (moved here from the
 * dialog for size, RC-POL-1.4; pure).
 *
 * The marching order already says who is in front, so it is the honest answer to "who reacts first"
 * when a fight opens badly. `party-ambushes` puts the party on top of the order in marching-order
 * sequence; `party-surprised` puts the foes on top AND starts them hidden (players see the tracker's
 * "Unknown creature" placeholder until the DM reveals them). Unplaced party members fall in behind
 * everyone the marching order does place. `none` is the dialog's job: it restores what the fields
 * held before a mode was applied.
 */
export function seedAmbush(
	rows: DraftRow[],
	mode: Exclude<AmbushMode, 'none'>,
	marchingOrder: readonly string[],
): DraftRow[] {
	const partyTop = mode === 'party-ambushes';
	const rank = (r: DraftRow) => {
		const index = r.characterId ? marchingOrder.indexOf(r.characterId) : -1;
		return index >= 0 ? index : marchingOrder.length;
	};
	let foeIndex = 0;
	return rows.map((r) => {
		if (r.kind === 'character') {
			return { ...r, initiative: String((partyTop ? AMBUSH_TOP : AMBUSH_BOTTOM) - rank(r)) };
		}
		const seat = foeIndex;
		foeIndex += 1;
		return {
			...r,
			initiative: String((partyTop ? AMBUSH_BOTTOM : AMBUSH_TOP) - seat),
			// Only the foes' ambush hides them; a party ambush leaves visibility alone.
			hidden: partyTop ? r.hidden : true,
		};
	});
}

/** Typed draft text as a whole number, or `fallback` when it is blank or not a number. */
const whole = (text: string, fallback: number) => Math.trunc(Number(text)) || fallback;

/** The party context both the meter and `encounter.build` read: size ≥ 1, level 1–20. */
export function partyContext(size: string, level: string) {
	return {
		size: Math.max(1, whole(size, 1)),
		averageLevel: Math.min(20, Math.max(1, whole(level, 1))),
	};
}

/** The durable `encounter.build` payload — shared by Save and Start (moved here for size, RC-POL-1.4). */
export function encounterBuildPayload(
	rows: DraftRow[],
	title: string,
	partySize: string,
	partyLevel: string,
) {
	return {
		title,
		combatants: rows.map((r) => ({
			kind: r.kind,
			name: r.name,
			characterId: r.characterId,
			challengeRating: r.kind === 'character' ? 0 : r.cr,
			quantity: r.kind === 'character' ? 1 : Math.max(1, r.quantity),
			maxHp: r.maxHp,
			ac: r.ac,
			// Blank ⇒ roll here (d20 + DEX mod) so the DM never starts a fight of all-0 initiative.
			initiative:
				r.initiative.trim() === ''
					? 1 + Math.floor(Math.random() * 20) + r.dexMod
					: whole(r.initiative, 0),
			hidden: r.hidden,
		})),
		party: partyContext(partySize, partyLevel),
	};
}

/** The `combat.add-combatants` roster for reinforcements. Blank ⇒ null ⇒ the core auto-rolls 1d20. */
export function reinforcementsOf(rows: DraftRow[]) {
	return rows.map((r) => ({
		kind: r.kind,
		name: r.name,
		characterId: r.characterId,
		ac: r.ac,
		initiative: r.initiative.trim() === '' ? null : whole(r.initiative, 0),
		maxHp: r.maxHp,
		hidden: r.hidden,
		quantity: Math.min(20, Math.max(1, r.kind === 'character' ? 1 : r.quantity)),
	}));
}

/**
 * RC-SES-3.5 — rehydrate draft rows from a saved encounter. A selection that still points at a live
 * vault character re-adopts that character's DEX, so a blank initiative rolls the same way it would
 * from the roster picker.
 */
export function rowsFromSaved(
	saved: ReturnType<typeof listEncountersForActor>[number],
	characters: RosterCharacter[],
): DraftRow[] {
	return saved.combatants.map((c) => {
		const character = c.characterId ? characters.find((r) => r.id === c.characterId) : undefined;
		return {
			key: c.characterId ? `char-${c.characterId}` : `saved-${c.id}`,
			kind: c.kind === 'character' || c.kind === 'monster' ? c.kind : 'npc',
			name: c.name,
			characterId: c.characterId,
			maxHp: c.maxHp,
			ac: c.ac,
			initiative: '',
			cr: c.challengeRating,
			quantity: Math.max(1, c.quantity),
			hidden: c.hidden,
			dexMod: character ? dexModOf(character) : 0,
		};
	});
}
