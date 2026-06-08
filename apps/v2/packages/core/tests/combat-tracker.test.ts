import { describe, expect, it } from 'vitest';
import {
	advanceTurn,
	dispatchCommand,
	getCombatTrackerForActor,
	orderInitiative,
	type Actor,
	type Combatant,
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
 * SES-002 — RUN COMBAT: the deterministic initiative/round/turn state machine, per-combatant
 * resource application with authority + session-active gating, stat-block previews, and the durable
 * encounter log. Tests are the primary evidence (fail-closed negative cases included).
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

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** Put the session into the `active` workflow (the gate every combat command requires). */
function activeSession(...actors: Actor[]): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const homeSceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		}),
	).nextState;
	return { state: active, env };
}

const TWO_COMBATANTS = [
	{ kind: 'monster' as const, name: 'Goblin', initiative: 18, maxHp: 7 },
	{ kind: 'monster' as const, name: 'Ogre', initiative: 12, maxHp: 30 },
];

describe('SES-002 pure turn/round state machine', () => {
	it('advances turns and wraps to the next round at the end of the order (deterministic)', () => {
		// 3 combatants: turn 0 → 1 → 2 → wrap to round+1 turn 0.
		expect(advanceTurn(1, 0, 3)).toEqual({ round: 1, turn: 1, wrappedRound: false });
		expect(advanceTurn(1, 1, 3)).toEqual({ round: 1, turn: 2, wrappedRound: false });
		expect(advanceTurn(1, 2, 3)).toEqual({ round: 2, turn: 0, wrappedRound: true });
		// An empty order is a no-op.
		expect(advanceTurn(1, 0, 0)).toEqual({ round: 1, turn: 0, wrappedRound: false });
	});

	it('orders initiative descending with a deterministic, stable tie-break', () => {
		const combatants: Combatant[] = ['A', 'B', 'C'].map((name, index) => ({
			id: `c-${index}`,
			kind: 'monster',
			name,
			characterId: null,
			statBlock: { ac: 10, initiative: index === 2 ? 20 : 15, notes: '' },
			resources: {
				hp: 1,
				maxHp: 1,
				tempHp: 0,
				conditions: [],
				deathSaves: { successes: 0, failures: 0, stable: false },
				concentration: { effect: null, since: null },
			},
			hidden: false,
			placeholder: null,
			tieBreak: 0,
		}));
		// C has initiative 20; A and B tie at 15. A appears before B in input ⇒ A acts first on the tie.
		const ordered = orderInitiative(combatants);
		expect(ordered.order).toEqual(['c-2', 'c-0', 'c-1']);
		// The tie-break is recorded on the combatants (input position), so the resolution is auditable.
		expect(ordered.combatants.map((c) => c.tieBreak)).toEqual([0, 1, 2]);
	});
});

