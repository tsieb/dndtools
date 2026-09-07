import { describe, expect, it } from 'vitest';
import {
	EMPTY_CONCENTRATION,
	applyConcentrationCheckOutcome,
	concentrationCheckDc,
	dispatchCommand,
	getCombatTrackerForActor,
	raiseConcentrationCheck,
	resourcesOf,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-CHR-1.3 — CONCENTRATION AND DEATH SAVES.
 *
 * The rule this slice adds is narrow and deliberately incomplete on purpose: damage taken while
 * concentrating RAISES A PROMPT carrying the DC. The core does not roll the save and never decides
 * that concentration broke — the table reports the outcome back with `concentration-check`.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

/** An active session (the gate every combat/resource write requires). */
function activeSession(): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const state = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
		}),
	).nextState;
	return { state, env };
}

/** A DM-authored character with the given HP, plus an active session. */
function characterSetup(hp = 20): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	characterId: string;
} {
	const { state, env } = activeSession();
	const created = accept(
		dispatch(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name: 'Wren',
				visibility: 'player-visible',
				combat: { hp, maxHp: hp, ac: 13 },
			},
		}),
	);
	return {
		state: created.nextState,
		env,
		characterId: Object.keys(created.nextState.characters.characters)[0]!,
	};
}

/** Combat with one 30 HP monster; returns its combatant id. */
function combatSetup(): { state: CoreStateSlice; env: CoreEnvironment; combatantId: string } {
	const { state, env } = activeSession();
	const started = accept(
		dispatch(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Ogre', initiative: 12, maxHp: 30 }] },
		}),
	);
	return {
		state: started.nextState,
		env,
		combatantId: started.nextState.session.combat.order[0]!,
	};
}

describe('RC-CHR-1.3 — the concentration-check DC', () => {
	it('is 10, or half the damage when that is higher, and 0 when nothing was taken', () => {
		expect(concentrationCheckDc(1)).toBe(10);
		expect(concentrationCheckDc(20)).toBe(10);
		expect(concentrationCheckDc(21)).toBe(10);
		expect(concentrationCheckDc(22)).toBe(11);
		expect(concentrationCheckDc(45)).toBe(22);
		expect(concentrationCheckDc(0)).toBe(0);
		expect(concentrationCheckDc(-3)).toBe(0);
	});

	it('raises nothing when the creature is not concentrating, and replaces an older check', () => {
		expect(raiseConcentrationCheck({ ...EMPTY_CONCENTRATION }, 30, 't0').check ?? null).toBeNull();
		const concentrating = { effect: 'Bless', since: 't0', spellId: null, check: null };
		const first = raiseConcentrationCheck(concentrating, 8, 't1');
		expect(first.check).toEqual({ dc: 10, damage: 8, at: 't1' });
		// A second hit replaces the outstanding check: the newer DC is the one still to beat.
		const second = raiseConcentrationCheck(first, 40, 't2');
		expect(second.check).toEqual({ dc: 20, damage: 40, at: 't2' });
		// The effect itself is untouched — the core never drops it on its own.
		expect(second.effect).toBe('Bless');
	});

	it('clears only the prompt on `kept` and the whole concentration on `lost`', () => {
		const held = {
			effect: 'Bless',
			since: 't0',
			spellId: null,
			check: { dc: 14, damage: 28, at: 't1' },
		};
		expect(applyConcentrationCheckOutcome(held, 'kept')).toEqual({
			effect: 'Bless',
			since: 't0',
			spellId: null,
			check: null,
		});
		expect(applyConcentrationCheckOutcome(held, 'lost')).toEqual(EMPTY_CONCENTRATION);
	});
});

