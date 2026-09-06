/**
 * MAP-021 — shared, data-only vocabulary for the rebuilt editor.
 *
 * These are the curated asset/style catalogues the drawing tools and the Assets browser author with,
 * plus the small mapping tables between the core's `MapLayerCategory` / `SceneVisibility` and the DS
 * component vocabulary. Kept here (not in a component) so every panel agrees on the same names without
 * importing each other.
 */

import type { MapLayerCategory, SceneVisibility } from '@dndtools/core';
import type { MessageKey } from '../../i18n';

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

/** The same three levels addressed by message key, for anything a reader sees (RC-UX-1.2).
 * `VIS_TEXT` survives for the announcement templates that are still assembled as plain strings. */
export const VIS_TEXT_KEY: Record<SceneVisibility, MessageKey> = {
	'dm-only': 'common.visibility.dmOnly',
	'player-visible': 'common.visibility.playerVisible',
	shared: 'common.visibility.shared',
};

/** The curated terrain palette the brush/fill tools paint with. `id` is the feature `style` string. */
export const TERRAIN_STYLES: ReadonlyArray<{ id: string; label: MessageKey; swatch: string }> = [
	{ id: 'terrain:grass', label: 'mapVocab.terrain.grass', swatch: 'var(--layer-height)' },
	{ id: 'terrain:stone', label: 'mapVocab.terrain.stone', swatch: 'var(--layer-base)' },
	{ id: 'terrain:dirt', label: 'mapVocab.terrain.dirt', swatch: 'var(--layer-roads)' },
	{ id: 'terrain:sand', label: 'mapVocab.terrain.sand', swatch: 'var(--color-status-warning)' },
	{ id: 'terrain:water', label: 'mapVocab.terrain.water', swatch: 'var(--layer-water)' },
	// `--layer-terrain` was never DECLARED, and because the reference carried its own fallback the
	// token-reference gate could not see it — so Forest silently resolved to `--layer-height`, which is
	// exactly Grass's swatch. The token now exists in every theme; the fallback is gone on purpose so
	// styles/token-references.test.ts guards it.
	{ id: 'terrain:forest', label: 'mapVocab.terrain.forest', swatch: 'var(--layer-terrain)' },
	{ id: 'terrain:snow', label: 'mapVocab.terrain.snow', swatch: 'var(--color-text-tertiary)' },
	{ id: 'terrain:lava', label: 'mapVocab.terrain.lava', swatch: 'var(--color-status-error)' },
];

const TERRAIN_SWATCH: Record<string, string> = Object.fromEntries(
	TERRAIN_STYLES.map((t) => [t.id, t.swatch]),
);

/**
 * The palette colour a `terrain:*` feature style paints with, or `null` for any other style.
 *
 * The brush, fill and room tools all write the chosen `terrain:*` id into `feature.style`, but the
 * renderer (`FeatureShape`) only ever read the LAYER category colour — so all eight entries of the
 * Terrain select, each with its own swatch in the dropdown, painted the identical tint and a DM could
 * not tell painted lava from painted snow.
 */
export function terrainColor(style: string | undefined): string | null {
	return (style && TERRAIN_SWATCH[style]) || null;
}

