import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getSessionRecoveryPrompt,
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
 * UX-SES-002 — the SESSION RECOVERY read model: on restart during an `active`/`paused` session the
 * GUI either confirms a FULL restore (`restored`) or must present the MODAL partial-restore prompt
 * (`partial`) naming exactly which item(s) could not be restored. DM-gated, fail closed.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** An active session with the auto-provisioned home scene as the active scene. */
function activeSession(): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
		}),
	).nextState;
	return { state: active, env };
}

function withRunningCombat(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: {
				combatants: [
					{ kind: 'monster', name: 'Goblin', initiative: 18, maxHp: 7 },
					{ kind: 'monster', name: 'Ogre', initiative: 12, maxHp: 30 },
				],
			},
		}),
	).nextState;
}

describe('UX-SES-002 session recovery read model', () => {
	it('returns kind none when no live session needs recovery (idle / recap workflows)', () => {
		const env = makeEnvironment();
		const idle = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(getSessionRecoveryPrompt(idle, DM_ACTOR.id).kind).toBe('none');
		void env;
	});

	it('reports a FULL restore for an intact active session with running combat', () => {
		const { state, env } = activeSession();
		const running = withRunningCombat(state, env);
		const prompt = getSessionRecoveryPrompt(running, DM_ACTOR.id);
		expect(prompt.kind).toBe('restored');
		expect(prompt.workflow).toBe('active');
		expect(prompt.round).toBe(1);
		expect(prompt.activeCombatantName).toBe('Goblin');
		expect(prompt.missingItems).toEqual([]);
		expect(prompt.restoredItems.join(' ')).toContain('Active scene');
		expect(prompt.restoredItems.join(' ')).toContain('Combat — round 1');
	});

	it('reports a PARTIAL restore naming the missing active scene (AC3)', () => {
		const { state, env } = activeSession();
		void env;
		// Simulate a restore where the active scene record could not be read back.
		const broken: CoreStateSlice = {
			...state,
			scenes: { ...state.scenes, scenes: {} },
		};
		const prompt = getSessionRecoveryPrompt(broken, DM_ACTOR.id);
		expect(prompt.kind).toBe('partial');
		expect(prompt.missingItems).toContain('Active scene');
	});

	it('reports a PARTIAL restore when the combat order names a missing combatant record', () => {
		const { state, env } = activeSession();
		const running = withRunningCombat(state, env);
		const firstId = running.session.combat.order[0]!;
		const combatants = { ...running.session.combat.combatants };
		delete combatants[firstId];
		const broken: CoreStateSlice = {
			...running,
			session: {
				...running.session,
				combat: { ...running.session.combat, combatants },
			},
		};
		const prompt = getSessionRecoveryPrompt(broken, DM_ACTOR.id);
		expect(prompt.kind).toBe('partial');
		expect(prompt.missingItems.join(' ')).toContain('Combat order (1 combatant record missing)');
	});

	it('reports a PARTIAL restore when the turn position is outside the order', () => {
		const { state, env } = activeSession();
		const running = withRunningCombat(state, env);
		const broken: CoreStateSlice = {
			...running,
			session: {
				...running.session,
				combat: { ...running.session.combat, turn: 99 },
			},
		};
		const prompt = getSessionRecoveryPrompt(broken, DM_ACTOR.id);
		expect(prompt.kind).toBe('partial');
		expect(prompt.missingItems).toContain('Combat turn position');
	});

	it('covers a PAUSED session too (restart during pause must also recover)', () => {
		const { state, env } = activeSession();
		const paused = accept(
			dispatch(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'paused', activeSceneId: state.session.activeSceneId },
			}),
		).nextState;
		const prompt = getSessionRecoveryPrompt(paused, DM_ACTOR.id);
		expect(prompt.kind).toBe('restored');
		expect(prompt.workflow).toBe('paused');
	});

	it('is DM-gated fail closed: players, observers, and unknown actors receive kind none', () => {
		const { state, env } = activeSession();
		const running = withRunningCombat(state, env);
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'actor-unknown']) {
			const prompt = getSessionRecoveryPrompt(running, actorId);
			expect(prompt.kind).toBe('none');
			expect(prompt.restoredItems).toEqual([]);
			expect(prompt.missingItems).toEqual([]);
			expect(prompt.activeCombatantName).toBeNull();
		}
	});

	it('never exposes a hidden combatant identity through the active-combatant summary', () => {
		const { state, env } = activeSession();
		const running = accept(
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
							placeholder: 'Unknown creature',
						},
						{ kind: 'monster', name: 'Goblin', initiative: 5, maxHp: 7 },
					],
				},
			}),
		).nextState;
		// The DM sees the real name (their own filtered view)…
		expect(getSessionRecoveryPrompt(running, DM_ACTOR.id).activeCombatantName).toBe('Secret Boss');
		// …and a non-DM gets NO prompt at all (fail closed), so nothing can leak.
		const playerPrompt = getSessionRecoveryPrompt(running, PLAYER_ACTOR.id);
		expect(JSON.stringify(playerPrompt)).not.toContain('Secret Boss');
	});
});
