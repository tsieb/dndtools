import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getTimerCountdown,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SessionTimer,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

/**
 * UX-SES-012 — the PURE timer countdown view model + the pause-folds-elapsed reducer change.
 *
 * The countdown view is a deterministic function of (timer document, nowIso): remaining seconds,
 * arm's-length display string, depletion fraction, and the urgency band (red in the final 10 s,
 * amber at 30% remaining). Pausing a running timer folds the elapsed time into the remaining
 * duration, so pause/resume cycles never lose time and the paused display freezes at the true value.
 */

const T0 = '2026-06-10T12:00:00.000Z';

function timerAt(patch: Partial<SessionTimer>): SessionTimer {
	return {
		id: 'timer-1',
		sceneId: 'scene-1',
		widgetInstanceId: 'widget-timer-1',
		status: 'idle',
		durationSeconds: 0,
		startedAt: null,
		revision: 1,
		...patch,
	};
}

function atSeconds(offset: number): string {
	return new Date(Date.parse(T0) + offset * 1000).toISOString();
}

describe('UX-SES-012 getTimerCountdown (pure view model)', () => {
	it('derives remaining time and M:SS display for a running timer', () => {
		const timer = timerAt({ status: 'running', durationSeconds: 90, startedAt: T0 });
		const view = getTimerCountdown(timer, atSeconds(25), 90);
		expect(view.status).toBe('running');
		expect(view.remainingSeconds).toBe(65);
		expect(view.display).toBe('1:05');
		expect(view.fractionRemaining).toBeCloseTo(65 / 90, 5);
		expect(view.urgency).toBe('normal');
		expect(view.statusLabel).toBe('Running');
	});

	it('turns amber at <=30% remaining and red in the final 10 seconds (AC1)', () => {
		const timer = timerAt({ status: 'running', durationSeconds: 100, startedAt: T0 });
		expect(getTimerCountdown(timer, atSeconds(75), 100).urgency).toBe('warning');
		// 8 seconds remaining: red numerals/bar + sub-10s "S.s" display.
		const danger = getTimerCountdown(timer, atSeconds(92), 100);
		expect(danger.urgency).toBe('danger');
		expect(danger.display).toBe('8.0');
	});

	it('expires at zero: status expired, display 0:00, danger urgency (AC3)', () => {
		const timer = timerAt({ status: 'running', durationSeconds: 30, startedAt: T0 });
		const view = getTimerCountdown(timer, atSeconds(31), 30);
		expect(view.status).toBe('expired');
		expect(view.remainingSeconds).toBe(0);
		expect(view.display).toBe('0:00');
		expect(view.urgency).toBe('danger');
		expect(view.statusLabel).toBe("Time's up");
	});

	it('a paused timer freezes at its recorded remaining duration; a missing timer is stopped', () => {
		const paused = getTimerCountdown(
			timerAt({ status: 'paused', durationSeconds: 42, startedAt: null }),
			atSeconds(500),
			60,
		);
		expect(paused.status).toBe('paused');
		expect(paused.remainingSeconds).toBe(42);
		expect(paused.display).toBe('0:42');
		expect(paused.statusLabel).toBe('Paused');

		const stopped = getTimerCountdown(undefined, T0, 60);
		expect(stopped.status).toBe('stopped');
		expect(stopped.display).toBe('1:00');
		expect(stopped.urgency).toBe('normal');
		expect(stopped.statusLabel).toBe('Stopped');
	});

	it('is deterministic and clamps a skewed clock fail-safe (never negative remaining)', () => {
		const timer = timerAt({ status: 'running', durationSeconds: 60, startedAt: T0 });
		expect(getTimerCountdown(timer, atSeconds(10), 60)).toEqual(
			getTimerCountdown(timer, atSeconds(10), 60),
		);
		// now BEFORE startedAt (skew): elapsed clamps to 0, full duration remains.
		expect(getTimerCountdown(timer, atSeconds(-5), 60).remainingSeconds).toBe(60);
	});
});

describe('UX-SES-012 timer.pause folds elapsed time into the remaining duration', () => {
	function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
		if (result.status !== 'accepted') {
			throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
		}
		return result;
	}

	it('pause after 25 of 90 running seconds records 65 remaining; resume restarts from there', () => {
		// A controllable clock: each command sees the CURRENT instant.
		let nowIso = T0;
		const env: CoreEnvironment = makeEnvironment({ clock: () => nowIso });
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const home = accept(
			dispatchCommand(base, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		const sceneId = home.commandCenter.homeSceneId!;
		const timerId = home.scenes.scenes[sceneId]!.widgets.find((w) => w.type === 'timer')!.id;
		let state: CoreStateSlice = accept(
			dispatchCommand(home, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: sceneId },
			}),
		).nextState;

		const operate = (commandType: string, payload: Record<string, unknown> = {}): void => {
			const command: CoreCommand = {
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				idempotencyKey: `${commandType}-${env.ids()}`,
				payload: {
					sceneId,
					widgetInstanceId: timerId,
					commandType,
					payload,
					expectedRevision: state.scenes.scenes[sceneId]!.ownership.revision,
				},
			};
			state = accept(dispatchCommand(state, env, command)).nextState;
		};

		operate('timer.start', { durationSeconds: 90 });
		expect(state.session.timers[timerId]).toMatchObject({
			status: 'running',
			durationSeconds: 90,
			startedAt: T0,
		});

		// 25 seconds later the DM pauses: the document folds the elapsed time (90 - 25 = 65).
		nowIso = atSeconds(25);
		operate('timer.pause');
		expect(state.session.timers[timerId]).toMatchObject({
			status: 'paused',
			durationSeconds: 65,
			startedAt: null,
		});
		// The paused countdown view freezes at 65 regardless of how much later it renders.
		expect(getTimerCountdown(state.session.timers[timerId], atSeconds(500), 90).display).toBe('1:05');

		// Resume 100 seconds later: the countdown continues from 65 (no lost or gained time).
		nowIso = atSeconds(125);
		operate('timer.resume');
		expect(state.session.timers[timerId]).toMatchObject({
			status: 'running',
			durationSeconds: 65,
			startedAt: atSeconds(125),
		});
		const view = getTimerCountdown(state.session.timers[timerId], atSeconds(135), 90);
		expect(view.remainingSeconds).toBe(55);
	});
});
