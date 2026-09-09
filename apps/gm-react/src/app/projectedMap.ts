import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	type ActorId,
	type CoreStateSlice,
	type MapCombatTokenView,
	type MapFogView,
	type MapPoiView,
	type MapTokenView,
} from '@dndtools/core';
import { pickRasterAssetId } from './mapGeometry';

/**
 * PLAYER-SAFETY GATE for raster map assets.
 *
 * A map's raster bytes are DM authoring content until the DM explicitly projects that map to a
 * player (`session.set-active-map` + `session.project-active-map`). This resolver is the ONLY path
 * by which a raster asset id may enter a player view-model, and it is gated on the SAME delivery
 * state the core's map queries use (`deliveredMapIdsForActor` — the per-actor active-map projection
 * / player-view assignment). A map that is not actively projected to this viewer yields `null`, so
 * its raster reference (and therefore its bytes) never reaches the player device's view-model —
 * fail closed by construction, not by UI hiding.
 *
 * Pure over `(state, viewer)`; resolves METADATA only (the asset id). Byte resolution happens on
 * the rendering device through the content-addressed asset store, and only for ids this gate let
 * through.
 */
export interface ProjectedMapInfo {
	mapId: string;
	name: string;
	/** Content-addressed raster asset id, or null when the projected map has no raster base layer. */
	rasterAssetId: string | null;
	/**
	 * RC-CLD-3.2 — the projected map's ACTOR-FILTERED overlay, so the player companion draws the same
	 * map the DM projected rather than a bare picture: the fog ops, POIs, tokens and combat tokens the
	 * core already decided this viewer may see. Taken verbatim from the SAME `getMapViewForActor` call
	 * the gate below already makes — no second visibility decision is taken here or in the UI.
	 */
	fog: MapFogView[];
	pois: MapPoiView[];
	tokens: MapTokenView[];
	combatTokens: MapCombatTokenView[];
}

export function resolveProjectedMapForViewer(
	state: CoreStateSlice,
	viewer: ActorId,
): ProjectedMapInfo | null {
	// Gate 1 — an explicit, per-actor delivery must exist (the DM projected a map to THIS viewer).
	const delivered = deliveredMapIdsForActor(state.session, viewer);
	const projection = state.session.activeMapProjections[viewer];
	const mapId = projection?.mapId ?? [...delivered][0] ?? null;
	if (!mapId || !delivered.has(mapId)) return null;

	// Gate 2 — the map itself must be visible to the viewer through the actor-filtered query (a
	// projection to a map the viewer may not see collapses to unavailable — nothing leaks).
	// `combat` is passed so a combatant standing on the projected map appears for the player exactly as
	// the combat tracker already allows — the core filters it; a hidden foe is absent, never redacted.
	const view = getMapViewForActor(state.maps, state.permissions, viewer, mapId, {
		deliveredMapIds: delivered,
		combat: state.session.combat,
	});
	if (view.kind !== 'available') return null;

	const entity = state.maps.maps[mapId];
	return {
		mapId,
		name: view.name,
		rasterAssetId: entity ? pickRasterAssetId(entity.assetIds, state.maps.assets) : null,
		fog: view.fog,
		pois: view.pois,
		tokens: view.tokens,
		combatTokens: view.combatTokens,
	};
}
