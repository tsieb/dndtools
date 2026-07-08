/**
 * Map accessibility summary + fog-of-war safety (UX-A11Y-005).
 *
 * The non-visual access path for maps: a structured summary of the visible POIs, routes, and areas,
 * computed from the PLAYER-VISIBLE layer. The map element itself gets a concise `aria-label` (name +
 * scale, never content); the content lives in this summary so a screen-reader user can browse and
 * activate POIs without seeing the image.
 *
 * NO-LEAK / fog safety (UX-A11Y-008, principle 8): the summary is built by FILTERING POIs/routes/areas
 * through `filterVisibleForViewer` first, so a Player summary contains exactly the player-visible
 * POIs and zero DM-only ones, and fog-of-war state is never exposed. Fog announcements name only a
 * change the viewer may perceive: a reveal is announced to a Player only when the area is now visible
 * to them; a HIDE is NEVER announced to a Player (naming a now-hidden area would leak its existence).
 *
 * Pure — no DOM. `MapSummary.svelte` renders this model; surfaces feed fog announcements to the
 * shared LiveAnnouncer.
 */

import {
	filterVisibleForViewer,
	isDm,
	type Viewer,
	type VisibilityClassification,
} from './visibility-boundary';

export interface MapPoiInput extends VisibilityClassification {
	id: string;
	name: string;
	type: string;
	description?: string;
}

export interface MapRouteInput extends VisibilityClassification {
	id: string;
	name: string;
	from: string;
	to: string;
}

export interface MapAreaInput extends VisibilityClassification {
	id: string;
	name: string;
	type: string;
}

export interface MapSummaryInput {
	mapName: string;
	/** Optional scale/kind descriptor, e.g. "dungeon map", woven into the concise map label. */
	scale?: string;
	pois: readonly MapPoiInput[];
	routes: readonly MapRouteInput[];
	areas: readonly MapAreaInput[];
}

export interface MapSummaryPoi {
	id: string;
	accessibleName: string;
	type: string;
	description?: string;
}

export interface MapSummaryRoute {
	id: string;
	accessibleName: string;
}

export interface MapSummaryArea {
	id: string;
	accessibleName: string;
	type: string;
}

export interface MapSummaryModel {
	/** Concise map `aria-label`, e.g. "Map: Undermountain Level 1 — dungeon map". Content-free. */
	mapLabel: string;
	/** Summary panel landmark label. */
	panelLabel: string;
	pois: MapSummaryPoi[];
	routes: MapSummaryRoute[];
	areas: MapSummaryArea[];
	/** Live-region count string. */
	countLabel: string;
	/** No visible POIs/routes/areas for this viewer. */
	empty: boolean;
}

/** The concise, content-free map label (UX-A11Y-005 map alt text). */
export function mapAccessibleLabel(mapName: string, scale?: string): string {
	const name = mapName.trim() || 'Untitled map';
	const suffix = scale?.trim() ? ` — ${scale.trim()}` : '';
	return `Map: ${name}${suffix}`;
}

/**
 * Build the map accessibility summary for a viewer. Every list is visibility-filtered first; the
 * Player summary is computed from the player-visible layer and contains zero DM-only POIs/routes/areas
 * and no fog state (UX-A11Y-005 AC1).
 */
export function buildMapSummary(input: MapSummaryInput, viewer: Viewer): MapSummaryModel {
	const pois = filterVisibleForViewer(input.pois, viewer).map(
		(poi): MapSummaryPoi => ({
			id: poi.id,
			accessibleName: `${poi.name}, ${poi.type}`,
			type: poi.type,
			...(poi.description?.trim() ? { description: poi.description.trim() } : {}),
		}),
	);
	const routes = filterVisibleForViewer(input.routes, viewer).map(
		(route): MapSummaryRoute => ({
			id: route.id,
			accessibleName: `${route.name}: ${route.from} to ${route.to}`,
		}),
	);
	const areas = filterVisibleForViewer(input.areas, viewer).map(
		(area): MapSummaryArea => ({
			id: area.id,
			accessibleName: `${area.name}, ${area.type}`,
			type: area.type,
		}),
	);

	const total = pois.length + routes.length + areas.length;
	const empty = total === 0;
	const countLabel = empty
		? 'No visible points of interest'
		: `${pois.length} point${pois.length === 1 ? '' : 's'} of interest, ${routes.length} route${
				routes.length === 1 ? '' : 's'
			}, ${areas.length} area${areas.length === 1 ? '' : 's'}`;

	return {
		mapLabel: mapAccessibleLabel(input.mapName, input.scale),
		panelLabel: 'Map accessibility summary',
		pois,
		routes,
		areas,
		countLabel,
		empty,
	};
}

export type FogChangeKind = 'reveal' | 'hide';

export interface FogChange {
	kind: FogChangeKind;
	/** The area whose fog changed, classified at its POST-change visibility. */
	area: MapAreaInput;
}

/**
 * Fog-of-war announcement for a viewer, or `null` when nothing may be said to them.
 *
 *   - DM ⇒ "Area revealed: X" / "Area hidden: X" (the DM sees all fog state).
 *   - non-DM, reveal ⇒ "Area revealed: X" ONLY when the area is now visible to them; else `null`.
 *   - non-DM, hide ⇒ ALWAYS `null` — naming a now-hidden area would leak its existence/name to the
 *     player (UX-A11Y-005 AC3). The player simply hears nothing about the hidden area.
 */
export function fogChangeAnnouncement(change: FogChange, viewer: Viewer): string | null {
	if (isDm(viewer)) {
		return change.kind === 'reveal'
			? `Area revealed: ${change.area.name}.`
			: `Area hidden: ${change.area.name}.`;
	}
	if (change.kind === 'hide') return null;
	// reveal: only when the area is now visible to this viewer.
	const visible = filterVisibleForViewer([change.area], viewer).length === 1;
	return visible ? `Area revealed: ${change.area.name}.` : null;
}

/**
 * Polite announcement when a POI is activated from the summary and the viewport centres on it. Only
 * call with a POI already present in the viewer's filtered summary (UX-A11Y-005 AC4).
 */
export function poiActivationAnnouncement(poi: Pick<MapSummaryPoi, 'accessibleName'>): string {
	return `Centred on ${poi.accessibleName}.`;
}
