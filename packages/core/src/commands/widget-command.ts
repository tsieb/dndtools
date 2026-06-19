import { dispatchWidgetCommandInputSchema } from '../schemas/commands';
import { handleRollDice } from './dice';
import { decideWidgetCommandAuthority } from '../permissions/widget-operator-authority';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { commandBindingBlock } from '../queries/binding';
import {
	findWidgetDefinition,
	findPackageRecordForWidgetType,
} from '../state/widget-package-state';
import type { SessionTimer } from '../state/session-state';
import type { Scene } from '../state/scene-state';
import { findOperationByIdempotencyKey } from '../sync/operation-log';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	bumpRevision,
	findWidget,
	parseInput,
	reject,
	replaceWidget,
	requireActor,
	requireScene,
	validateObjectAgainstSchema,
	withScene,
} from './helpers';

function projectedAssignmentIncludesWidget(
	state: CoreStateSlice,
	actorId: string,
	sceneId: string,
	widgetInstanceId: string,
): boolean {
	const assignment = state.session.playerViewAssignments[actorId];
	if (!assignment || assignment.target.sceneId !== sceneId) return false;
	if (
		assignment.target.widgetInstanceIds &&
		!assignment.target.widgetInstanceIds.includes(widgetInstanceId)
	) {
		return false;
	}
	if (!assignment.target.sectionIds) return true;
	const scene = state.scenes.scenes[sceneId];
	if (!scene) return false;
	return scene.sections
		.filter((section) => assignment.target.sectionIds?.includes(section.id))
		.some((section) => section.widgetInstanceIds.includes(widgetInstanceId));
}

export function handleDispatchWidgetCommand(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
	idempotencyKey: string | undefined,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const parsed = parseInput(dispatchWidgetCommandInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	if (!idempotencyKey) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget durable commands require an idempotency key.',
			},
			state,
		);
	}
	const replayed = findOperationByIdempotencyKey(state.sync, idempotencyKey);
	if (replayed) {
		// Idempotent retry: the command already committed under this key. Return the prior
		// acceptance with no state change or duplicate event instead of surfacing an error.
		return { status: 'accepted', nextState: state, events: [], operationIds: [replayed.id] };
	}
	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	if (parsed.data.expectedRevision !== scene.ownership.revision) {
		return reject(
			{
				code: 'revision-conflict',
				message: `Expected Scene revision ${parsed.data.expectedRevision}, found ${scene.ownership.revision}.`,
			},
			state,
		);
	}
	const widget = findWidget(scene, parsed.data.widgetInstanceId);
	if (!widget) {
		return reject(
			{
				code: 'widget-not-found',
				message: `Widget ${parsed.data.widgetInstanceId} not found on Scene ${scene.id}.`,
			},
			state,
		);
	}
	const visibility = evaluateSceneVisibility(scene, actor, state.permissions);
	if (
		visibility.kind !== 'visible' &&
		!projectedAssignmentIncludesWidget(state, actor.id, scene.id, widget.id)
	) {
		return reject(
			{
				code: 'hidden-target',
				message: `Scene ${scene.id} is not visible to actor ${actor.id}.`,
			},
			state,
		);
	}
	if (widget.disabled) {
		return reject(
			{
				code: 'package-disabled',
				message: widget.disabled.message,
			},
			state,
		);
	}
	// Durable commands must not write through a hidden or conflicted binding. This
	// fails closed for every actor, including the DM, who must reveal or resolve the
	// target through an explicit command rather than silently overwriting a version.
	const bindingBlock = commandBindingBlock(widget.binding);
	if (bindingBlock) {
		return reject({ code: bindingBlock.code, message: bindingBlock.message }, state);
	}
	const packageRecord = findPackageRecordForWidgetType(state.widgets, widget.type);
	if (!packageRecord || packageRecord.removedAt) {
		return reject(
			{
				code: 'package-not-found',
				message: `No installed package declares widget type ${widget.type}.`,
			},
			state,
		);
	}
	if (!packageRecord.enabled) {
		return reject(
			{
				code: 'package-disabled',
				message: `Widget package ${packageRecord.package.id} is disabled.`,
			},
			state,
		);
	}
	const definition = findWidgetDefinition(state.widgets, widget.type);
	const descriptor = definition?.commands.find(
		(command) => command.type === parsed.data.commandType,
	);
	if (!definition || !descriptor) {
		return reject(
			{
				code: 'command-not-declared',
				message: `Widget ${widget.type} does not declare command ${parsed.data.commandType}.`,
			},
			state,
		);
	}
	// SES-005 — OPERATE-vs-CONFIGURE authority. The policy fails closed BOTH ways: a non-operator cannot
	// operate, and an actor holding only `operator` cannot reach a configure/define command.
	const authority = decideWidgetCommandAuthority(state.permissions, actor, widget.id, descriptor);
	if (!authority.authorized) {
		const message =
			authority.reason === 'operator-cannot-configure'
				? `Actor ${actor.id} holds operator on widget ${widget.id} but configuring it requires manager.`
				: `Actor ${actor.id} is not authorized to ${authority.kind} widget ${widget.id}.`;
		return reject({ code: 'actor-not-authorized', message }, state);
	}
	const issues = validateObjectAgainstSchema(descriptor.payloadSchema, parsed.data.payload);
	if (issues.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget command payload failed schema validation.',
				issues,
			},
			state,
		);
	}
	if (descriptor.writesTo === 'session' && state.session.workflow !== 'active') {
		return reject(
			{
				code: 'invalid-state',
				message: `Session widget commands require an active workflow; current workflow is ${state.session.workflow}.`,
			},
			state,
		);
	}
	// SES-005 — the timer/tool reducer. start/pause/resume/reset/advance are OPERATE actions that mutate
	// the durable SESSION timer state; set-duration is a CONFIGURE action that mutates the scene widget's
	// configuration (NOT the live timer). Anything else has no reducer here.
	if (parsed.data.commandType === 'timer.set-duration') {
		return reduceTimerConfigure(state, env, actor.id, scene, widget.id, parsed.data, idempotencyKey);
	}
	if (TIMER_OPERATE_COMMANDS.includes(parsed.data.commandType)) {
		return reduceTimerOperate(state, env, actor.id, scene, widget.id, parsed.data, idempotencyKey);
	}
	// SES-003 — the Dice widget's `dice.roll` is the shared session dice engine, not a slice-local
	// reducer. Delegate to it (it computes the outcome from a seed and records it to the session dice
	// history); the envelope's idempotency key is threaded through so a retry does not double-roll.
	if (parsed.data.commandType === 'dice.roll') {
		return handleRollDice(state, env, actor.id, parsed.data.payload, idempotencyKey);
	}
	return reject(
		{
			code: 'command-not-declared',
			message: `Command ${parsed.data.commandType} has no reducer in this slice.`,
		},
		state,
	);
}

