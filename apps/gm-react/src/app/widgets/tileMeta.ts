import type { WidgetDefinition } from '@dndtools/core';

/** Presentation only: these families use the theme-aware RC-CAN-2.1 palette. */
export type TileFamily =
	| 'note'
	| 'combat'
	| 'encounter'
	| 'dice'
	| 'generator'
	| 'handout'
	| 'timer'
	| 'calendar'
	| 'map'
	| 'character'
	| 'audio'
	| 'reference';

export interface TileTypeMetadata {
	readonly accentToken: `--color-tile-${TileFamily}`;
	readonly icon: string;
	readonly silhouetteClass: `tile-silhouette-${TileFamily}`;
	readonly description: string;
}

function metadata(family: TileFamily, icon: string, description: string): TileTypeMetadata {
	return Object.freeze({
		accentToken: `--color-tile-${family}`,
		icon,
		silhouetteClass: `tile-silhouette-${family}`,
		description,
	});
}

/** Identity defaults, not a second widget registry. Definitions remain authoritative. */
export const TILE_TYPE_METADATA = Object.freeze({
	note: metadata('note', 'note-edit', 'Keep session notes close at hand.'),
	combat: metadata('combat', 'sword', 'Follow the current round and turn order.'),
	encounter: metadata('encounter', 'sword', 'Prepare the next encounter.'),
	dice: metadata('dice', 'dice', 'Roll dice and record the results.'),
	generator: metadata('generator', 'sparkle', 'Generate ideas for the session.'),
	handout: metadata('handout', 'scroll', 'Share a handout with the party.'),
	timer: metadata('timer', 'recent', 'Track a session countdown.'),
	calendar: metadata('calendar', 'recent', 'Track dates and upcoming events.'),
	map: metadata('map', 'atlas-map', 'Explore a map and its visible layers.'),
	character: metadata('character', 'characters-person', 'Read a character stat block.'),
	audio: metadata('audio', 'audio', 'Control the session atmosphere.'),
	reference: metadata('reference', 'book', 'Keep reference material within reach.'),
} satisfies Record<TileFamily, TileTypeMetadata>);

const CATEGORY_FAMILY: Readonly<Record<string, TileFamily>> = Object.freeze({
	notes: 'note',
	combat: 'combat',
	encounters: 'encounter',
	'dice & timers': 'dice',
	generators: 'generator',
	handouts: 'handout',
	timers: 'timer',
	calendar: 'calendar',
	maps: 'map',
	characters: 'character',
	atmosphere: 'audio',
	reference: 'reference',
});

// Icons disambiguate shared categories (timer/dice and handout/reference) and the
// broad Command Center category. Unknown third-party categories safely fall back.
const ICON_FAMILY: Readonly<Record<string, TileFamily>> = Object.freeze({
	'note-edit': 'note',
	sword: 'combat',
	dice: 'dice',
	sparkle: 'generator',
	scroll: 'handout',
	recent: 'timer',
	'atlas-map': 'map',
	'characters-person': 'character',
	audio: 'audio',
	book: 'reference',
	folder: 'reference',
});

type TileDefinition = Pick<WidgetDefinition, 'category' | 'icon' | 'description'>;

function ownFamily(
	table: Readonly<Record<string, TileFamily>>,
	key: string,
): TileFamily | undefined {
	return Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * Resolve from the current definition, including installed/custom definitions.
 * Callers may supply per-definition presentation overrides without persisting a
 * new core schema field. No instance configuration or bound entity is read here.
 */
export function tileMetadataForDefinition(
	definition: TileDefinition,
	overrides: Partial<TileTypeMetadata> = {},
): TileTypeMetadata {
	const category = definition.category?.trim().toLowerCase() ?? '';
	const icon = definition.icon?.trim() ?? '';
	const categoryFamily = ownFamily(CATEGORY_FAMILY, category);
	const iconFamily = ownFamily(ICON_FAMILY, icon);
	const family =
		category === 'dice & timers' || category === 'reference' || !categoryFamily
			? (iconFamily ?? categoryFamily ?? 'reference')
			: categoryFamily;
	const defaults = TILE_TYPE_METADATA[family];
	return Object.freeze({
		accentToken: overrides.accentToken ?? defaults.accentToken,
		icon: overrides.icon?.trim() || icon || defaults.icon,
		silhouetteClass: overrides.silhouetteClass ?? defaults.silhouetteClass,
		description:
			(overrides.description ?? definition.description)?.replace(/\s+/g, ' ').trim() ||
			defaults.description,
	});
}
