import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	SESSION_COMMAND_AVAILABILITY,
	SESSION_INTENT_TARGET,
	SESSION_LIVE_ONLY_EFFECTS,
	SESSION_WORKFLOW_STATES,
	SESSION_WORKFLOW_TRANSITIONS,
	allowedTransitionsFrom,
	availableSessionCommands,
	canRetry,
	canUndo,
	createCommandLifecycle,
	dispatchCommand,
	happenedLive,
	isLifecycleIntentAllowed,
	isLiveWorkflow,
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
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
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
	it('RC-SES-6.1: makes every governed session command available in every state', () => {
		const governed = Object.keys(SESSION_COMMAND_AVAILABILITY) as CoreCommand['type'][];
		expect(governed.length).toBeGreaterThan(0);
		for (const type of governed) {
			for (const workflow of SESSION_WORKFLOW_STATES) {
				expect(isSessionCommandAvailable(type, workflow)).toBe(true);
			}
		}
	});

	it('RC-SES-6.1: keeps set-workflow as the one lifecycle command and marks nothing live-only', () => {
		expect(SESSION_COMMAND_AVAILABILITY['session.set-workflow']).toBe('lifecycle');
		expect([...new Set(Object.values(SESSION_COMMAND_AVAILABILITY))].sort()).toEqual([
			'always',
			'lifecycle',
		]);
	});

	it('reports unknown command types as unavailable (fail closed)', () => {
		expect(isSessionCommandAvailable('scene.create', 'active')).toBe(false);
	});

	it('lists the same commands in every state, Standby included', () => {
		const active = availableSessionCommands('active');
		expect(active).toContain('combat.start');
		expect(active).toContain('dice.roll');
		expect(active).toContain('session.deliver-handout');
		expect(active).toContain('session.quick-timer.start');
		for (const workflow of SESSION_WORKFLOW_STATES) {
			expect(availableSessionCommands(workflow)).toEqual(active);
		}
	});

	it('RC-SES-6.1: only the clock, automations and start triggers wait for Go live', () => {
		expect([...SESSION_LIVE_ONLY_EFFECTS].sort()).toEqual([
			'audio-automation',
			'session-clock',
			'session-start-triggers',
		]);
		for (const workflow of SESSION_WORKFLOW_STATES) {
			expect(isLiveWorkflow(workflow)).toBe(workflow === 'active');
		}
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

	it('RC-SES-6.1: a player rolling in Standby is accepted and recorded outside a session', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		expect(state.session.workflow).toBe('idle');
		// dice.roll is a table tool ANY actor (including a player) may use. Standby permits it; the roll
		// does not move the workflow, and it is stamped as made outside a live session.
		const result = accept(
			dispatchCommand(state, env, {
				type: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				payload: { expression: '1d20' },
			}),
		);
		expect(result.nextState.session.workflow).toBe('idle');
		const [roll] = result.nextState.session.diceHistory;
		expect(roll).toMatchObject({ actorId: PLAYER_ACTOR.id, workflow: 'idle' });
		expect(happenedLive(roll!)).toBe(false);
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

	it('AC2: in recap, DM can create notes and archived combat/dice/handout data is read-only', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);

		// Build an active session with live combat and dice data to be archived on recap entry.
		let current = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
		current = accept(
			dispatchCommand(current, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 }] },
			}),
		).nextState;
		current = accept(
			dispatchCommand(current, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', total: 17 },
			}),
		).nextState;

		// Transition to ending then recap — archives the live combat, dice, and handout state.
		current = accept(setWorkflow(current, env, 'ending', homeSceneId)).nextState;
		current = accept(setWorkflow(current, env, 'recap')).nextState;
		expect(current.session.workflow).toBe('recap');

		const archiveId = current.session.recapArchiveId;
		expect(archiveId).not.toBeNull();
		const archiveBefore = current.session.archives[archiveId!];
		expect(archiveBefore).toBeDefined();
		// Sanity: the archive captured the live combat and dice history.
		expect(archiveBefore?.combat.status).toBe('running');
		expect(archiveBefore?.diceHistory).toHaveLength(1);
		// The live session fields were reset on recap entry.
		expect(current.session.diceHistory).toHaveLength(0);
		expect(current.session.combat.status).toBe('idle');

		// DM CAN create a recap note in recap state (content commands are not session-workflow-gated).
		// The archived combat, dice, and handout data serve as read-only reference inputs for the note.
		const noteResult = accept(
			dispatchCommand(current, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Session recap', body: 'Combat: Goblin encountered.' },
			}),
		);
		const noteId = Object.keys(noteResult.nextState.content.items).find(
			(id) => noteResult.nextState.content.items[id]?.title === 'Session recap',
		);
		expect(noteId).toBeTruthy();

		// Creating the recap note MUST NOT mutate the archived data (it is read-only input).
		const archiveAfter = noteResult.nextState.session.archives[archiveId!];
		expect(archiveAfter?.combat).toEqual(archiveBefore?.combat);
		expect(archiveAfter?.diceHistory).toEqual(archiveBefore?.diceHistory);

		// RC-SES-6.1 — table tools keep working in recap, but they write the fresh live fields, never the
		// archive under review (re-opening it still takes session.recover), and the roll is stamped as
		// made outside a live session.
		const recapRoll = accept(
			dispatchCommand(noteResult.nextState, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d6', total: 3 },
			}),
		);
		expect(recapRoll.nextState.session.archives[archiveId!]).toEqual(archiveAfter);
		expect(recapRoll.nextState.session.diceHistory).toEqual([
			expect.objectContaining({ expression: '1d6', workflow: 'recap' }),
		]);
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

