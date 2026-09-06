import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import { sortedLayers } from '../state/map-layers';
import { mapVisibleToActor } from './map-visibility';
import type {
	MapFogOp,
	MapPoi,
	MapRoute,
	MapRouteWaypoint,
	MapToken,
} from '../state/map-annotations';
import { cloneFogRegion } from '../state/map-annotations';
import type { MapOverlaySettings, MapOverlayMode } from '../state/map-overlay-modes';
import { measureRoute, type RouteMeasurement, type TravelSpeed } from '../state/map-travel';
import type {
	Combatant,
	CombatantKind,
	CombatToken,
	SessionCombatState,
} from '../state/combat-tracker';
import { actorCanSeeCombatant, actorMayMoveCombatantToken } from './combat-tracker-view';

/**
 * MAP-018 — THE single actor-filtered map query model. This is the KEYSTONE of the epic's non-leak
 * guarantee (Architecture Contract 1 Processing Core; Contract 3 Visibility): EVERY map surface —
 * the renderer, search, the graph, a widget binding, an MCP response, and a deep link — consumes
 * THIS model, never raw `MapState`. Because there is exactly ONE filtered read path, a `dm-only` POI,
 * a concealed fog region, a hidden route, or a hidden token CANNOT leak through one surface while
 * being blocked on another.
 *
 * Effective visibility precedence (hidden-ancestor-wins, matching `getActiveMapViewForActor` and the
 * PERM visibility engine):
 *   1. The MAP must be visible to the actor (DM: always; player: `player-visible`, or `shared` when
 *      delivered through an active-map projection / player-view).
 *   2. The annotation's LAYER must be visible to the actor (a `dm-only` layer hides everything on it).
 *   3. The annotation's OWN `visibility` must be player-facing.
 * An annotation is returned to a non-DM ONLY when all three hold; otherwise it is OMITTED ENTIRELY
 * (never redacted in place) so its id, label, notes, and coordinates never appear. Fail-closed: an
 * unknown actor receives an empty view; absent/unknown visibility collapses to `dm-only`.
 *
 * The DM receives the full, unfiltered model plus hidden-count aggregates so the authoring UI can
 * show "2 POIs (1 hidden from players)" WITHOUT the non-DM result ever carrying those hidden items.
 *
 * This module is pure Processing-Core policy. It derives route measurements (MAP-013) from the map
 * scale so the same model the renderer draws also carries deterministic distance/travel-time.
 */

/** A POI as projected to an actor. For a non-DM result this is ALWAYS a visible POI. */
export interface MapPoiView {
	id: string;
	layerId: string;
	label: string;
	category: MapPoi['category'];
	position: { x: number; y: number };
	visibility: MapPoi['visibility'];
	/** DM/author notes — present for the DM; for a player it is only ever a player-visible POI's notes. */
	notes: string;
	linkedEntityType: string | null;
	linkedEntityId: string | null;
}

/** A route as projected to an actor, with its DERIVED measurement (MAP-013). */
export interface MapRouteView {
	id: string;
	layerId: string;
	label: string;
	visibility: MapRoute['visibility'];
	waypoints: MapRouteWaypoint[];
	/** Deterministic distance/travel-time derived from the waypoints + map scale (+ optional speed). */
	measurement: RouteMeasurement;
}

/** A fog op as projected to an actor. A non-DM only ever sees fog ops they may see. */
export interface MapFogView {
	id: string;
	layerId: string;
	kind: MapFogOp['kind'];
	/** The fog region (rect / polygon / stroke; legacy untagged rects stay valid). */
	region: MapFogOp['region'];
	/** Optional soft-edge feather width (0..0.2), when the op recorded one. */
	feather?: number;
	visibility: MapFogOp['visibility'];
	sequence: number;
}

/** A token as projected to an actor. A non-DM only ever sees tokens they're permitted to see. */
export interface MapTokenView {
	id: string;
	layerId: string;
	label: string;
	linkedActorId: string | null;
	position: { x: number; y: number };
	size: number;
	visibility: MapToken['visibility'];
	/** The actor permitted to move this token (DM always; this player when set) — MAP-019 AC4. */
	controllerActorId: string | null;
	/** Whether the VIEWING actor may move this token (DM, or the declared controller). */
	canMove: boolean;
}

