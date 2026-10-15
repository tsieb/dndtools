/**
 * CharBuilder ability-score pools — the standard array and 4d6-drop-lowest rolls, assigned one
 * value per ability (RC-CHR-5.2).
 *
 * An assignment maps each ability to a SLOT index in the pool (as a string, '' = unassigned), not to
 * the value itself: a rolled pool can hold the same number twice, and keying by value made the
 * second 12 disappear from every other ability's options as soon as the first was used.
 *
 * RC-ENG-8.8 — the ancestry bonus sits ON TOP of whichever method produced the base scores. The
 * bonus itself comes from the core's ancestry table (`ancestryBonuses`), the same one finalize adds.
 */
import { ABILITY_SCORE_CEILING, ancestryBonuses, getDraftAncestry } from '@dndtools/core';
import { BUILDER, type AbilityKey } from './data';

export type Assignment = Record<AbilityKey, string>;

export const EMPTY_ASSIGNMENT: Assignment = Object.freeze({
	STR: '',
	DEX: '',
	CON: '',
	INT: '',
	WIS: '',
	CHA: '',
});

/** One 4d6-drop-lowest result: the four dice as rolled, which one was dropped, and the best three. */
export interface RolledScore {
	dice: number[];
	dropped: number;
	total: number;
}

/**
 * A uniform 1..sides. A character's starting scores need no cryptographic randomness, and GUI code
 * may not reach the `crypto` platform primitive directly (PLAT-006) — so plain `Math.random`.
 */
