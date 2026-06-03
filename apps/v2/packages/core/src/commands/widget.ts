import {
	addWidgetInputSchema,
	destroyWidgetInputSchema,
	dockWidgetInputSchema,
	groupWidgetsInputSchema,
	layerWidgetInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	resizeWidgetInputSchema,
} from '../schemas/commands';
import type { WidgetInstance, WidgetLayout, Scene, SectionLayoutRegion } from '../state/scene-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	bumpRevision,
	findWidget,
	parseInput,
	reject,
	replaceWidget,
	requireActor,
	requireDm,
	requireScene,
	withScene,
} from './helpers';

function widgetLayoutFromAdd(input: { x: number; y: number; w: number; h: number }, z: number): WidgetLayout {
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

export function handleAddWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(addWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	const widget: WidgetInstance = {
		id: env.ids(),
		type: parsed.data.widget.type,
		version: parsed.data.widget.version,
		layout: widgetLayoutFromAdd(parsed.data.widget.layout, nextZ(scene)),
		configuration: parsed.data.widget.configuration,
		binding: parsed.data.widget.binding,
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

type LayoutFieldKind = 'position' | 'size' | 'z' | 'dock' | 'pin' | 'group';

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
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const scene = requireScene(state, sceneId);
	if ('code' in scene) return reject(scene, state);
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

export function handleGroupWidgets(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(groupWidgetsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

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
		targetIds.has(widget.id)
			? { ...widget, layout: { ...widget.layout, groupId } }
			: widget,
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
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(moveGroupInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

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
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(destroyWidgetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

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

	const nextScene = bumpRevision(
		{
			...scene,
			widgets: scene.widgets.filter((w) => w.id !== widget.id),
			sections: newSections,
		},
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
