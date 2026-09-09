import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getQuickTimerForActor,
	type CommandResult,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

// RC-SES-4.4 — the session-level quick-panel timer: DM-only countdown/break with lap marks, only a
// BREAK timer's remaining time is projected to players.

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function reject(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') {
		throw new Error('expected rejected, got accepted');
	}
	return result;
}

function ensureHome(
	state: CoreStateSlice,
	env: CoreEnvironment,
): { state: CoreStateSlice; homeSceneId: string } {
	const result = accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const homeSceneId = result.nextState.commandCenter.homeSceneId;
	if (!homeSceneId) throw new Error('missing home Scene');
	return { state: result.nextState, homeSceneId };
}

function goLive(env: CoreEnvironment): CoreStateSlice {
	const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
	return accept(
		dispatchCommand(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		}),
	).nextState;
}

describe('RC-SES-4.4 quick-panel timer', () => {
	it('DM-only: a player cannot start it', () => {
		const env = makeEnvironment();
		const state = goLive(env);
		const result = reject(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: PLAYER_ACTOR.id,
				payload: { kind: 'countdown', durationSeconds: 300 },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('requires an active session', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const result = reject(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: DM_ACTOR.id,
				payload: { kind: 'countdown', durationSeconds: 300 },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('starts, pauses, resumes, and resets a countdown; only the DM sees it', () => {
		const env = makeEnvironment();
		let state = goLive(env);
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: DM_ACTOR.id,
				payload: { kind: 'countdown', durationSeconds: 300, label: 'Round timer' },
			}),
		).nextState;
		expect(state.session.quickTimer?.status).toBe('running');

		const dmView = getQuickTimerForActor(
			state.session.quickTimer,
			state.permissions,
			DM_ACTOR.id,
			state.session.quickTimer!.startedAt!,
		);
		expect(dmView.control?.countdown.status).toBe('running');
		expect(dmView.breakCard).toBeNull();

		const playerView = getQuickTimerForActor(
			state.session.quickTimer,
			state.permissions,
			PLAYER_ACTOR.id,
			state.session.quickTimer!.startedAt!,
		);
		expect(playerView.control).toBeNull();
		expect(playerView.breakCard).toBeNull(); // a countdown is a DM-only tool, never projected

		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.pause',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(state.session.quickTimer?.status).toBe('paused');

		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.resume',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(state.session.quickTimer?.status).toBe('running');

		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.reset',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(state.session.quickTimer).toBeNull();
	});

	it('records lap marks only while running', () => {
		const env = makeEnvironment();
		let state = goLive(env);
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: DM_ACTOR.id,
				payload: { kind: 'countdown', durationSeconds: 600 },
			}),
		).nextState;
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.lap',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(state.session.quickTimer?.laps).toHaveLength(1);

		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.pause',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		const result = reject(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.lap',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('projects a "Back in M:SS" card to players ONLY for a break, never a countdown', () => {
		const env = makeEnvironment();
		let state = goLive(env);
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: DM_ACTOR.id,
				payload: { kind: 'break', durationSeconds: 600, label: 'Coffee break' },
			}),
		).nextState;

		const playerView = getQuickTimerForActor(
			state.session.quickTimer,
			state.permissions,
			PLAYER_ACTOR.id,
			state.session.quickTimer!.startedAt!,
		);
		expect(playerView.control).toBeNull();
		expect(playerView.breakCard).toEqual({ display: '10:00', label: 'Coffee break' });
	});

	it('is cleared when the session workflow resets', () => {
		const env = makeEnvironment();
		let state = goLive(env);
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.quick-timer.start',
				actorId: DM_ACTOR.id,
				payload: { kind: 'countdown', durationSeconds: 300 },
			}),
		).nextState;
		state = accept(
			dispatchCommand(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'idle' },
			}),
		).nextState;
		expect(state.session.quickTimer).toBeNull();
	});
});
