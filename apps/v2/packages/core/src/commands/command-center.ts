import {
	applyCommandCenterPresetInputSchema,
	ensureCommandCenterHomeInputSchema,
	saveCommandCenterPresetInputSchema,
} from '../schemas/commands';
import {
	buildDefaultCommandCenterScene,
	type CommandCenterPreset,
	type CommandCenterPresetWidget,
	type CommandCenterState,
} from '../state/command-center-state';
import {
	SCENE_SCHEMA_VERSION,
	type Scene,
	type SceneState,
	type SectionLayoutRegion,
	type WidgetInstance,
} from '../state/scene-state';
import { findPackageRecordForWidgetType } from '../state/widget-package-state';
import {
	appendOperationDraft,
	bumpRevision,
	parseInput,
	reject,
	requireActor,
	requireDm,
	withScene,
} from './helpers';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';

function homeSceneExists(state: CoreStateSlice): Scene | null {
	const id = state.commandCenter.homeSceneId;
	if (!id) return null;
	return state.scenes.scenes[id] ?? null;
}

export function handleEnsureCommandCenterHome(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(ensureCommandCenterHomeInputSchema, rawPayload ?? {});
	if (!parsed.ok) return reject(parsed.rejection, state);

	// Idempotent: when a Command Center home Scene already exists, leave durable
	// state untouched and simply report it as ready (CMD-001).
	const existing = homeSceneExists(state);
	if (existing) {
		return {
			status: 'accepted',
			nextState: state,
			events: [{ kind: 'command-center.home-ready', sceneId: existing.id, actorId: actor.id }],
			operationIds: [],
		};
	}

	const scene = buildDefaultCommandCenterScene(env, actor.id);
	const namedScene = parsed.data.name ? { ...scene, name: parsed.data.name } : scene;

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [namedScene.id]: namedScene },
	};
	const nextCommandCenter: CommandCenterState = {
		...state.commandCenter,
		homeSceneId: namedScene.id,
	};

	const afterSceneOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: namedScene.id,
		opType: 'scene.create',
		value: namedScene,
		afterRevision: namedScene.ownership.revision,
	});
	const afterHomeOp = appendOperationDraft(env, afterSceneOp.log, actor.id, {
		entityType: 'command-center',
		entityId: namedScene.id,
		opType: 'command-center.set-home',
		value: { homeSceneId: namedScene.id },
		dependencies: [afterSceneOp.op.id],
	});

	return {
		status: 'accepted',
		nextState: {
			...state,
			scenes: nextSceneState,
			commandCenter: nextCommandCenter,
			sync: afterHomeOp.log,
		},
		events: [
			{ kind: 'command-center.home-created', sceneId: namedScene.id, actorId: actor.id },
			{ kind: 'command-center.home-ready', sceneId: namedScene.id, actorId: actor.id },
		],
		operationIds: [afterSceneOp.op.id, afterHomeOp.op.id],
	};
}

function snapshotPresetWidgets(
	env: CoreEnvironment,
	scene: Scene,
): { widgets: CommandCenterPresetWidget[]; byInstanceId: Map<string, string> } {
	const byInstanceId = new Map<string, string>();
	const widgets = scene.widgets.map((widget) => {
		const presetWidgetId = env.ids();
		byInstanceId.set(widget.id, presetWidgetId);
		return {
			presetWidgetId,
			type: widget.type,
			version: widget.version,
			layout: { ...widget.layout },
			configuration: { ...widget.configuration },
			localState: { ...widget.localState },
			binding: widget.binding ? { ...widget.binding } : null,
		} satisfies CommandCenterPresetWidget;
	});
	return { widgets, byInstanceId };
}

