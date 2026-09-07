import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CHARACTER_RESOURCES_SCHEMA_VERSION,
	EXHAUSTION_MAX,
	dispatchCommand,
	ensureCharacterResources,
	resourcesOf,
	type CharacterResources,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * RC-CHR-1.2 — the REST WORKFLOW. A short rest spends hit dice (rolled from a recorded seed, or taken
 * at their average) and heals by die + CON modifier; a long rest fills the hit-point pool, hands back
 * half the character's hit dice, and removes one level of exhaustion. Every rest records what it did
 * on the expenditure history and on the durable op, so a replica applies the SAME hit points rather
 * than rolling its own.
 */

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

/** Quick-create a sidekick with the given combat block, and return state + its id. */
function setup(
	env: CoreEnvironment,
	combat: Record<string, number> = { hp: 4, maxHp: 20, ac: 12 },
): { state: CoreStateSlice; characterId: string } {
	const created = accepted(
		dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name: 'Pip', visibility: 'player-visible', combat },
		}),
	);
	return {
		state: created.nextState,
		characterId: Object.keys(created.nextState.characters.characters)[0]!,
	};
}

/** Declare the character's hit dice (the DM edits proficiencies as administrator). */
function setHitDice(
	state: CoreStateSlice,
	env: CoreEnvironment,
	characterId: string,
	hitDice: { die: string; total: number; spent: number },
): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'character.set-proficiencies',
			actorId: DM_ACTOR.id,
			payload: { characterId, hitDice },
		}),
	).nextState;
}

/** Start an active session, which is what combat-resource writes (exhaustion) require. */
function startActiveSession(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	const home = accepted(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	return accepted(
		dispatchCommand(home.nextState, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.nextState.commandCenter.homeSceneId! },
		}),
	).nextState;
}

