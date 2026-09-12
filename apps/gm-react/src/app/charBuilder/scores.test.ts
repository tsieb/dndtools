import { describe, expect, it } from 'vitest';
import { BUILDER } from './data';
import {
	EMPTY_ASSIGNMENT,
	assignSlot,
	assignedScores,
	assignmentComplete,
	priorityFor,
	rollAbilityScore,
	secureDie,
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

describe('secureDie', () => {
	it('stays within 1..sides', () => {
		for (let n = 0; n < 500; n += 1) {
			const d = secureDie(6);
			expect(d).toBeGreaterThanOrEqual(1);
			expect(d).toBeLessThanOrEqual(6);
		}
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
