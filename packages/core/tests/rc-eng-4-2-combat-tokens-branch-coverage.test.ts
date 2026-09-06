import { describe, expect, it } from 'vitest';
import {
	EMPTY_SESSION_COMBAT_STATE,
	activeCombatant,
	autoPlaceCombatTokens,
	cloneCombatant,
	getCombatTrackerForActor,
	initiativeInsertionIndex,
	type Combatant,
	type CombatLogEntry,
	type SessionCombatState,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * RC-ENG-4.2 — raises `state/combat-tracker.ts` and `queries/combat-tracker-view.ts` (the "combat
 * tokens" coverage domain, RC-MAP-1.1) to the ≥ 90% branch floor `vitest.config.ts` now enforces.
 * These are direct unit tests of the pure state/query functions rather than through commands, since
 * several of the gaps (a sparse combatant-id array, an `abilityScores` preview, a roll-visibility
 * default) are edge cases the command layer never happens to produce today but the pure functions
 * still contract to handle correctly.
 */

const PERMISSIONS = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
	return {
		id: 'c-1',
		kind: 'monster',
		name: 'Goblin',
		characterId: null,
		statBlock: { ac: 13, initiative: 12, notes: '' },
		resources: {
			hp: 7,
			maxHp: 7,
			tempHp: 0,
			conditions: [],
			deathSaves: { successes: 0, failures: 0, stable: false },
			concentration: { effect: null, since: null },
		},
		hidden: false,
		placeholder: null,
		tieBreak: 0,
		...overrides,
	};
}

describe('RC-ENG-4.2 — autoPlaceCombatTokens tolerates a sparse id array', () => {
	it('skips a hole in the combatant-id array instead of placing a token at index "undefined"', () => {
		const ids: readonly string[] = ['a', undefined as unknown as string, 'b'];
		const tokens = autoPlaceCombatTokens(ids, 'map-1');
		expect(Object.keys(tokens).sort()).toEqual(['a', 'b']);
	});
});

describe('RC-ENG-4.2 — cloneCombatant preserves an ability-score preview when present', () => {
	it('deep-clones abilityScores rather than dropping them', () => {
		const withScores = makeCombatant({
			statBlock: { ac: 13, initiative: 12, notes: '', abilityScores: { str: 16, dex: 12 } },
		});
		const clone = cloneCombatant(withScores);
		expect(clone.statBlock.abilityScores).toEqual({ str: 16, dex: 12 });
		expect(clone.statBlock.abilityScores).not.toBe(withScores.statBlock.abilityScores);
	});

	it('omits abilityScores when the source has none (minimal NPC)', () => {
		const noScores = makeCombatant();
		expect(cloneCombatant(noScores).statBlock.abilityScores).toBeUndefined();
	});
});

describe('RC-ENG-4.2 — initiativeInsertionIndex resolves a stale/missing order entry', () => {
	it('treats an order id with no matching combatant as not blocking the new insertion', () => {
		// "ghost" is listed in the order but absent from the combatants map (a defensive edge the pure
		// helper must not throw on): it contributes nothing to the insertion index.
		const index = initiativeInsertionIndex(
			['ghost', 'c-1'],
			{ 'c-1': makeCombatant({ statBlock: { ac: 13, initiative: 10, notes: '' } }) },
			15,
		);
		expect(index).toBe(0);
	});
});

describe('RC-ENG-4.2 — activeCombatant fails closed on idle/empty/stale state', () => {
	it('returns null when combat is not running', () => {
		expect(activeCombatant({ ...EMPTY_SESSION_COMBAT_STATE, status: 'idle' })).toBeNull();
	});

	it('returns null when the current turn points past an empty order', () => {
		expect(
			activeCombatant({ ...EMPTY_SESSION_COMBAT_STATE, status: 'running', order: [], turn: 0 }),
		).toBeNull();
	});

	it('returns null when the order id at `turn` has no combatant record (stale reference)', () => {
		expect(
			activeCombatant({
				...EMPTY_SESSION_COMBAT_STATE,
				status: 'running',
				order: ['ghost'],
				turn: 0,
				combatants: {},
			}),
		).toBeNull();
	});

	it('returns the live combatant when the order/turn/combatants line up', () => {
		const goblin = makeCombatant();
		expect(
			activeCombatant({
				...EMPTY_SESSION_COMBAT_STATE,
				status: 'running',
				order: [goblin.id],
				turn: 0,
				combatants: { [goblin.id]: goblin },
			}),
		).toEqual(goblin);
	});
});

describe('RC-ENG-4.2 — getCombatTrackerForActor: ability-score preview and roll-visibility fail-closed', () => {
	function stateWith(log: CombatLogEntry[]): SessionCombatState {
		const goblin = makeCombatant({
			statBlock: { ac: 13, initiative: 12, notes: '', abilityScores: { str: 16 } },
		});
		return {
			...EMPTY_SESSION_COMBAT_STATE,
			status: 'running',
			order: [goblin.id],
			turn: 0,
			combatants: { [goblin.id]: goblin },
			log,
		};
	}

	function rollEntry(overrides: Partial<CombatLogEntry> = {}): CombatLogEntry {
		return {
			id: 'log-1',
			round: 1,
			turn: 0,
			kind: 'roll',
			label: 'Attack roll',
			combatantId: null,
			delta: null,
			actorActorId: DM_ACTOR.id,
			actorRole: 'dm',
			at: '2026-06-03T12:00:00.000Z',
			operationId: 'op-1',
			rollId: 'roll-1',
			...overrides,
		};
	}

	it("exposes a fully-visible combatant's ability-score preview to the DM", () => {
		const view = getCombatTrackerForActor(stateWith([]), PERMISSIONS, DM_ACTOR.id);
		expect(view.combatants[0]?.statBlock.abilityScores).toEqual({ str: 16 });
	});

	it('fails a roll entry with no recorded visibility closed to dm-only for a non-DM viewer', () => {
		const view = getCombatTrackerForActor(
			stateWith([rollEntry({ rollVisibility: undefined })]),
			PERMISSIONS,
			PLAYER_ACTOR.id,
		);
		expect(view.log).toEqual([]);
	});

	it('shares a "shared" roll with a listed participant but not an unlisted one', () => {
		const shared = stateWith([
			rollEntry({ rollVisibility: 'shared', rollSharedWith: [PLAYER_ACTOR.id] }),
		]);
		const included = getCombatTrackerForActor(shared, PERMISSIONS, PLAYER_ACTOR.id);
		expect(included.log).toHaveLength(1);

		const notListed = stateWith([rollEntry({ rollVisibility: 'shared', rollSharedWith: [] })]);
		const excluded = getCombatTrackerForActor(notListed, PERMISSIONS, PLAYER_ACTOR.id);
		expect(excluded.log).toEqual([]);
	});

	it('always shows the rolling actor their own "shared" roll even if not separately listed', () => {
		const own = stateWith([
			rollEntry({ rollVisibility: 'shared', actorActorId: PLAYER_ACTOR.id, rollSharedWith: [] }),
		]);
		expect(getCombatTrackerForActor(own, PERMISSIONS, PLAYER_ACTOR.id).log).toHaveLength(1);
	});

	it('shows a "session-visible" roll to every participant', () => {
		const visible = stateWith([rollEntry({ rollVisibility: 'session-visible' })]);
		expect(getCombatTrackerForActor(visible, PERMISSIONS, PLAYER_ACTOR.id).log).toHaveLength(1);
	});
});
