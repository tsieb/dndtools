import { describe, expect, it } from 'vitest';
import {
	advanceTurn,
	dispatchCommand,
	getCombatTrackerForActor,
	orderInitiative,
	previousTurn,
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
	fixedClock,
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

	it('PERM-004 / PERM-006: an expired combat-participant grant is inert on combat.apply-resource (fail-closed)', () => {
		// Clock starts well after the grant expiry so the grant is expired at command evaluation time.
		const EXPIRY = '2026-06-03T10:00:00.000Z';
		const env = makeEnvironment({ clock: fixedClock('2026-06-03T12:00:00.000Z') });
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

		// Quick-create a character combatant.
		const withChar = accept(
			dispatch(base, env, {
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

		// Inject an expired combat-participant grant directly (bypassing command validation which
		// would reject a past-expiry grant at creation time; this simulates a stale/adversarial record).
		const withExpiredGrant: CoreStateSlice = {
			...withChar,
			permissions: {
				...withChar.permissions,
				grants: [
					{
						id: 'stale-cp-grant',
						entityType: 'character',
						entityId: characterId,
						playerActorId: PLAYER_ACTOR.id,
						capabilitySet: 'combat-participant',
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T09:00:00.000Z',
						expiresAt: EXPIRY, // already expired at clock time
					},
				],
			},
		};

		// Activate session and start combat.
		const home = accept(
			dispatch(withExpiredGrant, env, {
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
		const started = accept(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'character', name: 'Hero', characterId, initiative: 16, maxHp: 10 },
					],
				},
			}),
		).nextState;
		const heroId = started.session.combat.order[0]!;

		// The player's combat-participant grant is expired — applying resource MUST be rejected.
		const result = rejected(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: PLAYER_ACTOR.id,
				payload: { combatantId: heroId, kind: 'hp', delta: -3 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
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

// --- A11Y-007 AC2: isBloodied non-color state indicator ------------------------------------------------

describe('A11Y-007 AC2: getCombatTrackerForActor exposes isBloodied for non-color status indicators', () => {
	/** Start an active session and begin combat with one combatant at a given HP. */
	function startWithHp(
		maxHp: number,
	): { state: CoreStateSlice; env: CoreEnvironment; combatantId: string } {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Test Monster', initiative: 10, maxHp }] },
			}),
		).nextState;
		const combatantId = started.session.combat.order[0]!;
		return { state: started, env, combatantId };
	}

	function applyDamage(
		state: CoreStateSlice,
		env: CoreEnvironment,
		combatantId: string,
		damage: number,
	): CoreStateSlice {
		return accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'hp', delta: -damage },
			}),
		).nextState;
	}

	it('isBloodied is false at full HP', () => {
		const { state, combatantId } = startWithHp(20);
		const view = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(20);
		expect(c.isBloodied).toBe(false);
	});

	it('isBloodied is false just above half HP', () => {
		const { state, env, combatantId } = startWithHp(20);
		// 9 damage → 11 HP remaining (above floor(20/2) = 10)
		const after = applyDamage(state, env, combatantId, 9);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(11);
		expect(c.isBloodied).toBe(false);
	});

	it('isBloodied is true at exactly half HP (boundary)', () => {
		const { state, env, combatantId } = startWithHp(20);
		// 10 damage → 10 HP remaining = floor(20/2)
		const after = applyDamage(state, env, combatantId, 10);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(10);
		expect(c.isBloodied).toBe(true);
	});

	it('isBloodied is true well below half HP', () => {
		const { state, env, combatantId } = startWithHp(20);
		// 15 damage → 5 HP remaining
		const after = applyDamage(state, env, combatantId, 15);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(5);
		expect(c.isBloodied).toBe(true);
	});

	it('isBloodied is false at 0 HP (dead, not bloodied)', () => {
		const { state, env, combatantId } = startWithHp(20);
		// 20 damage → 0 HP
		const after = applyDamage(state, env, combatantId, 20);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(0);
		expect(c.isBloodied).toBe(false);
	});

	it('isBloodied is false for a redacted/hidden combatant placeholder (no stat leak)', () => {
		// A combatant with a placeholder but whose stats are withheld from non-DM actors.
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{
							kind: 'monster',
							name: 'Secret Boss',
							initiative: 20,
							maxHp: 100,
							hidden: true,
							placeholder: 'Mysterious Figure',
						},
					],
				},
			}),
		).nextState;
		const bossId = started.session.combat.order[0]!;

		// Take heavy damage so isBloodied would be true for the DM.
		const damaged = applyDamage(started, env, bossId, 80);

		// DM sees full data → isBloodied should be true (80 of 100 HP gone = 20 HP left).
		const dmView = getCombatTrackerForActor(damaged.session.combat, damaged.permissions, DM_ACTOR.id);
		const dmRow = dmView.combatants.find((c) => c.name === 'Secret Boss')!;
		expect(dmRow.isBloodied).toBe(true);

		// Non-DM player sees the placeholder → isBloodied must be false (no stat leak).
		const playerView = getCombatTrackerForActor(
			damaged.session.combat,
			damaged.permissions,
			PLAYER_ACTOR.id,
		);
		const placeholder = playerView.combatants.find((c) => c.redacted)!;
		expect(placeholder).toBeDefined();
		expect(placeholder.resources).toBeNull();
		expect(placeholder.isBloodied).toBe(false);
	});

	it('isBloodied works correctly for odd maxHp (floor rounding)', () => {
		// floor(15/2) = 7, so ≤7 is bloodied, 8+ is not.
		const { state, env, combatantId } = startWithHp(15);

		// 7 damage → 8 HP: NOT bloodied.
		const view8 = getCombatTrackerForActor(
			applyDamage(state, env, combatantId, 7).session.combat,
			state.permissions,
			DM_ACTOR.id,
		);
		expect(view8.combatants.find((c) => c.id === combatantId)!.isBloodied).toBe(false);

		// 8 damage → 7 HP: bloodied.
		const view7 = getCombatTrackerForActor(
			applyDamage(state, env, combatantId, 8).session.combat,
			state.permissions,
			DM_ACTOR.id,
		);
		expect(view7.combatants.find((c) => c.id === combatantId)!.isBloodied).toBe(true);
	});
});