export function handleSaveCommandCenterPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(saveCommandCenterPresetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = homeSceneExists(state);
	if (!scene) {
		return reject(
			{
				code: 'command-center-not-configured',
				message: 'No Command Center home Scene exists to save as a preset.',
			},
			state,
		);
	}

	const now = env.clock();
	const presetId = env.ids();
	const { widgets, byInstanceId } = snapshotPresetWidgets(env, scene);
	const sections = scene.sections.map((section) => ({
		name: section.name,
		bounds: { ...section.bounds },
		presetWidgetIds: section.widgetInstanceIds
			.map((id) => byInstanceId.get(id))
			.filter((value): value is string => Boolean(value)),
	}));

	const preset: CommandCenterPreset = {
		id: presetId,
		name: parsed.data.name,
		createdAt: now,
		updatedAt: now,
		revision: 1,
		visualSettings: { ...scene.visualSettings },
		sections,
		widgets,
	};

	const nextCommandCenter: CommandCenterState = {
		...state.commandCenter,
		presets: { ...state.commandCenter.presets, [presetId]: preset },
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'command-center',
		entityId: presetId,
		opType: 'command-center.save-preset',
		value: { presetId, name: parsed.data.name, sourceSceneId: scene.id },
	});

	return {
		status: 'accepted',
		nextState: { ...state, commandCenter: nextCommandCenter, sync: nextLog },
		events: [
			{ kind: 'command-center.preset-saved', presetId, sceneId: scene.id, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleApplyCommandCenterPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(applyCommandCenterPresetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = homeSceneExists(state);
	if (!scene) {
		return reject(
			{
				code: 'command-center-not-configured',
				message: 'No Command Center home Scene exists to restore a preset onto.',
			},
			state,
		);
	}

	const preset = state.commandCenter.presets[parsed.data.presetId];
	if (!preset) {
		return reject(
			{ code: 'preset-not-found', message: `Preset ${parsed.data.presetId} does not exist.` },
			state,
		);
	}

	// Restore valid widgets and report any whose widget type is no longer installed
	// (e.g. a removed package), restoring all the others (CMD-007).
	const missingWidgetTypes: string[] = [];
	const groupRemap = new Map<string, string>();
	const presetToInstance = new Map<string, string>();
	const restoredWidgets: WidgetInstance[] = [];
	for (const presetWidget of preset.widgets) {
		const record = findPackageRecordForWidgetType(state.widgets, presetWidget.type);
		if (!record || record.removedAt) {
			if (!missingWidgetTypes.includes(presetWidget.type)) {
				missingWidgetTypes.push(presetWidget.type);
			}
			continue;
		}
		const newId = env.ids();
		presetToInstance.set(presetWidget.presetWidgetId, newId);
		let groupId = presetWidget.layout.groupId;
		if (groupId !== null) {
			const remapped = groupRemap.get(groupId) ?? env.ids();
			groupRemap.set(groupId, remapped);
			groupId = remapped;
		}
		restoredWidgets.push({
			id: newId,
			type: presetWidget.type,
			version: presetWidget.version,
			layout: { ...presetWidget.layout, groupId },
			configuration: { ...presetWidget.configuration },
			localState: { ...presetWidget.localState },
			binding: presetWidget.binding ? { ...presetWidget.binding } : null,
			disabled: null,
		});
	}

	const restoredSections: SectionLayoutRegion[] = preset.sections.map((section) => ({
		id: env.ids(),
		name: section.name,
		bounds: { ...section.bounds },
		widgetInstanceIds: section.presetWidgetIds
			.map((presetWidgetId) => presetToInstance.get(presetWidgetId))
			.filter((value): value is string => Boolean(value)),
	}));

	const nextScene = bumpRevision(
		{
			...scene,
			visualSettings: { ...preset.visualSettings },
			sections: restoredSections,
			widgets: restoredWidgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		env,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'command-center.apply-preset',
		value: {
			presetId: preset.id,
			restoredWidgetCount: restoredWidgets.length,
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
				kind: 'command-center.preset-restored',
				presetId: preset.id,
				sceneId: scene.id,
				actorId: actor.id,
				restoredWidgetCount: restoredWidgets.length,
				missingWidgetTypes,
			},
		],
		operationIds: [op.id],
	};
}
