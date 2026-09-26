import {
	BUILTIN_SCENE_TEMPLATES,
	DEFAULT_COMMAND_CENTER_NAME,
	DEFAULT_COMMAND_CENTER_TOOLS,
	type BuiltinSceneTemplateId,
	type SceneBackground,
	type ScreenLayoutPolicy,
	type ScreenListEntry,
} from '@dndtools/core';
import { FLOW_COLUMN_STEP, FLOW_ROW_STEP } from '../../app/board-helpers';
import type { MessageKey } from '../../i18n';

/**
 * RC-CAN-7.3 — the pure half of the screens library and switcher: how a screen is named, filtered,
 * sorted, created from a template and addressed. Everything here is framework-free so it can be unit
 * tested without mounting the library; the components in this directory only render it.
 *
 * A screen IS a scene (ADR-041), so none of this invents state. It reads `listScreensForActor`, which
 * already applies the actor's scene visibility, and every write goes out as an existing core command.
 */

/** The canonical route of one screen. The library, the header switcher and the palette all use it. */
export function screenPath(id: string): string {
	return `/screen/${encodeURIComponent(id)}`;
}

/** The library. `/scenes` resolves here (ADR-041 route table). */
export const SCREENS_PATH = '/screens';

/**
 * The name a screen is shown under. The vault's home board is still named after the code-defined
 * Command Center template it was seeded from, which is not what the GM calls it: ADR-041 keeps that
 * board as the GM screen. Until the GM renames it, it is labelled as the GM screen (in the active
 * system's vocabulary, which the caller supplies); a name the GM chose is always shown as written.
 */
export function screenDisplayName(
	entry: Pick<ScreenListEntry, 'name' | 'isHome'>,
	gmScreenLabel: string,
): string {
	return entry.isHome && entry.name === DEFAULT_COMMAND_CENTER_NAME ? gmScreenLabel : entry.name;
}

/**
 * Visibility named for what it is (ADR-041 vocabulary), replacing the old "Draft"/"Ready" status,
 * which was only ever derived from visibility. `{gm}` in the dm-only message follows the vocabulary.
 */
export function visibilityLabelKey(visibility: ScreenListEntry['visibility']): MessageKey {
	if (visibility === 'dm-only') return 'common.visibility.dmOnly';
	if (visibility === 'shared') return 'common.visibility.shared';
	return 'common.visibility.playerVisible';
}

export const SCREEN_SORTS = ['pinned', 'name', 'updated'] as const;
export type ScreenSort = (typeof SCREEN_SORTS)[number];

export interface ScreenFilter {
	query: string;
	/** A tag the screen must carry, or `''` for every tag. */
	tag: string;
	sort: ScreenSort;
}