// --- A11Y-011 AC2/AC3: isConcentrating + isDefeated non-color state indicators -----------------------

describe('A11Y-011 AC2: getCombatTrackerForActor exposes isConcentrating for non-color status indicators', () => {
	/** Start an active combat with a single monster. */
	function startCombat(): { state: CoreStateSlice; env: CoreEnvironment; combatantId: string } {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Wizard', initiative: 10, maxHp: 20 }] },
			}),
		).nextState;
		const combatantId = started.session.combat.order[0]!;
		return { state: started, env, combatantId };
	}

	it('isConcentrating is false when no concentration effect is set', () => {
		const { state, combatantId } = startCombat();
		const view = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.concentration.effect).toBeNull();
		expect(c.isConcentrating).toBe(false);
	});

	it('isConcentrating is true when a concentration effect is active', () => {
		const { state, env, combatantId } = startCombat();
		const after = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration', effect: 'Bless' },
			}),
		).nextState;
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.concentration.effect).toBe('Bless');
		expect(c.isConcentrating).toBe(true);
	});

	it('isConcentrating returns to false after concentration is cleared', () => {
		const { state, env, combatantId } = startCombat();
		const withConc = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration', effect: 'Bless' },
			}),
		).nextState;
		const cleared = accept(
			dispatch(withConc, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId, kind: 'concentration', effect: null },
			}),
		).nextState;
		const view = getCombatTrackerForActor(cleared.session.combat, cleared.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.concentration.effect).toBeNull();
		expect(c.isConcentrating).toBe(false);
	});

	it('isConcentrating is false for a redacted/hidden combatant placeholder (no stat leak)', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{
							kind: 'monster',
							name: 'Secret Caster',
							initiative: 20,
							maxHp: 30,
							hidden: true,
							placeholder: 'Mysterious Figure',
						},
					],
				},
			}),
		).nextState;
		const casterId = started.session.combat.order[0]!;

		// Set concentration so isConcentrating would be true for the DM.
		const withConc = accept(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: casterId, kind: 'concentration', effect: 'Hold Person' },
			}),
		).nextState;

		// DM sees isConcentrating = true.
		const dmView = getCombatTrackerForActor(withConc.session.combat, withConc.permissions, DM_ACTOR.id);
		const dmRow = dmView.combatants.find((c) => c.name === 'Secret Caster')!;
		expect(dmRow.isConcentrating).toBe(true);

		// Non-DM player sees the placeholder — isConcentrating must be false (no stat leak).
		const playerView = getCombatTrackerForActor(
			withConc.session.combat,
			withConc.permissions,
			PLAYER_ACTOR.id,
		);
		const placeholder = playerView.combatants.find((c) => c.redacted)!;
		expect(placeholder).toBeDefined();
		expect(placeholder.resources).toBeNull();
		expect(placeholder.isConcentrating).toBe(false);
	});
});

