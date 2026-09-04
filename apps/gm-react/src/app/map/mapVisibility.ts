import { type MapPoiCategory, type MapLayerCategory, type SceneVisibility } from '@dndtools/core';

/* The map vocabulary shared by the builder, the editor and the Atlas: tool ids, the layer-category
 * colour/label tables and the core-visibility ⇄ design-system chip translation. Extracted from
 * MapBuilder.tsx unchanged (RC-STB-2.6). */

export type MapTool = 'select' | 'pan' | 'poi' | 'token' | 'fog';
export type FogShape = 'rect' | 'polygon' | 'brush';

// ── Shared vocabulary (also imported by Atlas) ──────────────────────────────────────────────────

/** Layer-type → `--layer-*` hue map (mirrors the archived Svelte MapLayerPanel.svelte CATEGORY tones). */
export const CATEGORY_VAR: Record<MapLayerCategory, string> = {
	base: '--layer-base',
	terrain: '--layer-height',
	roads: '--layer-roads',
	poi: '--layer-poi',
	fog: '--layer-fog',
	'dm-annotations': '--layer-dm',
	'player-overlay': '--layer-player',
};
export const CATEGORY_LABEL: Record<MapLayerCategory, string> = {
	base: 'Base',
	terrain: 'Terrain',
	roads: 'Roads',
	poi: 'POI',
	fog: 'Fog',
	'dm-annotations': 'DM notes',
	'player-overlay': 'Player overlay',
};
export const VIS_LABEL: Record<string, string> = {
	'dm-only': 'DM only',
	'player-visible': 'Player visible',
	shared: 'Shared',
};
export const VIS_STATUS: Record<string, 'neutral' | 'info' | 'success'> = {
	'dm-only': 'neutral',
	'player-visible': 'info',
	shared: 'success',
};
export const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Player visible' },
	{ value: 'shared', label: 'Shared' },
];
/** Core visibility → the safety-critical VisibilityChip level (same map as Knowledge/Campaign).
 *  `shared` reads as "players can see it" — the chip's players level is the honest signal. */
export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};

/** Core POI category → the DS POIMarker/POIPopover glyph family (the DS knows 6 tones, core 9). */
export const POI_MARKER_CAT: Record<MapPoiCategory, string> = {
	settlement: 'location',
	landmark: 'location',
	dungeon: 'danger',
	quest: 'quest',
	hazard: 'danger',
	shop: 'treasure',
	npc: 'npc',
	note: 'note',
	other: 'location',
};

/** Core visibility ↔ the DS POIPopover's segmented values (`players` vs core `player-visible`). */
export function visToDs(v: SceneVisibility): string {
	return v === 'player-visible' ? 'players' : v;
}
export function dsToVis(v: string): SceneVisibility {
	return (v === 'players' ? 'player-visible' : v) as SceneVisibility;
}
