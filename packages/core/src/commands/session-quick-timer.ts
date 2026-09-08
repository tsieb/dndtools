import { operateQuickTimerInputSchema, startQuickTimerInputSchema } from '../schemas/commands';
import type { SessionQuickTimer } from '../state/session-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

const SESSION_ENTITY_ID = 'session-default';

/**
 * RC-SES-4.4 — the QUICK-PANEL TIMER: a session-level countdown or break the DM runs from
 * `SessionQuickPanel`, independent of any scene widget (contrast the per-widget `SessionTimer` a
 * scene's Timer widget drives, `commands/widget-command.ts`). DM-only, and only while the session is
 * live — a timer left over from a stale prep/recap view has nothing to count down to.
 *
 * `laps` records the ISO instant of each lap mark; a lap is only meaningful while the timer is
 * running (paused/idle laps are rejected rather than recorded as a meaningless zero-length lap).
 */
export function handleQuickTimerCommand(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	commandType:
		| 'session.quick-timer.start'
		| 'session.quick-timer.pause'
		| 'session.quick-timer.resume'
		| 'session.quick-timer.reset'
		| 'session.quick-timer.lap',
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	if (state.session.workflow !== 'active') {
		return reject(
			{
				code: 'invalid-state',
				message: `The quick-panel timer requires an active session; current workflow is ${state.session.workflow}.`,
			},
			state,
		);
	}

	const previous = state.session.quickTimer;
	const now = env.clock();
	let next: SessionQuickTimer | null;
	let operation: 'started' | 'paused' | 'resumed' | 'reset' | 'lap';

	switch (commandType) {
		case 'session.quick-timer.start': {
			const parsed = parseInput(startQuickTimerInputSchema, rawPayload);
			if (!parsed.ok) return reject(parsed.rejection, state);
			next = {
				id: previous?.id ?? env.ids(),
				kind: parsed.data.kind,
				label: parsed.data.label ?? null,
				status: 'running',
				durationSeconds: parsed.data.durationSeconds,
				startedAt: now,
				laps: [],
				revision: (previous?.revision ?? 0) + 1,
			};
			operation = 'started';
			break;
		}
		case 'session.quick-timer.pause': {
			const parsed = parseInput(operateQuickTimerInputSchema, rawPayload);
			if (!parsed.ok) return reject(parsed.rejection, state);
			if (!previous || previous.status !== 'running') {
				return reject(
					{ code: 'invalid-state', message: 'No running quick timer to pause.' },
					state,
				);
			}
			next = {
				...previous,
				status: 'paused',
				durationSeconds: remainingSecondsAt(previous, now),
				startedAt: null,
				revision: previous.revision + 1,
			};
			operation = 'paused';
			break;
		}
		case 'session.quick-timer.resume': {
			const parsed = parseInput(operateQuickTimerInputSchema, rawPayload);
			if (!parsed.ok) return reject(parsed.rejection, state);
			if (!previous || previous.status !== 'paused') {
				return reject(
					{ code: 'invalid-state', message: 'No paused quick timer to resume.' },
					state,
				);
			}
			next = { ...previous, status: 'running', startedAt: now, revision: previous.revision + 1 };
			operation = 'resumed';
			break;
		}
		case 'session.quick-timer.reset': {
			const parsed = parseInput(operateQuickTimerInputSchema, rawPayload);
			if (!parsed.ok) return reject(parsed.rejection, state);
			if (!previous) {
				return reject({ code: 'invalid-state', message: 'No quick timer to reset.' }, state);
			}
			next = null;
			operation = 'reset';
			break;
		}
		case 'session.quick-timer.lap': {
			const parsed = parseInput(operateQuickTimerInputSchema, rawPayload);
			if (!parsed.ok) return reject(parsed.rejection, state);
			if (!previous || previous.status !== 'running') {
				return reject(
					{ code: 'invalid-state', message: 'Lap marks require a running quick timer.' },
					state,
				);
			}
			next = { ...previous, laps: [...previous.laps, now], revision: previous.revision + 1 };
			operation = 'lap';
			break;
		}
		default:
			return reject(
				{ code: 'command-not-declared', message: `No quick-timer reducer for ${commandType}.` },
				state,
			);
	}

	const nextQuickTimer = next;
	const nextSession = { ...state.session, quickTimer: nextQuickTimer };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: commandType,
		path: 'quickTimer',
		value: { operation },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: nextQuickTimer?.revision ?? 0,
		dependencies: [],
	});
	const event: CoreEvent = { kind: 'session.quick-timer-changed', operation, actorId: actor.id };
	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [event],
		operationIds: [op.id],
	};
}

/** Remaining seconds at `nowIso` for a running quick timer (0 once fully depleted). */
function remainingSecondsAt(previous: SessionQuickTimer, nowIso: string): number {
	if (previous.status !== 'running' || !previous.startedAt) return previous.durationSeconds;
	const started = Date.parse(previous.startedAt);
	const now = Date.parse(nowIso);
	if (Number.isNaN(started) || Number.isNaN(now)) return previous.durationSeconds;
	return Math.max(0, previous.durationSeconds - Math.max(0, (now - started) / 1000));
}
