import type { SessionCombatantState, SessionConditionName } from '$lib/types/session-state.js';

export interface SessionCombatTurnState {
	combatants: SessionCombatantState[];
	currentRound: number;
	activeCombatantIndex: number;
}

export interface ExpiredConditionNotice {
	combatantId: string;
	combatantName: string;
	conditionName: SessionConditionName;
}

export interface AdvanceSessionCombatResult extends SessionCombatTurnState {
	expiredConditions: ExpiredConditionNotice[];
}

export interface HpApplyInput {
	mode: 'damage' | 'heal' | 'temp';
	amount: number;
}

export interface HpUndoSnapshot {
	previousCurrentHp: number;
	previousTempHp: number;
}

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function sortCombatantsByInitiative(
	combatants: readonly SessionCombatantState[],
): SessionCombatantState[] {
	return [...combatants].sort((left, right) => {
		const leftInit = left.initiative ?? Number.NEGATIVE_INFINITY;
		const rightInit = right.initiative ?? Number.NEGATIVE_INFINITY;
		if (leftInit !== rightInit) return rightInit - leftInit;
		return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
	});
}

export function indexOfCombatant(
	combatants: readonly SessionCombatantState[],
	combatantId: string | null | undefined,
): number {
	if (!combatantId) return -1;
	return combatants.findIndex((combatant) => combatant.id === combatantId);
}

function normalizeTurnState(state: SessionCombatTurnState): SessionCombatTurnState {
	const currentRound = Math.max(1, Math.trunc(state.currentRound));
	const activeCombatantIndex =
		state.combatants.length === 0
			? 0
			: clampInt(state.activeCombatantIndex, 0, state.combatants.length - 1);
	return {
		combatants: [...state.combatants],
		currentRound,
		activeCombatantIndex,
	};
}

function decrementConditionDurations(combatants: readonly SessionCombatantState[]): {
	combatants: SessionCombatantState[];
	expiredConditions: ExpiredConditionNotice[];
} {
	const expiredConditions: ExpiredConditionNotice[] = [];
	const nextCombatants = combatants.map((combatant) => {
		const nextConditions = combatant.conditions.flatMap((condition) => {
			if (condition.roundsRemaining === null) return [condition];
			const nextRounds = condition.roundsRemaining - 1;
			if (nextRounds <= 0) {
				expiredConditions.push({
					combatantId: combatant.id,
					combatantName: combatant.name,
					conditionName: condition.name,
				});
				return [];
			}
			return [{ ...condition, roundsRemaining: nextRounds }];
		});
		return {
			...combatant,
			conditions: nextConditions,
		};
	});
	return {
		combatants: nextCombatants,
		expiredConditions,
	};
}

export function advanceSessionCombatTurn(
	state: SessionCombatTurnState,
): AdvanceSessionCombatResult {
	const normalized = normalizeTurnState(state);
	if (normalized.combatants.length === 0) {
		return {
			...normalized,
			expiredConditions: [],
		};
	}

	const wrapped = normalized.activeCombatantIndex >= normalized.combatants.length - 1;
	const nextActiveCombatantIndex = wrapped ? 0 : normalized.activeCombatantIndex + 1;

	if (!wrapped) {
		return {
			combatants: normalized.combatants,
			currentRound: normalized.currentRound,
			activeCombatantIndex: nextActiveCombatantIndex,
			expiredConditions: [],
		};
	}

	const decremented = decrementConditionDurations(normalized.combatants);
	return {
		combatants: decremented.combatants,
		currentRound: normalized.currentRound + 1,
		activeCombatantIndex: nextActiveCombatantIndex,
		expiredConditions: decremented.expiredConditions,
	};
}

export function applyHpChange(
	combatant: SessionCombatantState,
	input: HpApplyInput,
): { combatant: SessionCombatantState; undo: HpUndoSnapshot } {
	const amount = Math.max(0, Math.trunc(input.amount));
	const undo = {
		previousCurrentHp: combatant.currentHp,
		previousTempHp: combatant.tempHp,
	};
	if (amount === 0) {
		return {
			combatant,
			undo,
		};
	}

	if (input.mode === 'heal') {
		return {
			combatant: {
				...combatant,
				currentHp: Math.min(combatant.maxHp, combatant.currentHp + amount),
			},
			undo,
		};
	}

	if (input.mode === 'temp') {
		return {
			combatant: {
				...combatant,
				tempHp: amount,
			},
			undo,
		};
	}

	const absorbedByTemp = Math.min(combatant.tempHp, amount);
	const damageToHp = amount - absorbedByTemp;
	return {
		combatant: {
			...combatant,
			tempHp: combatant.tempHp - absorbedByTemp,
			currentHp: Math.max(0, combatant.currentHp - damageToHp),
		},
		undo,
	};
}