describe('SES-002 run combat (commands)', () => {
	it('starts combat, persists initiative order + round/turn, and advances/wraps turns', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		);
		const combat = started.nextState.session.combat;
		expect(combat.status).toBe('running');
		expect(combat.round).toBe(1);
		expect(combat.turn).toBe(0);
		expect(combat.order).toHaveLength(2);
		// Goblin (18) acts before Ogre (12).
		expect(combat.combatants[combat.order[0]!]!.name).toBe('Goblin');
		// A durable op + start log entry exist.
		expect(started.operationIds).toHaveLength(1);
		expect(combat.log[0]!.kind).toBe('combat-started');

		// Advance: turn 0 → 1 (still round 1), then wrap to round 2 turn 0.
		const t1 = accept(
			dispatch(started.nextState, env, {
				type: 'combat.advance-turn',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(t1.session.combat).toMatchObject({ round: 1, turn: 1 });
		const t2 = accept(
			dispatch(t1, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(t2.session.combat).toMatchObject({ round: 2, turn: 0 });
		expect(t2.session.combat.log.some((e) => e.kind === 'round-advanced')).toBe(true);
	});

	it('fails closed when the session is not active and when a non-DM runs combat', () => {
		// Not active: build an idle session.
		const env = makeEnvironment();
		const idle = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const idleResult = rejected(
			dispatch(idle, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		);
		expect(idleResult.rejection.code).toBe('invalid-state');

		// Active, but a player tries to start combat (DM-run only).
		const { state, env: env2 } = activeSession();
		const playerStart = rejected(
			dispatch(state, env2, {
				type: 'combat.start',
				actorId: PLAYER_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		);
		expect(playerStart.rejection.code).toBe('actor-not-authorized');
	});

	it('applies HP/condition/death-save/concentration to a combatant and logs each event', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		).nextState;
		const ogreId = started.session.combat.order.find(
			(id) => started.session.combat.combatants[id]!.name === 'Ogre',
		)!;

		// Damage: 30 → 25.
		let s = accept(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'hp', delta: -5 },
			}),
		).nextState;
		expect(s.session.combat.combatants[ogreId]!.resources.hp).toBe(25);

		// Condition add.
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'condition', condition: 'prone', present: true },
			}),
		).nextState;
		expect(s.session.combat.combatants[ogreId]!.resources.conditions).toContain('prone');

		// Death save failure.
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'death-save', outcome: 'failure' },
			}),
		).nextState;
		expect(s.session.combat.combatants[ogreId]!.resources.deathSaves.failures).toBe(1);

		// Concentration set.
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, kind: 'concentration', effect: 'Bless' },
			}),
		).nextState;
		expect(s.session.combat.combatants[ogreId]!.resources.concentration.effect).toBe('Bless');

		// The encounter log records each event in order.
		const kinds = s.session.combat.log.map((e) => e.kind);
		expect(kinds).toEqual([
			'combat-started',
			'hp-changed',
			'condition-changed',
			'death-save',
			'concentration',
		]);
	});

	it('damage consumes temporary HP first (reuses the CHAR-007 HP rule)', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Wraith', initiative: 14, maxHp: 20 }] },
			}),
		).nextState;
		const id = started.session.combat.order[0]!;
		let s = accept(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: id, kind: 'temp-hp', value: 5 },
			}),
		).nextState;
		// 7 damage: 5 absorbed by temp HP, 2 to HP ⇒ hp 18, temp 0.
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: id, kind: 'hp', delta: -7 },
			}),
		).nextState;
		const wraith = s.session.combat.combatants[id]!;
		expect(wraith.resources.tempHp).toBe(0);
		expect(wraith.resources.hp).toBe(18);
	});

	it('lets an authorized combat-participant edit their character combatant, but fails closed otherwise', () => {
		const { state, env } = activeSession();
		// Quick-create a character and grant the player combat-participant.
		const withChar = accept(
			dispatch(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'npc',
					name: 'Hero',
					visibility: 'player-visible',
					combat: { hp: 10, maxHp: 10, ac: 15 },
				},
			}),
		).nextState;
		const characterId = Object.keys(withChar.characters.characters)[0]!;
		const granted = accept(
			dispatch(withChar, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		const started = accept(
			dispatch(granted, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'character', name: 'Hero', characterId, initiative: 16, maxHp: 10 },
						{ kind: 'monster', name: 'Goblin', initiative: 10, maxHp: 7 },
					],
				},
			}),
		).nextState;
		const heroId = started.session.combat.order.find(
			(id) => started.session.combat.combatants[id]!.characterId === characterId,
		)!;
		const goblinId = started.session.combat.order.find(
			(id) => started.session.combat.combatants[id]!.kind === 'monster',
		)!;

		// The combat-participant player may heal their own character combatant.
		const playerHeal = accept(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: heroId, kind: 'hp', delta: -3 },
			}),
		);
		expect(playerHeal.nextState.session.combat.combatants[heroId]!.resources.hp).toBe(7);

		// The player may NOT edit the monster combatant (no character authority) — fail closed.
		const playerMonster = rejected(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'hp', delta: -3 },
			}),
		);
		expect(playerMonster.rejection.code).toBe('actor-not-authorized');

		// An observer may never edit any combatant.
		const observer = rejected(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: OBSERVER_ACTOR.id,
				payload: { combatantId: heroId, kind: 'hp', delta: -1 },
			}),
		);
		expect(observer.rejection.code).toBe('actor-not-authorized');
	});

	it('ends combat and persists the durable encounter log', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		).nextState;
		const ended = accept(
			dispatch(started, env, {
				type: 'combat.end',
				actorId: DM_ACTOR.id,
				payload: { note: 'Party victorious' },
			}),
		);
		expect(ended.nextState.session.combat.status).toBe('ended');
		const log = ended.nextState.session.combat.log;
		expect(log[log.length - 1]!.kind).toBe('combat-ended');
		expect(log[log.length - 1]!.label).toContain('Party victorious');
	});
});

describe('SES-002 actor-filtered combat tracker view (AC4 hidden combatants)', () => {
	function buildHiddenCombat(): { state: CoreStateSlice; env: CoreEnvironment } {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Bandit', initiative: 14, maxHp: 11 },
						{
							kind: 'monster',
							name: 'Assassin in the shadows',
							initiative: 20,
							maxHp: 20,
							hidden: true,
						},
						{
							kind: 'monster',
							name: 'Lurking horror',
							initiative: 8,
							maxHp: 40,
							hidden: true,
							placeholder: 'Unknown figure',
						},
					],
				},
			}),
		).nextState;
		return { state: started, env };
	}

	it('omits a hidden combatant with no placeholder, and substitutes the DM-approved placeholder', () => {
		const { state } = buildHiddenCombat();
		const playerView = getCombatTrackerForActor(
			state.session.combat,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		const names = playerView.combatants.map((c) => c.name);
		// Bandit is visible; the placeholdered horror shows as "Unknown figure"; the no-placeholder
		// assassin is omitted entirely. The real hidden names never appear.
		expect(names).toContain('Bandit');
		expect(names).toContain('Unknown figure');
		expect(names).not.toContain('Assassin in the shadows');
		expect(names).not.toContain('Lurking horror');
		// The placeholder row exposes NO stat data.
		const placeholderRow = playerView.combatants.find((c) => c.redacted)!;
		expect(placeholderRow.statBlock.ac).toBeNull();
		expect(placeholderRow.resources).toBeNull();
		// The non-DM view never reports a hidden count.
		expect(playerView.hiddenCount).toBe(0);
	});

	it('shows the DM every combatant with full stat data + the hidden count', () => {
		const { state } = buildHiddenCombat();
		const dmView = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
		expect(dmView.combatants).toHaveLength(3);
		expect(dmView.combatants.every((c) => !c.redacted)).toBe(true);
		expect(dmView.hiddenCount).toBe(2);
		// The DM sees full stat blocks (AC/initiative).
		const assassin = dmView.combatants.find((c) => c.name === 'Assassin in the shadows')!;
		expect(assassin.statBlock.initiative).toBe(20);
	});
});

