import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	applySystemAdvantage,
	dispatchCommand,
	orderForTurnModel,
	orderInitiative,
	readRollUnderSystem,
	resolveTurnModel,
	rollExpression,
	type Combatant,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type DiceRollResult,
	type SystemPackage,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-SYS-2.4 — the DICE MODEL and the TURN MODEL come from the active system package.
 *
 * What these tests pin down: a d20 package reads a roll exactly as it always did (5e is unchanged);
 * a pool package reads the SAME recorded draw as a count of successes and marks each die; crit is
 * judged on the package's own crit rules rather than a hard-coded natural 20; advantage follows the
 * package's declared semantics and REFUSES rather than inventing a bonus it was never given; and the
 * tracker is an ordered initiative list or an unordered spotlight roster according to the package's
 * turn model. The encounter log says "successes" under a pool package, because a total there would
 * be quietly wrong in the DM's own history.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function roll(expression: string, seed: number): DiceRollResult {
	const result = rollExpression(expression, seed);
	if (!result.ok) throw new Error(`expected a rollable expression: ${result.error.message}`);
	return result.result;
}

/** A package that differs from a built-in only in the field under test. */
function withDice(base: SystemPackage, dice: Partial<SystemPackage['dice']>): SystemPackage {
	return { ...base, dice: { ...base.dice, ...dice } };
}

function withTurnModel(base: SystemPackage, turnModel: SystemPackage['turnModel']): SystemPackage {
	return { ...base, turnModel };
}

function combatant(id: string, name: string, initiative: number): Combatant {
	return {
		id,
		kind: 'monster',
		name,
		characterId: null,
		statBlock: { ac: 10, initiative, abilities: {}, notes: '' } as Combatant['statBlock'],
		resources: {
			hp: 10,
			maxHp: 10,
			tempHp: 0,
			conditions: [],
			concentration: null,
			deathSaves: { successes: 0, failures: 0 },
		} as unknown as Combatant['resources'],
		hidden: false,
		placeholder: null,
		tieBreak: 0,
	};
}

