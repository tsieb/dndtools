import type { MapEditorApi } from './useMapEditor';

/**
 * RC-UX-2.2 — the accessible name of the map editor's `role="application"` canvas.
 *
 * `application` hands every key to the editor and stops describing content, so the name is the one
 * thing a screen reader says on entry. It carries the map's name, how much is on it (the same
 * counts, in the same catalog words, as the List view's region — `mapList.summary`), and which tool
 * is armed. The counts are read from `editor.map`, the actor-filtered view, so a player preview
 * never counts a hidden POI it could not otherwise know exists.
 *
 * The contents themselves are NOT in the name: the List view (header toggle) is the full non-visual
 * path through them.
 */
export function mapCanvasLabel(editor: Pick<MapEditorApi, 'map' | 'toolLabel' | 't'>): string {
	const { map, toolLabel, t } = editor;
	const counts = t('mapList.summary', {
		pois: map?.pois.length ?? 0,
		tokens: map?.tokens.length ?? 0,
		routes: map?.routes.length ?? 0,
		layers: map?.layers.length ?? 0,
	});
	return `Map canvas — ${map?.name ?? 'map'}. ${counts} Drawing tool: ${toolLabel}.`;
}
