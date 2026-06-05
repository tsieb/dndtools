import { describe, expect, it } from 'vitest';
import {
	classifyWidgetCommand,
	decideWidgetCommandAuthority,
	dispatchCommand,
	requiredCapabilityForWidgetCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetCommandDescriptor,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { PermissionGrant } from '../src/state/permission-state';

/**
 * SES-005 — a participant with a timer/tool widget `operator` grant may OPERATE the tool (start, pause,
 * resume, reset, advance) WITHOUT being able to CONFIGURE it. Proves the operate-allowed /
 * configure-denied boundary fail-closed BOTH ways: an operator can operate but not configure; a
 * non-operator cannot operate.
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

function ensureHomeWithTimer(env: CoreEnvironment): {
	state: CoreStateSlice;
	sceneId: string;
	timerId: string;
} {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const sceneId = home.commandCenter.homeSceneId!;
	const timer = home.scenes.scenes[sceneId]!.widgets.find((widget) => widget.type === 'timer')!;
	return { state: home, sceneId, timerId: timer.id };
}

function startActive(state: CoreStateSlice, env: CoreEnvironment, sceneId: string): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
}

/**
 * Project the timer widget onto the player's Player View so the player can REACH it (the scene is
 * dm-only by default; the visibility gate requires the widget be delivered to the player). This is the
 * sanctioned SES delivery path — a grant authorizes the ACTION, the projection makes the widget visible.
 */
function projectWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	sceneId: string,
	widgetId: string,
	playerActorId: string,
): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'session.project-player-view',
			actorId: DM_ACTOR.id,
			payload: {
				playerActorIds: [playerActorId],
				target: {
					kind: 'widget-subset',
					sceneId,
					widgetInstanceIds: [widgetId],
				},
			},
		}),
	).nextState;
}

function grantWidget(
	state: CoreStateSlice,
	widgetId: string,
	playerActorId: string,
	capabilitySet: 'operator' | 'manager' | 'viewer',
): CoreStateSlice {
	const grant: PermissionGrant = {
		id: `grant-${playerActorId}-${capabilitySet}`,
		entityType: 'widget',
		entityId: widgetId,
		playerActorId,
		capabilitySet,
		createdBy: DM_ACTOR.id,
		createdAt: '2026-06-05T00:00:00.000Z',
		expiresAt: null,
	};
	return {
		...state,
		permissions: { ...state.permissions, grants: [...state.permissions.grants, grant] },
	};
}

function operate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	sceneId: string,
	timerId: string,
	commandType: string,
	payload: Record<string, unknown> = {},
): CommandResult {
	return dispatch(state, env, {
		type: 'widget.dispatch-command',
		actorId,
		idempotencyKey: `${commandType}-${actorId}-${env.ids()}`,
		payload: {
			sceneId,
			widgetInstanceId: timerId,
			commandType,
			payload,
			expectedRevision: state.scenes.scenes[sceneId]!.ownership.revision,
		},
	});
}

const operateDescriptor: WidgetCommandDescriptor = {
	type: 'timer.pause',
	displayName: 'Pause timer',
	requiredCapability: 'operator',
	payloadSchema: { type: 'object', additionalProperties: false },
	writesTo: 'session',
};
const configureDescriptor: WidgetCommandDescriptor = {
	type: 'timer.set-duration',
	displayName: 'Configure timer duration',
	requiredCapability: 'manager',
	payloadSchema: { type: 'object', additionalProperties: false },
	writesTo: 'scene',
};

describe('SES-005 widget-operator-authority policy', () => {
	it('classifies operate verbs as operate and configure verbs as configure', () => {
		expect(classifyWidgetCommand(operateDescriptor)).toBe('operate');
		expect(classifyWidgetCommand(configureDescriptor)).toBe('configure');
		expect(requiredCapabilityForWidgetCommand(operateDescriptor)).toBe('operator');
		expect(requiredCapabilityForWidgetCommand(configureDescriptor)).toBe('manager');
	});

	it('treats a configure verb mislabeled as operator as configure (fail closed against misconfig)', () => {
		const misconfigured: WidgetCommandDescriptor = {
			...configureDescriptor,
			type: 'timer.set-duration',
			requiredCapability: 'operator',
		};
		expect(classifyWidgetCommand(misconfigured)).toBe('configure');
	});

	it('treats an unknown verb that is not declared operator as configure (fail closed)', () => {
		const unknown: WidgetCommandDescriptor = {
			...operateDescriptor,
			type: 'timer.frobnicate',
			requiredCapability: 'manager',
		};
		expect(classifyWidgetCommand(unknown)).toBe('configure');
	});

	it('authorizes the DM for both operate and configure', () => {
		const env = makeEnvironment();
		const { state } = ensureHomeWithTimer(env);
		expect(
			decideWidgetCommandAuthority(state.permissions, DM_ACTOR, 'w1', operateDescriptor),
		).toEqual({ authorized: true, kind: 'operate', via: 'dm' });
		expect(
			decideWidgetCommandAuthority(state.permissions, DM_ACTOR, 'w1', configureDescriptor),
		).toEqual({ authorized: true, kind: 'configure', via: 'dm' });
	});

	it('allows an operator to operate but DENIES configure (the core boundary)', () => {
		const env = makeEnvironment();
		const { state, timerId } = ensureHomeWithTimer(env);
		const granted = grantWidget(state, timerId, PLAYER_ACTOR.id, 'operator');
		const operateDecision = decideWidgetCommandAuthority(
			granted.permissions,
			PLAYER_ACTOR,
			timerId,
			operateDescriptor,
		);
		expect(operateDecision).toEqual({ authorized: true, kind: 'operate', via: 'grant' });
		const configureDecision = decideWidgetCommandAuthority(
			granted.permissions,
			PLAYER_ACTOR,
			timerId,
			configureDescriptor,
		);
		expect(configureDecision).toEqual({
			authorized: false,
			kind: 'configure',
			reason: 'operator-cannot-configure',
		});
	});

	it('allows a manager to both operate AND configure (manager implies operator)', () => {
		const env = makeEnvironment();
		const { state, timerId } = ensureHomeWithTimer(env);
		const granted = grantWidget(state, timerId, PLAYER_ACTOR.id, 'manager');
		expect(
			decideWidgetCommandAuthority(granted.permissions, PLAYER_ACTOR, timerId, operateDescriptor)
				.authorized,
		).toBe(true);
		expect(
			decideWidgetCommandAuthority(granted.permissions, PLAYER_ACTOR, timerId, configureDescriptor)
				.authorized,
		).toBe(true);
	});

	it('denies a non-operator (no grant) and an observer from operating', () => {
		const env = makeEnvironment();
		const { state, timerId } = ensureHomeWithTimer(env);
		expect(
			decideWidgetCommandAuthority(state.permissions, PLAYER_ACTOR, timerId, operateDescriptor),
		).toEqual({ authorized: false, kind: 'operate', reason: 'not-operator' });
		expect(
			decideWidgetCommandAuthority(state.permissions, OBSERVER_ACTOR, timerId, operateDescriptor),
		).toEqual({ authorized: false, kind: 'operate', reason: 'observer' });
	});
});

