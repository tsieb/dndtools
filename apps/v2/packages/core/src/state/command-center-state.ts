import type { ActorId, SceneId } from './ids';
import type { CoreEnvironment } from '../commands/types';
import {
	SCENE_SCHEMA_VERSION,
	type Scene,
	type SceneVisualSettings,
	type WidgetBinding,
	type WidgetInstance,
	type WidgetLayout,
} from './scene-state';

export const COMMAND_CENTER_STATE_SCHEMA_VERSION = 1 as const;

/**
 * The Command Center is the DM's home Scene. Its durable identity and saved
 * presets live in this dedicated state document so that the home-scene pointer
 * and preset library are partitioned from the generic SceneState (Contract 1).
 */
export interface CommandCenterPresetWidget {
	/** Stable id within the preset; remapped to a fresh widget instance on restore. */
	presetWidgetId: string;
	type: string;
	version: string;
	layout: WidgetLayout;
	configuration: Record<string, unknown>;
	localState: Record<string, unknown>;
	binding: WidgetBinding | null;
}

export interface CommandCenterPresetSection {
	name: string;
	bounds: { x: number; y: number; w: number; h: number };
	presetWidgetIds: string[];
}

export interface CommandCenterPreset {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	revision: number;
	visualSettings: SceneVisualSettings;
	sections: CommandCenterPresetSection[];
	widgets: CommandCenterPresetWidget[];
}

export interface CommandCenterState {
	/** The Scene that is rendered as the application home surface. */
	homeSceneId: SceneId | null;
	presets: Record<string, CommandCenterPreset>;
	schemaVersion: typeof COMMAND_CENTER_STATE_SCHEMA_VERSION;
}

export const EMPTY_COMMAND_CENTER_STATE: CommandCenterState = Object.freeze({
	homeSceneId: null,
	presets: {},
	schemaVersion: COMMAND_CENTER_STATE_SCHEMA_VERSION,
});

export const DEFAULT_COMMAND_CENTER_NAME = 'Command Center';

/**
 * The DM tools the default Command Center system template lays out as widgets.
 * Mirrors the Vision Command Center surface: active map embed, DM tools panel
 * (initiative, dice, timers, audio, reference), plus prep tooling (CMD-002/CMD-003).
 */
export const DEFAULT_COMMAND_CENTER_TOOLS: ReadonlyArray<{
	type: string;
	version: string;
	label: string;
}> = Object.freeze([
	{ type: 'map', version: '1.0.0', label: 'Active Map' },
	{ type: 'initiative-tracker', version: '1.0.0', label: 'Initiative' },
	{ type: 'dice', version: '1.0.0', label: 'Dice' },
	{ type: 'timer', version: '1.0.0', label: 'Timers' },
	{ type: 'audio', version: '1.0.0', label: 'Audio' },
	{ type: 'quick-reference', version: '1.0.0', label: 'Quick Reference' },
	{ type: 'prep', version: '1.0.0', label: 'Prep' },
]);

const DEFAULT_WIDGET_SIZE = { w: 240, h: 160 } as const;
const COLUMNS = 3;
const GUTTER = 24;

function defaultLayout(index: number): WidgetLayout {
	const column = index % COLUMNS;
	const row = Math.floor(index / COLUMNS);
	return {
		x: GUTTER + column * (DEFAULT_WIDGET_SIZE.w + GUTTER),
		y: GUTTER + row * (DEFAULT_WIDGET_SIZE.h + GUTTER),
		w: DEFAULT_WIDGET_SIZE.w,
		h: DEFAULT_WIDGET_SIZE.h,
		z: index + 1,
		groupId: null,
		dock: null,
		pinned: false,
		focusOrder: index + 1,
	};
}

/**
 * Builds the default Command Center Scene from the system template. This is a
 * code-defined template (not a stored Scene-template entity) used the first time
 * the home surface loads and no Command Center has been configured (CMD-001).
 */
export function buildDefaultCommandCenterScene(env: CoreEnvironment, ownerActorId: ActorId): Scene {
	const now = env.clock();
	const id = env.ids();
	const widgets: WidgetInstance[] = DEFAULT_COMMAND_CENTER_TOOLS.map((tool, index) => ({
		id: env.ids(),
		type: tool.type,
		version: tool.version,
		layout: defaultLayout(index),
		configuration: {},
		localState: {},
		binding: null,
		disabled: null,
	}));
	return {
		id,
		name: DEFAULT_COMMAND_CENTER_NAME,
		description: 'The DM home surface for active session management.',
		tags: ['command-center'],
		visibility: 'dm-only',
		visualSettings: { background: 'parchment' },
		ownership: { ownerActorId, createdAt: now, updatedAt: now, revision: 1 },
		sharingTargets: [],
		playerViewAssignments: [],
		templateMeta: { isTemplate: false, instantiatedFromTemplateSceneId: null },
		sections: [],
		widgets,
		schemaVersion: SCENE_SCHEMA_VERSION,
	};
}
