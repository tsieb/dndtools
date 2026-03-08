// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	advanceSessionCombatTurn,
	applyHpChange,
	sortCombatantsByInitiative,
	type SessionCombatTurnState,
} from './session-combat.js';

function buildState(overrides?: Partial<SessionCombatTurnState>): SessionCombatTurnState {
	return {
		combatants: [
			{
				id: 'a',
				name: 'Aria',
				kind: 'pc',
				initiative: 16,
				currentHp: 24,
				maxHp: 30,
				tempHp: 0,
				conditions: [],
			},
			{
				id: 'b',
				name: 'Bandit',
				kind: 'npc',
				initiative: 12,
				currentHp: 11,
				maxHp: 11,
				tempHp: 0,
				conditions: [
					{
						name: 'Prone',
						roundsRemaining: 1,
					},
				],
			},
		],
		currentRound: 2,
		activeCombatantIndex: 0,
		...overrides,
	};
}

describe('session-combat domain', () => {
	it('sorts combatants by initiative descending then by name', () => {
		const sorted = sortCombatantsByInitiative([
			{
				id: 'c',
				name: 'Cinder',
				kind: 'creature',
				initiative: 10,
				currentHp: 5,
				maxHp: 5,
				tempHp: 0,
				conditions: [],
			},
			{
				id: 'b',
				name: 'Bandit',
				kind: 'npc',
				initiative: 12,
				currentHp: 10,
				maxHp: 10,
				tempHp: 0,
				conditions: [],
			},
			{
				id: 'a',
				name: 'Aria',
				kind: 'pc',
				initiative: 12,
				currentHp: 20,
				maxHp: 20,
				tempHp: 0,
				conditions: [],
			},
		]);
		expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
	});

	it('advances to next combatant without incrementing round until wrap', () => {
		const next = advanceSessionCombatTurn(buildState());
		expect(next.currentRound).toBe(2);
		expect(next.activeCombatantIndex).toBe(1);
		expect(next.expiredConditions).toEqual([]);
	});

	it('increments round and expires timed conditions on wrap', () => {
		const wrapped = advanceSessionCombatTurn(buildState({ activeCombatantIndex: 1 }));
		expect(wrapped.currentRound).toBe(3);
		expect(wrapped.activeCombatantIndex).toBe(0);
		expect(wrapped.combatants[1]?.conditions).toEqual([]);
		expect(wrapped.expiredConditions).toEqual([
			{
				combatantId: 'b',
				combatantName: 'Bandit',
				conditionName: 'Prone',
			},
		]);
	});

	it('applies damage through temp HP before current HP', () => {
		const { combatant } = applyHpChange(
			{
				id: 'g',
				name: 'Guard',
				kind: 'npc',
				initiative: 11,
				currentHp: 14,
				maxHp: 14,
				tempHp: 5,
				conditions: [],
			},
			{ mode: 'damage', amount: 7 },
		);
		expect(combatant.tempHp).toBe(0);
		expect(combatant.currentHp).toBe(12);
	});

	it('clamps healing to max HP and allows setting temp HP', () => {
		const healed = applyHpChange(
			{
				id: 'a',
				name: 'Aria',
				kind: 'pc',
				initiative: 16,
				currentHp: 25,
				maxHp: 30,
				tempHp: 0,
				conditions: [],
			},
			{ mode: 'heal', amount: 20 },
		);
		expect(healed.combatant.currentHp).toBe(30);

		const withTemp = applyHpChange(healed.combatant, { mode: 'temp', amount: 9 });
		expect(withTemp.combatant.tempHp).toBe(9);
	});
});
