import type { ActorId } from '../state/ids';
import type { MapEntity, MapLayer } from '../state/map-state';
import type { SceneVisibility } from '../state/scene-state';

/**
 * MAP-016 — pre-projection map-layer visibility consistency audit.
 *
 * Before a DM projects a map to players/observers, the layer/POI/route/fog/token/nested-map graph
 * must be CHECKED for visibility inconsistencies that would either leak hidden content or render a
 * player-visible surface misleading once hidden content is omitted (Contract 3 "Consistency
 * Requirements"; Cross-Contract Non-Negotiable 10 — visibility/permission conflicts are consistency
 * errors to surface, not silent behavior to tolerate).
 *
 * This audit follows the SAME pattern as `consistency.ts`: it is pure, read-only, DM-facing, and
 * NON-LEAKING. Every problem carries only entity-type/id references and a generic remediation hint —
 * never a hidden layer name, POI title, or token value. It produces actionable DM diagnostics; it
 * does not mutate state.
 *
 * Effective visibility precedence (matches the projection / query model):
 *   - A child surface (POI/route/fog/token) inherits the HIDDEN state of its layer: a surface on a
 *     `dm-only` layer is hidden regardless of its own visibility (hidden-ancestor-wins).
 *   - A map's own `dm-only` visibility hides every layer/surface beneath it.
 *   - A nested-map link is hidden when the linked map is hidden from the actor.
 *
 * Severity:
 *   - `error` (BLOCKING) — projection must not proceed: a player-visible surface REFERENCES hidden
 *     content (e.g. a visible route references a hidden POI), or omitting hidden content would make a
 *     player-visible overlay misleading.
 *   - `warning` (NON-BLOCKING) — hidden content is SAFELY omitted from a DM-only surface; the DM is
 *     informed but projection of the unrelated visible data may continue.
 */

/** A point of interest placed on a layer, with its own visibility override. */
export interface MapPoiRecord {
	id: string;
	layerId: string;
	visibility: SceneVisibility;
}

/** A route that references an ordered list of POIs. The route itself has a visibility. */
export interface MapRouteRecord {
	id: string;
	layerId: string;
	visibility: SceneVisibility;
	/** POI ids this route's path references. */
	poiIds: string[];
}

/** A fog operation scoped to a layer (reveal/conceal). Visibility follows its layer. */
export interface MapFogRecord {
	id: string;
	layerId: string;
	visibility: SceneVisibility;
}

/** A token placed on a layer (combatant/marker). Tokens carry their own visibility. */
export interface MapTokenRecord {
	id: string;
	layerId: string;
	visibility: SceneVisibility;
	/**
	 * True when the surrounding visible overlay would be MISLEADING if this token were omitted — e.g.
	 * a player-visible combat overlay that implies a token is present. When such a token is hidden,
	 * omitting it blocks the projection (MAP-016 AC2). When false, a hidden token is safely omitted.
	 */
	overlayDependsOnPresence?: boolean;
}

/** A nested-map link: a region on a parent map opens a child map. */
export interface MapNestedLink {
	id: string;
	parentLayerId: string;
	/** Visibility of the LINK affordance itself on the parent map. */
	visibility: SceneVisibility;
	/** The child map id the link opens. */
	childMapId: string;
}

/** The full declarative graph the audit reasons over. All references are by id. */
export interface MapProjectionInput {
	map: MapEntity;
	pois?: MapPoiRecord[];
	routes?: MapRouteRecord[];
	fog?: MapFogRecord[];
	tokens?: MapTokenRecord[];
	nestedLinks?: MapNestedLink[];
	/** Visibility of OTHER maps a nested link may target, keyed by map id. Absent ⇒ `dm-only`. */
	childMapVisibility?: Record<string, SceneVisibility>;
}

export type MapProjectionProblemKind =
	| 'visible-route-references-hidden-poi'
	| 'visible-overlay-omits-required-token'
	| 'visible-link-targets-hidden-map'
	| 'hidden-content-on-visible-layer'
	| 'safely-omitted-hidden-token'
	| 'visible-annotation-on-hidden-layer';

export type MapProjectionSeverity = 'error' | 'warning';

/** The kind of element a problem concerns. Reference only — never a name/title/value. */
export type MapProjectionElementKind = 'layer' | 'poi' | 'route' | 'fog' | 'token' | 'nested-map';

export interface MapProjectionProblem {
	kind: MapProjectionProblemKind;
	severity: MapProjectionSeverity;
	mapId: string;
	elementKind: MapProjectionElementKind;
	/** The id of the offending element. Never a title or value. */
	elementId: string;
	/** The related element (e.g. the hidden POI a visible route references), when applicable. */
	relatedElementKind: MapProjectionElementKind | null;
	relatedElementId: string | null;
	/** Generic, non-leaking remediation hint for the DM. */
	remediation: string;
}

export interface MapProjectionConsistencyReport {
	kind: 'map-projection-consistency';
	mapId: string;
	problems: MapProjectionProblem[];
	/** True when at least one BLOCKING (`error`) problem exists; projection must not proceed. */
	blocked: boolean;
}

