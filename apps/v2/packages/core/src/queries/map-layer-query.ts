import type { ActorId } from '../state/ids';
import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import { sortedLayers } from '../state/map-layers';
import type { EntityVisibilityMetadata } from '../permissions/visibility-filter';
import type { VisibilitySurfaceRef } from '../permissions/visibility-invalidation';
import type { Actor, PermissionState } from '../state/permission-state';

/**
 * MAP-007 — tag / query layers by type and metadata WITHOUT reading hidden layer data into a player
 * context. This is a VISIBILITY-FILTERED, FAIL-CLOSED query: a non-DM actor's result contains only
 * the layers that actor may see, and a hidden layer that matches the query is OMITTED entirely (not
 * redacted-in-place) so its existence, name, tags, and query metadata never leak (Contract 3 Axis 1;
 * MAP-007 AC2).
 *
 * Visibility precedence here composes with the same model the active-map projection uses
 * (`getActiveMapViewForActor`) and the PERM visibility engine: a layer is visible to a non-DM iff
 *   - the map itself is visible to them, AND
 *   - the layer's player-facing `visibility` is `player-visible`, OR `shared` and explicitly
 *     delivered to them (a player-view / active-map projection records the delivery).
 * Anything else (including absent/unknown ⇒ `dm-only` by the SceneVisibility default) is hidden.
 *
 * The DM receives every matching layer, with the same query semantics, plus the hidden-match count so
 * the authoring UI can show "3 layers (1 hidden from players)" without the non-DM result ever seeing
 * those hidden layers.
 */

/** A single layer in a query result. For a non-DM result this is ALWAYS a visible layer. */
export interface MapLayerQueryEntry {
	mapId: string;
	layerId: string;
	name: string;
	category: MapLayer['category'];
	visibility: MapLayer['visibility'];
	enabled: boolean;
	opacity: number;
	tags: string[];
	query: Record<string, string>;
	locked: boolean;
	order: number;
}

export interface MapLayerQueryResult {
	/** Matching layers the actor may see, in render order. Never includes a hidden layer. */
	layers: MapLayerQueryEntry[];
	/**
	 * Number of layers that matched the query but are hidden from this actor. ALWAYS 0 for a non-DM
	 * actor (the count itself could leak existence); populated for the DM so the authoring UI can
	 * surface how many matches are player-hidden.
	 */
	hiddenMatchCount: number;
}

/** A query is a set of tag matches and/or query-facet matches, all of which must hold (AND). */
export interface MapLayerQuery {
	/** Map to scope to. When omitted, all actor-visible maps are searched. */
	mapId?: string;
	/** Layer categories to include (OR within the set). Omit to include any category. */
	categories?: MapLayer['category'][];
	/** Tags that must ALL be present on the layer (exact match). */
	tags?: string[];
	/** Query facets that must ALL match the layer's `query` (exact key=value). */
	facets?: Record<string, string>;
}

/** Whether the MAP ENTITY is visible to the actor. Mirrors the active-map / atlas filter. */
function mapVisibleToActor(map: MapEntity, actor: Actor, delivered: boolean): boolean {
	if (actor.role === 'dm') return true;
	if (map.visibility === 'dm-only') return false;
	if (map.visibility === 'player-visible') return true;
	return delivered; // `shared` map requires explicit delivery.
}

/** Whether the LAYER is visible to the actor, given the map is already visible. Fail-closed. */
function layerVisibleToActor(layer: MapLayer, actor: Actor, delivered: boolean): boolean {
	if (actor.role === 'dm') return true;
	if (layer.visibility === 'dm-only') return false;
	if (layer.visibility === 'player-visible') return true;
	return delivered; // `shared` layer requires explicit delivery.
}

function layerMatchesQuery(layer: MapLayer, query: MapLayerQuery): boolean {
	if (query.categories && query.categories.length > 0 && !query.categories.includes(layer.category)) {
		return false;
	}
	if (query.tags) {
		for (const tag of query.tags) {
			if (!layer.tags.includes(tag)) return false;
		}
	}
	if (query.facets) {
		for (const [key, value] of Object.entries(query.facets)) {
			if (layer.query[key] !== value) return false;
		}
	}
	return true;
}

function toEntry(map: MapEntity, layer: MapLayer): MapLayerQueryEntry {
	return {
		mapId: map.id,
		layerId: layer.id,
		name: layer.name,
		category: layer.category,
		visibility: layer.visibility,
		enabled: layer.enabled,
		opacity: layer.opacity,
		tags: [...layer.tags],
		query: { ...layer.query },
		locked: layer.locked,
		order: layer.order,
	};
}

/**
 * Resolve which `shared` map/layer surfaces are DELIVERED to the actor. A `shared` surface is hidden
 * unless explicitly delivered; we derive delivery from the session's active-map projections so the
 * query composes with the projection model rather than inventing a parallel notion of delivery.
 *
 * The caller passes the set of map ids this actor currently has delivered (e.g. via an active-map
 * projection). Keeping it an explicit input keeps the query pure and lets callers feed delivery from
 * whatever channel applies (active-map projection, player-view assignment, viewer grant).
 */
