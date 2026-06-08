import { describe, expect, it } from 'vitest';
import {
	SESSION_COMMAND_AVAILABILITY,
	SESSION_INTENT_TARGET,
	SESSION_WORKFLOW_STATES,
	SESSION_WORKFLOW_TRANSITIONS,
	allowedTransitionsFrom,
	availableSessionCommands,
	canRetry,
	canUndo,
	createCommandLifecycle,
	dispatchCommand,
	isLifecycleIntentAllowed,
	isSessionCommandAvailable,
	isTransitionAllowed,
	markFailure,
	markPending,
	markSuccess,
	markUndone,
	recoveryAction,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SessionLifecycleIntent,
	type SessionWorkflowState,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
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

function setWorkflow(
	state: CoreStateSlice,
	env: CoreEnvironment,
	workflow: SessionWorkflowState,
	activeSceneId?: string,
): CommandResult {
	const needsScene =
		workflow === 'active' || workflow === 'prep' || workflow === 'paused' || workflow === 'ending';
	return dispatchCommand(state, env, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow, ...(needsScene && activeSceneId ? { activeSceneId } : {}) },
	});
}

// ---------------------------------------------------------------------------
// SES-011 — the 7-state transition table
// ---------------------------------------------------------------------------

describe('SES-011: session workflow transition table', () => {
	it('defines exactly the seven canonical workflow states', () => {
		expect([...SESSION_WORKFLOW_STATES]).toEqual([
			'idle',
			'prep',
			'active',
			'paused',
			'ending',
			'recap',
			'archived',
		]);
		expect(Object.keys(SESSION_WORKFLOW_TRANSITIONS).sort()).toEqual(
			[...SESSION_WORKFLOW_STATES].sort(),
		);
	});

	it('only references defined states in the transition table (no dangling targets)', () => {
		for (const from of SESSION_WORKFLOW_STATES) {
			for (const to of SESSION_WORKFLOW_TRANSITIONS[from]) {
				expect(SESSION_WORKFLOW_STATES).toContain(to);
			}
		}
	});

	it('allows every self-transition (idempotent re-assert of the same state)', () => {
		for (const state of SESSION_WORKFLOW_STATES) {
			expect(isTransitionAllowed(state, state)).toBe(true);
		}
	});

	it('allows exactly the listed transitions and rejects all others fail-closed', () => {
		for (const from of SESSION_WORKFLOW_STATES) {
			const allowed = new Set(allowedTransitionsFrom(from));
			for (const to of SESSION_WORKFLOW_STATES) {
				expect(isTransitionAllowed(from, to)).toBe(allowed.has(to));
			}
		}
	});

	it('keeps the existing happy-path lifecycle sequence allowed', () => {
		const sequence: SessionWorkflowState[] = [
			'idle',
			'prep',
			'active',
			'paused',
			'ending',
			'recap',
			'archived',
		];
		for (let i = 0; i < sequence.length - 1; i += 1) {
			expect(isTransitionAllowed(sequence[i]!, sequence[i + 1]!)).toBe(true);
		}
	});

	it.each([
		['idle', 'paused'],
		['idle', 'ending'],
		['prep', 'paused'],
		['recap', 'active'],
		['recap', 'paused'],
		['archived', 'paused'],
		['archived', 'ending'],
	] as const)('rejects the disallowed transition %s -> %s', (from, to) => {
		expect(isTransitionAllowed(from, to)).toBe(false);
	});

	it('maps every lifecycle intent to an in-range target state', () => {
		const intents = Object.keys(SESSION_INTENT_TARGET) as SessionLifecycleIntent[];
		for (const intent of intents) {
			expect(SESSION_WORKFLOW_STATES).toContain(SESSION_INTENT_TARGET[intent]);
		}
		expect(isLifecycleIntentAllowed('idle', 'start')).toBe(true);
		expect(isLifecycleIntentAllowed('active', 'pause')).toBe(true);
		expect(isLifecycleIntentAllowed('paused', 'resume')).toBe(true);
		expect(isLifecycleIntentAllowed('archived', 'recover')).toBe(true);
		// Fail-closed: you cannot pause an idle session.
		expect(isLifecycleIntentAllowed('idle', 'pause')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// SES-011 — per-state command availability
// ---------------------------------------------------------------------------

describe('SES-011: per-state command availability', () => {
	it('makes live-session commands available ONLY in active', () => {
		const liveCommands = (
			Object.entries(SESSION_COMMAND_AVAILABILITY) as [
				CoreCommand['type'],
				(typeof SESSION_COMMAND_AVAILABILITY)[CoreCommand['type']],
			][]
		)
			.filter(([, availability]) => availability === 'live-session')
			.map(([type]) => type);
		expect(liveCommands.length).toBeGreaterThan(0);
		for (const type of liveCommands) {
			for (const workflow of SESSION_WORKFLOW_STATES) {
				expect(isSessionCommandAvailable(type, workflow)).toBe(workflow === 'active');
			}
		}
	});

	it('makes lifecycle + calendar-continuity commands available in every state', () => {
		for (const workflow of SESSION_WORKFLOW_STATES) {
			expect(isSessionCommandAvailable('session.set-workflow', workflow)).toBe(true);
			expect(isSessionCommandAvailable('session.set-campaign-date', workflow)).toBe(true);
			expect(isSessionCommandAvailable('session.link-calendar-date', workflow)).toBe(true);
		}
	});

	it('makes DM-admin session commands available in any non-idle state', () => {
		for (const workflow of SESSION_WORKFLOW_STATES) {
			expect(isSessionCommandAvailable('session.project-player-view', workflow)).toBe(
				workflow !== 'idle',
			);
			expect(isSessionCommandAvailable('session.pin-quick-reference', workflow)).toBe(
				workflow !== 'idle',
			);
		}
	});

	it('reports unknown command types as unavailable (fail closed)', () => {
		expect(isSessionCommandAvailable('scene.create', 'active')).toBe(false);
	});

	it('lists only available commands per state and excludes live-session commands when idle', () => {
		const idle = availableSessionCommands('idle');
		expect(idle).not.toContain('combat.start');
		expect(idle).not.toContain('dice.roll');
		expect(idle).toContain('session.set-workflow');
		const active = availableSessionCommands('active');
		expect(active).toContain('combat.start');
		expect(active).toContain('dice.roll');
		expect(active).toContain('session.deliver-handout');
	});
});

// ---------------------------------------------------------------------------
// SES-011 — disallowed transitions are rejected through the command
// ---------------------------------------------------------------------------

describe('SES-011: set-workflow enforces the transition table', () => {
	it('AC1: rejects an out-of-order transition with a non-leaking invalid-state result', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		// idle -> paused is not allowed.
		const result = setWorkflow(state, env, 'paused', undefined);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.code).toBe('invalid-state');
			// The message names states only — no internal entity ids or content leak.
			expect(result.rejection.message).not.toMatch(/actor-|scene-|op-/);
		}
		// The durable state is unchanged.
		expect(result.nextState.session.workflow).toBe('idle');
		expect(result.nextState.session.workflowRevision).toBe(0);
	});

	it('AC1: a player submitting an active-combat command from idle is rejected (no leak)', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		expect(state.session.workflow).toBe('idle');
		const result = dispatchCommand(state, env, {
			type: 'combat.start',
			actorId: PLAYER_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }] },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(['invalid-state', 'actor-not-authorized']).toContain(result.rejection.code);
		}
	});

	it('advances workflowRevision and appends an op only on an accepted transition', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId));
		expect(active.nextState.session.workflow).toBe('active');
		expect(active.nextState.session.workflowRevision).toBe(1);
		expect(active.nextState.sync.operations.map((op) => op.opType)).toContain(
			'session.set-workflow',
		);
	});

	it('rejects workflow control from a non-DM actor', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const result = dispatchCommand(state, env, {
			type: 'session.set-workflow',
			actorId: PLAYER_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

// ---------------------------------------------------------------------------
// SES-001 — lifecycle start / pause / resume / end / recap / archive / recover
// ---------------------------------------------------------------------------

describe('SES-001: session lifecycle persist / archive / recover round-trip', () => {
	function buildActiveWithLiveState(env: CoreEnvironment): {
		state: CoreStateSlice;
		homeSceneId: string;
	} {
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		let current = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		current = accept(
			dispatchCommand(current, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }],
				},
			}),
		).nextState;
		current = accept(
			dispatchCommand(current, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '2d6', total: 7 },
			}),
		).nextState;
		return { state: current, homeSceneId };
	}

	it('AC1: starting from idle enters active and records the active Scene', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId));
		expect(active.nextState.session.workflow).toBe('active');
		expect(active.nextState.session.activeSceneId).toBe(homeSceneId);
		expect(active.events).toContainEqual(
			expect.objectContaining({ kind: 'session.workflow-changed', to: 'active' }),
		);
	});

	it('refuses to enter active without an active Scene (fail closed)', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const result = dispatchCommand(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('invalid-payload');
	});

	it('aggregates combat/dice/scene into the archive on recap, then recovers them back', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = buildActiveWithLiveState(env);
		// active -> ending -> recap (recap archives the live state and clears it).
		const ending = accept(setWorkflow(state, env, 'ending', homeSceneId)).nextState;
		const recap = accept(setWorkflow(ending, env, 'recap', undefined)).nextState;
		expect(recap.session.workflow).toBe('recap');
		expect(recap.session.diceHistory).toEqual([]);
		expect(recap.session.combat.status).toBe('idle');
		const archiveId = recap.session.recapArchiveId;
		expect(archiveId).not.toBeNull();
		const archive = recap.session.archives[archiveId!];
		expect(archive).toBeDefined();
		expect(archive?.diceHistory).toHaveLength(1);
		expect(archive?.combat.status).toBe('running');
		expect(archive?.activeSceneId).toBe(homeSceneId);

		// archived snapshot is durable; recover restores the live fields back into recap review.
		const archived = accept(setWorkflow(recap, env, 'archived', undefined)).nextState;
		expect(archived.session.workflow).toBe('archived');
		expect(archived.session.archives[archiveId!]).toBeDefined();

		const recovered = accept(
			dispatchCommand(archived, env, {
				type: 'session.recover',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		expect(recovered.nextState.session.workflow).toBe('recap');
		expect(recovered.nextState.session.diceHistory).toHaveLength(1);
		expect(recovered.nextState.session.combat.status).toBe('running');
		expect(recovered.nextState.session.activeSceneId).toBe(homeSceneId);
		expect(recovered.events).toContainEqual(
			expect.objectContaining({ kind: 'session.recovered', archiveId }),
		);
		expect(recovered.nextState.sync.operations.map((op) => op.opType)).toContain('session.recover');
	});

	it('recover fails closed when no archive exists', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		// active can transition to recap, but there is no archive yet to recover.
		const result = dispatchCommand(active, env, {
			type: 'session.recover',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('invalid-state');
	});

	it('recover fails closed for an unknown archive id', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = buildActiveWithLiveState(env);
		const recap = accept(
			setWorkflow(accept(setWorkflow(state, env, 'ending', homeSceneId)).nextState, env, 'recap'),
		).nextState;
		const result = dispatchCommand(recap, env, {
			type: 'session.recover',
			actorId: DM_ACTOR.id,
			payload: { archiveId: 'archive-does-not-exist' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('invalid-state');
	});

	it('recover is DM-only', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = buildActiveWithLiveState(env);
		const recap = accept(
			setWorkflow(accept(setWorkflow(state, env, 'ending', homeSceneId)).nextState, env, 'recap'),
		).nextState;
		const result = dispatchCommand(recap, env, {
			type: 'session.recover',
			actorId: PLAYER_ACTOR.id,
			payload: {},
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('pause preserves live state and resume restores it', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = buildActiveWithLiveState(env);
		const paused = accept(setWorkflow(state, env, 'paused', homeSceneId)).nextState;
		expect(paused.session.workflow).toBe('paused');
		expect(paused.session.diceHistory).toHaveLength(1);
		expect(paused.session.combat.status).toBe('running');
		const resumed = accept(setWorkflow(paused, env, 'active', homeSceneId)).nextState;
		expect(resumed.session.workflow).toBe('active');
		expect(resumed.session.diceHistory).toEqual(paused.session.diceHistory);
		expect(resumed.session.combat).toEqual(paused.session.combat);
	});
});

// ---------------------------------------------------------------------------
// SES-001 AC3 — reconnect availability matches workflow state
// ---------------------------------------------------------------------------

describe('SES-001 AC3: stale active-session commands are rejected outside active', () => {
	it.each(['paused', 'ending', 'recap'] as const)(
		'rejects a live combat command while %s',
		(workflow) => {
			const env = makeEnvironment();
			const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
			let current = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
			// Drive into the target non-active workflow through allowed transitions.
			if (workflow === 'paused') {
				current = accept(setWorkflow(current, env, 'paused', homeSceneId)).nextState;
			} else if (workflow === 'ending') {
				current = accept(setWorkflow(current, env, 'ending', homeSceneId)).nextState;
			} else {
				current = accept(setWorkflow(current, env, 'ending', homeSceneId)).nextState;
				current = accept(setWorkflow(current, env, 'recap')).nextState;
			}
			expect(current.session.workflow).toBe(workflow);
			const result = dispatchCommand(current, env, {
				type: 'combat.advance-turn',
				actorId: DM_ACTOR.id,
				payload: {},
			});
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') expect(result.rejection.code).toBe('invalid-state');
		},
	);
});

// ---------------------------------------------------------------------------
// SES-010 — the standard async action model (pending/success/failure/retry/undo)
// ---------------------------------------------------------------------------

describe('SES-010: standard async action model for session commands', () => {
	it('a session command surfaces pending -> success with the committed op ids', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		let lifecycle = markPending(createCommandLifecycle('session.record-dice'));
		expect(lifecycle.status).toBe('pending');
		const result = accept(
			dispatchCommand(active, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20+5', total: 18 },
			}),
		);
		lifecycle = markSuccess(lifecycle, result.operationIds);
		expect(lifecycle.status).toBe('success');
		expect(lifecycle.operationIds.length).toBeGreaterThan(0);
		expect(recoveryAction(lifecycle)).toBe('none');
	});

	it('AC1: a rejected session command clears pending, records no op, and offers retry', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		// Dispatch a live command while idle -> rejected by the active gate.
		const rejected = dispatchCommand(state, env, {
			type: 'session.record-dice',
			actorId: DM_ACTOR.id,
			payload: { expression: '1d20', total: 12 },
		});
		expect(rejected.status).toBe('rejected');
		let lifecycle = markPending(createCommandLifecycle('session.record-dice'));
		if (rejected.status === 'rejected') {
			lifecycle = markFailure(lifecycle, rejected.rejection.message);
		}
		expect(lifecycle.status).toBe('failure');
		expect(lifecycle.operationIds).toEqual([]);
		expect(canRetry(lifecycle)).toBe(true);
		expect(recoveryAction(lifecycle)).toBe('retry');

		// Retry from the correct workflow succeeds.
		const { state: state2, homeSceneId } = ensureHome(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
		);
		const active = accept(setWorkflow(state2, env, 'active', homeSceneId)).nextState;
		lifecycle = markPending(lifecycle);
		expect(lifecycle.attempts).toBe(2);
		const retry = accept(
			dispatchCommand(active, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', total: 12 },
			}),
		);
		lifecycle = markSuccess(lifecycle, retry.operationIds);
		expect(lifecycle.status).toBe('success');
	});

	it('AC1 (note append): a failed dice.append-to-note clears pending state and offers retry', () => {
		// SES-010 AC1 specifically calls out "note append from a session tool fails". This test
		// exercises the lifecycle model end-to-end for the dice.append-to-note command, which is
		// the session tool that appends a recorded dice result to a vault note.
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;

		// Create a note in the active session context.
		const noteResult = accept(
			dispatchCommand(active, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Session log', body: '' },
			}),
		);
		const noteId = Object.keys(noteResult.nextState.content.items).find(
			(id) => noteResult.nextState.content.items[id]?.title === 'Session log',
		)!;
		expect(noteId).toBeTruthy();

		// Attempt append-to-note with a non-existent roll -> rejected (roll-not-found).
		let lifecycle = markPending(createCommandLifecycle('dice.append-to-note'));
		expect(lifecycle.status).toBe('pending');
		const failed = dispatchCommand(noteResult.nextState, env, {
			type: 'dice.append-to-note',
			actorId: DM_ACTOR.id,
			payload: { rollId: 'roll-does-not-exist', itemId: noteId },
		});
		expect(failed.status).toBe('rejected');
		if (failed.status === 'rejected') {
			expect(failed.rejection.code).toBe('roll-not-found');
			lifecycle = markFailure(lifecycle, failed.rejection.message);
		}
		// The UI clears pending state (failure, no committed ops) and offers retry guidance.
		expect(lifecycle.status).toBe('failure');
		expect(lifecycle.operationIds).toEqual([]);
		expect(canRetry(lifecycle)).toBe(true);
		expect(recoveryAction(lifecycle)).toBe('retry');
		// The note body is unchanged (no partial write).
		expect(noteResult.nextState.content.items[noteId]?.body).toBe('');
	});

	it('AC2: an undoable session command (project player view) restores via its inverse', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const active = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		const projected = accept(
			dispatchCommand(active, env, {
				type: 'session.project-player-view',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorIds: [PLAYER_ACTOR.id],
					connectionState: 'connected',
					target: {
						kind: 'scene',
						sceneId: homeSceneId,
						sectionIds: null,
						widgetInstanceIds: null,
						displayState: null,
						mapRegion: null,
					},
				},
			}),
		);
		expect(projected.nextState.session.playerViewAssignments[PLAYER_ACTOR.id]).toBeDefined();
		let lifecycle = markSuccess(
			markPending(createCommandLifecycle('session.project-player-view')),
			projected.operationIds,
		);
		expect(canUndo(lifecycle)).toBe(true);
		expect(recoveryAction(lifecycle)).toBe('undo');

		// The inverse command (revoke) restores the committed before-state (no assignment).
		const revoked = accept(
			dispatchCommand(projected.nextState, env, {
				type: 'session.revoke-player-view',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id] },
			}),
		);
		lifecycle = markUndone(lifecycle);
		expect(lifecycle.status).toBe('undone');
		expect(
			revoked.nextState.session.playerViewAssignments[PLAYER_ACTOR.id]?.deliveryStatus ?? 'revoked',
		).toBe('revoked');
	});

	it('does not fabricate undo for a workflow transition (it is not reversible)', () => {
		const lifecycle = markSuccess(
			markPending(createCommandLifecycle('session.set-workflow')),
			['op-x'],
		);
		expect(canUndo(lifecycle)).toBe(false);
		expect(recoveryAction(lifecycle)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// Regression — existing active-gated commands still work under the formalized machine
// ---------------------------------------------------------------------------

describe('SES regression: active-gated commands still work after formalization', () => {
	it('the live-session availability set matches every workflow===active guard in the command layer', () => {
		// These are the command types whose handlers reject when workflow !== 'active'. The availability
		// table must mark exactly these as `live-session`, so the formalized machine and the per-command
		// guards never drift.
		const expectedLive = [
			'session.record-dice',
			'dice.roll',
			'dice.roll-table',
			'combat.start',
			'combat.advance-turn',
			'combat.apply-resource',
			'combat.end',
			'session.deliver-handout',
			'session.reveal-handout-section',
			'session.project-active-map',
			'character.update-combat-resource',
		];
		const live = Object.entries(SESSION_COMMAND_AVAILABILITY)
			.filter(([, availability]) => availability === 'live-session')
			.map(([type]) => type)
			.sort();
		expect(live).toEqual([...expectedLive].sort());
	});

	it('combat, dice, and handout commands are accepted while active', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		let current = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		current = accept(
			dispatchCommand(current, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }],
				},
			}),
		).nextState;
		expect(current.session.combat.status).toBe('running');
		current = accept(
			dispatchCommand(current, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', total: 9 },
			}),
		).nextState;
		expect(current.session.diceHistory).toHaveLength(1);
		const handout = accept(
			dispatchCommand(current, env, {
				type: 'session.deliver-handout',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'A Letter',
					sections: [{ heading: 'Body', body: 'You find a letter.', visibility: 'player-visible' }],
					recipientActorIds: [PLAYER_ACTOR.id],
					sceneId: homeSceneId,
					connectionState: 'connected',
				},
			}),
		);
		expect(Object.keys(handout.nextState.session.handouts)).toHaveLength(1);
	});
});