describe('RC-SYS-2.4 — the dice model comes from the package', () => {
	it('a d20 package leads with the total; 5e reads exactly as it did before the package drove it', () => {
		const result = roll('1d20+5', 4242);
		const readout = readRollUnderSystem(DND5E_SYSTEM_PACKAGE, result);
		expect(readout.model).toBe('d20-plus-modifier');
		expect(readout.headlineKind).toBe('total');
		expect(readout.headline).toBe(result.total);
		expect(readout.successThreshold).toBeNull();
		expect(readout.tier).toBeNull();
		expect(readout.dice.every((die) => die.success === null)).toBe(true);
	});

	it('a pool package reads the SAME recorded draw as successes, and marks each die', () => {
		const result = roll('5d6', 99);
		expect(GENERIC_SYSTEM_PACKAGE.dice.model).toBe('dice-pool');
		expect(GENERIC_SYSTEM_PACKAGE.dice.successThreshold).toBe(4);
		const readout = readRollUnderSystem(GENERIC_SYSTEM_PACKAGE, result);
		expect(readout.headlineKind).toBe('successes');
		expect(readout.successThreshold).toBe(4);
		expect(readout.dice).toHaveLength(5);
		const expected = result.kept.filter((face) => face >= 4).length;
		expect(readout.headline).toBe(expected);
		expect(readout.dice.map((die) => die.success)).toEqual(result.kept.map((face) => face >= 4));
		// The total is still carried: reading a pool never destroys the recorded draw.
		expect(readout.total).toBe(result.total);
	});

	it('crit comes from the package: a natural 20 crits under 5e and does nothing under a package with no crit', () => {
		// Seeded until the widest die shows the package's natural high, so the assertion is about the
		// RULE rather than about one lucky seed.
		let critSeed = 0;
		while (critSeed < 5000 && !roll('1d20', critSeed).kept.includes(20)) critSeed += 1;
		expect(roll('1d20', critSeed).kept).toContain(20);
		expect(readRollUnderSystem(DND5E_SYSTEM_PACKAGE, roll('1d20', critSeed)).crit).toBe('success');

		const noCrit = withDice(DND5E_SYSTEM_PACKAGE, {
			crit: { naturalHigh: null, naturalLow: null, effect: 'none' },
		});
		expect(readRollUnderSystem(noCrit, roll('1d20', critSeed)).crit).toBeNull();
	});

	it('crit is judged on the system core die, not on a damage die riding along in the expression', () => {
		let seed = 0;
		while (seed < 5000) {
			const result = roll('1d20+2d6', seed);
			const d20 = result.terms.find((term) => term.kind === 'dice' && term.sides === 20);
			const d6 = result.terms.find((term) => term.kind === 'dice' && term.sides === 6);
			if (
				d20?.kind === 'dice' &&
				d6?.kind === 'dice' &&
				d20.kept[0] !== 20 &&
				d20.kept[0] !== 1 &&
				d6.kept.includes(6)
			) {
				expect(readRollUnderSystem(DND5E_SYSTEM_PACKAGE, result).crit).toBeNull();
				return;
			}
			seed += 1;
		}
		throw new Error('no seed produced a plain d20 alongside a maximum d6');
	});

	it('a 2d6 package reads a tier off its own crit bounds', () => {
		const pbta = withDice(GENERIC_SYSTEM_PACKAGE, {
			model: '2d6-pbta',
			notation: '2d6',
			successThreshold: null,
			crit: { naturalHigh: 10, naturalLow: 6, effect: 'extra-effect' },
		});
		const tierOf = (total: number): string | null => {
			// Drive the tier off a constant expression so the band, not the RNG, is what is asserted.
			const result = roll(String(total), 1);
			return readRollUnderSystem(pbta, result).tier;
		};
		expect(tierOf(12)).toBe('strong');
		expect(tierOf(10)).toBe('strong');
		expect(tierOf(8)).toBe('partial');
		expect(tierOf(6)).toBe('miss');
		expect(tierOf(2)).toBe('miss');
		// The same bounds are not ALSO reported as a natural crit — they are spoken for by the tier.
		expect(readRollUnderSystem(pbta, roll('2', 1)).crit).toBeNull();
		expect(readRollUnderSystem(pbta, roll('12', 1)).crit).toBeNull();
		// Every other model reads no tier at all.
		expect(readRollUnderSystem(DND5E_SYSTEM_PACKAGE, roll('2d6', 7)).tier).toBeNull();
	});

	it('advantage follows the package: 5e rolls twice and keeps the best, Generic adds a die', () => {
		const fiveE = applySystemAdvantage(DND5E_SYSTEM_PACKAGE, '1d20+5', 'advantage');
		expect(fiveE).toEqual({ expression: '2d20kh1+5', applied: true, reason: 'applied' });
		expect(applySystemAdvantage(DND5E_SYSTEM_PACKAGE, '1d20+5', 'disadvantage').expression).toBe(
			'2d20kl1+5',
		);

		expect(GENERIC_SYSTEM_PACKAGE.dice.advantage).toBe('extra-die');
		expect(applySystemAdvantage(GENERIC_SYSTEM_PACKAGE, '5d6', 'advantage')).toEqual({
			expression: '6d6',
			applied: true,
			reason: 'applied',
		});
		expect(applySystemAdvantage(GENERIC_SYSTEM_PACKAGE, '5d6', 'disadvantage').expression).toBe(
			'4d6',
		);
		// A pool of one never drops below one die.
		expect(applySystemAdvantage(GENERIC_SYSTEM_PACKAGE, '1d6', 'disadvantage').expression).toBe(
			'1d6',
		);
	});

	it('advantage refuses rather than inventing: no semantics, or a bonus size the package never declared', () => {
		const none = withDice(DND5E_SYSTEM_PACKAGE, { advantage: 'none' });
		expect(applySystemAdvantage(none, '1d20', 'advantage')).toEqual({
			expression: '1d20',
			applied: false,
			reason: 'no-advantage',
		});

		const bonus = withDice(DND5E_SYSTEM_PACKAGE, { advantage: 'bonus-modifier' });
		expect(applySystemAdvantage(bonus, '1d20', 'advantage')).toEqual({
			expression: '1d20',
			applied: false,
			reason: 'bonus-size-not-declared',
		});

		// Not the system's core roll ⇒ unchanged, and the caller is told why.
		expect(applySystemAdvantage(DND5E_SYSTEM_PACKAGE, '2d6+1', 'advantage')).toEqual({
			expression: '2d6+1',
			applied: false,
			reason: 'expression-not-core-roll',
		});
		expect(applySystemAdvantage(DND5E_SYSTEM_PACKAGE, 'not dice', 'advantage').applied).toBe(false);
		// `normal` is a no-op under every package.
		expect(applySystemAdvantage(GENERIC_SYSTEM_PACKAGE, '5d6', 'normal')).toEqual({
			expression: '5d6',
			applied: false,
			reason: 'normal',
		});
	});
});

