import {
	applyCommandCenterPresetInputSchema,
	commandCenterAutoSaveInputSchema,
	ensureCommandCenterHomeInputSchema,
	saveCommandCenterPresetInputSchema,
} from '../schemas/commands';
import {
	buildDefaultCommandCenterScene,
	DEFAULT_COMMAND_CENTER_NAME,
	type CommandCenterAutoSave,
	type CommandCenterPreset,
	type CommandCenterPresetSection,
	type CommandCenterPresetWidget,
	type CommandCenterState,
} from '../state/command-center-state';
import type { SceneVisualSettings } from '../state/scene-state';
import {
	SCENE_SCHEMA_VERSION,
	isLiveScene,
	screenMetaOf,
	withScreenMeta,
	type Scene,
	type SceneState,
	type SectionLayoutRegion,
	type WidgetInstance,
} from '../state/scene-state';
import {
	HOME_WIDGET_TYPES,
	SESSION_SCREEN_PARTS,
	findPackageRecordForWidgetType,
	type HomeWidgetType,
} from '../state/widget-package-state';
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

/**
 * RC-ENG-8.2 — the map the default board's Map tile opens on. The template used to lay the tile out
 * unbound even in a vault full of maps, and the tile read that as "the linked map is missing or was
 * removed": an error on the first screen a DM sees. Prefer the session's active map; otherwise the
 * first top-level map by name (a map embedded in another is a detail of it, not a place to start).
 * An empty vault keeps the tile unbound, which it renders as its "No map linked" empty state.
 */
export function defaultCommandCenterMapId(state: CoreStateSlice): string | null {
	const maps = state.maps.maps;
	const active = state.session.activeMap?.mapId;
	if (active && maps[active]) return active;
	const embedded = new Set(
		Object.values(maps).flatMap((map) => map.embeds.map((embed) => embed.childMapId)),
	);
	const byName = Object.values(maps).sort((a, b) => a.name.localeCompare(b.name));
	return (byName.find((map) => !embedded.has(map.id)) ?? byName[0])?.id ?? null;
}

function withDefaultMapBinding(scene: Scene, mapId: string | null): Scene {
	if (!mapId) return scene;
	return {
		...scene,
		widgets: scene.widgets.map((widget) =>
			widget.type === 'map' && !widget.binding
				? {
						...widget,
						binding: {
							source: { entityType: 'map', entityId: mapId },
							mode: 'read',
							requiredCapability: 'viewer',
						},
					}
				: widget,
		),
	};
}

// --- RC-CAN-7.6 — the Command Center as the default screen (ADR-041) ------------------------------

/**
 * The default-screen key the home screen is provisioned under (`ScreenOrigin.defaultKey`). It is how
 * `/` finds its screen: the home pointer (`commandCenter.homeSceneId`) keeps naming the board, which
 * ADR-041 keeps as the GM screen with its id, widgets and layout untouched, so `/board`, presets and
 * safe points go on meaning what they always have.
 */
export const HOME_SCREEN_DEFAULT_KEY = 'command-center';

/** The flow grid's authoring units (`FLOW_COLUMN_STEP` / `FLOW_ROW_STEP` in the app's board helpers). */
const FLOW_COLUMN = 96;
const FLOW_ROW = 240;

/**
 * Where each part sits on the twelve authoring columns, as the Command Center laid itself out: the
 * hero across the top, the scenes beside a column of Create over Manage (spans 7 + 5, the old
 * `1.5fr 1fr` body), then the library across the bottom. Create and Manage share a group, which a
 * flow screen stacks in one lane.
 */
const HOME_LAYOUT: Record<HomeWidgetType, { column: number; row: number; span: number }> = {
	'home-hero': { column: 0, row: 0, span: 12 },
	'home-scenes': { column: 0, row: 1, span: 7 },
	'home-create': { column: 7, row: 1, span: 5 },
	'home-manage': { column: 7, row: 2, span: 5 },
	'home-library': { column: 0, row: 3, span: 12 },
};
const STACKED: ReadonlySet<HomeWidgetType> = new Set(['home-create', 'home-manage']);