const TIMER_OPERATE_COMMANDS: readonly string[] = Object.freeze([
	'timer.start',
	'timer.pause',
	'timer.resume',
	'timer.reset',
	'timer.advance',
]);

type DispatchData = ReturnType<typeof dispatchWidgetCommandInputSchema['parse']>;

/**
 * SES-005 OPERATE — drive the session timer's runtime: start/pause/resume/reset/advance. Each action
 * mutates the durable session timer document only (never the widget configuration). Reset/advance/pause/
 * resume on a never-started timer initialize a stopped timer at zero so an operator's first action is
 * still well-defined. Returns a deterministic next timer + an op-log entry (Contract 2).
 */
function reduceTimerOperate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	scene: Scene,
	widgetInstanceId: string,
	data: DispatchData,
	idempotencyKey: string,
): CommandResult {
	const previous: SessionTimer | undefined = state.session.timers[widgetInstanceId];
	const baseDuration = previous?.durationSeconds ?? 0;
	const now = env.clock();
	let next: SessionTimer;
	let event: CoreEvent;

	switch (data.commandType) {
		case 'timer.start': {
			const duration = data.payload.durationSeconds;
			if (typeof duration !== 'number') {
				return reject(
					{
						code: 'invalid-payload',
						message: 'Timer duration must be numeric.',
						issues: [{ path: 'durationSeconds', message: 'Expected number.' }],
					},
					state,
				);
			}
			next = {
				id: previous?.id ?? env.ids(),
				sceneId: scene.id,
				widgetInstanceId,
				status: 'running',
				durationSeconds: duration,
				startedAt: now,
				revision: (previous?.revision ?? 0) + 1,
			};
			event = {
				kind: 'session.timer-started',
				sceneId: scene.id,
				widgetInstanceId,
				actorId,
			};
			break;
		}
		case 'timer.pause':
			// UX-SES-012 — pausing FOLDS the elapsed running time into the remaining duration, so the
			// paused countdown freezes at the true remaining value and resume continues from there
			// (the countdown view derives remaining = durationSeconds - elapsed-since-startedAt).
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: 'paused',
				durationSeconds: remainingSecondsAt(previous, now),
				startedAt: null,
			});
			event = { kind: 'session.timer-operated', sceneId: scene.id, widgetInstanceId, actorId, operation: 'pause' };
			break;
		case 'timer.resume':
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: 'running',
				durationSeconds: baseDuration,
				startedAt: now,
			});
			event = { kind: 'session.timer-operated', sceneId: scene.id, widgetInstanceId, actorId, operation: 'resume' };
			break;
		case 'timer.reset':
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: 'idle',
				durationSeconds: baseDuration,
				startedAt: null,
			});
			event = { kind: 'session.timer-operated', sceneId: scene.id, widgetInstanceId, actorId, operation: 'reset' };
			break;
		case 'timer.advance': {
			const delta = data.payload.deltaSeconds;
			if (typeof delta !== 'number') {
				return reject(
					{
						code: 'invalid-payload',
						message: 'Timer advance delta must be numeric.',
						issues: [{ path: 'deltaSeconds', message: 'Expected number.' }],
					},
					state,
				);
			}
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: previous?.status ?? 'idle',
				durationSeconds: Math.max(0, baseDuration + delta),
				startedAt: previous?.startedAt ?? null,
			});
			event = { kind: 'session.timer-operated', sceneId: scene.id, widgetInstanceId, actorId, operation: 'advance' };
			break;
		}
		default:
			return reject(
				{ code: 'command-not-declared', message: `No timer operate reducer for ${data.commandType}.` },
				state,
			);
	}

	const nextSession = {
		...state.session,
		timers: { ...state.session.timers, [widgetInstanceId]: next },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'session',
		entityId: 'session-default',
		opType: 'widget.dispatch-command',
		path: `timers/${widgetInstanceId}`,
		value: {
			widgetInstanceId,
			commandType: data.commandType,
			payload: data.payload,
			idempotencyKey,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: next.revision,
		dependencies: [`scene:${scene.id}@${scene.ownership.revision}`],
	});
	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [event],
		operationIds: [op.id],
	};
}