/** Player-facing visibility test: is a surface with this level visible to players (pre-projection)? */
function isPlayerFacing(visibility: SceneVisibility): boolean {
	// `shared` requires explicit per-actor delivery, so at the map level (before any actor is chosen)
	// it is NOT generally player-facing. The pre-projection check evaluates the GENERAL player view.
	return visibility === 'player-visible';
}

/** Effective player-facing visibility of a surface = its own level AND its layer's level. */
function surfaceIsPlayerVisible(
	surfaceVisibility: SceneVisibility,
	layer: MapLayer | undefined,
): boolean {
	if (!layer) return false; // orphan surface (no layer) is treated as hidden — fail closed.
	if (!isPlayerFacing(layer.visibility)) return false; // hidden-ancestor-wins.
	return isPlayerFacing(surfaceVisibility);
}

/**
 * Run the pre-projection consistency audit for one map. Returns a DM-facing report. When `blocked`
 * is true, the DM must resolve the listed errors before projecting; warnings are informational.
 */
export function auditMapProjectionConsistency(
	input: MapProjectionInput,
): MapProjectionConsistencyReport {
	const { map } = input;
	const problems: MapProjectionProblem[] = [];
	const layerById = new Map<string, MapLayer>(map.layers.map((layer) => [layer.id, layer]));

	const pois = input.pois ?? [];
	const poiById = new Map<string, MapPoiRecord>(pois.map((poi) => [poi.id, poi]));

	// A POI is player-visible iff its own level AND its layer are player-facing.
	const poiPlayerVisible = (poi: MapPoiRecord): boolean =>
		surfaceIsPlayerVisible(poi.visibility, layerById.get(poi.layerId));

	// 0. MAP-011 AC4 — a POI whose OWN visibility is `player-visible` but whose LAYER is hidden
	//    (hidden-ancestor-wins). The POI will not appear to players because the layer overrides it, yet
	//    the DM set it `player-visible` — this is a misconfiguration the DM needs to resolve before
	//    projecting. Non-blocking (the visibility enforcement is already correct) but explicitly surfaced
	//    so the DM is not left wondering why the POI is absent from the player view.
	for (const poi of pois) {
		const layer = layerById.get(poi.layerId);
		const layerHidesAnnotation = layer ? !isPlayerFacing(layer.visibility) : true; // orphan → hidden
		if (isPlayerFacing(poi.visibility) && layerHidesAnnotation) {
			problems.push({
				kind: 'visible-annotation-on-hidden-layer',
				severity: 'warning',
				mapId: map.id,
				elementKind: 'poi',
				elementId: poi.id,
				relatedElementKind: 'layer',
				relatedElementId: poi.layerId,
				remediation:
					'This POI is set to player-visible but its layer is hidden from players. The POI will not appear in any player-facing surface until the layer is also revealed.',
			});
		}
	}

	// 1. A player-visible ROUTE that references a hidden POI (MAP-016 AC1). BLOCKING: projecting the
	//    route would either leak the hidden POI's position or draw a path to nothing.
	for (const route of input.routes ?? []) {
		if (!surfaceIsPlayerVisible(route.visibility, layerById.get(route.layerId))) continue;
		for (const poiId of route.poiIds) {
			const poi = poiById.get(poiId);
			const visible = poi ? poiPlayerVisible(poi) : false;
			if (!visible) {
				problems.push({
					kind: 'visible-route-references-hidden-poi',
					severity: 'error',
					mapId: map.id,
					elementKind: 'route',
					elementId: route.id,
					relatedElementKind: 'poi',
					relatedElementId: poiId,
					remediation:
						'A player-visible route references a POI the players cannot see. Hide the route, reveal the referenced POI, or remove the reference before projecting.',
				});
			}
		}
	}

	// 2. A hidden TOKEN on a player-visible overlay where omission would mislead (MAP-016 AC2).
	//    BLOCKING: the token data is omitted from player payloads, but the visible overlay implies a
	//    token is present, so the projection must be blocked.
	for (const token of input.tokens ?? []) {
		const layer = layerById.get(token.layerId);
		const layerPlayerFacing = layer ? isPlayerFacing(layer.visibility) : false;
		const tokenHidden = !surfaceIsPlayerVisible(token.visibility, layer);
		if (layerPlayerFacing && tokenHidden) {
			if (token.overlayDependsOnPresence) {
				problems.push({
					kind: 'visible-overlay-omits-required-token',
					severity: 'error',
					mapId: map.id,
					elementKind: 'token',
					elementId: token.id,
					relatedElementKind: 'layer',
					relatedElementId: token.layerId,
					remediation:
						'A hidden token on a player-visible overlay would be omitted, leaving the overlay misleading. Reveal the token, hide the overlay layer, or mark the overlay independent of this token before projecting.',
				});
			}
			// A hidden token on a player-visible layer whose absence does NOT mislead is safely omitted
			// — surface it as a non-blocking notice so the DM knows it will not be projected.
			else {
				problems.push({
					kind: 'hidden-content-on-visible-layer',
					severity: 'warning',
					mapId: map.id,
					elementKind: 'token',
					elementId: token.id,
					relatedElementKind: 'layer',
					relatedElementId: token.layerId,
					remediation:
						'This hidden token sits on a player-visible layer and will be omitted from player payloads. No action needed unless the token should be revealed.',
				});
			}
		}
		// 3. A hidden token SAFELY omitted from a DM-only overlay (MAP-016 AC3): non-blocking warning,
		//    unrelated visible data may continue.
		if (layer && !isPlayerFacing(layer.visibility) && tokenHidden) {
			problems.push({
				kind: 'safely-omitted-hidden-token',
				severity: 'warning',
				mapId: map.id,
				elementKind: 'token',
				elementId: token.id,
				relatedElementKind: 'layer',
				relatedElementId: token.layerId,
				remediation:
					'This token is on a DM-only layer and is safely omitted from player payloads. Projection of unrelated visible data may continue.',
			});
		}
	}

	// 4. A player-visible NESTED-MAP link that targets a hidden child map. BLOCKING: the link would
	//    advertise (and let players open) a map they cannot see.
	for (const link of input.nestedLinks ?? []) {
		if (!surfaceIsPlayerVisible(link.visibility, layerById.get(link.parentLayerId))) continue;
		const childVisibility = input.childMapVisibility?.[link.childMapId] ?? 'dm-only';
		if (!isPlayerFacing(childVisibility)) {
			problems.push({
				kind: 'visible-link-targets-hidden-map',
				severity: 'error',
				mapId: map.id,
				elementKind: 'nested-map',
				elementId: link.id,
				relatedElementKind: 'nested-map',
				relatedElementId: link.childMapId,
				remediation:
					'A player-visible nested-map link opens a map the players cannot see. Reveal the linked map, hide the link, or remove it before projecting.',
			});
		}
	}

	// 5. Fog on a hidden layer is fine (omitted with the layer); fog on a player-visible layer that is
	//    itself hidden is a player-facing concealment that is safely omitted — informational only.
	for (const fog of input.fog ?? []) {
		const layer = layerById.get(fog.layerId);
		if (!layer) continue;
		if (isPlayerFacing(layer.visibility) && !surfaceIsPlayerVisible(fog.visibility, layer)) {
			problems.push({
				kind: 'hidden-content-on-visible-layer',
				severity: 'warning',
				mapId: map.id,
				elementKind: 'fog',
				elementId: fog.id,
				relatedElementKind: 'layer',
				relatedElementId: fog.layerId,
				remediation:
					'This fog operation is hidden on a player-visible layer and will be omitted. No action needed unless it should apply to the player view.',
			});
		}
	}

	return {
		kind: 'map-projection-consistency',
		mapId: map.id,
		problems,
		blocked: problems.some((problem) => problem.severity === 'error'),
	};
}