/**
 * RC-MAP-1.1 — a COMBAT TOKEN as projected to an actor: where a combatant in the running combat is
 * standing on this map. It is a JOIN, not a second source of truth — the placement comes from the
 * session's combat slice and the visibility comes from the SAME rule the combat tracker applies, so a
 * combatant the tracker withholds can never appear here.
 *
 * A hidden foe is ABSENT from a player's list entirely. There is deliberately no redacted variant:
 * the tracker can show a placeholder ROW because a row only reveals that someone is in the initiative
 * order, but a placeholder TOKEN would reveal that something unknown is standing at (x, y) — which is
 * most of what the DM was hiding.
 */
export interface MapCombatTokenView {
	/** The combatant this token stands for; the join key back to the combat tracker view. */
	combatantId: string;
	name: string;
	kind: CombatantKind;
	/** The character entity behind this combatant, or null for an inline NPC/monster. */
	characterId: string | null;
	position: { x: number; y: number };
	/** Footprint in grid cells (1 = Medium). */
	size: number;
	/** Facing in degrees clockwise from north, or null when the combatant has no facing. */
	facing: number | null;
	/** True when it is this combatant's turn — the active-turn ring the canvas draws. */
	isActive: boolean;
	/** Whether the VIEWING actor may move this token (DM, or the combatant's combat-participant). */
	canMove: boolean;
}

/** A visible layer in the actor-filtered map view (render order). */
export interface MapLayerView {
	id: string;
	name: string;
	category: MapLayer['category'];
	visibility: MapLayer['visibility'];
	opacity: number;
	enabled: boolean;
	order: number;
}

/** Hidden-count aggregates, populated ONLY for the DM (a non-DM sees zeros — counts would leak). */
export interface MapHiddenCounts {
	layers: number;
	pois: number;
	routes: number;
	fog: number;
	tokens: number;
	/** RC-MAP-1.1 — combat tokens on this map belonging to combatants hidden from players. */
	combatTokens: number;
}

/** The actor-filtered view of one map. Every list is already visibility-filtered. */
export interface MapView {
	kind: 'available';
	mapId: string;
	name: string;
	description: string;
	visibility: MapEntity['visibility'];
	scale: MapEntity['scale'];
	/** The combat overlay settings (mode + grid prerequisite state) — MAP-014. */
	overlay: MapOverlaySettings;
	layers: MapLayerView[];
	pois: MapPoiView[];
	routes: MapRouteView[];
	fog: MapFogView[];
	tokens: MapTokenView[];
	/**
	 * RC-MAP-1.1 — the running combat's tokens standing on THIS map, already filtered to the
	 * combatants this actor may see. Empty when no combat is running or none of its combatants are
	 * on this map.
	 */
	combatTokens: MapCombatTokenView[];
	/** DM-only hidden counts (all zero for a non-DM). */
	hidden: MapHiddenCounts;
}

/** A map that is hidden from the actor or missing collapses to a generic unavailable result so a
 *  player cannot tell "hidden from you" from "does not exist" (Contract 3; mirrors the deep-link). */
export type MapViewResult = MapView | { kind: 'unavailable'; mapId: string };

export interface MapQueryOptions {
	/** Map ids the actor has an explicit `shared`-delivery for (active-map projection / player-view). */
	deliveredMapIds?: ReadonlySet<string> | string[];
	/** Optional travel speed used to derive route travel time (MAP-013). */
	travelSpeed?: TravelSpeed | null;
	/**
	 * RC-MAP-1.1 — the session's combat slice, so the running combat's tokens are joined into the
	 * view. Omitted ⇒ no combat tokens (a caller that does not pass combat cannot leak one).
	 */
	combat?: SessionCombatState;
	/**
	 * The current time (`env.clock()`), used when evaluating an actor's combat-participant grant so an
	 * EXPIRED grant is inert. Omitted ⇒ expiry is not evaluated (PERM-004 fail-closed convention).
	 */
	now?: string;
}

function isDelivered(mapId: string, options: MapQueryOptions | undefined): boolean {
	const delivered = options?.deliveredMapIds;
	if (!delivered) return false;
	return Array.isArray(delivered) ? delivered.includes(mapId) : delivered.has(mapId);
}