describe('RC-CHR-1.3 — character.update-combat-resource', () => {
	it('records the spell the concentration came from, and raises a check when damage lands', () => {
		const { state, env, characterId } = characterSetup();
		const concentrating = accept(
			dispatch(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: {
					characterId,
					kind: 'concentration',
					effect: 'Hold person',
					spellId: 'spell-hold-person',
				},
			}),
		).nextState;
		const held = resourcesOf(concentrating.characters.characters[characterId]!).concentration;
		expect(held.effect).toBe('Hold person');
		expect(held.spellId).toBe('spell-hold-person');
		expect(held.check ?? null).toBeNull();

		const damaged = accept(
			dispatch(concentrating, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -26 },
			}),
		).nextState;
		const after = resourcesOf(damaged.characters.characters[characterId]!);
		expect(after.concentration.check).toEqual({ dc: 13, damage: 26, at: expect.any(String) });
		// The effect is still running: the prompt is a question, not a verdict.
		expect(after.concentration.effect).toBe('Hold person');
	});

	it('raises no check at all when the character is not concentrating', () => {
		const { state, env, characterId } = characterSetup();
		const healed = accept(
			dispatch(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -10 },
			}),
		).nextState;
		expect(
			resourcesOf(healed.characters.characters[characterId]!).concentration.check ?? null,
		).toBeNull();
	});

	it('reports `kept` (effect runs on) and `lost` (concentration ends), and logs both to the ledger', () => {
		const { state, env, characterId } = characterSetup();
		let s = accept(
			dispatch(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration', effect: 'Bless' },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -30 },
			}),
		).nextState;
		const kept = accept(
			dispatch(s, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration-check', outcome: 'kept' },
			}),
		).nextState;
		const keptResources = resourcesOf(kept.characters.characters[characterId]!);
		expect(keptResources.concentration.effect).toBe('Bless');
		expect(keptResources.concentration.check ?? null).toBeNull();
		expect(keptResources.ledger.at(-1)!.label).toBe('Kept concentration (DC 15)');

		// A fresh hit, then reported as lost: the effect ends.
		const hitAgain = accept(
			dispatch(kept, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -4 },
			}),
		).nextState;
		const lost = accept(
			dispatch(hitAgain, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration-check', outcome: 'lost' },
			}),
		).nextState;
		const lostResources = resourcesOf(lost.characters.characters[characterId]!);
		expect(lostResources.concentration.effect).toBeNull();
		expect(lostResources.ledger.at(-1)!.label).toBe('Lost concentration (DC 10)');
	});

	it('refuses a check nobody owes, so the history never claims one happened', () => {
		const { state, env, characterId } = characterSetup();
		const result = rejected(
			dispatch(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration-check', outcome: 'kept' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		expect(result.rejection.message).toContain('No concentration check');
	});

	it('drops an outstanding check when concentration is set again or dropped', () => {
		const { state, env, characterId } = characterSetup();
		let s = accept(
			dispatch(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration', effect: 'Bless' },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'hp', delta: -12 },
			}),
		).nextState;
		expect(resourcesOf(s.characters.characters[characterId]!).concentration.check).not.toBeNull();
		const recast = accept(
			dispatch(s, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'concentration', effect: 'Web' },
			}),
		).nextState;
		const after = resourcesOf(recast.characters.characters[characterId]!).concentration;
		expect(after.effect).toBe('Web');
		expect(after.check ?? null).toBeNull();
	});
});

describe('RC-CHR-1.3 — combat.apply-resource on the tracker', () => {
	it('raises the check on damage and surfaces its DC on the actor-filtered tracker view', () => {
		const { state, env, combatantId } = combatSetup();
		const concentrating = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration', effect: 'Blur' },
			}),
		).nextState;
		const dmView = getCombatTrackerForActor(
			concentrating.session.combat,
			concentrating.permissions,
			DM_ACTOR.id,
		);
		expect(dmView.combatants[0]!.isConcentrating).toBe(true);
		expect(dmView.combatants[0]!.resources!.concentration.checkDc).toBeNull();

		const damaged = accept(
			dispatch(concentrating, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'hp', delta: -18 },
			}),
		).nextState;
		const view = getCombatTrackerForActor(damaged.session.combat, damaged.permissions, DM_ACTOR.id);
		expect(view.combatants[0]!.resources!.concentration.checkDc).toBe(10);
		expect(view.combatants[0]!.resources!.concentration.effect).toBe('Blur');

		// Reported lost: the effect ends, the prompt goes, and the encounter log says what happened.
		const lost = accept(
			dispatch(damaged, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration-check', outcome: 'lost' },
			}),
		).nextState;
		const lostView = getCombatTrackerForActor(lost.session.combat, lost.permissions, DM_ACTOR.id);
		expect(lostView.combatants[0]!.isConcentrating).toBe(false);
		expect(lostView.combatants[0]!.resources!.concentration.checkDc).toBeNull();
		expect(lost.session.combat.log.at(-1)!.label).toContain('lost concentration on Blur (DC 10)');
	});

	it('refuses a check nobody owes on a combatant', () => {
		const { state, env, combatantId } = combatSetup();
		const result = rejected(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration-check', outcome: 'kept' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('marks a combatant kept at 0 HP as dying, and tracks its death saves to stable', () => {
		const { state, env, combatantId } = combatSetup();
		let s = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'hp', delta: -30 },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'defeated', value: false },
			}),
		).nextState;
		const dying = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id)
			.combatants[0]!;
		expect(dying.isDying).toBe(true);
		expect(dying.isDefeated).toBe(false);

		for (let i = 0; i < 3; i += 1) {
			s = accept(
				dispatch(s, env, {
					type: 'combat.apply-resource',
					actorId: DM_ACTOR.id,
					payload: { combatantId, kind: 'death-save', outcome: 'success' },
				}),
			).nextState;
		}
		const saves = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id)
			.combatants[0]!.resources!.deathSaves;
		expect(saves).toEqual({ successes: 3, failures: 0, stable: true });
	});
});