describe('SES-001 AC3 / RC-SES-6.1: a reconnecting combat command outside active is logged, not refused', () => {
	it.each(['paused', 'ending'] as const)(
		'accepts a combat command while %s and stamps its log entry with that workflow',
		(workflow) => {
			const env = makeEnvironment();
			const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
			let current = accept(setWorkflow(state, env, 'active', homeSceneId)).nextState;
			current = accept(
				dispatchCommand(current, env, {
					type: 'combat.start',
					actorId: DM_ACTOR.id,
					payload: {
						combatants: [
							{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 },
							{ kind: 'monster', name: 'Bandit', initiative: 12, maxHp: 11 },
						],
					},
				}),
			).nextState;
			current = accept(setWorkflow(current, env, workflow, homeSceneId)).nextState;
			const result = accept(
				dispatchCommand(current, env, {
					type: 'combat.advance-turn',
					actorId: DM_ACTOR.id,
					payload: {},
				}),
			);
			const log = result.nextState.session.combat.log;
			// The start entry was made live; the advance was made in the pause/wind-down.
			expect(log[0]).toMatchObject({ kind: 'combat-started', workflow: 'active' });
			expect(log.at(-1)).toMatchObject({ kind: 'turn-advanced', workflow });
			expect(log.filter(happenedLive).map((entry) => entry.kind)).toEqual(['combat-started']);
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
		// Dispatch a malformed roll -> rejected fail closed, no op recorded.
		const rejected = dispatchCommand(state, env, {
			type: 'dice.roll',
			actorId: DM_ACTOR.id,
			payload: { expression: 'not dice' },
		});
		expect(rejected.status).toBe('rejected');
		expect(rejected.nextState.sync.operations).toEqual(state.sync.operations);
		let lifecycle = markPending(createCommandLifecycle('dice.roll'));
		if (rejected.status === 'rejected') {
			lifecycle = markFailure(lifecycle, rejected.rejection.message);
		}
		expect(lifecycle.status).toBe('failure');
		expect(lifecycle.operationIds).toEqual([]);
		expect(canRetry(lifecycle)).toBe(true);
		expect(recoveryAction(lifecycle)).toBe('retry');

		// Retrying with a well-formed expression succeeds.
		lifecycle = markPending(lifecycle);
		expect(lifecycle.attempts).toBe(2);
		const retry = accept(
			dispatchCommand(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20' },
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
		const lifecycle = markSuccess(markPending(createCommandLifecycle('session.set-workflow')), [
			'op-x',
		]);
		expect(canUndo(lifecycle)).toBe(false);
		expect(recoveryAction(lifecycle)).toBe('none');
	});
});

// ---------------------------------------------------------------------------
// Regression — existing active-gated commands still work under the formalized machine
// ---------------------------------------------------------------------------

describe('SES regression: the availability table and the command layer stay in lockstep', () => {
	it('RC-SES-6.1: no handler gates on the live workflow, matching a table with no live-only command', () => {
		// The table marks no command live-only...
		const gated = Object.entries(SESSION_COMMAND_AVAILABILITY)
			.filter(([, availability]) => availability !== 'always' && availability !== 'lifecycle')
			.map(([type]) => type);
		expect(gated).toEqual([]);
		// ...and no command handler refuses anything for the session not being live. A new
		// `workflow !== 'active'` guard in `commands/*.ts` fails here until the table and the story that
		// wants it say so.
		const commandsDir = new URL('../src/commands/', import.meta.url);
		const guarded = readdirSync(commandsDir)
			.filter((file) => file.endsWith('.ts'))
			.filter((file) =>
				/session\.workflow\s*[!=]==\s*'active'/.test(
					readFileSync(new URL(file, commandsDir), 'utf8'),
				),
			);
		expect(guarded).toEqual([]);
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

// ---------------------------------------------------------------------------
// RC-SES-1.3 — the session NAME carried by the start flow
// ---------------------------------------------------------------------------

describe('RC-SES-1.3: session name', () => {
	function start(title?: string | null) {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const result = dispatchCommand(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: {
				workflow: 'active',
				activeSceneId: homeSceneId,
				...(title !== undefined ? { title } : {}),
			},
		});
		return { env, homeSceneId, result };
	}

	it('starts unnamed by default and takes the name the start flow passes', () => {
		expect(buildInitialState(DM_ACTOR, PLAYER_ACTOR).session.title).toBeNull();
		expect(accept(start('Session 12 — the drowned vault').result).nextState.session.title).toBe(
			'Session 12 — the drowned vault',
		);
		expect(accept(start().result).nextState.session.title).toBeNull();
	});

	it('trims the name and rejects one longer than 120 characters', () => {
		expect(accept(start('  The drowned vault  ').result).nextState.session.title).toBe(
			'The drowned vault',
		);
		const tooLong = start('x'.repeat(121)).result;
		expect(tooLong.status).toBe('rejected');
	});

	it('keeps the name across a pause and clears it on reset to idle', () => {
		const { env, homeSceneId, result } = start('The drowned vault');
		let current = accept(result).nextState;
		current = accept(setWorkflow(current, env, 'paused', homeSceneId)).nextState;
		expect(current.session.title).toBe('The drowned vault');
		current = accept(setWorkflow(current, env, 'idle')).nextState;
		expect(current.session.title).toBeNull();
	});

	it('snapshots the name onto the archive and clears it from the live session', () => {
		const { env, result } = start('The drowned vault');
		const current = accept(setWorkflow(accept(result).nextState, env, 'recap')).nextState;
		expect(current.session.title).toBeNull();
		const archiveId = current.session.recapArchiveId;
		expect(archiveId).not.toBeNull();
		expect(current.session.archives[archiveId!]?.title).toBe('The drowned vault');
	});

	it('leaves an unnamed session out of the archive shape entirely', () => {
		const { env, result } = start();
		const current = accept(setWorkflow(accept(result).nextState, env, 'recap')).nextState;
		const archive = current.session.archives[current.session.recapArchiveId!];
		expect(archive && 'title' in archive).toBe(false);
	});

	it('clears the name when the start flow passes an explicit null', () => {
		const { env, homeSceneId, result } = start('The drowned vault');
		const current = accept(
			dispatchCommand(accept(result).nextState, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId, title: null },
			}),
		).nextState;
		expect(current.session.title).toBeNull();
	});
});