/** Whether a player-facing visibility level is visible to the actor, given the map is visible. */
function levelVisibleToActor(
	level: MapLayer['visibility'],
	actor: Actor,
	delivered: boolean,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (level === 'dm-only') return false;
	if (level === 'player-visible') return true;
	return delivered; // `shared` requires explicit delivery.
}

/**
 * Resolve which delivered map ids this actor has from the session's active-map projections and
 * player-view map-region assignments, so `shared` surfaces follow the SAME delivery model the
 * projection uses. Callers can also pass explicit `deliveredMapIds`; the two are unioned.
 */
export function deliveredMapIdsForActor(
	session: SessionState | undefined,
	actorId: ActorId,
): Set<string> {
	const delivered = new Set<string>();
	if (!session) return delivered;
	const projection = session.activeMapProjections[actorId];
	if (projection) delivered.add(projection.mapId);
	const assignment = session.playerViewAssignments[actorId];
	if (assignment?.target.mapRegion) delivered.add(assignment.target.mapRegion.mapId);
	return delivered;
}

/**
 * Count the layers/annotations hidden from the GENERAL player view (player-facing visibility only:
 * `player-visible` survives, `dm-only`/`shared` are hidden, hidden-ancestor-wins via the layer).
 * DM-only authoring aid; never reaches a non-DM caller.
 */
function countHiddenFromPlayers(
	map: MapEntity,
	combat: SessionCombatState | undefined,
): MapHiddenCounts {
	const playerVisibleLayerIds = new Set(
		map.layers.filter((layer) => layer.visibility === 'player-visible').map((layer) => layer.id),
	);
	const surfaceHidden = (layerId: string, level: MapLayer['visibility']): boolean =>
		!playerVisibleLayerIds.has(layerId) || level !== 'player-visible';
	return {
		layers: map.layers.filter((layer) => layer.visibility !== 'player-visible').length,
		pois: map.pois.filter((poi) => surfaceHidden(poi.layerId, poi.visibility)).length,
		routes: map.routes.filter((route) => surfaceHidden(route.layerId, route.visibility)).length,
		fog: map.fog.filter((op) => surfaceHidden(op.layerId, op.visibility)).length,
		tokens: map.tokens.filter((token) => surfaceHidden(token.layerId, token.visibility)).length,
		// RC-MAP-1.1 — combat tokens on this map whose combatant is hidden from players. The DM needs to
		// know the ambushers are placed even though no player view will draw them.
		combatTokens: liveCombatTokenEntries(combat, map.id).filter(([, combatant]) => combatant.hidden)
			.length,
	};
}

/**
 * RC-MAP-1.1 — the running combat's placed tokens on one map, in INITIATIVE order, paired with their
 * combatant. Returns nothing unless combat is actually `running`: an ended combat keeps its placements
 * for the archive, but a finished fight must not keep drawing tokens over a live map. Pure.
 */
function liveCombatTokenEntries(
	combat: SessionCombatState | undefined,
	mapId: string,
): Array<[CombatToken, Combatant]> {
	if (!combat || combat.status !== 'running') return [];
	const entries: Array<[CombatToken, Combatant]> = [];
	for (const combatantId of combat.order) {
		const token = combat.tokens[combatantId];
		if (!token || token.mapId !== mapId) continue;
		const combatant = combat.combatants[combatantId];
		if (!combatant) continue;
		entries.push([token, combatant]);
	}
	return entries;
}

/**
 * MAP-018 — build the actor-filtered view of ONE map. Returns a generic `unavailable` when the actor
 * cannot see the map (indistinguishable from missing). For a visible map, every annotation list is
 * filtered through the map→layer→annotation precedence; the DM additionally receives hidden counts.
 */