/**
 * Build the default home screen: a GM-only FLOW screen of the Command Center's five system template
 * parts, recorded as the `command-center` default screen. Instances carry no configuration of their
 * own; every setting (bare presentation, headings, labels) is the definition's default, so a part the
 * GM rebuilds from the same definition is configured identically.
 */
export function buildDefaultHomeScreen(env: CoreEnvironment, ownerActorId: string): Scene {
	const now = env.clock();
	const id = env.ids();
	const column = env.ids();
	const widgets: WidgetInstance[] = HOME_WIDGET_TYPES.map((type, index) => {
		const place = HOME_LAYOUT[type];
		return {
			id: env.ids(),
			type,
			version: '1.0.0',
			layout: {
				x: place.column * FLOW_COLUMN,
				y: place.row * FLOW_ROW,
				w: place.span * FLOW_COLUMN,
				h: FLOW_ROW,
				z: index + 1,
				groupId: STACKED.has(type) ? column : null,
				dock: null,
				pinned: false,
				focusOrder: index + 1,
			},
			configuration: {},
			localState: {},
			binding: null,
			disabled: null,
		};
	});
	return withScreenMeta(
		{
			id,
			name: DEFAULT_COMMAND_CENTER_NAME,
			description: 'Your campaign hub: resume the live scene or jump anywhere.',
			tags: [],
			visibility: 'dm-only',
			visualSettings: { background: 'parchment' },
			ownership: { ownerActorId, createdAt: now, updatedAt: now, revision: 1 },
			sharingTargets: [],
			playerViewAssignments: [],
			templateMeta: { isTemplate: false, instantiatedFromTemplateSceneId: null },
			sections: [],
			widgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		{
			pinned: false,
			pinOrder: null,
			layoutPolicy: 'flow',
			origin: {
				kind: 'default',
				sourceSceneId: null,
				defaultKey: HOME_SCREEN_DEFAULT_KEY,
				at: now,
			},
		},
	);
}

/**
 * The vault's home screen: the oldest live scene provisioned as the `command-center` default screen,
 * or `null` before `command-center.ensure-home` has run. Provenance only — a GM's edits to it are
 * never overwritten, and a deleted one is not resurrected by a read.
 */
export function findHomeScreen(scenes: SceneState): Scene | null {
	return findDefaultScreen(scenes, HOME_SCREEN_DEFAULT_KEY);
}

/** The oldest live scene provisioned as the default screen under `defaultKey`. */
function findDefaultScreen(scenes: SceneState, defaultKey: string): Scene | null {
	let found: Scene | null = null;
	for (const scene of Object.values(scenes.scenes)) {
		if (!isLiveScene(scene)) continue;
		const origin = screenMetaOf(scene).origin;
		if (origin?.kind !== 'default' || origin.defaultKey !== defaultKey) continue;
		const older =
			!found ||
			scene.ownership.createdAt < found.ownership.createdAt ||
			(scene.ownership.createdAt === found.ownership.createdAt && scene.id < found.id);
		if (older) found = scene;
	}
	return found;
}

// --- RC-CAN-7.8 — Session as a screen (ADR-041) ---------------------------------------------------

/** The default-screen key the Session screen is provisioned under; `/session` finds it by this. */
export const SESSION_SCREEN_DEFAULT_KEY = 'session';

/**
 * Build the default Session screen: a GM-only FLOW screen of the console's widgets
 * (`SESSION_SCREEN_PARTS`), recorded as the `session` default screen. The session status runs across
 * the top; the combat tracker sits beside one stacked column of the other panels (spans 7 + 5, the old
 * `1.6fr 1fr` grid), so reading and focus order are the console's: status, combat, then the column.
 */
export function buildDefaultSessionScreen(env: CoreEnvironment, ownerActorId: string): Scene {
	const now = env.clock();
	const id = env.ids();
	const column = env.ids();
	let sideRow = 1;
	const widgets: WidgetInstance[] = SESSION_SCREEN_PARTS.map((part, index) => {
		const place =
			part.lane === 'full'
				? { column: 0, row: 0, span: 12 }
				: part.lane === 'main'
					? { column: 0, row: 1, span: 7 }
					: { column: 7, row: sideRow++, span: 5 };
		return {
			id: env.ids(),
			type: part.type,
			version: '1.0.0',
			layout: {
				x: place.column * FLOW_COLUMN,
				y: place.row * FLOW_ROW,
				w: place.span * FLOW_COLUMN,
				h: FLOW_ROW,
				z: index + 1,
				groupId: part.lane === 'side' ? column : null,
				dock: null,
				pinned: false,
				focusOrder: index + 1,
			},
			configuration: { ...part.configuration },
			localState: {},
			binding: null,
			disabled: null,
		};
	});
	return withScreenMeta(
		{
			id,
			name: 'Session',
			description: 'Run the table: the session phase, combat, dice and the tools you use live.',
			tags: [],
			visibility: 'dm-only',
			visualSettings: { background: 'parchment' },
			ownership: { ownerActorId, createdAt: now, updatedAt: now, revision: 1 },
			sharingTargets: [],
			playerViewAssignments: [],
			templateMeta: { isTemplate: false, instantiatedFromTemplateSceneId: null },
			sections: [],
			widgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		{
			pinned: false,
			pinOrder: null,
			layoutPolicy: 'flow',
			origin: {
				kind: 'default',
				sourceSceneId: null,
				defaultKey: SESSION_SCREEN_DEFAULT_KEY,
				at: now,
			},
		},
	);
}

/** The vault's Session screen, or `null` until `/session` (ensure-home `screen: 'session'`) provisions it. */
export function findSessionScreen(scenes: SceneState): Scene | null {
	return findDefaultScreen(scenes, SESSION_SCREEN_DEFAULT_KEY);
}

/**
 * Whether a scene is one of the default screens rather than a table scene: the GM screen (the board
 * the home pointer names) or any screen provisioned as a default. The Command Center's scene tiles,
 * the sidebar's scene list and the scene pickers leave these out, as they always left out the board.
 */
export function isDefaultScreen(
	state: Pick<CoreStateSlice, 'commandCenter' | 'scenes'>,
	sceneId: string,
): boolean {
	if (sceneId === state.commandCenter.homeSceneId) return true;
	const scene = state.scenes.scenes[sceneId];
	return !!scene && screenMetaOf(scene).origin?.kind === 'default';
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

	// RC-CAN-7.8 — `/session` ensures the Session screen alone, by the same rules as the home screen
	// below: created once, never reset, and nothing else in the vault touched.
	if (parsed.data.screen === 'session') {
		if (findSessionScreen(state.scenes))
			return { status: 'accepted', nextState: state, events: [], operationIds: [] };
		const screen = buildDefaultSessionScreen(env, actor.id);
		const created = appendOperationDraft(env, state.sync, actor.id, {
			entityType: 'scene',
			entityId: screen.id,
			opType: 'scene.create',
			value: screen,
			afterRevision: screen.ownership.revision,
		});
		return {
			status: 'accepted',
			nextState: {
				...state,
				scenes: {
					schemaVersion: state.scenes.schemaVersion,
					scenes: { ...state.scenes.scenes, [screen.id]: screen },
				},
				sync: created.log,
			},
			events: [{ kind: 'scene.created', sceneId: screen.id, actorId: actor.id }],
			operationIds: [created.op.id],
		};
	}

	const board = ensureHomeBoard(state, env, actor.id, parsed.data.name);
	// RC-CAN-7.6 — then the home screen (ADR-041 "Defaults and preservation"): a fresh vault gets it
	// beside the board it just created; an existing vault gains it as its new home while its board,
	// untouched, stays the GM screen. Idempotent: once one exists nothing is written, and a GM's
	// customisation of it is never reset.
	if (findHomeScreen(board.state.scenes)) return board.result(board.state, []);
	const home = buildDefaultHomeScreen(env, actor.id);
	const created = appendOperationDraft(env, board.state.sync, actor.id, {
		entityType: 'scene',
		entityId: home.id,
		opType: 'scene.create',
		value: home,
		afterRevision: home.ownership.revision,
	});
	return board.result(
		{
			...board.state,
			scenes: {
				schemaVersion: board.state.scenes.schemaVersion,
				scenes: { ...board.state.scenes.scenes, [home.id]: home },
			},
			sync: created.log,
		},
		[created.op.id],
		[{ kind: 'scene.created', sceneId: home.id, actorId: actor.id }],
	);
}

/**
 * The GM screen half of `ensure-home`: the board the home pointer names, created from the system
 * template the first time (CMD-001) and otherwise left untouched apart from the one RC-ENG-8.2 repair.
 * Returns the state after it and a `result` that finishes the command with whatever follows.
 */
function ensureHomeBoard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	name: string | undefined,
): {
	state: CoreStateSlice;
	result: (
		next: CoreStateSlice,
		operationIds: string[],
		events?: Extract<CommandResult, { status: 'accepted' }>['events'],
	) => CommandResult;
} {
	const finish =
		(
			sceneId: string,
			boardOps: string[],
			boardEvents: Extract<CommandResult, { status: 'accepted' }>['events'],
		) =>
		(
			next: CoreStateSlice,
			operationIds: string[],
			events: Extract<CommandResult, { status: 'accepted' }>['events'] = [],
		): CommandResult => ({
			status: 'accepted',
			nextState: next,
			events: [...boardEvents, { kind: 'command-center.home-ready', sceneId, actorId }, ...events],
			operationIds: [...boardOps, ...operationIds],
		});

	// Idempotent: when a Command Center home Scene already exists, leave durable
	// state untouched and simply report it as ready (CMD-001). The one repair is a
	// Map tile a board created before RC-ENG-8.2 left unbound while the vault has
	// maps: it is bound to the default map so the board stops opening on an error.
	const existing = homeSceneExists(state);
	if (existing) {
		const repaired = withDefaultMapBinding(existing, defaultCommandCenterMapId(state));
		const rebound = repaired.widgets.find(
			(widget, index) => widget.binding !== existing.widgets[index]?.binding,
		);
		if (!rebound) return { state, result: finish(existing.id, [], []) };
		const nextScene = bumpRevision(repaired, env);
		const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
			entityType: 'scene',
			entityId: existing.id,
			opType: 'command-center.bind-default-map',
			path: `widgets/${rebound.id}/binding`,
			value: { widgetInstanceId: rebound.id, binding: rebound.binding },
			beforeRevision: existing.ownership.revision,
			afterRevision: nextScene.ownership.revision,
		});
		return {
			state: {
				...state,
				scenes: withScene(state.scenes, existing.id, () => nextScene),
				sync: nextLog,
			},
			result: finish(existing.id, [op.id], []),
		};
	}

	const scene = withDefaultMapBinding(
		buildDefaultCommandCenterScene(env, actorId),
		defaultCommandCenterMapId(state),
	);
	const namedScene = name ? { ...scene, name } : scene;

	const nextSceneState: SceneState = {
		schemaVersion: state.scenes.schemaVersion,
		scenes: { ...state.scenes.scenes, [namedScene.id]: namedScene },
	};
	const nextCommandCenter: CommandCenterState = {
		...state.commandCenter,
		homeSceneId: namedScene.id,
	};

	const afterSceneOp = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'scene',
		entityId: namedScene.id,
		opType: 'scene.create',
		value: namedScene,
		afterRevision: namedScene.ownership.revision,
	});
	const afterHomeOp = appendOperationDraft(env, afterSceneOp.log, actorId, {
		entityType: 'command-center',
		entityId: namedScene.id,
		opType: 'command-center.set-home',
		value: { homeSceneId: namedScene.id },
		dependencies: [afterSceneOp.op.id],
	});

	return {
		state: {
			...state,
			scenes: nextSceneState,
			commandCenter: nextCommandCenter,
			sync: afterHomeOp.log,
		},
		result: finish(
			namedScene.id,
			[afterSceneOp.op.id, afterHomeOp.op.id],
			[{ kind: 'command-center.home-created', sceneId: namedScene.id, actorId }],
		),
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
 * The preset-shaped snapshot every layout source reduces to: a saved preset, the last-known-good
 * auto-save, a built-in scene template, or a template scene (RC-CAN-4.4).
 */
export interface LayoutSnapshot {
	visualSettings: SceneVisualSettings;
	sections: CommandCenterPresetSection[];
	widgets: CommandCenterPresetWidget[];
}

/**
 * Instantiate a snapshot's widgets and sections as fresh scene instances. Widget ids and group ids
 * are remapped; any widget whose package is no longer installed is skipped and reported, keeping all
 * the others (CMD-007 / UX-CMD-008 AC4). `offset` shifts every widget and section (append placement)
 * and `zBase` / `focusBase` lift stacking and traversal order above what the scene already holds.
 * Shared by preset-apply, auto-save-restore and `scene.apply-template` so all three behave identically.
 */
export function instantiateLayoutSnapshot(
	state: CoreStateSlice,
	env: CoreEnvironment,
	source: LayoutSnapshot,
	placement: { offset?: { x: number; y: number }; zBase?: number; focusBase?: number } = {},
): {
	widgets: WidgetInstance[];
	sections: SectionLayoutRegion[];
	missingWidgetTypes: string[];
} {
	const dx = placement.offset?.x ?? 0;
	const dy = placement.offset?.y ?? 0;
	const zBase = placement.zBase ?? 0;
	const focusBase = placement.focusBase ?? 0;
	const missingWidgetTypes: string[] = [];
	const groupRemap = new Map<string, string>();
	const presetToInstance = new Map<string, string>();
	const widgets: WidgetInstance[] = [];
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
		const { layout } = presetWidget;
		widgets.push({
			id: newId,
			type: presetWidget.type,
			version: presetWidget.version,
			layout: {
				...layout,
				x: layout.x + dx,
				y: layout.y + dy,
				z: layout.z + zBase,
				focusOrder: layout.focusOrder === null ? null : layout.focusOrder + focusBase,
				groupId,
			},
			configuration: { ...presetWidget.configuration },
			localState: { ...presetWidget.localState },
			binding: presetWidget.binding ? { ...presetWidget.binding } : null,
			disabled: null,
		});
	}

	const sections: SectionLayoutRegion[] = source.sections.map((section) => ({
		id: env.ids(),
		name: section.name,
		bounds: { ...section.bounds, x: section.bounds.x + dx, y: section.bounds.y + dy },
		widgetInstanceIds: section.presetWidgetIds
			.map((presetWidgetId) => presetToInstance.get(presetWidgetId))
			.filter((value): value is string => Boolean(value)),
	}));
	return { widgets, sections, missingWidgetTypes };
}

/**
 * Materialize a snapshot layout (a preset or a last-known-good auto-save) onto the home Scene,
 * REPLACING its widgets, sections and visual settings.
 */
function materializeLayoutOntoScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	scene: Scene,
	source: LayoutSnapshot,
): { nextScene: Scene; restoredWidgets: WidgetInstance[]; missingWidgetTypes: string[] } {
	const { widgets, sections, missingWidgetTypes } = instantiateLayoutSnapshot(state, env, source);
	const nextScene = bumpRevision(
		{
			...scene,
			visualSettings: { ...source.visualSettings },
			sections,
			widgets,
			schemaVersion: SCENE_SCHEMA_VERSION,
		},
		env,
	);
	return { nextScene, restoredWidgets: widgets, missingWidgetTypes };
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
