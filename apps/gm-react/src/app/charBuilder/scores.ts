/**
 * CharBuilder ability-score pools — the standard array and 4d6-drop-lowest rolls, assigned one
 * value per ability (RC-CHR-5.2).
 *
 * An assignment maps each ability to a SLOT index in the pool (as a string, '' = unassigned), not to
 * the value itself: a rolled pool can hold the same number twice, and keying by value made the
 * second 12 disappear from every other ability's options as soon as the first was used.
 */
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