// --- SES-002 AC5: dice rolls during active combat are recorded in the encounter log -----------------

describe('SES-002 AC5: visible dice rolls persisted into the combat encounter log', () => {
	/** Start an active session and begin combat with two monsters. */
	function startCombat(): { state: CoreStateSlice; env: CoreEnvironment } {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		).nextState;
		return { state: started, env };
	}

	it('AC5-1: a roll made during active combat appears as a `roll` entry in the combat log with round/turn context', () => {
		const { state, env } = startCombat();
		const combat = state.session.combat;
		// Roll a session-visible dice expression while combat is running.
		const rolled = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20+4', label: 'Attack roll', seed: 'atk-1' },
			}),
		).nextState;

		// The roll must appear in the combat encounter log.
		const rollEntries = rolled.session.combat.log.filter((e) => e.kind === 'roll');
		expect(rollEntries).toHaveLength(1);
		const entry = rollEntries[0]!;

		// Round/turn context matches the combat state at roll time.
		expect(entry.round).toBe(combat.round);
		expect(entry.turn).toBe(combat.turn);

		// The entry references the session dice-history record.
		const rollRecord = rolled.session.diceHistory[0]!;
		expect(entry.rollId).toBe(rollRecord.id);

		// The label includes the expression and total.
		expect(entry.label).toContain('1d20+4');
		expect(entry.label).toContain(String(rollRecord.total));
		expect(entry.label).toContain('Attack roll');

		// The roll is session-visible.
		expect(entry.rollVisibility).toBe('session-visible');
	});

	it('AC5-2: a DM-only roll is OMITTED from player/observer views but visible to the DM (hard non-leak)', () => {
		const { state, env } = startCombat();
		// DM makes a secret roll.
		const afterRoll = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', visibility: 'dm-only', label: 'Ambush check', seed: 'sec-1' },
			}),
		).nextState;

		// DM view: sees the roll entry.
		const dmView = getCombatTrackerForActor(
			afterRoll.session.combat,
			afterRoll.permissions,
			DM_ACTOR.id,
		);
		const dmRollEntries = dmView.log.filter((e) => e.kind === 'roll');
		expect(dmRollEntries).toHaveLength(1);
		expect(dmRollEntries[0]!.label).toContain('Ambush check');

		// Player view: the roll entry is OMITTED entirely.
		const playerView = getCombatTrackerForActor(
			afterRoll.session.combat,
			afterRoll.permissions,
			PLAYER_ACTOR.id,
		);
		const playerRollEntries = playerView.log.filter((e) => e.kind === 'roll');
		expect(playerRollEntries).toHaveLength(0);
		// Hard non-leak: the serialized player log must not contain any reference to the hidden roll.
		const playerLogJson = JSON.stringify(playerView.log);
		expect(playerLogJson).not.toContain('Ambush check');
		expect(playerLogJson).not.toContain(afterRoll.session.diceHistory[0]!.id);

		// Observer view: also omitted.
		const observerView = getCombatTrackerForActor(
			afterRoll.session.combat,
			afterRoll.permissions,
			OBSERVER_ACTOR.id,
		);
		expect(observerView.log.filter((e) => e.kind === 'roll')).toHaveLength(0);
	});

	it('AC5-3: the encounter log returned at/after combat end includes the visible roll entries', () => {
		const { state, env } = startCombat();
		// Roll a session-visible expression during combat.
		const afterRoll = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '2d6', label: 'Fireball damage', seed: 'fb-1' },
			}),
		).nextState;

		// End combat.
		const afterEnd = accept(
			dispatch(afterRoll, env, {
				type: 'combat.end',
				actorId: DM_ACTOR.id,
				payload: { note: 'Victory' },
			}),
		).nextState;

		// The persisted log must include the roll entry AND the combat-ended entry.
		const log = afterEnd.session.combat.log;
		expect(log.some((e) => e.kind === 'combat-ended')).toBe(true);
		const rollEntries = log.filter((e) => e.kind === 'roll');
		expect(rollEntries).toHaveLength(1);
		expect(rollEntries[0]!.label).toContain('Fireball damage');

		// The tracker view for the DM also surfaces the roll (post-ended).
		const dmView = getCombatTrackerForActor(
			afterEnd.session.combat,
			afterEnd.permissions,
			DM_ACTOR.id,
		);
		expect(dmView.log.filter((e) => e.kind === 'roll')).toHaveLength(1);
		expect(dmView.status).toBe('ended');
	});
});