/** Every tag across the listed screens, de-duplicated and sorted for a stable menu. */
export function screenTags(entries: readonly ScreenListEntry[]): string[] {
	return [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
}

/**
 * Filter and order the library. The query matches the shown name, the description and the tags,
 * case-insensitively. `pinned` keeps the core's order (pinned screens first, in the GM's order, then
 * by name); `name` is alphabetical by the shown name; `updated` is newest first.
 */
export function filterScreens(
	entries: readonly ScreenListEntry[],
	filter: ScreenFilter,
	nameOf: (entry: ScreenListEntry) => string,
): ScreenListEntry[] {
	const needle = filter.query.trim().toLocaleLowerCase();
	const matched = entries.filter((entry) => {
		if (filter.tag && !entry.tags.includes(filter.tag)) return false;
		if (!needle) return true;
		return [nameOf(entry), entry.description, ...entry.tags].some((text) =>
			text.toLocaleLowerCase().includes(needle),
		);
	});
	if (filter.sort === 'name')
		return [...matched].sort(
			(a, b) => nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id),
		);
	if (filter.sort === 'updated')
		return [...matched].sort(
			(a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
		);
	return matched;
}

/** A tile a template places: a system widget type at a layout rectangle. */
export interface TemplateTile {
	type: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Where a template's tiles come from. `builtin` is a CAN-4.4 scene template (`scene.apply-template`),
 * `preset` and `scene` are the GM's own saved templates, `tiles` is a layout defined here and placed
 * with `scene.add-widget`, and `blank` places nothing.
 */
export type ScreenTemplateSource =
	| { kind: 'builtin'; templateId: BuiltinSceneTemplateId }
	| { kind: 'preset'; presetId: string }
	| { kind: 'scene'; templateSceneId: string }
	| { kind: 'tiles'; tiles: readonly TemplateTile[] }
	| { kind: 'blank' };

export interface ScreenTemplate {
	id: string;
	/** A message key for the built-in templates; saved templates carry their own name instead. */
	nameKey?: MessageKey;
	bodyKey?: MessageKey;
	name?: string;
	icon: string;
	layoutPolicy: ScreenLayoutPolicy;
	source: ScreenTemplateSource;
	/** The board's background, as `scene.create` writes it; omitted means the create default. */
	background?: SceneBackground;
}

/** The bounded board's three columns (24px margin, 264px step), as the CAN-4.4 templates use them. */
function boardColumn(index: number, row: number, rowHeight = 184): [number, number] {
	return [24 + index * 264, 24 + row * rowHeight];
}

/** The GM screen: the default home board's seven system tools, three to a row. */
const GM_SCREEN_TILES: readonly TemplateTile[] = DEFAULT_COMMAND_CENTER_TOOLS.map((tool, index) => {
	const [x, y] = boardColumn(index % 3, Math.floor(index / 3));
	return { type: tool.type, x, y, w: 240, h: 160 };
});

/**
 * The Command Center as a FLOW screen: the session hub beside the create tools, then the library
 * hub beside the notes — spans 7 + 5 of the twelve authoring columns, the Command Center's own
 * `1.5fr 1fr` body. CAN-7.6 replaces these with the hub's own template widgets.
 */
const COMMAND_CENTER_TILES: readonly TemplateTile[] = [
	{ type: 'session', x: 0, y: 0, w: 7 * FLOW_COLUMN_STEP, h: FLOW_ROW_STEP },
	{ type: 'tools', x: 7 * FLOW_COLUMN_STEP, y: 0, w: 5 * FLOW_COLUMN_STEP, h: FLOW_ROW_STEP },
	{ type: 'data-hub', x: 0, y: FLOW_ROW_STEP, w: 7 * FLOW_COLUMN_STEP, h: FLOW_ROW_STEP },
	{
		type: 'notes',
		x: 7 * FLOW_COLUMN_STEP,
		y: FLOW_ROW_STEP,
		w: 5 * FLOW_COLUMN_STEP,
		h: FLOW_ROW_STEP,
	},
];

/** Session: the session control, initiative, dice, ambience and a handout within one board. */
const SESSION_TILES: readonly TemplateTile[] = [
	{ type: 'session', x: 24, y: 24, w: 504, h: 240 },
	{ type: 'initiative-tracker', x: 552, y: 24, w: 240, h: 344 },
	{ type: 'dice', x: 24, y: 288, w: 240, h: 160 },
	{ type: 'audio', x: 288, y: 288, w: 240, h: 160 },
	{ type: 'handout', x: 552, y: 392, w: 240, h: 160 },
];

/** The CAN-4.4 built-ins offered after the run templates. Session prep is the Prep template. */
const SCENE_TEMPLATE_KEYS: Record<
	Exclude<BuiltinSceneTemplateId, 'session-prep'>,
	[MessageKey, MessageKey]
> = {
	combat: ['screens.template.combat', 'screens.template.combatBody'],
	social: ['screens.template.social', 'screens.template.socialBody'],
	exploration: ['screens.template.exploration', 'screens.template.explorationBody'],
	town: ['screens.template.town', 'screens.template.townBody'],
};

/**
 * "New from template": Command Center, GM screen, Session, Prep and Blank, then the CAN-4.4 scene
 * templates. The GM's own saved templates are appended by the caller, which can read them.
 */
export const BUILTIN_SCREEN_TEMPLATES: readonly ScreenTemplate[] = [
	{
		id: 'command-center',
		nameKey: 'screens.template.commandCenter',
		bodyKey: 'screens.template.commandCenterBody',
		icon: 'home',
		layoutPolicy: 'flow',
		background: 'parchment',
		source: { kind: 'tiles', tiles: COMMAND_CENTER_TILES },
	},
	{
		id: 'gm-screen',
		nameKey: 'screens.template.gmScreen',
		bodyKey: 'screens.template.gmScreenBody',
		icon: 'widget',
		layoutPolicy: 'canvas',
		// The home board is seeded on parchment; a new GM screen matches it.
		background: 'parchment',
		source: { kind: 'tiles', tiles: GM_SCREEN_TILES },
	},
	{
		id: 'session',
		nameKey: 'screens.template.session',
		bodyKey: 'screens.template.sessionBody',
		icon: 'session-bolt',
		layoutPolicy: 'canvas',
		background: 'parchment',
		source: { kind: 'tiles', tiles: SESSION_TILES },
	},
	{
		id: 'prep',
		nameKey: 'screens.template.prep',
		bodyKey: 'screens.template.prepBody',
		icon: 'hourglass',
		layoutPolicy: 'canvas',
		background: 'paper',
		source: { kind: 'builtin', templateId: 'session-prep' },
	},
	{
		id: 'blank',
		nameKey: 'screens.template.blank',
		bodyKey: 'screens.template.blankBody',
		icon: 'add',
		layoutPolicy: 'canvas',
		source: { kind: 'blank' },
	},
	...BUILTIN_SCENE_TEMPLATES.filter((template) => template.id !== 'session-prep').map(
		(template): ScreenTemplate => {
			const [nameKey, bodyKey] =
				SCENE_TEMPLATE_KEYS[template.id as Exclude<BuiltinSceneTemplateId, 'session-prep'>];
			return {
				id: `scene-${template.id}`,
				nameKey,
				bodyKey,
				icon: template.icon,
				layoutPolicy: 'canvas',
				background: template.visualSettings.background,
				source: { kind: 'builtin', templateId: template.id },
			};
		},
	),
];

/** The tiles a template's miniature draws, where the template itself knows them. */
export function templateTiles(template: ScreenTemplate): readonly TemplateTile[] {
	if (template.source.kind === 'tiles') return template.source.tiles;
	if (template.source.kind === 'builtin') {
		const id = template.source.templateId;
		return BUILTIN_SCENE_TEMPLATES.find((builtin) => builtin.id === id)?.widgets ?? [];
	}
	return [];
}

/**
 * The palette's canvas surface for a screen route. `/screen/:id` renders the home board through the
 * same engine `/board` did, so the home screen keeps the board's surface kind and every other screen
 * is a scene surface. Anything else is not a screen route.
 */
export function screenCanvasRoute(
	pathname: string,
	homeSceneId: string | null,
): { kind: 'board' } | { kind: 'scene'; sceneId: string } | null {
	const segment = /^\/screen\/([^/]+)\/?$/.exec(pathname)?.[1];
	if (!segment) return null;
	let sceneId: string;
	try {
		sceneId = decodeURIComponent(segment);
	} catch {
		return null;
	}
	if (!sceneId) return null;
	return sceneId === homeSceneId ? { kind: 'board' } : { kind: 'scene', sceneId };
}