describe('SES-005 operate-vs-configure through the widget command dispatch', () => {
	it('an operator can START, PAUSE, RESUME, RESET, and ADVANCE the session timer', () => {
		const env = makeEnvironment();
		const home = ensureHomeWithTimer(env);
		const { sceneId, timerId } = home;
		let state = home.state;
		state = startActive(state, env, sceneId);
		state = projectWidget(state, env, sceneId, timerId, PLAYER_ACTOR.id);
		state = grantWidget(state, timerId, PLAYER_ACTOR.id, 'operator');

		const started = accept(
			operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.start', { durationSeconds: 60 }),
		);
		state = started.nextState;
		expect(state.session.timers[timerId]).toMatchObject({ status: 'running', durationSeconds: 60 });

		const paused = accept(operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.pause'));
		state = paused.nextState;
		expect(state.session.timers[timerId]).toMatchObject({ status: 'paused' });

		const resumed = accept(operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.resume'));
		state = resumed.nextState;
		expect(state.session.timers[timerId]).toMatchObject({ status: 'running' });

		const advanced = accept(
			operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.advance', { deltaSeconds: 30 }),
		);
		state = advanced.nextState;
		expect(state.session.timers[timerId]?.durationSeconds).toBe(90);

		const reset = accept(operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.reset'));
		state = reset.nextState;
		expect(state.session.timers[timerId]).toMatchObject({ status: 'idle' });
	});

	it('the same operator is REJECTED when attempting to CONFIGURE (timer.set-duration)', () => {
		const env = makeEnvironment();
		const home = ensureHomeWithTimer(env);
		const { sceneId, timerId } = home;
		let state = home.state;
		state = startActive(state, env, sceneId);
		state = projectWidget(state, env, sceneId, timerId, PLAYER_ACTOR.id);
		state = grantWidget(state, timerId, PLAYER_ACTOR.id, 'operator');

		const result = operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.set-duration', {
			durationSeconds: 999,
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.code).toBe('actor-not-authorized');
			expect(result.rejection.message).toContain('requires manager');
		}
		// The configure never happened: the scene widget keeps no configured duration from the operator.
		expect(state.scenes.scenes[sceneId]!.widgets.find((w) => w.id === timerId)!.configuration).not
			.toHaveProperty('durationSeconds', 999);
	});

	it('a non-operator player is REJECTED from operating the timer even when the widget is visible', () => {
		const env = makeEnvironment();
		const home = ensureHomeWithTimer(env);
		const { sceneId, timerId } = home;
		let state = home.state;
		state = startActive(state, env, sceneId);
		// The widget is projected (so the player can SEE it) but NO operator grant is given: the authority
		// check denies the OPERATE action specifically (not a visibility denial).
		state = projectWidget(state, env, sceneId, timerId, PLAYER_ACTOR.id);

		const result = operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.pause');
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('a manager (or the DM) can CONFIGURE the timer duration on the scene widget', () => {
		const env = makeEnvironment();
		const home = ensureHomeWithTimer(env);
		const { sceneId, timerId } = home;
		let state = home.state;
		state = startActive(state, env, sceneId);
		state = projectWidget(state, env, sceneId, timerId, PLAYER_ACTOR.id);
		state = grantWidget(state, timerId, PLAYER_ACTOR.id, 'manager');

		const result = accept(
			operate(state, env, PLAYER_ACTOR.id, sceneId, timerId, 'timer.set-duration', {
				durationSeconds: 300,
			}),
		);
		state = result.nextState;
		const widget = state.scenes.scenes[sceneId]!.widgets.find((w) => w.id === timerId)!;
		expect(widget.configuration.durationSeconds).toBe(300);
	});
});
