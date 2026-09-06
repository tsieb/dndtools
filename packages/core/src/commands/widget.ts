import { hasDmAuthority } from '../state/permission-state';
import {
	addWidgetInputSchema,
	configureWidgetInputSchema,
	destroyWidgetInputSchema,
	dockWidgetInputSchema,
	groupWidgetsInputSchema,
	layerWidgetInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	resizeWidgetInputSchema,
	setWidgetFocusOrderInputSchema,
	// RC-CAN-1.2 (append-only)
	restoreWidgetInputSchema,
} from '../schemas/commands';
import { actorCanCoEditScene, hasGrantedCapability } from '../permissions/grants';
import { evaluateSceneVisibility } from '../permissions/visibility';
import type { Actor } from '../state/permission-state';
import type {
	WidgetInstance,
	WidgetLayout,
	Scene,
	SectionLayoutRegion,
	WidgetBinding,
	WidgetTombstone,
	WidgetDisabledState,
} from '../state/scene-state';
// RC-CAN-1.2 — tombstone helpers (retention window, hydrator-safe read, pruning).
import {
	isRestorableTombstone,
	pruneExpiredTombstones,
	sceneTombstones,
	withTombstones,
} from '../state/scene-state';
import {
	findPackageRecordForWidgetType,
	findWidgetDefinition,
} from '../state/widget-package-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
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

function widgetLayoutFromAdd(
	input: { x: number; y: number; w: number; h: number },
	z: number,
): WidgetLayout {
	return {
		x: input.x,
		y: input.y,
		w: input.w,
		h: input.h,
		z,
		groupId: null,
		dock: null,
		pinned: false,
		focusOrder: null,
	};
}

function nextZ(scene: Scene): number {
	if (scene.widgets.length === 0) return 1;
	return Math.max(...scene.widgets.map((w) => w.layout.z)) + 1;
}

function requireSceneCoEditor(
	state: CoreStateSlice,
	actor: Actor,
	scene: Scene,
): ReturnType<typeof reject>['rejection'] | null {
	if (hasDmAuthority(actor.role)) return null;
	if (!actorCanCoEditScene(state.permissions, actor.id, scene.id)) {
		return {
			code: 'actor-not-authorized',
			message: `Actor ${actor.id} lacks co-editor for Scene ${scene.id}.`,
		};
	}
	const visibility = evaluateSceneVisibility(scene, actor, state.permissions);
	if (visibility.kind !== 'visible') {
		return {
			code: 'hidden-target',
			message: `Scene ${scene.id} is not visible to actor ${actor.id}.`,
		};
	}
	return null;
}

/**
 * PERM-004: `now` MUST be passed (from `env.clock()`) so expired `manager` grants are inert
 * (fail closed). Omitting `now` would allow an expired widget-manager grant to remain effective.
 */
function requireWidgetManager(
	state: CoreStateSlice,
	actor: Actor,
	widget: WidgetInstance,
	now?: string,
): ReturnType<typeof reject>['rejection'] | null {
	if (hasDmAuthority(actor.role)) return null;
	if (hasGrantedCapability(state.permissions, actor, 'widget', widget.id, 'manager', now)) {
		return null;
	}
	return {
		code: 'actor-not-authorized',
		message: `Actor ${actor.id} lacks manager for widget ${widget.id}.`,
	};
}

/**
 * PERM-004: `now` MUST be passed (from `env.clock()`) so expired binding-capability grants are
 * inert (fail closed). Omitting `now` would allow an expired grant to remain effective.
 */
function requireBindingCapability(
	state: CoreStateSlice,
	actor: Actor,
	binding: WidgetBinding | null,
	now?: string,
): ReturnType<typeof reject>['rejection'] | null {
	if (!binding || hasDmAuthority(actor.role)) return null;
	if (
		hasGrantedCapability(
			state.permissions,
			actor,
			binding.source.entityType,
			binding.source.entityId,
			binding.requiredCapability,
			now,
		)
	) {
		return null;
	}
	return {
		code: 'actor-not-authorized',
		message: `Actor ${actor.id} lacks ${binding.requiredCapability} for ${binding.source.entityType} ${binding.source.entityId}.`,
	};
}

