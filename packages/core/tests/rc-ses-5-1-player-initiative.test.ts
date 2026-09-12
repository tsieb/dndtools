import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getCombatTrackerForActor,
	type Actor,
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
 * RC-SES-5.1 — PLAYER-ROLLED INITIATIVE. The DM opens a roll-for-initiative call (`combat.start` +
 * `rollForInitiative`), each player rolls for their OWN character through `combat.apply-resource`
 * (`kind: 'initiative'`), the rows reorder as rolls land, the DM adjusts, and the first advance begins
 * round 1. The DM's runtime is the authority: a player can never set another player's initiative.
 */

const SECOND_PLAYER: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Second Player' };

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

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand) {
	return dispatchCommand(state, env, command);
}

/** A live session with two player-owned characters and a DM-held initiative call over them + a monster. */
function callSetup(): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	mine: string;
	theirs: string;
	monster: string;
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, SECOND_PLAYER, OBSERVER_ACTOR);
	state = accept(
		dispatch(state, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	state = accept(
		dispatch(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: state.commandCenter.homeSceneId! },
		}),
	).nextState;

	const characterIds: string[] = [];
	for (const [name, owner] of [
		['Wren', PLAYER_ACTOR.id],
		['Tamsin', SECOND_PLAYER.id],
	] as const) {
		const before = new Set(Object.keys(state.characters.characters));
		state = accept(
			dispatch(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'sidekick',
					name,
					visibility: 'player-visible',
					combat: { hp: 20, maxHp: 20, ac: 13 },
				},
			}),
		).nextState;
		const id = Object.keys(state.characters.characters).find((key) => !before.has(key))!;
		state = accept(
			dispatch(state, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: id,
					playerActorId: owner,
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		characterIds.push(id);
	}

	state = accept(
		dispatch(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: {
				rollForInitiative: true,
				combatants: [
					{ kind: 'character', name: 'Wren', characterId: characterIds[0], maxHp: 20 },
					{ kind: 'character', name: 'Tamsin', characterId: characterIds[1], maxHp: 20 },
					{ kind: 'monster', name: 'Bog Lurker', initiative: 14, maxHp: 22 },
				],
			},
		}),
	).nextState;

	const idOf = (name: string) =>
		Object.values(state.session.combat.combatants).find((c) => c.name === name)!.id;
	return { state, env, mine: idOf('Wren'), theirs: idOf('Tamsin'), monster: idOf('Bog Lurker') };
}

function roll(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	combatantId: string,
	modifier = 2,
): CommandResult {
	return dispatch(state, env, {
		type: 'combat.apply-resource',
		actorId,
		payload: { combatantId, kind: 'initiative', roll: { modifier } },
	});
}

function initiativeOf(state: CoreStateSlice, combatantId: string): number {
	return state.session.combat.combatants[combatantId]!.statBlock.initiative;
}

/** The order must read highest initiative first (ties keep their earlier place). */
function expectOrdered(state: CoreStateSlice): void {
	const values = state.session.combat.order.map((id) => initiativeOf(state, id));
	for (let i = 1; i < values.length; i += 1) {
		expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]!);
	}
}

