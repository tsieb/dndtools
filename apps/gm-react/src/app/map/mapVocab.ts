/**
 * MAP-021 — shared, data-only vocabulary for the rebuilt editor.
 *
 * These are the curated asset/style catalogues the drawing tools and the Assets browser author with,
 * plus the small mapping tables between the core's `MapLayerCategory` / `SceneVisibility` and the DS
 * component vocabulary. Kept here (not in a component) so every panel agrees on the same names without
 * importing each other.
 */

import type {
	MapLayerCategory,
	PropCatalogEntry,
	PropCategoryId,
	SceneVisibility,
} from '@dndtools/core';
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

/**
 * RC-MAP-3.1 — the stamp/prop library.
 *
 * The catalogue itself (ids, categories, tags, vector glyphs, default scale) is CORE data
 * (`PROP_CATALOG`), because the canvas renderer and the scatter generators read the same entries.
 * What lives here is the part only the GUI can own: the message key each entry and each category is
 * rendered with. A missing key is not a crash and not a placeholder — the panel falls back to the
 * catalogue's own English `name`, so a prop added in the core is still stampable before it is
 * translated (`mapVocab.test.ts` holds the two lists together).
 */
export const PROP_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
	'prop:tree': 'mapVocab.prop.tree',
	'prop:pine': 'mapVocab.prop.pine',
	'prop:bush': 'mapVocab.prop.bush',
	'prop:dead-tree': 'mapVocab.prop.deadTree',
	'prop:mushroom': 'mapVocab.prop.mushroom',
	'prop:grass': 'mapVocab.prop.grass',
	'prop:rock': 'mapVocab.prop.rock',
	'prop:rubble': 'mapVocab.prop.rubble',
	'prop:bone': 'mapVocab.prop.bone',
	'prop:stalagmite': 'mapVocab.prop.stalagmite',
	'prop:grave': 'mapVocab.prop.grave',
	'prop:table': 'mapVocab.prop.table',
	'prop:chair': 'mapVocab.prop.chair',
	'prop:bed': 'mapVocab.prop.bed',
	'prop:bookshelf': 'mapVocab.prop.bookshelf',
	'prop:crate': 'mapVocab.prop.crate',
	'prop:barrel': 'mapVocab.prop.barrel',
	'prop:altar': 'mapVocab.prop.altar',
	'prop:chest': 'mapVocab.prop.chest',
	'prop:coins': 'mapVocab.prop.coins',
	'prop:gem': 'mapVocab.prop.gem',
	'prop:urn': 'mapVocab.prop.urn',
	'prop:door-frame': 'mapVocab.prop.doorFrame',
	'prop:double-doors': 'mapVocab.prop.doubleDoors',
	'prop:secret-panel': 'mapVocab.prop.secretPanel',
	'prop:portcullis': 'mapVocab.prop.portcullis',
	'prop:stairs-up': 'mapVocab.prop.stairsUp',
	'prop:stairs-down': 'mapVocab.prop.stairsDown',
	'prop:spiral-stairs': 'mapVocab.prop.spiralStairs',
	'prop:ladder': 'mapVocab.prop.ladder',
	'prop:brazier': 'mapVocab.prop.brazier',
	'prop:campfire': 'mapVocab.prop.campfire',
	'prop:torch': 'mapVocab.prop.torch',
	'prop:chandelier': 'mapVocab.prop.chandelier',
	'prop:pillar': 'mapVocab.prop.pillar',
	'prop:statue': 'mapVocab.prop.statue',
	'prop:well': 'mapVocab.prop.well',
	'prop:fountain': 'mapVocab.prop.fountain',
};

/** The shelf headings in the Assets panel's category rail. */
export const PROP_CATEGORY_LABEL_KEYS: Readonly<Record<PropCategoryId, MessageKey>> = {
	furniture: 'mapVocab.propCategory.furniture',
	foliage: 'mapVocab.propCategory.foliage',
	rubble: 'mapVocab.propCategory.rubble',
	treasure: 'mapVocab.propCategory.treasure',
	doors: 'mapVocab.propCategory.doors',
	stairs: 'mapVocab.propCategory.stairs',
	light: 'mapVocab.propCategory.light',
	structure: 'mapVocab.propCategory.structure',
};

/** The label for a catalogue entry: the localized name, or the catalogue's English name. */
export function propLabel(entry: PropCatalogEntry, t: (key: MessageKey) => string): string {
	const key = PROP_LABEL_KEYS[entry.id];
	return key ? t(key) : entry.name;
}

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