export function handleAddWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(addWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

	const packageRecord = findPackageRecordForWidgetType(state.widgets, parsed.data.widget.type);
	if (!packageRecord || packageRecord.removedAt) {
		return reject(
			{
				code: 'package-not-found',
				message: `No installed package declares widget type ${parsed.data.widget.type}.`,
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
	const definition = findWidgetDefinition(state.widgets, parsed.data.widget.type);
	if (!definition) {
		return reject(
			{
				code: 'package-not-found',
				message: `Widget definition ${parsed.data.widget.type} is not available.`,
			},
			state,
		);
	}
	if (parsed.data.widget.version !== definition.version) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Widget ${parsed.data.widget.type} must be created at definition version ${definition.version}.`,
			},
			state,
		);
	}
	const configIssues = validateObjectAgainstSchema(
		definition.configurationSchema,
		parsed.data.widget.configuration,
	);
	if (configIssues.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget configuration failed schema validation.',
				issues: configIssues.map((issue) => ({
					path: `widget.configuration.${issue.path}`,
					message: issue.message,
				})),
			},
			state,
		);
	}
	const now = env.clock();
	const bindingCheck = requireBindingCapability(state, actor, parsed.data.widget.binding, now);
	if (bindingCheck) return reject(bindingCheck, state);

	const widget: WidgetInstance = {
		id: env.ids(),
		type: parsed.data.widget.type,
		version: parsed.data.widget.version,
		layout: widgetLayoutFromAdd(parsed.data.widget.layout, nextZ(scene)),
		configuration: parsed.data.widget.configuration,
		localState: parsed.data.widget.localState,
		binding: parsed.data.widget.binding,
		disabled: null,
	};

	let nextSections: SectionLayoutRegion[] = scene.sections;
	if (parsed.data.widget.sectionId) {
		const sectionId = parsed.data.widget.sectionId;
		const target = scene.sections.find((s) => s.id === sectionId);
		if (!target) {
			return reject(
				{ code: 'invalid-state', message: `Section ${sectionId} does not exist.` },
				state,
			);
		}
		nextSections = scene.sections.map((section) =>
			section.id === sectionId
				? { ...section, widgetInstanceIds: [...section.widgetInstanceIds, widget.id] }
				: section,
		);
	}

	const nextScene = bumpRevision(
		{ ...scene, widgets: [...scene.widgets, widget], sections: nextSections },
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.add-widget',
		path: `widgets/${widget.id}`,
		value: widget,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-added',
				sceneId: scene.id,
				widgetInstanceId: widget.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

type LayoutFieldKind = 'position' | 'size' | 'z' | 'dock' | 'pin' | 'group' | 'focusOrder';

function mutateWidgetLayout(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	sceneId: string,
	widgetInstanceId: string,
	field: LayoutFieldKind,
	mutator: (layout: WidgetLayout) => WidgetLayout,
	value: unknown,
	opType: string,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const scene = requireScene(state, sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);
	const widget = findWidget(scene, widgetInstanceId);
	if (!widget) {
		return reject(
			{
				code: 'widget-not-found',
				message: `Widget ${widgetInstanceId} not found on Scene ${sceneId}.`,
			},
			state,
		);
	}

	const nextWidget: WidgetInstance = { ...widget, layout: mutator(widget.layout) };
	const sceneWithWidget = replaceWidget(scene, nextWidget);
	const nextScene = bumpRevision(sceneWithWidget, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType,
		path: `widgets/${widget.id}/layout/${field}`,
		value,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-layout-changed',
				sceneId: scene.id,
				widgetInstanceId: widget.id,
				actorId: actor.id,
				field,
			},
		],
		operationIds: [op.id],
	};
}

export function handleMoveWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(moveWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'position',
		(layout) => ({ ...layout, x: parsed.data.x, y: parsed.data.y }),
		{ x: parsed.data.x, y: parsed.data.y },
		'scene.move-widget',
	);
}

export function handleResizeWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(resizeWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'size',
		(layout) => ({ ...layout, w: parsed.data.w, h: parsed.data.h }),
		{ w: parsed.data.w, h: parsed.data.h },
		'scene.resize-widget',
	);
}

export function handleLayerWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(layerWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'z',
		(layout) => ({ ...layout, z: parsed.data.z }),
		{ z: parsed.data.z },
		'scene.layer-widget',
	);
}

export function handleDockWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(dockWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'dock',
		(layout) => ({ ...layout, dock: parsed.data.dock }),
		{ dock: parsed.data.dock },
		'scene.dock-widget',
	);
}

export function handlePinWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(pinWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'pin',
		(layout) => ({ ...layout, pinned: parsed.data.pinned }),
		{ pinned: parsed.data.pinned },
		'scene.pin-widget',
	);
}

export function handleSetWidgetFocusOrder(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setWidgetFocusOrderInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	return mutateWidgetLayout(
		state,
		env,
		actorId,
		parsed.data.sceneId,
		parsed.data.widgetInstanceId,
		'focusOrder',
		(layout) => ({ ...layout, focusOrder: parsed.data.focusOrder }),
		{ focusOrder: parsed.data.focusOrder },
		'scene.set-focus-order',
	);
}

export function handleGroupWidgets(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(groupWidgetsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

	for (const id of parsed.data.widgetInstanceIds) {
		if (!findWidget(scene, id)) {
			return reject(
				{ code: 'widget-not-found', message: `Widget ${id} not found on Scene ${scene.id}.` },
				state,
			);
		}
	}

	const groupId = env.ids();
	const targetIds = new Set(parsed.data.widgetInstanceIds);
	const newWidgets = scene.widgets.map((widget) =>
		targetIds.has(widget.id) ? { ...widget, layout: { ...widget.layout, groupId } } : widget,
	);
	const nextScene = bumpRevision({ ...scene, widgets: newWidgets }, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.group-widgets',
		path: `groups/${groupId}`,
		value: { groupId, widgetInstanceIds: parsed.data.widgetInstanceIds },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: parsed.data.widgetInstanceIds.map((id) => ({
			kind: 'scene.widget-layout-changed' as const,
			sceneId: scene.id,
			widgetInstanceId: id,
			actorId: actor.id,
			field: 'group' as const,
		})),
		operationIds: [op.id],
	};
}

export function handleMoveGroup(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(moveGroupInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

	const matched = scene.widgets.filter((w) => w.layout.groupId === parsed.data.groupId);
	if (matched.length === 0) {
		return reject(
			{ code: 'invalid-state', message: `Group ${parsed.data.groupId} contains no widgets.` },
			state,
		);
	}

	const newWidgets = scene.widgets.map((widget) =>
		widget.layout.groupId === parsed.data.groupId
			? {
					...widget,
					layout: {
						...widget.layout,
						x: widget.layout.x + parsed.data.deltaX,
						y: widget.layout.y + parsed.data.deltaY,
					},
				}
			: widget,
	);

	const nextScene = bumpRevision({ ...scene, widgets: newWidgets }, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.move-group',
		path: `groups/${parsed.data.groupId}/position`,
		value: { deltaX: parsed.data.deltaX, deltaY: parsed.data.deltaY },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: matched.map((widget) => ({
			kind: 'scene.widget-layout-changed' as const,
			sceneId: scene.id,
			widgetInstanceId: widget.id,
			actorId: actor.id,
			field: 'position' as const,
		})),
		operationIds: [op.id],
	};
}

export function handleDestroyWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(destroyWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

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

	const newSections = scene.sections.map((section) => ({
		...section,
		widgetInstanceIds: section.widgetInstanceIds.filter((id) => id !== widget.id),
	}));

	// RC-CAN-1.2: the destroy is REVERSIBLE. Keep the whole instance plus the section it sat in, so
	// `scene.restore-widget` can put back the same widget rather than mint a replacement. Expired
	// tombstones are pruned here — this mutation IS the "next mutation" the 30-day expiry waits for.
	const destroyedAt = env.clock();
	const tombstone: WidgetTombstone = {
		widget,
		sectionId: scene.sections.find((s) => s.widgetInstanceIds.includes(widget.id))?.id ?? null,
		index: scene.widgets.findIndex((w) => w.id === widget.id),
		destroyedAt,
		destroyedByActorId: actor.id,
	};
	const nextScene = bumpRevision(
		withTombstones(
			{
				...scene,
				widgets: scene.widgets.filter((w) => w.id !== widget.id),
				sections: newSections,
			},
			[
				...pruneExpiredTombstones(scene, destroyedAt).filter((t) => t.widget.id !== widget.id),
				tombstone,
			],
		),
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.destroy-widget',
		path: `widgets/${widget.id}`,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-destroyed',
				sceneId: scene.id,
				widgetInstanceId: widget.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleConfigureWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(configureWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

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
	const now = env.clock();
	const managerCheck = requireWidgetManager(state, actor, widget, now);
	if (managerCheck) return reject(managerCheck, state);

	const definition = findWidgetDefinition(state.widgets, widget.type);
	if (!definition) {
		return reject(
			{
				code: 'package-not-found',
				message: `Widget definition ${widget.type} is not available.`,
			},
			state,
		);
	}

	const nextConfiguration = parsed.data.configuration ?? widget.configuration;
	const configIssues = validateObjectAgainstSchema(
		definition.configurationSchema,
		nextConfiguration,
	);
	if (configIssues.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget configuration failed schema validation.',
				issues: configIssues.map((issue) => ({
					path: `configuration.${issue.path}`,
					message: issue.message,
				})),
			},
			state,
		);
	}

	const nextBinding = parsed.data.binding === undefined ? widget.binding : parsed.data.binding;
	const bindingCheck = requireBindingCapability(state, actor, nextBinding, now);
	if (bindingCheck) return reject(bindingCheck, state);

	const nextWidget: WidgetInstance = {
		...widget,
		configuration: nextConfiguration,
		binding: nextBinding,
	};
	const nextScene = bumpRevision(replaceWidget(scene, nextWidget), env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.configure-widget',
		path: `widgets/${widget.id}`,
		value: {
			configuration: nextConfiguration,
			binding: nextBinding,
		},
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-configured',
				sceneId: scene.id,
				widgetInstanceId: widget.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

// --- RC-CAN-1.2 — RESTORE A DESTROYED WIDGET (append-only block) --------------------------------

/**
 * The placeholder state a restored widget wakes up in when the package that declares its type went
 * away, or was disabled, while the widget sat in the bin. Restoring is an UNDO, so it must succeed —
 * but it must not pretend the widget works. This mirrors the placeholder `widget.package.remove` /
 * `widget.package.disable` leave on live instances.
 */
function restoredDisabledState(
	state: CoreStateSlice,
	widget: WidgetInstance,
	now: string,
): WidgetDisabledState | null {
	if (widget.disabled) return widget.disabled;
	const packageRecord = findPackageRecordForWidgetType(state.widgets, widget.type);
	if (!packageRecord || packageRecord.removedAt) {
		return {
			reason: 'package-removed',
			packageId: packageRecord?.package.id ?? null,
			diagnosticId: null,
			message: 'Package was removed while the widget was removed; the instance is a placeholder.',
			previousVersion: widget.version,
			disabledAt: now,
		};
	}
	if (!packageRecord.enabled || !findWidgetDefinition(state.widgets, widget.type)) {
		return {
			reason: 'package-disabled',
			packageId: packageRecord.package.id,
			diagnosticId: null,
			message: 'Package is turned off; the restored widget is a placeholder until it is enabled.',
			previousVersion: widget.version,
			disabledAt: now,
		};
	}
	return null;
}

/**
 * RC-CAN-1.2 — put a destroyed widget back on its scene from its tombstone, with the same instance
 * id, layout, configuration, binding and section. The durable inverse of `scene.destroy-widget`.
 *
 * Fails closed: no live tombstone (never destroyed, already restored, or past the 30-day retention
 * window) is `widget-not-restorable`, and the binding is re-checked against the RESTORING actor's
 * capabilities so a restore can never hand someone a binding they could not create today.
 */
export function handleRestoreWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(restoreWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);
	const sceneEditCheck = requireSceneCoEditor(state, actor, scene);
	if (sceneEditCheck) return reject(sceneEditCheck, state);

	const now = env.clock();
	const tombstone = sceneTombstones(scene).find(
		(candidate) =>
			candidate.widget.id === parsed.data.widgetInstanceId && isRestorableTombstone(candidate, now),
	);
	if (!tombstone) {
		return reject(
			{
				code: 'widget-not-restorable',
				message: `Widget ${parsed.data.widgetInstanceId} can no longer be restored on Scene ${scene.id}.`,
			},
			state,
		);
	}
	if (findWidget(scene, tombstone.widget.id)) {
		return reject(
			{
				code: 'invalid-state',
				message: `Widget ${tombstone.widget.id} is already on Scene ${scene.id}.`,
			},
			state,
		);
	}

	const bindingCheck = requireBindingCapability(state, actor, tombstone.widget.binding, now);
	if (bindingCheck) return reject(bindingCheck, state);

	const restored: WidgetInstance = {
		...tombstone.widget,
		disabled: restoredDisabledState(state, tombstone.widget, now),
	};

	// Put it back in its section when that section still exists; a section deleted meanwhile leaves the
	// widget loose on the canvas rather than failing the undo.
	const nextSections: SectionLayoutRegion[] = scene.sections.map((section) =>
		section.id === tombstone.sectionId && !section.widgetInstanceIds.includes(restored.id)
			? { ...section, widgetInstanceIds: [...section.widgetInstanceIds, restored.id] }
			: section,
	);

	// Back at the index it held, so undoing the destroy of a middle widget leaves the scene exactly as
	// it was rather than shuffling it to the end.
	const nextWidgets = [...scene.widgets];
	nextWidgets.splice(Math.min(Math.max(tombstone.index, 0), nextWidgets.length), 0, restored);

	const nextScene = bumpRevision(
		withTombstones(
			{ ...scene, widgets: nextWidgets, sections: nextSections },
			pruneExpiredTombstones(scene, now).filter((t) => t.widget.id !== restored.id),
		),
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.restore-widget',
		path: `widgets/${restored.id}`,
		value: restored,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.widget-restored',
				sceneId: scene.id,
				widgetInstanceId: restored.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