describe('RC-SES-5.1 the initiative call', () => {
	it('opens the fight before round 1, with the order already sorted and nobody having acted', () => {
		const { state, monster } = callSetup();
		const combat = state.session.combat;
		expect(combat.status).toBe('running');
		expect(combat.round).toBe(0);
		expect(combat.turn).toBe(0);
		// The monster's 14 sits above the two characters still owing a roll (0).
		expect(combat.order[0]).toBe(monster);
		expect(combat.log[0]?.label).toBe('Initiative called for 3 combatant(s).');
	});

	it('a plain start is unchanged: round 1, turn 0', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR);
		state = accept(
			dispatch(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		state = accept(
			dispatch(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: state.commandCenter.homeSceneId! },
			}),
		).nextState;
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 12, maxHp: 7 }] },
			}),
		).nextState;
		expect(started.session.combat.round).toBe(1);
	});

	it('refuses an unknown start key (the call schema stays strict)', () => {
		const { state, env } = callSetup();
		const ended = accept(
			dispatch(state, env, { type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const result = rejected(
			dispatch(ended, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					rollForInitiative: true,
					everyoneRollsTwenty: true,
					combatants: [{ kind: 'monster', name: 'Goblin', initiative: 12, maxHp: 7 }],
				},
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});
});

describe('RC-SES-5.1 a player rolls from their own device', () => {
	it('the core rolls d20 + the declared modifier and the row moves to where the roll puts it', () => {
		const { state, env, mine } = callSetup();
		const result = accept(roll(state, env, PLAYER_ACTOR.id, mine, 3));
		const next = result.nextState;
		const total = initiativeOf(next, mine);
		expect(total).toBeGreaterThanOrEqual(4);
		expect(total).toBeLessThanOrEqual(23);
		expectOrdered(next);
		// Still before round 1, cursor at the top.
		expect(next.session.combat.round).toBe(0);
		expect(next.session.combat.turn).toBe(0);

		// The roll is on the encounter log as a session-visible roll carrying the total.
		const entry = next.session.combat.log.at(-1)!;
		expect(entry.kind).toBe('roll');
		expect(entry.combatantId).toBe(mine);
		expect(entry.delta).toBe(total);
		expect(entry.rollVisibility).toBe('session-visible');
		expect(entry.label).toBe(`Wren rolled initiative: 1d20+3 = ${total}.`);
		expect(result.events[0]).toMatchObject({
			kind: 'combat.resource-applied',
			resourceKind: 'initiative',
		});
		// The durable op sits under the combatant's path, so the collab stream filter gates it per
		// combatant, and it records the seed so a replay reproduces the roll.
		const op = next.sync.operations.at(-1)!;
		expect(op.opType).toBe('combat.resource.initiative');
		expect(op.path).toBe(`combat/combatants/${mine}/initiative`);
		expect(op.value).toMatchObject({ initiative: total, expression: '1d20+3' });

		// Other players see the roll arrive on the tracker.
		const seen = getCombatTrackerForActor(next.session.combat, next.permissions, SECOND_PLAYER.id);
		expect(seen.log.some((e) => e.kind === 'roll' && e.combatantId === mine)).toBe(true);
	});

	it('the same seed yields the same roll (deterministic replay)', () => {
		const a = callSetup();
		const b = callSetup();
		const first = accept(roll(a.state, a.env, PLAYER_ACTOR.id, a.mine)).nextState;
		const second = accept(roll(b.state, b.env, PLAYER_ACTOR.id, b.mine)).nextState;
		expect(initiativeOf(first, a.mine)).toBe(initiativeOf(second, b.mine));
	});

	it("a player cannot set another player's initiative", () => {
		const { state, env, theirs } = callSetup();
		const result = rejected(roll(state, env, PLAYER_ACTOR.id, theirs));
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState).toBe(state);
		expect(initiativeOf(state, theirs)).toBe(0);
		// Nor by naming a value instead of rolling.
		const byValue = rejected(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: theirs, kind: 'initiative', value: 1 },
			}),
		);
		expect(byValue.rejection.code).toBe('actor-not-authorized');
	});

	it('a player cannot roll for a monster, and an observer cannot roll at all', () => {
		const { state, env, mine, monster } = callSetup();
		expect(rejected(roll(state, env, PLAYER_ACTOR.id, monster)).rejection.code).toBe(
			'actor-not-authorized',
		);
		expect(rejected(roll(state, env, OBSERVER_ACTOR.id, mine)).rejection.code).toBe(
			'actor-not-authorized',
		);
	});

	it('a player only rolls: naming a value for their own character is refused', () => {
		const { state, env, mine } = callSetup();
		const result = rejected(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: mine, kind: 'initiative', value: 30 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a player rolls once per call, and never once round 1 has begun', () => {
		const { state, env, mine, theirs } = callSetup();
		const once = accept(roll(state, env, PLAYER_ACTOR.id, mine)).nextState;
		expect(rejected(roll(once, env, PLAYER_ACTOR.id, mine)).rejection.code).toBe('invalid-state');

		const begun = accept(
			dispatch(once, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(rejected(roll(begun, env, SECOND_PLAYER.id, theirs)).rejection.code).toBe(
			'invalid-state',
		);
	});

	it('refuses a modifier outside the bound and a payload carrying both shapes', () => {
		const { state, env, mine } = callSetup();
		expect(rejected(roll(state, env, PLAYER_ACTOR.id, mine, 21)).rejection.code).toBe(
			'invalid-payload',
		);
		expect(
			rejected(
				dispatch(state, env, {
					type: 'combat.apply-resource',
					actorId: DM_ACTOR.id,
					payload: { combatantId: mine, kind: 'initiative', value: 5, roll: { modifier: 1 } },
				}),
			).rejection.code,
		).toBe('invalid-payload');
	});
});

describe('RC-SES-5.1 the DM accepts, adjusts and starts', () => {
	it('an adjustment moves the row and is logged as a reorder carrying the value', () => {
		const { state, env, theirs } = callSetup();
		const next = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: theirs, kind: 'initiative', value: 19 },
			}),
		).nextState;
		expect(next.session.combat.order[0]).toBe(theirs);
		expect(next.session.combat.turn).toBe(0);
		expectOrdered(next);
		const entry = next.session.combat.log.at(-1)!;
		expect(entry.kind).toBe('combatant-reordered');
		expect(entry.delta).toBe(19);
	});

	it('the first advance begins round 1 on the highest initiative; previous turn has nothing to undo', () => {
		const { state, env, mine, theirs } = callSetup();
		let next = accept(roll(state, env, PLAYER_ACTOR.id, mine)).nextState;
		next = accept(
			dispatch(next, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: theirs, kind: 'initiative', value: 25 },
			}),
		).nextState;
		expect(
			rejected(
				dispatch(next, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
			).rejection.message,
		).toBe('Round 1 has not begun yet.');

		const begun = accept(
			dispatch(next, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(begun.nextState.session.combat.round).toBe(1);
		expect(begun.nextState.session.combat.turn).toBe(0);
		expect(begun.nextState.session.combat.order[0]).toBe(theirs);
		expect(begun.nextState.session.combat.log.at(-1)?.label).toBe('Round 1 begins.');
		expect(begun.events[0]).toMatchObject({
			kind: 'combat.turn-advanced',
			round: 1,
			turn: 0,
			activeCombatantId: theirs,
		});
	});

	it('a monster added during the call leaves the cursor at the top', () => {
		const { state, env } = callSetup();
		const next = accept(
			dispatch(state, env, {
				type: 'combat.add-combatants',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Reed Stalker', initiative: 20 }] },
			}),
		).nextState;
		expect(next.session.combat.turn).toBe(0);
		expect(next.session.combat.combatants[next.session.combat.order[0]!]!.name).toBe(
			'Reed Stalker',
		);
	});

	it("a hidden combatant's roll is not session-visible", () => {
		const { state, env, monster } = callSetup();
		const hidden = accept(
			dispatch(state, env, {
				type: 'combat.set-combatant-visibility',
				actorId: DM_ACTOR.id,
				payload: { combatantId: monster, hidden: true },
			}),
		).nextState;
		const next = accept(roll(hidden, env, DM_ACTOR.id, monster, 1)).nextState;
		expect(next.session.combat.log.at(-1)?.rollVisibility).toBe('dm-only');
		const seen = getCombatTrackerForActor(next.session.combat, next.permissions, PLAYER_ACTOR.id);
		expect(seen.log.some((e) => e.combatantId === monster)).toBe(false);
	});
});
