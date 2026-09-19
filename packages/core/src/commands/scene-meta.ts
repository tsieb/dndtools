import {
	applySceneTemplateInputSchema,
	createSceneInputSchema,
	deleteSceneInputSchema,
	instantiateSceneTemplateInputSchema,
	restoreSceneInputSchema,
	saveSceneTemplateInputSchema,
	setSceneSectionsInputSchema,
	updateSceneMetadataInputSchema,
} from '../schemas/commands';
import {
	SCENE_SCHEMA_VERSION,
	isLiveScene,
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
import {
	builtinSceneTemplateLayout,
	findBuiltinSceneTemplate,
} from '../state/command-center-state';
import { instantiateLayoutSnapshot, type LayoutSnapshot } from './command-center';

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
			playerViewAssignments: parsed.data.playerViewAssignments ?? scene.playerViewAssignments,
		},
		env,
	);

	for (const [key, value] of Object.entries(parsed.data)) {
		if (key === 'sceneId') continue;
		if (value === undefined) continue;
		changedPaths.push(key);
	}
	if (changedPaths.length === 0) {
		return reject({ code: 'invalid-payload', message: 'No metadata fields were supplied.' }, state);
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

/**
 * SOFT-DELETE a scene (DM-only) — a TOMBSTONE, mirroring `content.remove-item`: the scene is stamped
 * `deletedAt` + revision-bumped, leaves every actor-filtered read, and stays RECOVERABLE via
 * `scene.restore`. Fail-closed guards: the session's ACTIVE scene and the Command Center HOME scene
 * can never be deleted (they are load-bearing live surfaces), and a deleted scene cannot be re-deleted.
 */
export function handleDeleteScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deleteSceneInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	// Read raw (not requireScene) so an already-tombstoned scene gets the DISTINCT rejection.
	const scene = state.scenes.scenes[parsed.data.sceneId];
	if (!scene) {
		return reject(
			{ code: 'scene-not-found', message: `Scene ${parsed.data.sceneId} does not exist.` },
			state,
		);
	}
	if (!isLiveScene(scene)) {
		return reject(
			{ code: 'scene-deleted', message: `Scene ${parsed.data.sceneId} is already deleted.` },
			state,
		);
	}
	if (state.session.activeSceneId === scene.id) {
		return reject({ code: 'invalid-state', message: 'The active scene cannot be deleted.' }, state);
	}
	if (state.commandCenter.homeSceneId === scene.id) {
		return reject(
			{ code: 'invalid-state', message: 'The Command Center home scene cannot be deleted.' },
			state,
		);
	}

	const now = env.clock();
	const nextScene = bumpRevision({ ...scene, deletedAt: now }, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.delete',
		path: `scenes/${scene.id}`,
		value: { sceneId: scene.id, softDelete: true },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [{ kind: 'scene.deleted', sceneId: scene.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

/**
 * RESTORE a soft-deleted scene (DM-only) — the undo counterpart of `scene.delete`, mirroring
 * `content.restore-item`: clears the tombstone + bumps the revision. Fail closed: a live scene
 * cannot be restored.
 */
export function handleRestoreScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(restoreSceneInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = state.scenes.scenes[parsed.data.sceneId];
	if (!scene) {
		return reject(
			{ code: 'scene-not-found', message: `Scene ${parsed.data.sceneId} does not exist.` },
			state,
		);
	}
	if (isLiveScene(scene)) {
		return reject(
			{ code: 'scene-not-deleted', message: `Scene ${parsed.data.sceneId} is not deleted.` },
			state,
		);
	}

	const nextScene = bumpRevision({ ...scene, deletedAt: null }, env);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.restore',
		path: `scenes/${scene.id}`,
		value: { sceneId: scene.id },
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [{ kind: 'scene.restored', sceneId: scene.id, actorId: actor.id }],
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
			localState: { ...widget.localState },
			// A template captures widget structure, not transient disabled placeholders;
			// instances start live and re-derive disabled state from current package status.
			disabled: null,
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
			localState: { ...widget.localState },
			binding: widget.binding ? { ...widget.binding } : null,
			// Instantiated widgets start live; disabled state is re-derived from the
			// current package status rather than copied from the template snapshot.
			disabled: null,
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

/** The gap between what a scene already holds and a template appended below it (the board gutter). */
const APPEND_GUTTER = 24;

/** A template scene read as the same preset-shaped snapshot a saved preset is. */
function sceneAsLayoutSnapshot(scene: Scene): LayoutSnapshot {
	return {
		visualSettings: { ...scene.visualSettings },
		sections: scene.sections.map((section) => ({
			name: section.name,
			bounds: { ...section.bounds },
			presetWidgetIds: section.widgetInstanceIds.slice(),
		})),
		widgets: scene.widgets.map((widget) => ({
			presetWidgetId: widget.id,
			type: widget.type,
			version: widget.version,
			layout: { ...widget.layout },
			configuration: { ...widget.configuration },
			localState: { ...widget.localState },
			binding: widget.binding ? { ...widget.binding } : null,
		})),
	};
}

/**
 * RC-CAN-4.4 — `scene.apply-template`: instantiate a template's widgets into ANY live scene, not only
 * the Command Center home (`command-center.apply-preset`) and not as a new scene
 * (`scene.instantiate-template`). The source is a built-in template, a saved preset or a template
 * scene; all three reduce to one preset-shaped snapshot and go through the preset materializer.
 *
 * It APPENDS. On an empty scene the template lands exactly as authored and its background is adopted;
 * on a scene that already has tiles the template goes below them (stacking and traversal order lifted
 * above the existing tiles) and the scene keeps its own background, so applying a template never
 * destroys the DM's work. Widgets whose package is gone are skipped and reported (CMD-007); a template
 * that would place nothing is refused rather than recorded as an empty change. DM-only, like every
 * other template and preset command.
 */
export function handleApplySceneTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(applySceneTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = requireScene(state, parsed.data.sceneId);
	if ('code' in scene) return reject(scene, state);

	const { source } = parsed.data;
	let snapshot: LayoutSnapshot;
	let sourceId: string;
	if (source.kind === 'builtin') {
		// The schema's enum already refused an unknown id; this keeps the lookup total for the types.
		const template = findBuiltinSceneTemplate(source.templateId);
		if (!template) {
			return reject(
				{ code: 'template-not-found', message: `Template ${source.templateId} does not exist.` },
				state,
			);
		}
		snapshot = builtinSceneTemplateLayout(template);
		sourceId = template.id;
	} else if (source.kind === 'preset') {
		const preset = state.commandCenter.presets[source.presetId];
		if (!preset) {
			return reject(
				{ code: 'preset-not-found', message: `Preset ${source.presetId} does not exist.` },
				state,
			);
		}
		snapshot = preset;
		sourceId = preset.id;
	} else {
		const template = requireScene(state, source.templateSceneId);
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
		snapshot = sceneAsLayoutSnapshot(template);
		sourceId = template.id;
	}

	const empty = scene.widgets.length === 0;
	const placement = empty
		? {}
		: {
				offset: {
					x: 0,
					y:
						Math.max(...scene.widgets.map((w) => w.layout.y + w.layout.h)) +
						APPEND_GUTTER -
						Math.min(...snapshot.widgets.map((w) => w.layout.y), Number.POSITIVE_INFINITY),
				},
				zBase: Math.max(0, ...scene.widgets.map((w) => w.layout.z)),
				focusBase: Math.max(0, ...scene.widgets.map((w) => w.layout.focusOrder ?? 0)),
			};
	const { widgets, sections, missingWidgetTypes } = instantiateLayoutSnapshot(
		state,
		env,
		snapshot,
		placement,
	);
	if (widgets.length === 0) {
		return reject(
			{
				code: 'template-empty',
				message:
					missingWidgetTypes.length > 0
						? `None of this template's widgets are installed (${missingWidgetTypes.join(', ')}).`
						: 'This template has no widgets to place.',
			},
			state,
		);
	}

	const nextScene = bumpRevision(
		{
			...scene,
			visualSettings: empty ? { ...snapshot.visualSettings } : scene.visualSettings,
			sections: [...scene.sections, ...sections],
			widgets: [...scene.widgets, ...widgets],
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'scene.apply-template',
		value: {
			source: source.kind,
			sourceId,
			appliedWidgetCount: widgets.length,
			missingWidgetTypes,
		},
		beforeRevision: scene.ownership.revision,
		afterRevision: nextScene.ownership.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, scenes: nextSceneState, sync: nextLog },
		events: [
			{
				kind: 'scene.template-applied',
				sceneId: scene.id,
				source: source.kind,
				sourceId,
				actorId: actor.id,
				appliedWidgetCount: widgets.length,
				missingWidgetTypes,
			},
		],
		operationIds: [op.id],
	};
}