export function rollDie(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

export function rollAbilityScore(die: (sides: number) => number = rollDie): RolledScore {
	const dice = [die(6), die(6), die(6), die(6)];
	let dropped = 0;
	for (let j = 1; j < dice.length; j += 1) if (dice[j]! < dice[dropped]!) dropped = j;
	const total = dice.reduce((sum, d) => sum + d, 0) - dice[dropped]!;
	return { dice, dropped, total };
}

export function rollAbilityScores(die: (sides: number) => number = rollDie): RolledScore[] {
	return BUILDER.abilityKeys.map(() => rollAbilityScore(die));
}

/**
 * The order each class wants its scores in — the highest pool value goes to the first ability.
 * Follows the 5e quick-build advice for each class.
 */
const CLASS_SCORE_PRIORITY: Record<string, AbilityKey[]> = {
	fighter: ['STR', 'CON', 'DEX', 'WIS', 'CHA', 'INT'],
	cleric: ['WIS', 'CON', 'STR', 'DEX', 'CHA', 'INT'],
	rogue: ['DEX', 'INT', 'CON', 'WIS', 'CHA', 'STR'],
	wizard: ['INT', 'CON', 'DEX', 'WIS', 'CHA', 'STR'],
	ranger: ['DEX', 'WIS', 'CON', 'STR', 'INT', 'CHA'],
	barbarian: ['STR', 'CON', 'DEX', 'WIS', 'CHA', 'INT'],
	bard: ['CHA', 'DEX', 'CON', 'WIS', 'INT', 'STR'],
	paladin: ['STR', 'CHA', 'CON', 'WIS', 'DEX', 'INT'],
	druid: ['WIS', 'CON', 'DEX', 'INT', 'CHA', 'STR'],
	warlock: ['CHA', 'CON', 'DEX', 'WIS', 'INT', 'STR'],
	sorcerer: ['CHA', 'CON', 'DEX', 'WIS', 'INT', 'STR'],
	monk: ['DEX', 'WIS', 'CON', 'STR', 'INT', 'CHA'],
};

export function priorityFor(classId: string): AbilityKey[] {
	return CLASS_SCORE_PRIORITY[classId] ?? BUILDER.abilityKeys;
}

/** Hand the pool's slots, highest value first, to the abilities in `priority` order. */
export function suggestAssignment(
	pool: readonly number[],
	priority: readonly AbilityKey[],
): Assignment {
	const ranked = pool.map((value, slot) => ({ value, slot })).sort((a, b) => b.value - a.value);
	const next: Assignment = { ...EMPTY_ASSIGNMENT };
	priority.forEach((k, rank) => {
		const pick = ranked[rank];
		if (pick) next[k] = String(pick.slot);
	});
	return next;
}

/**
 * Put `slot` on ability `k`. A slot already held by another ability SWAPS with `k`'s old slot, so a
 * fully assigned pool can be rearranged directly instead of clearing one ability first.
 */
export function assignSlot(current: Assignment, k: AbilityKey, slot: string): Assignment {
	const next: Assignment = { ...current };
	if (slot !== '') {
		for (const other of BUILDER.abilityKeys) {
			if (other !== k && next[other] === slot) next[other] = current[k];
		}
	}
	next[k] = slot;
	return next;
}

const slotValue = (pool: readonly number[], slot: string): number | undefined =>
	slot === '' ? undefined : pool[Number(slot)];

/** Each ability's assigned value; an unassigned ability reads as 10. */
export function assignedScores(
	pool: readonly number[],
	assign: Assignment,
): Record<AbilityKey, number> {
	return Object.fromEntries(
		BUILDER.abilityKeys.map((k) => [k, slotValue(pool, assign[k]) ?? 10]),
	) as Record<AbilityKey, number>;
}

export function assignmentComplete(pool: readonly number[], assign: Assignment): boolean {
	return BUILDER.abilityKeys.every((k) => slotValue(pool, assign[k]) !== undefined);
}

/** The ability currently holding `slot`, if any. */
export function slotHolder(assign: Assignment, slot: string): AbilityKey | undefined {
	return BUILDER.abilityKeys.find((k) => assign[k] === slot);
}

const coreId = (k: AbilityKey) => k.toLowerCase();

/** The free picks an ancestry offers ("+1 to two others"), or null when it has none. */
export function ancestryChoice(
	raceId: string,
): { count: number; amount: number; excluded: AbilityKey[] } | null {
	const choice = getDraftAncestry(raceId)?.choice;
	if (!choice) return null;
	return {
		count: choice.count,
		amount: choice.amount,
		excluded: BUILDER.abilityKeys.filter((k) =>
			(choice.excluded as readonly string[]).includes(coreId(k)),
		),
	};
}

/** Whether `picks` is exactly the free choice the ancestry asks for (distinct, none excluded). */
export function ancestryPicksLegal(raceId: string, picks: readonly AbilityKey[]): boolean {
	const choice = ancestryChoice(raceId);
	if (!choice) return picks.length === 0;
	return (
		picks.length === choice.count &&
		new Set(picks).size === choice.count &&
		picks.every((k) => !choice.excluded.includes(k))
	);
}

/** The class's first abilities that the ancestry lets the free picks raise. */
export function suggestAncestryPicks(
	raceId: string,
	priority: readonly AbilityKey[],
): AbilityKey[] {
	const choice = ancestryChoice(raceId);
	if (!choice) return [];
	return priority.filter((k) => !choice.excluded.includes(k)).slice(0, choice.count);
}

/** Each ability's ancestry bonus (0 when none). */
export function ancestryBonusFor(
	raceId: string,
	picks: readonly AbilityKey[],
): Record<AbilityKey, number> {
	const bonuses = ancestryBonuses(raceId, picks.map(coreId)) as Record<string, number>;
	return Object.fromEntries(BUILDER.abilityKeys.map((k) => [k, bonuses[coreId(k)] ?? 0])) as Record<
		AbilityKey,
		number
	>;
}

/** Base scores with the bonus added, capped like the core caps them. */
export function withAncestryBonus(
	base: Record<AbilityKey, number>,
	bonus: Record<AbilityKey, number>,
): Record<AbilityKey, number> {
	return Object.fromEntries(
		BUILDER.abilityKeys.map((k) => [k, Math.min(ABILITY_SCORE_CEILING, base[k] + bonus[k])]),
	) as Record<AbilityKey, number>;
}