describe('A11Y-011 AC2: getCombatTrackerForActor exposes isDefeated for non-color status indicators', () => {
	function startWithHpSingle(
		maxHp: number,
	): { state: CoreStateSlice; env: CoreEnvironment; combatantId: string } {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Fighter', initiative: 12, maxHp }] },
			}),
		).nextState;
		const combatantId = started.session.combat.order[0]!;
		return { state: started, env, combatantId };
	}

	function applyDmg(state: CoreStateSlice, env: CoreEnvironment, id: string, dmg: number): CoreStateSlice {
		return accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: id, kind: 'hp', delta: -dmg },
			}),
		).nextState;
	}

	it('isDefeated is false at full HP', () => {
		const { state, combatantId } = startWithHpSingle(10);
		const view = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
		expect(view.combatants.find((c) => c.id === combatantId)!.isDefeated).toBe(false);
	});

	it('isDefeated is false while HP is above 0', () => {
		const { state, env, combatantId } = startWithHpSingle(10);
		const after = applyDmg(state, env, combatantId, 9);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(1);
		expect(c.isDefeated).toBe(false);
	});

	it('isDefeated is true at exactly 0 HP', () => {
		const { state, env, combatantId } = startWithHpSingle(10);
		const after = applyDmg(state, env, combatantId, 10);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.resources!.hp).toBe(0);
		expect(c.isDefeated).toBe(true);
	});

	it('isDefeated is mutually exclusive with isBloodied (dead is not bloodied)', () => {
		const { state, env, combatantId } = startWithHpSingle(20);
		const after = applyDmg(state, env, combatantId, 20);
		const view = getCombatTrackerForActor(after.session.combat, after.permissions, DM_ACTOR.id);
		const c = view.combatants.find((x) => x.id === combatantId)!;
		expect(c.isDefeated).toBe(true);
		expect(c.isBloodied).toBe(false); // A11Y-007 guarantees false at 0 HP
	});

	it('isDefeated is false for a redacted/hidden combatant placeholder (no stat leak)', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{
							kind: 'monster',
							name: 'Secret Boss',
							initiative: 20,
							maxHp: 10,
							hidden: true,
							placeholder: 'Mysterious Foe',
						},
					],
				},
			}),
		).nextState;
		const bossId = started.session.combat.order[0]!;
		const downed = applyDmg(started, env, bossId, 10);

		// DM: isDefeated should be true.
		const dmView = getCombatTrackerForActor(downed.session.combat, downed.permissions, DM_ACTOR.id);
		expect(dmView.combatants.find((c) => c.name === 'Secret Boss')!.isDefeated).toBe(true);

		// Non-DM: placeholder row — isDefeated must be false (no stat leak).
		const playerView = getCombatTrackerForActor(
			downed.session.combat,
			downed.permissions,
			PLAYER_ACTOR.id,
		);
		const placeholder = playerView.combatants.find((c) => c.redacted)!;
		expect(placeholder).toBeDefined();
		expect(placeholder.isDefeated).toBe(false);
	});
});