/**
 * A non-DM actor must never receive this report. The projection consistency audit is a DM authoring
 * aid; an unauthorized actor receives nothing (fail closed). The caller (command/query layer) gates
 * with this before returning a report.
 */
export function actorCanViewMapProjectionConsistency(actorRole: string): boolean {
	return actorRole === 'dm';
}

/** Convenience: the actor-gated report. A non-DM actor gets `null` (the report is never leaked). */
export function getMapProjectionConsistencyForActor(
	input: MapProjectionInput,
	actorRole: string,
): MapProjectionConsistencyReport | null {
	if (!actorCanViewMapProjectionConsistency(actorRole)) return null;
	return auditMapProjectionConsistency(input);
}

/**
 * Build the audit input from a durable {@link MapEntity}. The validator reasons over a minimal
 * id/layer/visibility graph; this projects the map's own POIs/routes/fog/tokens into that shape.
 *
 *   - A route references a POI through any waypoint whose link is a POI (`linkedEntityType === 'poi'`).
 *   - Nested-map links carry no per-embed visibility in the domain model (an embed inherits the child
 *     map's visibility, resolved at the query layer per MAP-017), so they are not surfaced here — the
 *     map-level audit covers the POI/route/layer leak class (MAP-016 AC1) that the projection command
 *     must block on.
 */
export function mapProjectionInput(map: MapEntity): MapProjectionInput {
	return {
		map,
		pois: map.pois.map((poi) => ({ id: poi.id, layerId: poi.layerId, visibility: poi.visibility })),
		routes: map.routes.map((route) => ({
			id: route.id,
			layerId: route.layerId,
			visibility: route.visibility,
			poiIds: route.waypoints
				.filter((wp) => wp.linkedEntityType === 'poi' && wp.linkedEntityId !== null)
				.map((wp) => wp.linkedEntityId as string),
		})),
		fog: map.fog.map((fog) => ({ id: fog.id, layerId: fog.layerId, visibility: fog.visibility })),
		tokens: map.tokens.map((token) => ({
			id: token.id,
			layerId: token.layerId,
			visibility: token.visibility,
		})),
	};
}

export type { ActorId };