export function getMapViewForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	mapId: string,
	options?: MapQueryOptions,
): MapViewResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'unavailable', mapId };
	const map = maps.maps[mapId];
	if (!map) return { kind: 'unavailable', mapId };

	const delivered = isDelivered(map.id, options);
	if (!mapVisibleToActor(map, actor, delivered)) {
		return { kind: 'unavailable', mapId };
	}

	const isDm = hasDmAuthority(actor.role);

	// Which layers the actor may see — the precedence root for every annotation on this map.
	const visibleLayerIds = new Set<string>();
	for (const layer of map.layers) {
		if (levelVisibleToActor(layer.visibility, actor, delivered)) visibleLayerIds.add(layer.id);
	}

	// An annotation is visible iff its layer is visible AND its own visibility is player-facing.
	const annotationVisible = (layerId: string, level: MapLayer['visibility']): boolean =>
		visibleLayerIds.has(layerId) && levelVisibleToActor(level, actor, delivered);

	const layers: MapLayerView[] = sortedLayers(map)
		.filter((layer) => visibleLayerIds.has(layer.id))
		.map((layer) => ({
			id: layer.id,
			name: layer.name,
			category: layer.category,
			visibility: layer.visibility,
			opacity: layer.opacity,
			enabled: layer.enabled,
			order: layer.order,
		}));

	const pois: MapPoiView[] = [];
	for (const poi of map.pois) {
		if (!annotationVisible(poi.layerId, poi.visibility)) continue;
		pois.push({
			id: poi.id,
			layerId: poi.layerId,
			label: poi.label,
			category: poi.category,
			position: { ...poi.position },
			visibility: poi.visibility,
			notes: poi.notes,
			linkedEntityType: poi.linkedEntityType,
			linkedEntityId: poi.linkedEntityId,
		});
	}

	const routes: MapRouteView[] = [];
	for (const route of map.routes) {
		if (!annotationVisible(route.layerId, route.visibility)) continue;
		routes.push({
			id: route.id,
			layerId: route.layerId,
			label: route.label,
			visibility: route.visibility,
			waypoints: route.waypoints.map((waypoint) => ({
				...waypoint,
				position: { ...waypoint.position },
			})),
			measurement: measureRoute(route.waypoints, map.scale, options?.travelSpeed ?? null),
		});
	}

	const fog: MapFogView[] = [];
	for (const op of map.fog) {
		if (!annotationVisible(op.layerId, op.visibility)) continue;
		fog.push({
			id: op.id,
			layerId: op.layerId,
			kind: op.kind,
			region: cloneFogRegion(op.region),
			...(op.feather !== undefined ? { feather: op.feather } : {}),
			visibility: op.visibility,
			sequence: op.sequence,
		});
	}

	const tokens: MapTokenView[] = [];
	for (const token of map.tokens) {
		if (!annotationVisible(token.layerId, token.visibility)) continue;
		tokens.push({
			id: token.id,
			layerId: token.layerId,
			label: token.label,
			linkedActorId: token.linkedActorId,
			position: { ...token.position },
			size: token.size,
			visibility: token.visibility,
			controllerActorId: token.controllerActorId,
			canMove: isDm || token.controllerActorId === actorId,
		});
	}

	// RC-MAP-1.1 — join the running combat's tokens. Visibility is NOT re-decided here: it is the SAME
	// `actorCanSeeCombatant` rule the combat tracker applies, so a combatant the tracker withholds from
	// this actor cannot appear on the map either. A combatant the viewer can only see as a PLACEHOLDER
	// row fails this check, so a hidden foe is ABSENT — never "unknown at (x, y)".
	const combatTokens: MapCombatTokenView[] = [];
	const combat = options?.combat;
	const activeCombatantId = combat ? (combat.order[combat.turn] ?? null) : null;
	for (const [token, combatant] of liveCombatTokenEntries(combat, map.id)) {
		if (!actorCanSeeCombatant(permissions, actor, combatant, options?.now)) continue;
		combatTokens.push({
			combatantId: combatant.id,
			name: combatant.name,
			kind: combatant.kind,
			characterId: combatant.characterId,
			position: { x: token.x, y: token.y },
			size: token.size,
			facing: token.facing ?? null,
			isActive: combatant.id === activeCombatantId,
			canMove: actorMayMoveCombatantToken(permissions, actor, combatant, options?.now),
		});
	}

	// DM-only hidden-count aggregates: how many layers/POIs/routes/fog/tokens are hidden FROM PLAYERS
	// (the general player view, before per-actor `shared` delivery). This is the authoring aid that
	// lets the DM UI show "2 POIs (1 hidden from players)" WITHOUT the non-DM result ever carrying the
	// hidden items. A non-DM receives all zeros — the count itself could leak existence. Mirrors the
	// layer query's `hiddenMatchCount`.
	const hidden: MapHiddenCounts = isDm
		? countHiddenFromPlayers(map, combat)
		: { layers: 0, pois: 0, routes: 0, fog: 0, tokens: 0, combatTokens: 0 };

	return {
		kind: 'available',
		mapId: map.id,
		name: map.name,
		description: map.description,
		visibility: map.visibility,
		scale: map.scale,
		overlay: map.overlay,
		layers,
		pois,
		routes,
		fog,
		tokens,
		combatTokens,
		hidden,
	};
}