describe('UX-SES-006 previous turn (the undo for an accidental advance)', () => {
	it('previousTurn is the pure inverse of advanceTurn, wrapping back across rounds', () => {
		expect(previousTurn(1, 2, 3)).toEqual({ round: 1, turn: 1, wrappedRound: false });
		expect(previousTurn(1, 1, 3)).toEqual({ round: 1, turn: 0, wrappedRound: false });
		// Wrap back: round 2 turn 0 → round 1, last combatant.
		expect(previousTurn(2, 0, 3)).toEqual({ round: 1, turn: 2, wrappedRound: true });
		// Nothing before round 1 turn 0 (no-op) and an empty order is a no-op.
		expect(previousTurn(1, 0, 3)).toEqual({ round: 1, turn: 0, wrappedRound: false });
		expect(previousTurn(2, 0, 0)).toEqual({ round: 2, turn: 0, wrappedRound: false });
		// Round-trip: advancing then reverting restores the original position.
		const advanced = advanceTurn(1, 2, 3);
		expect(previousTurn(advanced.round, advanced.turn, 3)).toEqual({
			round: 1,
			turn: 2,
			wrappedRound: true,
		});
	});

	it('combat.previous-turn reverts an advance, logs the revert, and wraps back across rounds', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		).nextState;
		const t1 = accept(
			dispatch(started, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(t1.session.combat).toMatchObject({ round: 1, turn: 1 });

		// Prev: back to turn 0 of round 1, with a durable 'turn-reverted' log entry + op.
		const reverted = accept(
			dispatch(t1, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(reverted.nextState.session.combat).toMatchObject({ round: 1, turn: 0 });
		expect(reverted.operationIds).toHaveLength(1);
		const lastEntry = reverted.nextState.session.combat.log.at(-1)!;
		expect(lastEntry.kind).toBe('turn-reverted');
		expect(lastEntry.label).toContain('Goblin');
		expect(reverted.events[0]).toMatchObject({
			kind: 'combat.turn-reverted',
			round: 1,
			turn: 0,
			wrappedRound: false,
		});

		// Advance twice → round 2 turn 0; prev wraps BACK to round 1, last combatant.
		const t2 = accept(
			dispatch(t1, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(t2.session.combat).toMatchObject({ round: 2, turn: 0 });
		const wrapped = accept(
			dispatch(t2, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(wrapped.nextState.session.combat).toMatchObject({ round: 1, turn: 1 });
		expect(wrapped.events[0]).toMatchObject({ kind: 'combat.turn-reverted', wrappedRound: true });
	});

	it('fails closed: first turn of round 1, non-DM actors, inactive session, no combat', () => {
		const { state, env } = activeSession();
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: TWO_COMBATANTS },
			}),
		).nextState;

		// Already at round 1 turn 0: nothing to return to.
		expect(
			rejected(
				dispatch(started, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
			).rejection.code,
		).toBe('invalid-state');

		// DM-only (player and observer rejected).
		const t1 = accept(
			dispatch(started, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		for (const actor of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
			expect(
				rejected(
					dispatch(t1, env, { type: 'combat.previous-turn', actorId: actor.id, payload: {} }),
				).rejection.code,
			).toBe('actor-not-authorized');
		}

		// No combat running.
		const ended = accept(
			dispatch(t1, env, { type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(
			rejected(
				dispatch(ended, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
			).rejection.code,
		).toBe('invalid-state');

		// Inactive session (paused): the active-session gate fails closed.
		const paused = accept(
			dispatch(t1, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'paused', activeSceneId: t1.session.activeSceneId },
			}),
		).nextState;
		expect(
			rejected(
				dispatch(paused, env, { type: 'combat.previous-turn', actorId: DM_ACTOR.id, payload: {} }),
			).rejection.code,
		).toBe('invalid-state');
	});
});

// --- UX-SESSION-combat-editing-conditions-and-player-tracker -------------------------------------

/** Start running combat with TWO_COMBATANTS as the DM (shared setup for the UX-SES-005/007/008 suites). */
function runningCombat(): { state: CoreStateSlice; env: CoreEnvironment } {
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

describe('UX-SES-005 defeated confirmation (the `defeated` resource kind)', () => {
	it('"No — keep at 0" keeps the combatant dying (isDying), not defeated; healing resets it', () => {
		const { state, env } = runningCombat();
		const goblinId = state.session.combat.order[0]!;

		// Drop the goblin to 0 — the default semantics treat hp ≤ 0 as defeated (UX-SES-003 AC3).
		let s = accept(
			dispatch(state, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'hp', delta: -7 },
			}),
		).nextState;
		let view = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id);
		expect(view.combatants.find((c) => c.id === goblinId)).toMatchObject({
			isDefeated: true,
			isDying: false,
		});

		// "No — keep at 0": NOT defeated; the death-save track becomes the active surface (AC3 of
		// UX-SES-007: death saves render only for an at-0, not-defeated combatant).
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'defeated', value: false },
			}),
		).nextState;
		view = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id);
		expect(view.combatants.find((c) => c.id === goblinId)).toMatchObject({
			isDefeated: false,
			isDying: true,
		});
		expect(s.session.combat.log.at(-1)!.kind).toBe('defeated-set');

		// "Yes — defeated" re-applies the defeated treatment.
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'defeated', value: true },
			}),
		).nextState;
		view = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id);
		expect(view.combatants.find((c) => c.id === goblinId)).toMatchObject({
			isDefeated: true,
			isDying: false,
		});

		// Healing above 0 ends the dying/defeated state AND resets the death-save track (5e rule).
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'defeated', value: false },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'death-save', outcome: 'failure' },
			}),
		).nextState;
		expect(s.session.combat.combatants[goblinId]!.resources.deathSaves.failures).toBe(1);
		s = accept(
			dispatch(s, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'hp', delta: 3 },
			}),
		).nextState;
		const resources = s.session.combat.combatants[goblinId]!.resources;
		expect(resources.hp).toBe(3);
		expect(resources.deathSaves).toMatchObject({ successes: 0, failures: 0 });
		expect(resources.notDefeated).toBe(false);
		const healed = getCombatTrackerForActor(s.session.combat, s.permissions, DM_ACTOR.id);
		expect(healed.combatants.find((c) => c.id === goblinId)).toMatchObject({
			isDefeated: false,
			isDying: false,
		});
	});
});