/** The curated stamp/prop catalogue (the "assets" for the prototype — a fixed set, not a file browser). */
export interface StampAsset {
	id: string;
	label: MessageKey;
	tags: string[];
	icon: string;
}
export const STAMP_ASSETS: readonly StampAsset[] = [
	{
		id: 'prop:tree',
		label: 'mapVocab.prop.tree',
		tags: ['nature', 'outdoor'],
		icon: 'layer-terrain',
	},
	{ id: 'prop:rock', label: 'mapVocab.prop.rock', tags: ['nature', 'outdoor'], icon: 'layer-base' },
	{
		id: 'prop:bush',
		label: 'mapVocab.prop.bush',
		tags: ['nature', 'outdoor'],
		icon: 'layer-terrain',
	},
	{
		id: 'prop:crate',
		label: 'mapVocab.prop.crate',
		tags: ['dungeon', 'indoor'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:barrel',
		label: 'mapVocab.prop.barrel',
		tags: ['dungeon', 'indoor'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:chest',
		label: 'mapVocab.prop.chest',
		tags: ['dungeon', 'treasure'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:table',
		label: 'mapVocab.prop.table',
		tags: ['furniture', 'indoor'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:chair',
		label: 'mapVocab.prop.chair',
		tags: ['furniture', 'indoor'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:pillar',
		label: 'mapVocab.prop.pillar',
		tags: ['dungeon', 'structure'],
		icon: 'tool-room',
	},
	{
		id: 'prop:brazier',
		label: 'mapVocab.prop.brazier',
		tags: ['dungeon', 'light'],
		icon: 'tool-light',
	},
	{
		id: 'prop:statue',
		label: 'mapVocab.prop.statue',
		tags: ['dungeon', 'decor'],
		icon: 'tool-stamp',
	},
	{
		id: 'prop:campfire',
		label: 'mapVocab.prop.campfire',
		tags: ['outdoor', 'light'],
		icon: 'tool-light',
	},
];

/** The tag rail down the left of the Assets browser (multi-select). */
export const STAMP_TAGS: ReadonlyArray<{ id: string; label: MessageKey }> = [
	{ id: 'nature', label: 'mapVocab.tag.nature' },
	{ id: 'outdoor', label: 'mapVocab.tag.outdoor' },
	{ id: 'indoor', label: 'mapVocab.tag.indoor' },
	{ id: 'dungeon', label: 'mapVocab.tag.dungeon' },
	{ id: 'furniture', label: 'mapVocab.tag.furniture' },
	{ id: 'treasure', label: 'mapVocab.tag.treasure' },
	{ id: 'structure', label: 'mapVocab.tag.structure' },
	{ id: 'light', label: 'mapVocab.tag.light' },
	{ id: 'decor', label: 'mapVocab.tag.decor' },
];

/** Scatter uses a small set of natural object families. */
export const SCATTER_SETS: ReadonlyArray<{ id: string; label: MessageKey }> = [
	{ id: 'trees', label: 'mapVocab.scatter.trees' },
	{ id: 'rocks', label: 'mapVocab.scatter.rocks' },
	{ id: 'bushes', label: 'mapVocab.scatter.bushes' },
	{ id: 'crates', label: 'mapVocab.scatter.crates' },
	{ id: 'rubble', label: 'mapVocab.scatter.rubble' },
];

/** The door variants the door tool cycles through. `portal` lands in the feature's props. */
export const DOOR_KINDS: ReadonlyArray<{ id: string; label: MessageKey }> = [
	{ id: 'door', label: 'mapVocab.door.door' },
	{ id: 'secret', label: 'mapVocab.door.secret' },
	{ id: 'archway', label: 'mapVocab.door.archway' },
	{ id: 'portcullis', label: 'mapVocab.door.portcullis' },
];

/** Clamp a normalized coordinate to the [0,1] map box. */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Announcement copy for a bulk selection command that walks the selection one `run()` at a time and
 * stops on the first refusal (a locked layer, a permission ceiling).
 *
 * `run()` returns false for BOTH "already busy" and "the core refused", so a partial or empty result
 * is the normal failure signal — and announcing the verb unconditionally told the DM the work landed
 * when nothing had. Mirrors `keyboard.ts`'s `deleteSelection`, which had the same defect.
 */
export function bulkResultMessage(opts: {
	done: number;
	attempted: number;
	/** Success copy. `{objects}` is replaced with "1 object" / "N objects" — the plural the old
	 *  hard-coded `${n} objects` got wrong for a single-item selection. */
	template: string;
	/** Past participle for the all-refused case, e.g. `deleted`, `changed`. */
	refusedVerb: string;
}): string {
	const { done, attempted, template, refusedVerb } = opts;
	if (attempted === 0) return '';
	if (done === 0) return `Nothing was ${refusedVerb} — the selection may be on a locked layer.`;
	const objects = done === 1 ? '1 object' : `${done} objects`;
	const message = template.replace('{objects}', objects);
	return done < attempted ? `${message.replace(/\.$/, '')} — the rest were refused.` : message;
}
