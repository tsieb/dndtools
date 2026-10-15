import { describe, expect, it } from 'vitest';
import { DRAFT_ANCESTRY_OPTIONS } from '@dndtools/core';
import { BUILDER, ancestrySummary, classSaveIds } from './data';
import {
	EMPTY_ASSIGNMENT,
	ancestryBonusFor,
	ancestryPicksLegal,
	suggestAncestryPicks,
	withAncestryBonus,
	assignSlot,
	assignedScores,
	assignmentComplete,
	priorityFor,
	rollAbilityScore,
	rollDie,
	suggestAssignment,
} from './scores';

const sequence = (values: number[]) => {
	let n = 0;
	return () => values[n++ % values.length] ?? 1;
};

describe('rollAbilityScore', () => {
	it('drops the lowest of four d6', () => {
		expect(rollAbilityScore(sequence([3, 6, 1, 5]))).toEqual({
			dice: [3, 6, 1, 5],
			dropped: 2,
			total: 14,
		});
	});

	it('drops only one die when the lowest is tied', () => {
		expect(rollAbilityScore(sequence([2, 2, 2, 2])).total).toBe(6);
	});
});

describe('rollDie', () => {
	it('stays within 1..sides and reaches both ends', () => {
		const seen = new Set<number>();
		for (let n = 0; n < 500; n += 1) {
			const d = rollDie(6);
			expect(Number.isInteger(d)).toBe(true);
			expect(d).toBeGreaterThanOrEqual(1);
			expect(d).toBeLessThanOrEqual(6);
			seen.add(d);
		}
		expect(seen.has(1) && seen.has(6)).toBe(true);
	});
});

describe('suggestAssignment', () => {
	it('deals the standard array in the class priority order, a legal 27-point spread', () => {
		const scores = assignedScores(
			BUILDER.standardArray,
			suggestAssignment(BUILDER.standardArray, priorityFor('fighter')),
		);
		expect(scores).toEqual({ STR: 15, CON: 14, DEX: 13, WIS: 12, CHA: 10, INT: 8 });
		const cost = BUILDER.abilityKeys.reduce((s, k) => s + (BUILDER.pointCost[scores[k]] ?? 99), 0);
		expect(cost).toBe(27);
	});

	it('keeps duplicate rolled values on separate slots', () => {
		const pool = [12, 12, 10, 8, 15, 9];
		const assign = suggestAssignment(pool, priorityFor('wizard'));
		expect(assignmentComplete(pool, assign)).toBe(true);
		expect(new Set(Object.values(assign)).size).toBe(6);
		expect(assignedScores(pool, assign)).toMatchObject({ INT: 15, CON: 12, DEX: 12 });
	});

	it('falls back to the table order for a class without a priority', () => {
		expect(priorityFor('artificer')).toEqual(BUILDER.abilityKeys);
	});
});

describe('assignSlot', () => {
	const dealt = suggestAssignment(BUILDER.standardArray, priorityFor('fighter'));

	it('swaps with the ability that already holds the slot', () => {
		const next = assignSlot(dealt, 'DEX', dealt.STR);
		expect(next.DEX).toBe(dealt.STR);
		expect(next.STR).toBe(dealt.DEX);
		expect(assignmentComplete(BUILDER.standardArray, next)).toBe(true);
	});

	it('clears one ability without touching the rest', () => {
		const next = assignSlot(dealt, 'CHA', '');
		expect(next).toEqual({ ...dealt, CHA: '' });
		expect(assignmentComplete(BUILDER.standardArray, next)).toBe(false);
		expect(assignedScores(BUILDER.standardArray, next).CHA).toBe(10);
	});
});

describe('assignmentComplete', () => {
	it('is false for a pool that has not been rolled yet', () => {
		expect(assignmentComplete([], EMPTY_ASSIGNMENT)).toBe(false);
	});
});

describe('ancestry bonuses (RC-ENG-8.8)', () => {
	it('every builder race is a core ancestry, labelled from the bonus the core applies', () => {
		const core = new Set(DRAFT_ANCESTRY_OPTIONS.map((a) => a.value));
		for (const race of BUILDER.races) expect(core.has(race.id), race.id).toBe(true);
		expect(Object.fromEntries(BUILDER.races.map((r) => [r.id, r.sub]))).toEqual({
			human: '+1 to all abilities',
			dwarf: '+2 CON',
			elf: '+2 DEX',
			'half-elf': '+2 CHA, +1 ×2',
			halfling: '+2 DEX',
			tiefling: '+2 CHA, +1 INT',
			dragonborn: '+2 STR, +1 CHA',
			gnome: '+2 INT',
		});
		expect(ancestrySummary('orc')).toBe('');
	});

	it('adds the bonus on top of the base scores', () => {
		const base = assignedScores(
			BUILDER.standardArray,
			suggestAssignment(BUILDER.standardArray, priorityFor('fighter')),
		);
		expect(withAncestryBonus(base, ancestryBonusFor('dwarf', []))).toEqual({
			...base,
			CON: base.CON + 2,
		});
		expect(withAncestryBonus({ ...base, STR: 30 }, ancestryBonusFor('human', [])).STR).toBe(30);
	});

	it("suggests the half-elf's two picks from the class order, never CHA", () => {
		expect(suggestAncestryPicks('half-elf', priorityFor('bard'))).toEqual(['DEX', 'CON']);
		expect(suggestAncestryPicks('dwarf', priorityFor('bard'))).toEqual([]);
		expect(ancestryPicksLegal('half-elf', ['DEX', 'CON'])).toBe(true);
		expect(ancestryPicksLegal('half-elf', ['CHA', 'CON'])).toBe(false);
		expect(ancestryPicksLegal('half-elf', ['CON', 'CON'])).toBe(false);
		expect(ancestryPicksLegal('dwarf', [])).toBe(true);
		expect(ancestryBonusFor('half-elf', ['DEX', 'CON'])).toMatchObject({ CHA: 2, DEX: 1, CON: 1 });
	});

	it("reads a class's save proficiencies as core ability ids", () => {
		const fighter = BUILDER.classes.find((c) => c.id === 'fighter')!;
		expect(classSaveIds(fighter)).toEqual(['str', 'con']);
	});
});
