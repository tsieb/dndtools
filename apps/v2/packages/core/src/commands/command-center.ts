import {
	applyCommandCenterPresetInputSchema,
	commandCenterAutoSaveInputSchema,
	ensureCommandCenterHomeInputSchema,
	saveCommandCenterPresetInputSchema,
} from '../schemas/commands';
import {
	buildDefaultCommandCenterScene,
	type CommandCenterAutoSave,
	type CommandCenterPreset,
	type CommandCenterPresetSection,
	type CommandCenterPresetWidget,
	type CommandCenterState,
} from '../state/command-center-state';
import type { SceneVisualSettings } from '../state/scene-state';
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
	const materialized = materializeLayoutOntoScene(state, env, scene, preset);
	const { nextScene, restoredWidgets, missingWidgetTypes } = materialized;
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

/**
 * Materialize a snapshot layout (a preset or a last-known-good auto-save) onto the home Scene. Widget
 * ids and group ids are remapped to fresh instances; any widget whose package is no longer installed is
 * skipped and reported, restoring all the others (CMD-007 / UX-CMD-008 AC4). Shared by preset-apply and
 * auto-save-restore so both paths behave identically.
 */
function materializeLayoutOntoScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	scene: Scene,
	source: {
		visualSettings: SceneVisualSettings;
		sections: CommandCenterPresetSection[];
		widgets: CommandCenterPresetWidget[];
	},
): { nextScene: Scene; restoredWidgets: WidgetInstance[]; missingWidgetTypes: string[] } {
	const missingWidgetTypes: string[] = [];
	const groupRemap = new Map<string, string>();
	const presetToInstance = new Map<string, string>();
	const restoredWidgets: WidgetInstance[] = [];
	for (const presetWidget of source.widgets) {
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

	const restoredSections: SectionLayoutRegion[] = source.sections.map((section) => ({
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
			visualSettings: { ...source.visualSettings },
			sections: restoredSections,
			widgets: restoredWidgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		env,
	);
	return { nextScene, restoredWidgets, missingWidgetTypes };
}

/**
 * UX-CMD-008 — capture the current Command Center layout into the rolling last-known-good auto-save
 * slot. Called at deliberate good checkpoints (home ready, preset save/apply) so a crash or unwanted
 * experimental change can be rolled back. DM-only; idempotent overwrite of the single slot.
 */
export function handleSnapshotCommandCenterAutoSave(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(commandCenterAutoSaveInputSchema, rawPayload ?? {});
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = homeSceneExists(state);
	if (!scene) {
		return reject(
			{
				code: 'command-center-not-configured',
				message: 'No Command Center home Scene exists to capture as a safe point.',
			},
			state,
		);
	}

	const now = env.clock();
	const { widgets, byInstanceId } = snapshotPresetWidgets(env, scene);
	const sections: CommandCenterPresetSection[] = scene.sections.map((section) => ({
		name: section.name,
		bounds: { ...section.bounds },
		presetWidgetIds: section.widgetInstanceIds
			.map((id) => byInstanceId.get(id))
			.filter((value): value is string => Boolean(value)),
	}));

	const autoSave: CommandCenterAutoSave = {
		capturedAt: now,
		visualSettings: { ...scene.visualSettings },
		sections,
		widgets,
	};

	const nextCommandCenter: CommandCenterState = { ...state.commandCenter, autoSave };

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'command-center',
		entityId: scene.id,
		opType: 'command-center.snapshot-auto-save',
		value: { sceneId: scene.id, capturedAt: now, widgetCount: widgets.length },
	});

	return {
		status: 'accepted',
		nextState: { ...state, commandCenter: nextCommandCenter, sync: nextLog },
		events: [
			{
				kind: 'command-center.auto-save-captured',
				sceneId: scene.id,
				actorId: actor.id,
				capturedAt: now,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * UX-CMD-008 — restore the last-known-good layout from the auto-save slot onto the home Scene. Fails
 * closed when no auto-save exists. DM-only. Restores all valid widgets and reports any whose package is
 * no longer installed (CMD-007 AC4 semantics shared with preset-apply).
 */
export function handleRestoreCommandCenterAutoSave(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(commandCenterAutoSaveInputSchema, rawPayload ?? {});
	if (!parsed.ok) return reject(parsed.rejection, state);

	const scene = homeSceneExists(state);
	if (!scene) {
		return reject(
			{
				code: 'command-center-not-configured',
				message: 'No Command Center home Scene exists to restore a safe point onto.',
			},
			state,
		);
	}

	const autoSave = state.commandCenter.autoSave ?? null;
	if (!autoSave) {
		return reject(
			{
				code: 'auto-save-not-available',
				message: 'No Command Center safe point has been captured yet.',
			},
			state,
		);
	}

	const { nextScene, restoredWidgets, missingWidgetTypes } = materializeLayoutOntoScene(
		state,
		env,
		scene,
		autoSave,
	);
	const nextSceneState = withScene(state.scenes, scene.id, () => nextScene);

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'scene',
		entityId: scene.id,
		opType: 'command-center.restore-auto-save',
		value: {
			capturedAt: autoSave.capturedAt,
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
				kind: 'command-center.auto-save-restored',
				sceneId: scene.id,
				actorId: actor.id,
				capturedAt: autoSave.capturedAt,
				restoredWidgetCount: restoredWidgets.length,
				missingWidgetTypes,
			},
		],
		operationIds: [op.id],
	};
}