/** A single search hit from the actor-filtered map search (MAP-018). Carries only visible content. */
export interface MapSearchHit {
	kind: 'poi' | 'route' | 'token';
	mapId: string;
	id: string;
	label: string;
	layerId: string;
}

/**
 * MAP-018 — actor-filtered map SEARCH. Searches POIs, routes, and tokens by label substring across
 * every map the actor may see, returning ONLY visible artifacts. It is built ON TOP of
 * {@link getMapViewForActor}, so a hidden POI/route/token is never even a candidate — the search
 * cannot return what the single filtered model already omitted. This is the contract that makes
 * "search never leaks a hidden POI" structurally true rather than a per-call check (MAP-018 AC1).
 */
export function searchMapsForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	query: string,
	options?: MapQueryOptions,
): MapSearchHit[] {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) return [];
	const hits: MapSearchHit[] = [];
	for (const mapId of Object.keys(maps.maps)) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, options);
		if (view.kind !== 'available') continue;
		for (const poi of view.pois) {
			if (poi.label.toLowerCase().includes(needle)) {
				hits.push({ kind: 'poi', mapId, id: poi.id, label: poi.label, layerId: poi.layerId });
			}
		}
		for (const route of view.routes) {
			if (route.label.toLowerCase().includes(needle)) {
				hits.push({
					kind: 'route',
					mapId,
					id: route.id,
					label: route.label,
					layerId: route.layerId,
				});
			}
		}
		for (const token of view.tokens) {
			if (token.label.toLowerCase().includes(needle)) {
				hits.push({
					kind: 'token',
					mapId,
					id: token.id,
					label: token.label,
					layerId: token.layerId,
				});
			}
		}
	}
	return hits;
}

/** A graph node/edge derived from the actor-filtered map view (MAP-018). Links a POI/route waypoint
 *  to its linked entity — only ever for VISIBLE annotations. */
export interface MapGraphEdge {
	mapId: string;
	fromKind: 'poi' | 'route-waypoint';
	fromId: string;
	toEntityType: string;
	toEntityId: string;
}

/**
 * MAP-018 — the actor-filtered map GRAPH relationships (POI→note, waypoint→POI/note). Built on the
 * same filtered view, so a hidden POI's link never appears as a graph edge for a player (MAP-011 AC3 /
 * MAP-018 AC1). A backlink FROM a note TO a hidden POI is likewise impossible because the hidden POI
 * is not in the view.
 */
export function mapGraphEdgesForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	options?: MapQueryOptions,
): MapGraphEdge[] {
	const edges: MapGraphEdge[] = [];
	for (const mapId of Object.keys(maps.maps)) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, options);
		if (view.kind !== 'available') continue;
		for (const poi of view.pois) {
			if (poi.linkedEntityType && poi.linkedEntityId) {
				edges.push({
					mapId,
					fromKind: 'poi',
					fromId: poi.id,
					toEntityType: poi.linkedEntityType,
					toEntityId: poi.linkedEntityId,
				});
			}
		}
		for (const route of view.routes) {
			for (const waypoint of route.waypoints) {
				if (waypoint.linkedEntityType && waypoint.linkedEntityId) {
					edges.push({
						mapId,
						fromKind: 'route-waypoint',
						fromId: waypoint.id,
						toEntityType: waypoint.linkedEntityType,
						toEntityId: waypoint.linkedEntityId,
					});
				}
			}
		}
	}
	return edges;
}

/**
 * A map entry as projected to an actor for listing (atlas landing / deep-link picker). Contains
 * ONLY the fields needed to enumerate and navigate to maps — no annotations, no hidden counts.
 * A non-DM entry is always a map the actor may see; a DM entry may include every map.
 */
export interface MapListEntry {
	id: string;
	name: string;
	description: string;
	defaultRegionId: string | null;
	visibility: MapEntity['visibility'];
}