export interface MapLayerQueryOptions {
	/** Map ids the actor has an explicit `shared`-delivery for. Absent ⇒ no `shared` delivery. */
	deliveredMapIds?: ReadonlySet<string> | string[];
}

function isDelivered(mapId: string, options: MapLayerQueryOptions | undefined): boolean {
	const delivered = options?.deliveredMapIds;
	if (!delivered) return false;
	return Array.isArray(delivered) ? delivered.includes(mapId) : delivered.has(mapId);
}

/**
 * Run a tag/metadata layer query for an actor. The result is visibility-filtered and fail-closed:
 *
 *   - DM ⇒ every matching layer across the scoped maps, plus `hiddenMatchCount` for the player-hidden
 *     matches (so the DM authoring UI can show how many are hidden from players).
 *   - non-DM ⇒ ONLY the layers that actor may see; hidden matches are omitted, and `hiddenMatchCount`
 *     is 0 (the count would itself leak existence). An unknown actor receives an empty result.
 */
export function queryMapLayers(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	query: MapLayerQuery,
	options?: MapLayerQueryOptions,
): MapLayerQueryResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { layers: [], hiddenMatchCount: 0 };

	const scopedMaps = query.mapId
		? maps.maps[query.mapId]
			? [maps.maps[query.mapId]!]
			: []
		: Object.values(maps.maps);

	const result: MapLayerQueryEntry[] = [];
	let hiddenMatchCount = 0;

	for (const map of scopedMaps) {
		const delivered = isDelivered(map.id, options);
		const mapVisible = mapVisibleToActor(map, actor, delivered);
		// A non-DM cannot see ANY layer of a map they cannot see; for the DM the map is always visible.
		for (const layer of sortedLayers(map)) {
			if (!layerMatchesQuery(layer, query)) continue;
			const visible = mapVisible && layerVisibleToActor(layer, actor, delivered);
			if (visible) {
				result.push(toEntry(map, layer));
			} else if (actor.role === 'dm') {
				// Unreachable for the DM (always visible), kept for completeness/typing.
				hiddenMatchCount += 1;
			} else {
				// Non-DM hidden match: OMIT entirely. Count is NOT exposed to a non-DM (stays 0).
				continue;
			}
		}
	}

	// For the DM, also report how many matching layers are hidden FROM PLAYERS (player-facing
	// `dm-only`, or `shared` with no general delivery). This is a DM-only authoring aid and never
	// reaches a non-DM caller.
	if (actor.role === 'dm') {
		hiddenMatchCount = 0;
		for (const map of scopedMaps) {
			for (const layer of map.layers) {
				if (!layerMatchesQuery(layer, query)) continue;
				if (layer.visibility === 'dm-only' || layer.visibility === 'shared') hiddenMatchCount += 1;
			}
		}
	}

	return { layers: result, hiddenMatchCount };
}

/**
 * Cache-invalidation bridge (PERM-012 / Contract 3 Session Join rule 4): project each map + layer
 * into the granular-visibility metadata + surface refs the EXISTING visibility cache
 * (`visibility-invalidation.ts`, whose trigger list already names "visibility") consumes, so a layer
 * player-visibility change flows into that engine WITHOUT a parallel one. Feeding the
 * before/after metadata + surfaces into `invalidateVisibilityCache` invalidates EXACTLY the
 * participants whose view of an affected layer changed (and never the DM, who sees everything).
 *
 * Each map becomes an entity `map:<mapId>` whose entity-level rule is the map visibility; each layer
 * becomes a SECTION (`layer:<layerId>`) of its map whose rule is the layer's player-facing
 * visibility. A non-DM cannot see a section under a hidden map (hidden-ancestor-wins), so a layer on
 * a `dm-only` map stays hidden, matching the query. This makes the visibility cache the single source
 * of map-layer visibility-invalidation truth.
 *
 * Note: `order`/`opacity`/`enabled` are PRESENTATION axes, not visibility — they do not change what a
 * participant may SEE, so they are intentionally NOT folded into the visibility fingerprint. The
 * rendered map view-model already reflects them on the next query, so no stale cache can serve them.
 */
export function mapLayerVisibilityMetadata(maps: MapState): EntityVisibilityMetadata[] {
	return Object.values(maps.maps).map((map) => {
		const sections: Record<string, { level: MapLayer['visibility'] }> = {};
		for (const layer of map.layers) {
			sections[`layer:${layer.id}`] = { level: layer.visibility };
		}
		return {
			entityType: 'map',
			entityId: map.id,
			entity: { level: map.visibility },
			sections,
		};
	});
}

/** The surface refs (one per layer, plus the map entity) the visibility cache tracks for a map set. */
export function mapLayerVisibilitySurfaces(maps: MapState): VisibilitySurfaceRef[] {
	const surfaces: VisibilitySurfaceRef[] = [];
	for (const map of Object.values(maps.maps)) {
		surfaces.push({ entityType: 'map', entityId: map.id });
		for (const layer of map.layers) {
			surfaces.push({ entityType: 'map', entityId: map.id, sectionId: `layer:${layer.id}` });
		}
	}
	return surfaces;
}