/**
 * UX-SES-012 — the timer's remaining seconds at `nowIso`. For a running timer this subtracts the
 * elapsed time since the recorded start (clamped at zero); otherwise the recorded duration IS the
 * remaining time. Pure: a function of the recorded document + the supplied instant only.
 */
function remainingSecondsAt(previous: SessionTimer | undefined, nowIso: string): number {
	const base = previous?.durationSeconds ?? 0;
	if (previous?.status !== 'running' || !previous.startedAt) return base;
	const started = Date.parse(previous.startedAt);
	const now = Date.parse(nowIso);
	if (Number.isNaN(started) || Number.isNaN(now)) return base;
	return Math.max(0, base - Math.max(0, (now - started) / 1000));
}

function makeTimer(
	previous: SessionTimer | undefined,
	sceneId: string,
	widgetInstanceId: string,
	env: CoreEnvironment,
	patch: Pick<SessionTimer, 'status' | 'durationSeconds' | 'startedAt'>,
): SessionTimer {
	return {
		id: previous?.id ?? env.ids(),
		sceneId,
		widgetInstanceId,
		revision: (previous?.revision ?? 0) + 1,
		...patch,
	};
}

/**
 * SES-005 CONFIGURE — change the timer widget's configured default duration. This mutates the SCENE
 * widget's configuration (durable scene state), NOT the live session timer. Only a `manager`/DM reaches
 * here (the authority check above already blocked an operator). Bumps the scene revision so the change
 * syncs.
 */
function reduceTimerConfigure(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	scene: Scene,
	widgetInstanceId: string,
	data: DispatchData,
	idempotencyKey: string,
): CommandResult {
	const duration = data.payload.durationSeconds;
	if (typeof duration !== 'number') {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Timer duration must be numeric.',
				issues: [{ path: 'durationSeconds', message: 'Expected number.' }],
			},
			state,
		);
	}
	const sceneEntity = state.scenes.scenes[scene.id]!;
	const widget = findWidget(sceneEntity, widgetInstanceId)!;
	const configuredWidget = {
		...widget,
		configuration: { ...widget.configuration, durationSeconds: duration },
	};
	const updatedScene = bumpRevision(replaceWidget(sceneEntity, configuredWidget), env);
	const nextScenes = withScene(state.scenes, scene.id, () => updatedScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'widget.dispatch-command',
		path: `widgets/${widgetInstanceId}/configuration/durationSeconds`,
		value: { widgetInstanceId, commandType: data.commandType, durationSeconds: duration, idempotencyKey },
		beforeRevision: sceneEntity.ownership.revision,
		afterRevision: updatedScene.ownership.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, sync: nextLog },
		events: [
			{ kind: 'scene.widget-configured', sceneId: scene.id, widgetInstanceId, actorId },
		],
		operationIds: [op.id],
	};
}