describe('RC-SYS-2.4 — the turn model comes from the package', () => {
	it('5e is an ordered, round-counting initiative tracker', () => {
		expect(resolveTurnModel(DND5E_SYSTEM_PACKAGE)).toEqual({
			kind: 'initiative',
			ordered: true,
			spotlight: false,
			rounds: true,
			actionsPerTurn: null,
			initiativeFormula: 'modifier',
		});
	});

	it('a `none` package is an unordered roster with a spotlight and no rounds', () => {
		expect(GENERIC_SYSTEM_PACKAGE.turnModel).toEqual({ kind: 'none' });
		expect(resolveTurnModel(GENERIC_SYSTEM_PACKAGE)).toEqual({
			kind: 'none',
			ordered: false,
			spotlight: true,
			rounds: false,
			actionsPerTurn: null,
			initiativeFormula: null,
		});
	});

	it('an `actions-per-turn` package carries its action budget; `popcorn` is unordered but still runs turns', () => {
		const actions = resolveTurnModel(
			withTurnModel(GENERIC_SYSTEM_PACKAGE, { kind: 'actions-per-turn', actionsPerTurn: 3 }),
		);
		expect(actions.ordered).toBe(true);
		expect(actions.spotlight).toBe(false);
		expect(actions.actionsPerTurn).toBe(3);

		const popcorn = resolveTurnModel(withTurnModel(GENERIC_SYSTEM_PACKAGE, { kind: 'popcorn' }));
		expect(popcorn.ordered).toBe(false);
		expect(popcorn.spotlight).toBe(false);
		expect(popcorn.rounds).toBe(true);
	});

	it('an ordered model sorts by initiative exactly as before; an unordered one keeps the authored roster order', () => {
		const roster = [
			combatant('c-slow', 'Ogre', 4),
			combatant('c-fast', 'Goblin', 19),
			combatant('c-mid', 'Bandit', 11),
		];
		expect(orderForTurnModel(DND5E_SYSTEM_PACKAGE, roster).order).toEqual(
			orderInitiative(roster).order,
		);
		expect(orderForTurnModel(DND5E_SYSTEM_PACKAGE, roster).order).toEqual([
			'c-fast',
			'c-mid',
			'c-slow',
		]);
		// Under a system that never rolls initiative, sorting by the number would be inventing a rank.
		expect(orderForTurnModel(GENERIC_SYSTEM_PACKAGE, roster).order).toEqual([
			'c-slow',
			'c-fast',
			'c-mid',
		]);
		// The tie-break key is still stamped by input position, so either result is auditable.
		expect(
			orderForTurnModel(GENERIC_SYSTEM_PACKAGE, roster).combatants.map((c) => c.tieBreak),
		).toEqual([0, 1, 2]);
	});

	it('ordering never mutates the caller’s combatants', () => {
		const roster = [combatant('c-a', 'A', 3), combatant('c-b', 'B', 8)];
		orderForTurnModel(DND5E_SYSTEM_PACKAGE, roster);
		orderForTurnModel(GENERIC_SYSTEM_PACKAGE, roster);
		expect(roster.map((c) => c.tieBreak)).toEqual([0, 0]);
	});
});

describe('RC-SYS-2.4 — the encounter log reports what the package says a roll means', () => {
	function activeCombat(): { state: CoreStateSlice; env: CoreEnvironment } {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const home = accept(
			dispatch(base, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		const active = accept(
			dispatch(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
			}),
		).nextState;
		return {
			state: accept(
				dispatch(active, env, {
					type: 'combat.start',
					actorId: DM_ACTOR.id,
					payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }] },
				}),
			).nextState,
			env,
		};
	}

	function lastRollLabel(state: CoreStateSlice): string {
		const entries = state.session.combat.log.filter((entry) => entry.kind === 'roll');
		const last = entries[entries.length - 1];
		if (!last) throw new Error('expected a roll entry in the encounter log');
		return last.label;
	}

	it('under 5e the log records the total; under a pool package the SAME roll records successes', () => {
		const fiveE = activeCombat();
		const rolled = accept(
			dispatch(fiveE.state, fiveE.env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '5d6', seed: 99 },
			}),
		).nextState;
		const total = rolled.session.diceHistory[rolled.session.diceHistory.length - 1]!.total;
		expect(lastRollLabel(rolled)).toBe(`5d6 → ${total}`);

		const generic = activeCombat();
		const switched = accept(
			dispatch(generic.state, generic.env, {
				type: 'system.select',
				actorId: DM_ACTOR.id,
				payload: { packageId: GENERIC_SYSTEM_PACKAGE_ID, acknowledgeLoss: true },
			}),
		).nextState;
		const pooled = accept(
			dispatch(switched, generic.env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '5d6', seed: 99 },
			}),
		).nextState;
		const successes = roll('5d6', 99).kept.filter((face) => face >= 4).length;
		expect(lastRollLabel(pooled)).toBe(
			`5d6 → ${successes === 1 ? '1 success' : `${successes} successes`}`,
		);
	});
});
