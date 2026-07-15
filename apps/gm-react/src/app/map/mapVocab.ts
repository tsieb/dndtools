/**
 * MAP-021 — shared, data-only vocabulary for the rebuilt editor.
 *
 * These are the curated asset/style catalogues the drawing tools and the Assets browser author with,
 * plus the small mapping tables between the core's `MapLayerCategory` / `SceneVisibility` and the DS
 * component vocabulary. Kept here (not in a component) so every panel agrees on the same names without
 * importing each other.
 */

import type { MapLayerCategory, SceneVisibility } from '@dndtools/core';

/** Core layer category → the DS `LayerTypeBadge` `type` (grayscale-safe glyph family). */
export const CATEGORY_TO_BADGE: Record<MapLayerCategory, string> = {
	base: 'base',
	terrain: 'height',
	roads: 'roads',
	poi: 'poi',
	fog: 'fog',
	'dm-annotations': 'dm',
	'player-overlay': 'player',
};

/** Core visibility → the DS `LayerRow` cycle value. */
export const VIS_CORE_TO_DS: Record<SceneVisibility, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'shared',
};
export const VIS_DS_TO_CORE: Record<string, SceneVisibility> = {
	'dm-only': 'dm-only',
	players: 'player-visible',
	shared: 'shared',
};

/** Human labels for the three player-facing visibility levels. */
export const VIS_TEXT: Record<SceneVisibility, string> = {
	'dm-only': 'DM only',
	'player-visible': 'Player visible',
	shared: 'Shared',
};

/** The curated terrain palette the brush/fill tools paint with. `id` is the feature `style` string. */
export const TERRAIN_STYLES: ReadonlyArray<{ id: string; label: string; swatch: string }> = [
	{ id: 'terrain:grass', label: 'Grass', swatch: 'var(--layer-height)' },
	{ id: 'terrain:stone', label: 'Stone floor', swatch: 'var(--layer-base)' },
	{ id: 'terrain:dirt', label: 'Dirt', swatch: 'var(--layer-roads)' },
	{ id: 'terrain:sand', label: 'Sand', swatch: 'var(--color-status-warning)' },
	{ id: 'terrain:water', label: 'Shallows', swatch: 'var(--layer-water)' },
	{ id: 'terrain:forest', label: 'Forest', swatch: 'var(--layer-terrain, var(--layer-height))' },
	{ id: 'terrain:snow', label: 'Snow', swatch: 'var(--color-text-tertiary)' },
	{ id: 'terrain:lava', label: 'Lava', swatch: 'var(--color-status-error)' },
];

/** The curated stamp/prop catalogue (the "assets" for the prototype — a fixed set, not a file browser). */
export interface StampAsset {
	id: string;
	label: string;
	tags: string[];
	icon: string;
}
export const STAMP_ASSETS: readonly StampAsset[] = [
	{ id: 'prop:tree', label: 'Tree', tags: ['nature', 'outdoor'], icon: 'layer-terrain' },
	{ id: 'prop:rock', label: 'Rock', tags: ['nature', 'outdoor'], icon: 'layer-base' },
	{ id: 'prop:bush', label: 'Bush', tags: ['nature', 'outdoor'], icon: 'layer-terrain' },
	{ id: 'prop:crate', label: 'Crate', tags: ['dungeon', 'indoor'], icon: 'tool-stamp' },
	{ id: 'prop:barrel', label: 'Barrel', tags: ['dungeon', 'indoor'], icon: 'tool-stamp' },
	{ id: 'prop:chest', label: 'Chest', tags: ['dungeon', 'treasure'], icon: 'tool-stamp' },
	{ id: 'prop:table', label: 'Table', tags: ['furniture', 'indoor'], icon: 'tool-stamp' },
	{ id: 'prop:chair', label: 'Chair', tags: ['furniture', 'indoor'], icon: 'tool-stamp' },
	{ id: 'prop:pillar', label: 'Pillar', tags: ['dungeon', 'structure'], icon: 'tool-room' },
	{ id: 'prop:brazier', label: 'Brazier', tags: ['dungeon', 'light'], icon: 'tool-light' },
	{ id: 'prop:statue', label: 'Statue', tags: ['dungeon', 'decor'], icon: 'tool-stamp' },
	{ id: 'prop:campfire', label: 'Campfire', tags: ['outdoor', 'light'], icon: 'tool-light' },
];

/** The tag rail down the left of the Assets browser (multi-select). */
export const STAMP_TAGS: readonly string[] = [
	'nature',
	'outdoor',
	'indoor',
	'dungeon',
	'furniture',
	'treasure',
	'structure',
	'light',
	'decor',
];

/** Scatter uses a small set of natural object families. */
export const SCATTER_SETS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'trees', label: 'Trees' },
	{ id: 'rocks', label: 'Rocks' },
	{ id: 'bushes', label: 'Bushes' },
	{ id: 'crates', label: 'Crates' },
	{ id: 'rubble', label: 'Rubble' },
];

/** The door variants the door tool cycles through. `portal` lands in the feature's props. */
export const DOOR_KINDS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'door', label: 'Door' },
	{ id: 'secret', label: 'Secret' },
	{ id: 'archway', label: 'Archway' },
	{ id: 'portcullis', label: 'Portcullis' },
];

/** Clamp a normalized coordinate to the [0,1] map box. */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
