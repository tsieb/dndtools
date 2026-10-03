import { dispatchWidgetCommandInputSchema } from '../schemas/commands';
import { handleRollDice } from './dice';
import { handleUpdateContentItem } from './content';
import { handleUpdateVaultObject } from './vault-object';
import { parseDiceExpression } from '../state/dice';
import { contentItemById, isLiveContentItem } from '../state/content';
import type { ContentItem, VaultContentState } from '../state/content';
import { VAULT_OBJECT_SUBTYPE_KEY } from '../state/vault-object';
import { decideWidgetCommandAuthority } from '../permissions/widget-operator-authority';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { commandBindingBlock } from '../queries/binding';
import {
	WIDGET_COUNTER_EXECUTORS,
	WIDGET_COUNTER_RESTORE_COMMAND,
	WIDGET_COUNTER_STATE_KEY,
	WIDGET_LAST_ROLL_STATE_KEY,
	WIDGET_SHOWN_MESSAGE_STATE_KEY,
	findWidgetDefinition,
	findPackageRecordForWidgetType,
	readWidgetCounter,
	widgetCommandHasExecutor,
	type WidgetCommandDescriptor,
	type WidgetCommandExecutor,
	type WidgetLastRoll,
	type WidgetShownMessage,
} from '../state/widget-package-state';
import type { SessionTimer } from '../state/session-state';
import type { Scene, WidgetInstance } from '../state/scene-state';
import { findOperationByIdempotencyKey } from '../sync/operation-log';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';
import {
	appendOperationDraft,
	bumpRevision,
	ensureContentStateSlice,
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
	// RC-WID-6.1 — the counter's restore (the inverse of a counter press) is core-reserved, never
	// declared. It is reachable only on a widget that declares a counter command, and it is authorized
	// exactly as that command is, so undoing a press needs no more authority than making it.
	const restoring = parsed.data.commandType === WIDGET_COUNTER_RESTORE_COMMAND;
	const descriptor = restoring
		? definition?.commands.find(
				(command) =>
					command.executor !== undefined && WIDGET_COUNTER_EXECUTORS.includes(command.executor),
			)
		: definition?.commands.find((command) => command.type === parsed.data.commandType);
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
	if (restoring) {
		return restoreWidgetCounter(state, env, actor.id, scene, widget, parsed.data, idempotencyKey);
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
	// RC-SES-6.1 — a session-writing widget command (the Timer widget, the Dice widget) runs in every
	// workflow state, like the top-level session commands; going live gates no table tool.
	// SES-005 — the timer/tool reducer. start/pause/resume/reset/advance are OPERATE actions that mutate
	// the durable SESSION timer state; set-duration is a CONFIGURE action that mutates the scene widget's
	// configuration (NOT the live timer). Anything else has no reducer here.
	if (parsed.data.commandType === 'timer.set-duration') {
		return reduceTimerConfigure(
			state,
			env,
			actor.id,
			scene,
			widget.id,
			parsed.data,
			idempotencyKey,
		);
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
	// RC-WID-6.1 — everything else runs through the executor the descriptor declares. Install refuses
	// a template command without one, so reaching the end of this chain means a package installed
	// before executors existed, or custom code naming a command it never gave the core a way to run.
	if (descriptor.executor) {
		return runWidgetCommandExecutor(state, env, {
			actorId: actor.id,
			scene,
			widget,
			descriptor,
			executor: descriptor.executor,
			data: parsed.data,
			idempotencyKey,
		});
	}
	return reject(
		{
			code: 'command-not-declared',
			message: `Command ${parsed.data.commandType} declares no executor, so the core cannot run it.`,
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

type DispatchData = ReturnType<(typeof dispatchWidgetCommandInputSchema)['parse']>;

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
	// RC-WID-6.1 — a template's start/pause/resume executor drives the same timer under its own
	// command type, so the operation is named separately from the type the op log records.
	operation: string = data.commandType,
): CommandResult {
	const previous: SessionTimer | undefined = state.session.timers[widgetInstanceId];
	const baseDuration = previous?.durationSeconds ?? 0;
	const now = env.clock();
	let next: SessionTimer;
	let event: CoreEvent;

	switch (operation) {
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
			event = {
				kind: 'session.timer-operated',
				sceneId: scene.id,
				widgetInstanceId,
				actorId,
				operation: 'pause',
			};
			break;
		case 'timer.resume':
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: 'running',
				durationSeconds: baseDuration,
				startedAt: now,
			});
			event = {
				kind: 'session.timer-operated',
				sceneId: scene.id,
				widgetInstanceId,
				actorId,
				operation: 'resume',
			};
			break;
		case 'timer.reset':
			next = makeTimer(previous, scene.id, widgetInstanceId, env, {
				status: 'idle',
				durationSeconds: baseDuration,
				startedAt: null,
			});
			event = {
				kind: 'session.timer-operated',
				sceneId: scene.id,
				widgetInstanceId,
				actorId,
				operation: 'reset',
			};
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
			event = {
				kind: 'session.timer-operated',
				sceneId: scene.id,
				widgetInstanceId,
				actorId,
				operation: 'advance',
			};
			break;
		}
		default:
			return reject(
				{
					code: 'command-not-declared',
					message: `No timer operate reducer for ${data.commandType}.`,
				},
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
		value: {
			widgetInstanceId,
			commandType: data.commandType,
			durationSeconds: duration,
			idempotencyKey,
		},
		beforeRevision: sceneEntity.ownership.revision,
		afterRevision: updatedScene.ownership.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, sync: nextLog },
		events: [{ kind: 'scene.widget-configured', sceneId: scene.id, widgetInstanceId, actorId }],
		operationIds: [op.id],
	};
}

// --- RC-WID-6.1 — declared executors ------------------------------------------------------------

/** Why a declared command cannot run right now. Each has its own copy in the action panel. */
export type WidgetCommandUnavailableReason =
	| 'no-executor'
	| 'no-formula'
	| 'bad-formula'
	| 'no-bound-entity'
	| 'bound-entity-missing'
	| 'bound-entity-not-note'
	| 'bound-entity-not-quest'
	| 'no-text'
	| 'no-line'
	| 'no-value'
	| 'no-duration';

export type WidgetCommandAvailability =
	| { available: true }
	| { available: false; reason: WidgetCommandUnavailableReason; message: string };

export interface WidgetCommandAvailabilityInput {
	descriptor: Pick<WidgetCommandDescriptor, 'type' | 'executor'>;
	/** The payload the press would send (the action panel reads it off the configuration). */
	payload: Record<string, unknown>;
	/** The placed widget's binding source, if any. */
	binding: { entityType: string; entityId: string } | null;
	/** The placed widget's configuration — where `start` finds a duration the payload lacks. */
	configuration?: Record<string, unknown>;
	/**
	 * The vault content. When given, the bound entity itself is checked (exists, is a note / a quest);
	 * without it only the binding's presence is. The pure templates pass none; the core always does.
	 */
	content?: VaultContentState;
}

const AVAILABLE: WidgetCommandAvailability = Object.freeze({ available: true });

function unavailable(
	reason: WidgetCommandUnavailableReason,
	message: string,
): WidgetCommandAvailability {
	return { available: false, reason, message };
}

function nonEmptyText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
	const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

function finiteNumber(value: unknown): number | null {
	const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

/** The duration a `start` press runs for: the payload's, else the placed widget's configured one. */
function startDurationOf(
	payload: Record<string, unknown>,
	configuration: Record<string, unknown> | undefined,
): number | null {
	return positiveNumber(payload.durationSeconds) ?? positiveNumber(configuration?.durationSeconds);
}

/** The bound content item an entity executor writes through, or why there is none to write. */
function boundContentItem(
	input: WidgetCommandAvailabilityInput,
	kind: 'note' | 'quest',
): ContentItem | WidgetCommandAvailability | null {
	if (!input.binding) {
		return unavailable(
			'no-bound-entity',
			kind === 'note' ? 'Bind a note to this widget first.' : 'Bind a quest to this widget first.',
		);
	}
	if (!input.content) return null;
	const item = contentItemById(input.content, input.binding.entityId);
	if (!item || !isLiveContentItem(item)) {
		return unavailable('bound-entity-missing', 'The bound entity no longer exists.');
	}
	if (kind === 'note' && item.kind !== 'note') {
		return unavailable('bound-entity-not-note', 'The bound entity is not a note.');
	}
	if (kind === 'quest' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] !== 'quest') {
		return unavailable('bound-entity-not-quest', 'The bound entity is not a quest.');
	}
	return item;
}

function isAvailability(value: unknown): value is WidgetCommandAvailability {
	return typeof value === 'object' && value !== null && 'available' in value;
}

/**
 * Whether a declared command could run if pressed now, and if not, why. One function for both
 * sides: the action panel disables a button with the returned reason as its tooltip, and the core
 * runs the same check (with the vault content) before it executes, so the two cannot disagree.
 */
export function widgetCommandAvailability(
	input: WidgetCommandAvailabilityInput,
): WidgetCommandAvailability {
	const { descriptor, payload } = input;
	if (!widgetCommandHasExecutor(descriptor)) {
		return unavailable(
			'no-executor',
			`Command ${descriptor.type} has nothing in the core to run it.`,
		);
	}
	switch (descriptor.executor) {
		case 'roll': {
			const formula = nonEmptyText(payload.formula);
			if (!formula) return unavailable('no-formula', 'Set a dice formula for this roll first.');
			if (!parseDiceExpression(formula).ok) {
				return unavailable('bad-formula', `"${formula}" is not a dice formula.`);
			}
			return AVAILABLE;
		}
		case 'set-value':
			return finiteNumber(payload.value) === null
				? unavailable('no-value', 'Set the value this button sets first.')
				: AVAILABLE;
		case 'show':
			return nonEmptyText(payload.text) === null
				? unavailable('no-text', 'Write the message to show first.')
				: AVAILABLE;
		case 'write-note-line': {
			if (nonEmptyText(payload.line) === null) {
				return unavailable('no-line', 'Write the line to add first.');
			}
			const item = boundContentItem(input, 'note');
			return isAvailability(item) ? item : AVAILABLE;
		}
		case 'mark-complete': {
			const item = boundContentItem(input, 'quest');
			return isAvailability(item) ? item : AVAILABLE;
		}
		case 'start':
			return startDurationOf(payload, input.configuration) === null
				? unavailable('no-duration', 'Set how long the timer runs first.')
				: AVAILABLE;
		default:
			return AVAILABLE;
	}
}

interface ExecutorContext {
	actorId: string;
	scene: Scene;
	widget: WidgetInstance;
	descriptor: WidgetCommandDescriptor;
	executor: WidgetCommandExecutor;
	data: DispatchData;
	idempotencyKey: string;
}

function runWidgetCommandExecutor(
	state: CoreStateSlice,
	env: CoreEnvironment,
	ctx: ExecutorContext,
): CommandResult {
	const { data, widget } = ctx;
	const content = ensureContentStateSlice(state.content);
	const availability = widgetCommandAvailability({
		descriptor: ctx.descriptor,
		payload: data.payload,
		binding: widget.binding?.source ?? null,
		configuration: widget.configuration,
		content,
	});
	if (!availability.available) {
		return reject({ code: 'invalid-state', message: availability.message }, state);
	}
	const counter = readWidgetCounter(widget.localState);
	switch (ctx.executor) {
		case 'roll':
			return executeRoll(state, env, ctx, nonEmptyText(data.payload.formula)!);
		case 'advance':
			return writeWidgetLocalState(
				state,
				env,
				ctx,
				WIDGET_COUNTER_STATE_KEY,
				counter + (finiteNumber(data.payload.by) ?? 1),
			);
		case 'tick':
			return writeWidgetLocalState(state, env, ctx, WIDGET_COUNTER_STATE_KEY, counter + 1);
		case 'reset':
			return writeWidgetLocalState(state, env, ctx, WIDGET_COUNTER_STATE_KEY, 0);
		case 'set-value':
			return writeWidgetLocalState(
				state,
				env,
				ctx,
				WIDGET_COUNTER_STATE_KEY,
				finiteNumber(data.payload.value)!,
			);
		case 'show': {
			const message: WidgetShownMessage = {
				text: nonEmptyText(data.payload.text)!,
				shownAt: env.clock(),
				shownBy: ctx.actorId,
			};
			return writeWidgetLocalState(state, env, ctx, WIDGET_SHOWN_MESSAGE_STATE_KEY, message);
		}
		case 'write-note-line': {
			const item = contentItemById(content, widget.binding!.source.entityId)!;
			const line = nonEmptyText(data.payload.line)!;
			const body = item.body.trim() === '' ? line : `${item.body.replace(/\s+$/, '')}\n${line}`;
			return recordDelegatedPress(
				state,
				env,
				ctx,
				handleUpdateContentItem(state, env, ctx.actorId, { itemId: item.id, body }),
			);
		}
		case 'mark-complete':
			return recordDelegatedPress(
				state,
				env,
				ctx,
				handleUpdateVaultObject(state, env, ctx.actorId, {
					itemId: widget.binding!.source.entityId,
					fields: { status: 'completed' },
				}),
			);
		case 'start':
			return reduceTimerOperate(
				state,
				env,
				ctx.actorId,
				ctx.scene,
				widget.id,
				{
					...data,
					payload: { durationSeconds: startDurationOf(data.payload, widget.configuration)! },
				},
				ctx.idempotencyKey,
				'timer.start',
			);
		case 'pause':
			return reduceTimerOperate(
				state,
				env,
				ctx.actorId,
				ctx.scene,
				widget.id,
				data,
				ctx.idempotencyKey,
				'timer.pause',
			);
		case 'resume':
			return reduceTimerOperate(
				state,
				env,
				ctx.actorId,
				ctx.scene,
				widget.id,
				data,
				ctx.idempotencyKey,
				'timer.resume',
			);
	}
}

/**
 * `roll` — the shared session dice engine (the same `handleRollDice` the Dice widget reaches), with
 * the press's idempotency key on the dice op so a retry does not roll twice. The result is also
 * kept on the placed widget (`WIDGET_LAST_ROLL_STATE_KEY`), so the panel that rolled can show what came up.
 */
function executeRoll(
	state: CoreStateSlice,
	env: CoreEnvironment,
	ctx: ExecutorContext,
	formula: string,
): CommandResult {
	const rolled = handleRollDice(
		state,
		env,
		ctx.actorId,
		{ expression: formula, label: ctx.descriptor.displayName },
		ctx.idempotencyKey,
	);
	if (rolled.status !== 'accepted') return rolled;
	const record = rolled.nextState.session.diceHistory.at(-1)!;
	const kept = writeWidgetLocalState(
		rolled.nextState,
		env,
		{ ...ctx, idempotencyKey: '' },
		WIDGET_LAST_ROLL_STATE_KEY,
		{
			expression: record.expression,
			total: record.total,
			rolledAt: record.rolledAt,
		} satisfies WidgetLastRoll,
	);
	if (kept.status !== 'accepted') return kept;
	return {
		...kept,
		events: [...rolled.events, ...kept.events],
		operationIds: [...rolled.operationIds, ...kept.operationIds],
	};
}

/**
 * Write one key of the placed widget's `localState` (the counter, the shown message, the last
 * roll). Scene state, so the scene revision moves and the op is on the scene; the op carries the
 * previous value beside the next so the write can be read back, and undone, from the log alone.
 */
function writeWidgetLocalState(
	state: CoreStateSlice,
	env: CoreEnvironment,
	ctx: Pick<ExecutorContext, 'actorId' | 'scene' | 'widget' | 'data' | 'idempotencyKey'>,
	key: string,
	value: unknown,
): CommandResult {
	const sceneEntity = state.scenes.scenes[ctx.scene.id]!;
	const current = findWidget(sceneEntity, ctx.widget.id)!;
	const nextWidget: WidgetInstance = {
		...current,
		localState: { ...current.localState, [key]: value },
	};
	const updatedScene = bumpRevision(replaceWidget(sceneEntity, nextWidget), env);
	const nextScenes = withScene(state.scenes, ctx.scene.id, () => updatedScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, ctx.actorId, {
		entityType: 'scene',
		entityId: ctx.scene.id,
		opType: 'widget.dispatch-command',
		path: `widgets/${ctx.widget.id}/localState/${key}`,
		value: {
			widgetInstanceId: ctx.widget.id,
			commandType: ctx.data.commandType,
			previous: current.localState[key] ?? null,
			next: value,
			...(ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : {}),
		},
		beforeRevision: sceneEntity.ownership.revision,
		afterRevision: updatedScene.ownership.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextScenes, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-configured',
				sceneId: ctx.scene.id,
				widgetInstanceId: ctx.widget.id,
				actorId: ctx.actorId,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * An entity executor ran through the entity's own command, which knows nothing of the press. Record
 * the press beside it — widget, command, idempotency key, and the ops it produced — so a retry under
 * the same key replays instead of writing the line twice.
 */
function recordDelegatedPress(
	state: CoreStateSlice,
	env: CoreEnvironment,
	ctx: ExecutorContext,
	result: CommandResult,
): CommandResult {
	if (result.status !== 'accepted') return result;
	const { log: nextLog, op } = appendOperationDraft(env, result.nextState.sync, ctx.actorId, {
		entityType: 'scene',
		entityId: ctx.scene.id,
		opType: 'widget.dispatch-command',
		path: `widgets/${ctx.widget.id}/commands/${ctx.data.commandType}`,
		value: {
			widgetInstanceId: ctx.widget.id,
			commandType: ctx.data.commandType,
			executor: ctx.executor,
			delegatedOperationIds: result.operationIds,
			idempotencyKey: ctx.idempotencyKey,
		},
		beforeRevision: ctx.scene.ownership.revision,
		afterRevision: ctx.scene.ownership.revision,
	});
	return {
		...result,
		nextState: { ...result.nextState, sync: nextLog },
		operationIds: [...result.operationIds, op.id],
	};
}

/** The counter's restore: put it back to `value` (the inverse of a counter press). */
function restoreWidgetCounter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	scene: Scene,
	widget: WidgetInstance,
	data: DispatchData,
	idempotencyKey: string,
): CommandResult {
	const value = finiteNumber(data.payload.value);
	if (value === null || typeof data.payload.value !== 'number') {
		return reject(
			{
				code: 'invalid-payload',
				message: 'A counter restore needs a numeric value.',
				issues: [{ path: 'value', message: 'Expected number.' }],
			},
			state,
		);
	}
	return writeWidgetLocalState(
		state,
		env,
		{ actorId, scene, widget, data, idempotencyKey },
		WIDGET_COUNTER_STATE_KEY,
		value,
	);
}

/**
 * The command that exactly undoes an accepted counter press (or a counter restore), built from the
 * state BEFORE it — the same pure contract `buildWidgetInverse` keeps for layout commands. Any other
 * widget command returns `null`: a roll, a shown message or a note line is not taken back by
 * pretending it never happened.
 *
 * The inverse is the core-reserved {@link WIDGET_COUNTER_RESTORE_COMMAND} with the counter's prior
 * value, addressed at the scene revision the forward press produced, under a key derived from the
 * forward one so it is unique and replay-safe.
 */
export function buildWidgetCommandInverse(
	command: CoreCommand,
	stateBefore: CoreStateSlice,
): CoreCommand | null {
	if (command.type !== 'widget.dispatch-command' || !command.idempotencyKey) return null;
	const parsed = dispatchWidgetCommandInputSchema.safeParse(command.payload);
	if (!parsed.success) return null;
	const scene = stateBefore.scenes.scenes[parsed.data.sceneId];
	const widget = scene ? findWidget(scene, parsed.data.widgetInstanceId) : undefined;
	if (!scene || !widget) return null;
	if (parsed.data.commandType !== WIDGET_COUNTER_RESTORE_COMMAND) {
		const descriptor = findWidgetDefinition(stateBefore.widgets, widget.type)?.commands.find(
			(candidate) => candidate.type === parsed.data.commandType,
		);
		if (!descriptor?.executor || !WIDGET_COUNTER_EXECUTORS.includes(descriptor.executor)) {
			return null;
		}
	}
	return {
		type: 'widget.dispatch-command',
		actorId: command.actorId,
		idempotencyKey: `${command.idempotencyKey}:inverse`,
		payload: {
			sceneId: scene.id,
			widgetInstanceId: widget.id,
			commandType: WIDGET_COUNTER_RESTORE_COMMAND,
			payload: { value: readWidgetCounter(widget.localState) },
			expectedRevision: scene.ownership.revision + 1,
		},
	};
}
