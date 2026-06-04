import { dispatchWidgetCommandInputSchema } from '../schemas/commands';
import { hasGrantedCapability } from '../permissions/grants';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { commandBindingBlock } from '../queries/binding';
import {
	findWidgetDefinition,
	findPackageRecordForWidgetType,
} from '../state/widget-package-state';
import type { WidgetCommandDescriptor } from '../state/widget-package-state';
import { findOperationByIdempotencyKey } from '../sync/operation-log';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	findWidget,
	parseInput,
	reject,
	requireActor,
	requireScene,
	validateObjectAgainstSchema,
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

function actorCanUseWidgetCommand(
	state: CoreStateSlice,
	actor: NonNullable<ReturnType<typeof requireActor>>,
	widgetInstanceId: string,
	descriptor: WidgetCommandDescriptor,
): boolean {
	if ('code' in actor) return false;
	if (actor.role === 'dm') return true;
	return hasGrantedCapability(
		state.permissions,
		actor,
		'widget',
		widgetInstanceId,
		descriptor.requiredCapability,
	);
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
	if (!actorCanUseWidgetCommand(state, actor, widget.id, descriptor)) {
		return reject(
			{
				code: 'actor-not-authorized',
				message: `Actor ${actor.id} lacks ${descriptor.requiredCapability} for widget ${widget.id}.`,
			},
			state,
		);
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
	if (parsed.data.commandType !== 'timer.start') {
		return reject(
			{
				code: 'command-not-declared',
				message: `Command ${parsed.data.commandType} has no reducer in this slice.`,
			},
			state,
		);
	}

	const duration = parsed.data.payload.durationSeconds;
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
	const previousTimer = state.session.timers[widget.id];
	const nextTimer = {
		id: previousTimer?.id ?? env.ids(),
		sceneId: scene.id,
		widgetInstanceId: widget.id,
		status: 'running' as const,
		durationSeconds: duration,
		startedAt: env.clock(),
		revision: (previousTimer?.revision ?? 0) + 1,
	};
	const nextSession = {
		...state.session,
		timers: { ...state.session.timers, [widget.id]: nextTimer },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: 'session-default',
		opType: 'widget.dispatch-command',
		path: `timers/${widget.id}`,
		value: {
			widgetInstanceId: widget.id,
			commandType: parsed.data.commandType,
			payload: parsed.data.payload,
			idempotencyKey,
		},
		beforeRevision: previousTimer?.revision ?? 0,
		afterRevision: nextTimer.revision,
		dependencies: [`scene:${scene.id}@${scene.ownership.revision}`],
	});
	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.timer-started',
				sceneId: scene.id,
				widgetInstanceId: widget.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