describe('UX-SES-008 add / remove / reorder / visibility (mid-combat combatant management)', () => {
	it('mass-adds "5× Goblin" as "Goblin 1"…"Goblin 5", inserted by initiative, active combatant stable', () => {
		const { state, env } = runningCombat();
		const activeBefore = state.session.combat.order[state.session.combat.turn]!;

		const result = accept(
			dispatch(state, env, {
				type: 'combat.add-combatants',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Goblin Minion', initiative: 15, maxHp: 7, ac: 13, quantity: 5 },
					],
				},
			}),
		);
		const combat = result.nextState.session.combat;
		expect(combat.order).toHaveLength(7);
		const names = combat.order.map((id) => combat.combatants[id]!.name);
		expect(names.filter((n) => n.startsWith('Goblin Minion'))).toEqual([
			'Goblin Minion 1',
			'Goblin Minion 2',
			'Goblin Minion 3',
			'Goblin Minion 4',
			'Goblin Minion 5',
		]);
		// Initiative 15 inserts AFTER Goblin (18) and BEFORE Ogre (12).
		expect(names[0]).toBe('Goblin');
		expect(names.at(-1)).toBe('Ogre');
		// The active combatant did not change.
		expect(combat.order[combat.turn]).toBe(activeBefore);
		// Mass add is logged once; the event carries every new id.
		expect(combat.log.at(-1)!.kind).toBe('combatant-added');
		const event = result.events.find((e) => e.kind === 'combat.combatants-added');
		expect(event && 'combatantIds' in event ? event.combatantIds : []).toHaveLength(5);
	});

	it('auto-rolls a 1d20 initiative deterministically when initiative is blank', () => {
		const { state, env } = runningCombat();
		const added = accept(
			dispatch(state, env, {
				type: 'combat.add-combatants',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Wolf', maxHp: 11, ac: 13 }] },
			}),
		).nextState;
		const wolf = Object.values(added.session.combat.combatants).find((c) => c.name === 'Wolf')!;
		expect(wolf.statBlock.initiative).toBeGreaterThanOrEqual(1);
		expect(wolf.statBlock.initiative).toBeLessThanOrEqual(20);
	});

	it('a hidden add fails closed to the "Unknown creature" placeholder (player sees a placeholder, never the name)', () => {
		const { state, env } = runningCombat();
		const added = accept(
			dispatch(state, env, {
				type: 'combat.add-combatants',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Secret Assassin', initiative: 20, maxHp: 40, hidden: true },
					],
				},
			}),
		).nextState;

		const playerView = getCombatTrackerForActor(
			added.session.combat,
			added.permissions,
			PLAYER_ACTOR.id,
		);
		// The placeholder row is present (position preserved) with stat data withheld.
		const placeholderRow = playerView.combatants.find((c) => c.name === 'Unknown creature');
		expect(placeholderRow).toMatchObject({ redacted: true, resources: null });
		// NO-LEAK: the real name appears nowhere in the player's serialized view.
		expect(JSON.stringify(playerView)).not.toContain('Secret Assassin');
	});

	it('removes a combatant (turn cursor follows the active combatant) and rejects unknown ids', () => {
		const { state, env } = runningCombat();
		// Add a third combatant at initiative 15: order = Goblin(18), Patrol(15), Ogre(12).
		let s = accept(
			dispatch(state, env, {
				type: 'combat.add-combatants',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Patrol', initiative: 15, maxHp: 9 }] },
			}),
		).nextState;
		// Advance to Patrol (turn 1), then remove Goblin (index 0 < turn): the cursor follows Patrol.
		s = accept(
			dispatch(s, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const goblinId = s.session.combat.order[0]!;
		const patrolId = s.session.combat.order[1]!;
		s = accept(
			dispatch(s, env, {
				type: 'combat.remove-combatant',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId },
			}),
		).nextState;
		expect(s.session.combat.order).not.toContain(goblinId);
		expect(s.session.combat.combatants[goblinId]).toBeUndefined();
		expect(s.session.combat.order[s.session.combat.turn]).toBe(patrolId);
		expect(s.session.combat.log.at(-1)!.kind).toBe('combatant-removed');

		expect(
			rejected(
				dispatch(s, env, {
					type: 'combat.remove-combatant',
					actorId: DM_ACTOR.id,
					payload: { combatantId: goblinId },
				}),
			).rejection.code,
		).toBe('combatant-not-found');
	});

	it('removing the ACTIVE last-in-order combatant wraps to the next round', () => {
		const { state, env } = runningCombat();
		// Advance to the Ogre (last in order).
		const s1 = accept(
			dispatch(state, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const ogreId = s1.session.combat.order[1]!;
		const s2 = accept(
			dispatch(s1, env, {
				type: 'combat.remove-combatant',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId },
			}),
		).nextState;
		expect(s2.session.combat.turn).toBe(0);
		expect(s2.session.combat.round).toBe(2);
	});

	it('reorders a combatant one position with the active combatant staying active; ends are rejected', () => {
		const { state, env } = runningCombat();
		const [goblinId, ogreId] = state.session.combat.order as [string, string];

		// Move the Ogre earlier: order flips, and the ACTIVE combatant (Goblin) keeps the turn.
		const moved = accept(
			dispatch(state, env, {
				type: 'combat.reorder-combatant',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ogreId, direction: 'earlier' },
			}),
		).nextState;
		expect(moved.session.combat.order).toEqual([ogreId, goblinId]);
		expect(moved.session.combat.order[moved.session.combat.turn]).toBe(goblinId);
		expect(moved.session.combat.log.at(-1)!.label).toContain('moved to position 1');

		// Moving past the top is rejected (no silent no-op).
		expect(
			rejected(
				dispatch(moved, env, {
					type: 'combat.reorder-combatant',
					actorId: DM_ACTOR.id,
					payload: { combatantId: ogreId, direction: 'earlier' },
				}),
			).rejection.code,
		).toBe('invalid-state');
	});

	it('hide mid-combat immediately yields the placeholder in the player view; unhide reveals (UX-SES-008 AC2)', () => {
		const { state, env } = runningCombat();
		const goblinId = state.session.combat.order[0]!;

		const hidden = accept(
			dispatch(state, env, {
				type: 'combat.set-combatant-visibility',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, hidden: true },
			}),
		).nextState;
		const playerView = getCombatTrackerForActor(
			hidden.session.combat,
			hidden.permissions,
			PLAYER_ACTOR.id,
		);
		const row = playerView.combatants.find((c) => c.id === goblinId);
		// Placeholder (fail-closed default), stat data withheld, no real name anywhere.
		expect(row).toMatchObject({ name: 'Unknown creature', redacted: true, resources: null });
		expect(JSON.stringify(playerView)).not.toContain('Goblin');
		// The DM still sees the real name + the hidden count.
		const dmView = getCombatTrackerForActor(hidden.session.combat, hidden.permissions, DM_ACTOR.id);
		expect(dmView.combatants.find((c) => c.id === goblinId)!.name).toBe('Goblin');
		expect(dmView.hiddenCount).toBe(1);

		// Unhide: the player sees the real combatant again.
		const revealed = accept(
			dispatch(hidden, env, {
				type: 'combat.set-combatant-visibility',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, hidden: false },
			}),
		).nextState;
		const playerAfter = getCombatTrackerForActor(
			revealed.session.combat,
			revealed.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerAfter.combatants.find((c) => c.id === goblinId)).toMatchObject({
			name: 'Goblin',
			redacted: false,
		});
	});

	it('every management command is DM-only and running-combat gated (fail closed)', () => {
		const { state, env } = runningCombat();
		const goblinId = state.session.combat.order[0]!;
		const commands = [
			{
				type: 'combat.add-combatants' as const,
				payload: { combatants: [{ kind: 'monster' as const, name: 'X', maxHp: 1 }] },
			},
			{ type: 'combat.remove-combatant' as const, payload: { combatantId: goblinId } },
			{
				type: 'combat.reorder-combatant' as const,
				payload: { combatantId: goblinId, direction: 'later' as const },
			},
			{
				type: 'combat.set-combatant-visibility' as const,
				payload: { combatantId: goblinId, hidden: true },
			},
		];
		for (const command of commands) {
			for (const actor of [PLAYER_ACTOR, OBSERVER_ACTOR]) {
				expect(
					rejected(dispatch(state, env, { ...command, actorId: actor.id })).rejection.code,
				).toBe('actor-not-authorized');
			}
		}
		// No running combat: the same commands are invalid-state for the DM.
		const ended = accept(
			dispatch(state, env, { type: 'combat.end', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		for (const command of commands) {
			expect(
				rejected(dispatch(ended, env, { ...command, actorId: DM_ACTOR.id })).rejection.code,
			).toBe('invalid-state');
		}
	});

	it('rejects a mass add beyond the 20-per-row cap (schema bound)', () => {
		const { state, env } = runningCombat();
		expect(
			rejected(
				dispatch(state, env, {
					type: 'combat.add-combatants',
					actorId: DM_ACTOR.id,
					payload: {
						combatants: [{ kind: 'monster', name: 'Rat', maxHp: 1, quantity: 21 }],
					},
				}),
			).rejection.code,
		).toBe('invalid-payload');
	});
});
