import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	deliveredMapIdsForActor,
	getCharacterForActor,
	getContentItemsForActor,
	listMapsForActor,
	type CoreStateSlice,
	type WidgetDefinition,
} from '@dndtools/core';
import type { BoardWidget } from '../board-helpers';

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

/**
 * The board view-model carries the definition's `category` as `typeLabel` (falling back to the
 * display name when a definition has none, which then resolves through the icon like any unknown
 * category), so a frame can resolve its identity without a second registry lookup.
 */
export function tileMetadataForWidget(
	widget: Pick<BoardWidget, 'typeLabel' | 'icon' | 'description'>,
	overrides: Partial<TileTypeMetadata> = {},
): TileTypeMetadata {
	return tileMetadataForDefinition(
		{ category: widget.typeLabel, icon: widget.icon, description: widget.description },
		overrides,
	);
}

/** What the header's link glyph says about the instance's data binding. */
export type TileBindingState = 'bound' | 'unbound' | 'missing' | 'hidden' | 'conflicted';

/**
 * Read from the actor-scoped binding payload the board already derived (`status`), never from the
 * bound record, so the glyph cannot disagree with the frame's status note. `null` means the widget
 * has no binding to speak of (a note, a timer) and the header shows no glyph at all.
 */
export function tileBindingState(
	widget: Pick<BoardWidget, 'status' | 'bindingRef' | 'requiresBinding'>,
): TileBindingState | null {
	switch (widget.status) {
		case 'hidden':
		case 'missing':
		case 'conflicted':
		case 'unbound':
			return widget.status;
	}
	if (widget.bindingRef) return 'bound';
	return widget.requiresBinding ? 'unbound' : null;
}

/**
 * The bound entity's name as the VIEWING actor may read it, or `null`.
 *
 * Two gates, both fail-closed. First, only an `available`/`degraded` payload may be named: a hidden,
 * missing or conflicted binding shows its state and nothing else. Second, the name comes out of the
 * actor-filtered core read for that entity type, never the raw record, so even a stale `status`
 * cannot put a DM-only map's name on a player's board. An entity type with no such read here stays
 * unnamed rather than falling back to its id.
 */
export function safeBoundEntityName(
	state: CoreStateSlice,
	actorId: string,
	widget: Pick<BoardWidget, 'status' | 'bindingRef'>,
): string | null {
	const ref = widget.bindingRef;
	if (!ref) return null;
	if (widget.status !== 'available' && widget.status !== 'degraded') return null;
	switch (ref.entityType) {
		case 'map':
			return (
				listMapsForActor(state.maps, state.permissions, actorId, {
					deliveredMapIds: deliveredMapIdsForActor(state.session, actorId),
				}).find((map) => map.id === ref.entityId)?.name ?? null
			);
		case CHARACTER_ENTITY_TYPE:
			return (
				getCharacterForActor(state.characters, state.permissions, actorId, ref.entityId)?.name ??
				null
			);
		case CONTENT_ITEM_ENTITY_TYPE:
			return (
				getContentItemsForActor(state.content, state.permissions, actorId).find(
					(item) => item.id === ref.entityId,
				)?.title ?? null
			);
		default:
			return null;
	}
}