describe('RC-CHR-1.2 — rest workflow', () => {
	it('a short rest spending hit dice at AVERAGE heals a fixed, stated amount per die', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const state = setHitDice(__s.state, env, __s.characterId, { die: 'd8', total: 4, spent: 0 });
		const characterId = __s.characterId;

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'short', hitDice: { spend: 2, mode: 'average' } },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		// A quick-created sidekick has no CON score, so the modifier is 0 and a d8 averages 5 per die.
		expect(character.combat.hp).toBe(14);
		expect(character.proficiencies!.hitDice.spent).toBe(2);
		const entry = resourcesOf(character).ledger.at(-1)!;
		expect(entry.kind).toBe('rest');
		expect(entry.delta).toBe(10);
		expect(entry.label).toContain('spent 2 hit dice');
	});

	it('a short rest spending hit dice by ROLL is reproducible from the recorded seed', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const state = setHitDice(__s.state, env, __s.characterId, { die: 'd10', total: 6, spent: 0 });
		const characterId = __s.characterId;
		const roll = (seed: string) =>
			accepted(
				dispatchCommand(state, env, {
					type: 'character.rest',
					actorId: DM_ACTOR.id,
					payload: { characterId, rest: 'short', hitDice: { spend: 3, mode: 'roll' }, seed },
				}),
			);

		const first = roll('seed-a');
		const again = roll('seed-a');
		const firstHp = first.nextState.characters.characters[characterId]!.combat.hp;
		expect(again.nextState.characters.characters[characterId]!.combat.hp).toBe(firstHp);
		// Every die is a real d10 result, and the rest healed by at least one hit point.
		expect(firstHp).toBeGreaterThan(4);
		expect(firstHp).toBeLessThanOrEqual(4 + 30);
		// A different seed is free to differ; what matters is that the OUTCOME is recorded on the op.
		const op = first.nextState.sync.operations.at(-1)!;
		const value = op.value as { rest: string; outcome: { hitDiceRolls: number[]; seed: number } };
		expect(value.rest).toBe('short');
		expect(value.outcome.hitDiceRolls).toHaveLength(3);
		expect(typeof value.outcome.seed).toBe('number');
	});

	it('spending more hit dice than remain is rejected fail-closed and changes nothing', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const state = setHitDice(__s.state, env, __s.characterId, { die: 'd8', total: 3, spent: 2 });
		const characterId = __s.characterId;
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'short', hitDice: { spend: 2, mode: 'average' } },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		expect(result.rejection.message).toContain('1 hit dice');
		expect(result.nextState.characters.characters[characterId]!.combat.hp).toBe(4);
	});

	it('spending hit dice on a LONG rest is rejected rather than silently wasted', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const state = setHitDice(__s.state, env, __s.characterId, { die: 'd8', total: 4, spent: 0 });
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: {
					characterId: __s.characterId,
					rest: 'long',
					hitDice: { spend: 1, mode: 'average' },
				},
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('a long rest fills hit points, hands back half the hit dice, and removes one exhaustion level', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const characterId = __s.characterId;
		let state = setHitDice(__s.state, env, characterId, { die: 'd8', total: 5, spent: 5 });
		state = startActiveSession(state, env);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'exhaustion', level: 3 },
			}),
		).nextState;
		expect(resourcesOf(state.characters.characters[characterId]!).exhaustion).toBe(3);

		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'long' },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		expect(character.combat.hp).toBe(20);
		// Half of five dice, rounded down, comes back: 5 spent − 2 = 3.
		expect(character.proficiencies!.hitDice.spent).toBe(3);
		expect(resourcesOf(character).exhaustion).toBe(2);
		expect(resourcesOf(character).ledger.at(-1)!.label).toContain('exhaustion down to 2');
	});

	it('a short rest never touches exhaustion or hands hit dice back', () => {
		const env = makeEnvironment();
		const __s = setup(env, { hp: 20, maxHp: 20, ac: 12 });
		const characterId = __s.characterId;
		let state = setHitDice(__s.state, env, characterId, { die: 'd8', total: 4, spent: 3 });
		state = startActiveSession(state, env);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId, kind: 'exhaustion', level: 2 },
			}),
		).nextState;
		const rested = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: DM_ACTOR.id,
				payload: { characterId, rest: 'short' },
			}),
		);
		const character = rested.nextState.characters.characters[characterId]!;
		expect(character.proficiencies!.hitDice.spent).toBe(3);
		expect(resourcesOf(character).exhaustion).toBe(2);
	});

	it('an exhaustion level outside the rule bound is rejected rather than clamped', () => {
		const env = makeEnvironment();
		const __s = setup(env);
		const state = startActiveSession(__s.state, env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.update-combat-resource',
				actorId: DM_ACTOR.id,
				payload: { characterId: __s.characterId, kind: 'exhaustion', level: EXHAUSTION_MAX + 1 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('MIGRATION: a schema-1 resources block hydrates at exhaustion 0 and is stamped at the new version', () => {
		// A block persisted before RC-CHR-1.2 has no `exhaustion` field at all.
		const persisted = {
			deathSaves: { successes: 1, failures: 0, stable: false },
			concentration: { effect: 'bless', since: '2026-01-01T00:00:00.000Z' },
			spellSlots: { '1': { level: 1, max: 2, expended: 1 } },
			spells: [],
			classResources: {},
			ledger: [],
			schemaVersion: 1,
		} as unknown as CharacterResources;
		const hydrated = ensureCharacterResources(persisted);
		expect(hydrated.exhaustion).toBe(0);
		expect(hydrated.schemaVersion).toBe(CHARACTER_RESOURCES_SCHEMA_VERSION);
		expect(CHARACTER_RESOURCES_SCHEMA_VERSION).toBe(2);
		// Every pre-existing field survives the migration untouched.
		expect(hydrated.deathSaves.successes).toBe(1);
		expect(hydrated.spellSlots['1']!.expended).toBe(1);
		expect(hydrated.concentration.effect).toBe('bless');
	});
});