/**
 * CON-001 / MAP-018 — return the actor-filtered LIST of maps visible to an actor. This is the
 * data-layer choke-point for the Atlas landing page map list (and any other surface that enumerates
 * maps): the GUI MUST call this function and render whatever it returns, rather than reading
 * `maps.maps` raw and filtering by `map.visibility` itself (which would make the GUI the
 * authoritative enforcement point — the CON-001 violation).
 *
 * Visibility is evaluated via the same {@link mapVisibleToActor} predicate used by
 * {@link getMapViewForActor}, so the list and the per-map detail view are always consistent:
 * a map that appears in the list will always resolve to `available` for this actor, and a map
 * that does NOT appear here will always resolve to `unavailable`. Sorted alphabetically by name.
 * Fail closed: an unknown actor sees an empty list.
 */
export function listMapsForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	options?: MapQueryOptions,
): MapListEntry[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const result: MapListEntry[] = [];
	for (const map of Object.values(maps.maps)) {
		const delivered = isDelivered(map.id, options);
		if (!mapVisibleToActor(map, actor, delivered)) continue;
		result.push({
			id: map.id,
			name: map.name,
			description: map.description,
			defaultRegionId: map.defaultRegionId,
			visibility: map.visibility,
		});
	}
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

/**
 * RC-MAP-1.4 — one visible crumb in an atlas breadcrumb trail (root-first).
 */
export interface MapBreadcrumbCrumb {
	mapId: string;
	name: string;
}

/**
 * RC-MAP-1.4 — the atlas breadcrumb trail for one map, root-first ending at the map itself. `available`
 * only when the target map is visible to the actor; a hidden/missing map collapses to `unavailable`
 * (indistinguishable from missing, matching {@link getMapViewForActor}).
 */
export type MapBreadcrumbResult =
	| { kind: 'available'; mapId: string; crumbs: MapBreadcrumbCrumb[] }
	| { kind: 'unavailable'; mapId: string };

/**
 * Find the map that embeds `childMapId`, using the SAME nesting graph `state/map-nesting.ts` walks
 * (a parent's `embeds` list references its children by id; a child stores no back-reference). A map
 * may in principle be embedded by more than one parent; the lowest map id wins so the walk is
 * deterministic. Returns null for a root map (nothing embeds it).
 */
function findParentMap(maps: MapState, childMapId: string): MapEntity | null {
	let found: MapEntity | null = null;
	for (const candidate of Object.values(maps.maps)) {
		if (!candidate.embeds.some((embed) => embed.childMapId === childMapId)) continue;
		if (!found || candidate.id < found.id) found = candidate;
	}
	return found;
}

/**
 * RC-MAP-1.4 — build the actor-filtered atlas BREADCRUMB for one map: the chain of nesting ancestors
 * from the outermost visible root down to the map itself (MAP-008/MAP-017 nesting graph). Used by the
 * atlas surface and the prep/recap digest's party-location reading so "where is the party" reads as
 * "World Atlas > Western Reaches > Ruined Keep", not a bare map id.
 *
 * Fail-closed, matching {@link getMapViewForActor}: a map hidden from (or missing to) the actor
 * collapses to `unavailable`. Climbing the chain STOPS at the first ancestor hidden from the actor
 * (a `dm-only` parent never lends its name to a player's trail) rather than skipping over it and
 * continuing to a visible grandparent, which would misrepresent how deep the map actually sits.
 */
export function getMapBreadcrumbForActor(
	maps: MapState,
	permissions: PermissionState,
	actorId: ActorId,
	mapId: string,
	options?: MapQueryOptions,
): MapBreadcrumbResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'unavailable', mapId };
	const map = maps.maps[mapId];
	if (!map) return { kind: 'unavailable', mapId };
	if (!mapVisibleToActor(map, actor, isDelivered(map.id, options))) {
		return { kind: 'unavailable', mapId };
	}

	const crumbs: MapBreadcrumbCrumb[] = [{ mapId: map.id, name: map.name }];
	const seen = new Set<string>([map.id]);
	let current = map;
	for (;;) {
		const parent = findParentMap(maps, current.id);
		if (!parent || seen.has(parent.id)) break;
		if (!mapVisibleToActor(parent, actor, isDelivered(parent.id, options))) break;
		seen.add(parent.id);
		crumbs.unshift({ mapId: parent.id, name: parent.name });
		current = parent;
	}

	return { kind: 'available', mapId: map.id, crumbs };
}

export type { MapOverlayMode };
