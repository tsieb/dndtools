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

/**
 * UX-CMD-008 — the rolling LAST-KNOWN-GOOD layout snapshot. It is an unnamed, single-slot capture of
 * the Command Center layout taken at deliberate good checkpoints (home ready, preset save/apply), so the
 * DM can recover their console after a crash, a failed sync, or an unwanted experimental change. Unlike a
 * named preset it carries no user name and only the snapshot fields needed to re-materialize the layout.
 */
export interface CommandCenterAutoSave {
	/** When this last-known-good snapshot was captured. */
	capturedAt: string;
	visualSettings: SceneVisualSettings;
	sections: CommandCenterPresetSection[];
	widgets: CommandCenterPresetWidget[];
}

export interface CommandCenterState {
	/** The Scene that is rendered as the application home surface. */
	homeSceneId: SceneId | null;
	presets: Record<string, CommandCenterPreset>;
	/**
	 * UX-CMD-008 — the recoverable last-known-good layout slot. Optional so a vault persisted before
	 * this slice hydrates fail-closed to "no auto-save yet" without a destructive migration.
	 */
	autoSave?: CommandCenterAutoSave | null;
	schemaVersion: typeof COMMAND_CENTER_STATE_SCHEMA_VERSION;
}

export const EMPTY_COMMAND_CENTER_STATE: CommandCenterState = Object.freeze({
	homeSceneId: null,
	presets: {},
	autoSave: null,
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

/**
 * RC-CAN-4.4 — the code-defined scene templates the template picker offers next to the DM's own saved
 * presets and template scenes. Each is a preset-shaped layout (the same snapshot shape
 * `command-center.apply-preset` restores), so `scene.apply-template` instantiates all three kinds of
 * source through one materializer. Layouts stay inside the bounded board's three 240px columns
 * (x + w ≤ 792) so a template applied to the home board needs no clamping.
 */
export const BUILTIN_SCENE_TEMPLATE_IDS = [
	'combat',
	'social',
	'exploration',
	'town',
	'session-prep',
] as const;

export type BuiltinSceneTemplateId = (typeof BUILTIN_SCENE_TEMPLATE_IDS)[number];

export interface BuiltinSceneTemplate {
	id: BuiltinSceneTemplateId;
	name: string;
	description: string;
	/** The picker's card icon (a DS icon name). */
	icon: string;
	visualSettings: SceneVisualSettings;
	widgets: ReadonlyArray<{
		type: string;
		/** Optional tile title (`configuration.title`), so "Notes" can read "NPC notes". */
		title?: string;
		x: number;
		y: number;
		w: number;
		h: number;
	}>;
}

// Columns start at 24 / 288 / 552 (24px margin, 264px step), mirroring `defaultLayout` above.
export const BUILTIN_SCENE_TEMPLATES: ReadonlyArray<BuiltinSceneTemplate> = Object.freeze([
	{
		id: 'combat',
		name: 'Combat scene',
		description: 'Initiative, the battle map, dice and a round timer in reach.',
		icon: 'tile-combat',
		visualSettings: { background: 'dark' },
		widgets: [
			{ type: 'initiative-tracker', x: 24, y: 24, w: 240, h: 344 },
			{ type: 'map', x: 288, y: 24, w: 504, h: 344 },
			{ type: 'dice', x: 24, y: 392, w: 240, h: 160 },
			{ type: 'timer', title: 'Round timer', x: 288, y: 392, w: 240, h: 160 },
			{ type: 'quick-reference', title: 'Conditions', x: 552, y: 392, w: 240, h: 160 },
		],
	},
	{
		id: 'social',
		name: 'Social encounter',
		description: 'NPC notes, a handout to reveal, dice for checks and ambience.',
		icon: 'players',
		visualSettings: { background: 'parchment' },
		widgets: [
			{ type: 'note', title: 'NPC notes', x: 24, y: 24, w: 504, h: 240 },
			{ type: 'handout', x: 552, y: 24, w: 240, h: 240 },
			{ type: 'dice', x: 24, y: 288, w: 240, h: 160 },
			{ type: 'audio', title: 'Ambience', x: 288, y: 288, w: 240, h: 160 },
		],
	},
	{
		id: 'exploration',
		name: 'Exploration',
		description: 'The region map with travel notes, a watch timer and dice.',
		icon: 'travel',
		visualSettings: { background: 'paper' },
		widgets: [
			{ type: 'map', x: 24, y: 24, w: 504, h: 344 },
			{ type: 'note', title: 'Travel log', x: 552, y: 24, w: 240, h: 344 },
			{ type: 'timer', title: 'Watch timer', x: 24, y: 392, w: 240, h: 160 },
			{ type: 'dice', x: 288, y: 392, w: 240, h: 160 },
			{ type: 'audio', title: 'Ambience', x: 552, y: 392, w: 240, h: 160 },
		],
	},
	{
		id: 'town',
		name: 'Town visit',
		description: 'A town map, shop and rumour notes, and a handout for posted notices.',
		icon: 'flag',
		visualSettings: { background: 'parchment' },
		widgets: [
			{ type: 'map', title: 'Town map', x: 24, y: 24, w: 504, h: 280 },
			{ type: 'note', title: 'Shops & rumours', x: 552, y: 24, w: 240, h: 280 },
			{ type: 'handout', title: 'Notice board', x: 24, y: 328, w: 240, h: 200 },
			{ type: 'quick-reference', x: 288, y: 328, w: 240, h: 200 },
		],
	},
	{
		id: 'session-prep',
		name: 'Session prep',
		description: 'Prep checklist, session notes, the reference shelf and the next map.',
		icon: 'hourglass',
		visualSettings: { background: 'paper' },
		widgets: [
			{ type: 'prep', x: 24, y: 24, w: 240, h: 344 },
			{ type: 'note', title: 'Session notes', x: 288, y: 24, w: 504, h: 344 },
			{ type: 'quick-reference', x: 24, y: 392, w: 240, h: 200 },
			{ type: 'map', title: 'Next map', x: 288, y: 392, w: 504, h: 200 },
		],
	},
]);

export function findBuiltinSceneTemplate(id: string): BuiltinSceneTemplate | undefined {
	return BUILTIN_SCENE_TEMPLATES.find((template) => template.id === id);
}

/**
 * The preset-shaped layout snapshot of a built-in template. Preset widget ids are derived from the
 * template id and index (not `env.ids()`), so the snapshot is pure and a miniature can be drawn from
 * it without a core environment; `scene.apply-template` remaps every id to a fresh instance anyway.
 */
export function builtinSceneTemplateLayout(template: BuiltinSceneTemplate): {
	visualSettings: SceneVisualSettings;
	sections: CommandCenterPresetSection[];
	widgets: CommandCenterPresetWidget[];
} {
	return {
		visualSettings: { ...template.visualSettings },
		sections: [],
		widgets: template.widgets.map((widget, index) => ({
			presetWidgetId: `${template.id}:${index}`,
			type: widget.type,
			version: '1.0.0',
			layout: {
				x: widget.x,
				y: widget.y,
				w: widget.w,
				h: widget.h,
				z: index + 1,
				groupId: null,
				dock: null,
				pinned: false,
				focusOrder: index + 1,
			},
			configuration: widget.title ? { title: widget.title } : {},
			localState: {},
			binding: null,
		})),
	};
}
