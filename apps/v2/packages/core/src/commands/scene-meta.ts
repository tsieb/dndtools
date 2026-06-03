import {
	createSceneInputSchema,
	instantiateSceneTemplateInputSchema,
	saveSceneTemplateInputSchema,
	setSceneSectionsInputSchema,
	updateSceneMetadataInputSchema,
} from '../schemas/commands';
import {
	SCENE_SCHEMA_VERSION,
	type Scene,
	type SceneState,
	type WidgetInstance,
} from '../state/scene-state';
import {
	appendOperationDraft,
	bumpRevision,
	parseInput,
	reject,
	requireActor,
	requireDm,
	requireScene,
	withScene,
} from './helpers';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';

export function handleCreateScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(createSceneInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const now = env.clock();
	const id = env.ids();
	const scene: Scene = {
		id,
		name: parsed.data.name,
		description: parsed.data.description,
		tags: parsed.data.tags,
		visibility: parsed.data.visibility,
		visualSettings: parsed.data.visualSettings,
		ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
		sharingTargets: parsed.data.sharingTargets,
		playerViewAssignments: parsed.data.playerViewAssignments,
		templateMeta: { isTemplate: parsed.data.asTemplate, instantiatedFromTemplateSceneId: null },
		sections: [],
		widgets: [],
		schemaVersion: SCENE_SCHEMA_VERSION,
	};

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [id]: scene },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: id,
		opType: 'scene.create',
		value: scene,
		afterRevision: scene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [{ kind: 'scene.created', sceneId: id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleUpdateSceneMetadata(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updateSceneMetadataInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	const changedPaths: string[] = [];
	const nextScene = bumpRevision(
		{
			...scene,
			name: parsed.data.name ?? scene.name,
			description: parsed.data.description ?? scene.description,
			tags: parsed.data.tags ?? scene.tags,
			visibility: parsed.data.visibility ?? scene.visibility,
			visualSettings: parsed.data.visualSettings
				? { ...scene.visualSettings, ...parsed.data.visualSettings }
				: scene.visualSettings,
			sharingTargets: parsed.data.sharingTargets ?? scene.sharingTargets,
			playerViewAssignments:
				parsed.data.playerViewAssignments ?? scene.playerViewAssignments,
		},
		env,
	);

	for (const [key, value] of Object.entries(parsed.data)) {
		if (key === 'sceneId') continue;
		if (value === undefined) continue;
		changedPaths.push(key);
	}
	if (changedPaths.length === 0) {
		return reject(
			{ code: 'invalid-payload', message: 'No metadata fields were supplied.' },
			state,
		);
	}

	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.update-metadata',
		path: changedPaths.join(','),
		value: parsed.data,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.metadata-changed',
				sceneId: scene.id,
				actorId: actor.id,
				paths: changedPaths,
			},
		],
		operationIds: [op.id],
	};
}

export function handleSetSceneSections(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setSceneSectionsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	const widgetIds = new Set(scene.widgets.map((w) => w.id));
	for (const section of parsed.data.sections) {
		for (const memberId of section.widgetInstanceIds) {
			if (!widgetIds.has(memberId)) {
				return reject(
					{
						code: 'invalid-state',
						message: `Section ${section.id} references unknown widget ${memberId}.`,
					},
					state,
				);
			}
		}
	}

	const nextScene = bumpRevision({ ...scene, sections: parsed.data.sections }, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.set-sections',
		value: parsed.data.sections,
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [{ kind: 'scene.sections-changed', sceneId: scene.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleSaveSceneTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(saveSceneTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const source = requireScene(state, parsed.data.sourceSceneId);
	if ('code' in source) return reject(source, state);

	const now = env.clock();
	const newId = env.ids();
	const widgetMap = new Map<string, WidgetInstance>();
	const clonedWidgets: WidgetInstance[] = source.widgets.map((widget) => {
		const cloned: WidgetInstance = {
			...widget,
			id: env.ids(),
			layout: { ...widget.layout, groupId: null },
			configuration: { ...widget.configuration },
		};
		widgetMap.set(widget.id, cloned);
		return cloned;
	});

	const clonedSections = source.sections.map((section) => ({
		...section,
		id: env.ids(),
		widgetInstanceIds: section.widgetInstanceIds
			.map((id) => widgetMap.get(id)?.id)
			.filter((value): value is string => Boolean(value)),
	}));

	const template: Scene = {
		id: newId,
		name: parsed.data.templateName,
		description: source.description,
		tags: source.tags.slice(),
		visibility: 'dm-only',
		visualSettings: { ...source.visualSettings },
		ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
		sharingTargets: [],
		playerViewAssignments: [],
		templateMeta: { isTemplate: true, instantiatedFromTemplateSceneId: null },
		sections: clonedSections,
		widgets: clonedWidgets,
		schemaVersion: SCENE_SCHEMA_VERSION,
	};

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [newId]: template },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: newId,
		opType: 'scene.save-template',
		value: { sourceSceneId: source.id, templateName: parsed.data.templateName },
		afterRevision: template.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.template-saved',
				templateSceneId: newId,
				sourceSceneId: source.id,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleInstantiateSceneTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(instantiateSceneTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const template = requireScene(state, parsed.data.templateSceneId);
	if ('code' in template) return reject(template, state);
	if (!template.templateMeta.isTemplate) {
		return reject(
			{
				code: 'template-source-not-template',
				message: `Scene ${template.id} is not marked as a template.`,
			},
			state,
		);
	}

	const now = env.clock();
	const newId = env.ids();
	const widgetMap = new Map<string, WidgetInstance>();
	const newWidgets: WidgetInstance[] = template.widgets.map((widget) => {
		const cloned: WidgetInstance = {
			...widget,
			id: env.ids(),
			layout: { ...widget.layout, groupId: null },
			configuration: { ...widget.configuration },
			binding: widget.binding ? { ...widget.binding } : null,
		};
		widgetMap.set(widget.id, cloned);
		return cloned;
	});
	const newSections = template.sections.map((section) => ({
		...section,
		id: env.ids(),
		widgetInstanceIds: section.widgetInstanceIds
			.map((id) => widgetMap.get(id)?.id)
			.filter((value): value is string => Boolean(value)),
	}));

	const scene: Scene = {
		id: newId,
		name: parsed.data.newSceneName,
		description: template.description,
		tags: template.tags.slice(),
		visibility: 'dm-only',
		visualSettings: { ...template.visualSettings },
		ownership: { ownerActorId: actor.id, createdAt: now, updatedAt: now, revision: 1 },
		sharingTargets: [],
		playerViewAssignments: [],
		templateMeta: { isTemplate: false, instantiatedFromTemplateSceneId: template.id },
		sections: newSections,
		widgets: newWidgets,
		schemaVersion: SCENE_SCHEMA_VERSION,
	};

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [newId]: scene },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: newId,
		opType: 'scene.instantiate-template',
		value: { templateSceneId: template.id, newSceneName: parsed.data.newSceneName },
		afterRevision: scene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.template-instantiated',
				templateSceneId: template.id,
				newSceneId: newId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
