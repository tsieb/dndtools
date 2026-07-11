import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { MapState } from '../state/map-state';
import type { VaultContentState } from '../state/content';
import type { SessionState } from '../state/session-state';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { getContentItemsForActor, type ContentItemView } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor, type MapPoiView } from './map-query';
import { headingAnchors, parseMarkdownNote } from '../state/markdown';

/**
 * Deep-link resolution (NAV-005).
 *
 * A deep link restores the intended *selection within a route*: a map deep link focuses
 * a POI/region in the map viewport, a Scene deep link selects an open Scene (and an
 * optional tab/section), and note/object/character/search-result deep links select their
 * target. This module is the single Processing-Core resolver every deep link passes
 * through. Given the actor and a parsed {@link DeepLinkTarget}, {@link resolveDeepLink}
 * returns a discriminated result:
 *
 * - `restore` — the target is visible to the actor; the GUI restores the selected
 *   entity, viewport/region, tab, or section (NAV-005 AC1).
 * - `unavailable` — the target is hidden from the actor, deleted, or not cached locally.
 *   The reason is bucketed into `hidden` / `not-cached` / `not-found`, but the *message*
 *   is a single generic "unavailable" string in every case so the result never reveals
 *   that a hidden target exists, nor distinguishes "hidden from you" from "does not
 *   exist" (NAV-005 AC2). Non-sensitive route state (the section, the link kind) is
 *   preserved so the shell can still render a coherent unavailable page (NAV-005 AC3).
 *
 * Fail-closed and offline (Contract 2, Contract 3): visibility is evaluated in the core
 * before any selection is returned; a target the actor cannot see is `unavailable:hidden`
 * and indistinguishable from a missing one. A target not present in the locally cached
 * state (offline, never synced to this device) is `unavailable:not-cached` — the link
 * is still parsed and the section preserved, but no content is exposed (NAV-005 AC3).
 *
 * Scope: the resolver covers Scenes, Maps, map POIs (SRCH-007 AC1 — viewport focus on the
 * POI's normalized `x`/`y`), and notes/objects (SRCH-007 AC2 — open the content view +
 * restore a heading hash/scroll target). `character` / `search-result` targets are
 * first-class in the {@link DeepLinkTarget} union and resolve through the same result
 * shape; until those domains land in v2 their entities are not in local state, so they
 * resolve to `unavailable:not-cached` (fail-closed, never leaking). Each future domain
 * plugs its visibility-filtered lookup into the matching branch here without changing the
 * result contract.
 *
 * OPEN-TIME RE-CHECK (SRCH-007): every branch resolves its target through the SAME
 * actor-filtered read the rest of the app uses (the content query for notes/objects, the
 * map query for POIs, scene visibility for Scenes), so visibility is re-evaluated AT OPEN
 * TIME. A target that has since been hidden or deleted is simply absent from that read and
 * resolves to the generic `unavailable` — a deep link to a now-hidden/now-deleted target
 * degrades gracefully (no leak, no crash, a clear "unavailable" state).
 */

/** The entity kinds a deep link can target (NAV-005 / SRCH-007). */
export type DeepLinkEntityType =
	| 'map'
	| 'poi'
	| 'scene'
	| 'note'
	| 'object'
	| 'character'
	| 'search-result';

/** A parsed deep link the GUI hands the resolver. The GUI owns parsing the URL into this
 *  shape (route-shape knowledge is the GUI's — Contract 1); the core resolves it. */
export interface DeepLinkTarget {
	type: DeepLinkEntityType;
	/** The target entity id (a map id, scene id, note id, …). */
	entityId: string;
	/**
	 * The selection to restore *within* the target: a map region/POI id, a Scene
	 * tab/section id, a note heading/section anchor, etc. Optional — a deep link may
	 * target just the entity.
	 */
	selectionId?: string;
	/** The canonical section the link lives in (e.g. `atlas`, `scenes`). Preserved on
	 *  unavailable so the shell renders a coherent page (NAV-005 AC3). */
	sectionId: string;
}

/**
 * The map VIEWPORT FOCUS a POI/map deep link restores (SRCH-007 AC1): the normalized `x`/`y` to center
 * on (0..1 map space) and the owning map id. `null` when the link targets a non-map entity or no
 * coordinate resolved. Derived from the actor-VISIBLE POI only, so a hidden POI never contributes a focus.
 */
export interface DeepLinkViewportFocus {
	mapId: string;
	/** Normalized horizontal focus (0..1 across the map width). */
	x: number;
	/** Normalized vertical focus (0..1 down the map height). */
	y: number;
}

/** Where the restored deep link lands: the entity and the in-entity selection. */
export interface DeepLinkRestore {
	kind: 'restore';
	type: DeepLinkEntityType;
	sectionId: string;
	entityId: string;
	/** Human-readable entity name for the heading/title (already visibility-filtered). */
	entityName: string;
	/** The restored in-entity selection (region/POI/tab/section/heading), when one resolved. */
	selectionId: string | null;
	/** A human-readable label for the restored selection, when one resolved. */
	selectionLabel: string | null;
	/** The route to navigate to / restore, e.g. `/atlas/` or `/scene/<id>/`. */
	route: string;
	/**
	 * SRCH-007 AC1 — the map viewport focus (normalized `x`/`y` + map id) to center, when the link targets
	 * a map POI/region with a resolvable coordinate. `null` for non-map targets. The GUI centers its
	 * viewport on this without re-deriving it (Contract 1).
	 */
	viewport: DeepLinkViewportFocus | null;
	/**
	 * SRCH-007 AC2 — the hash ANCHOR to scroll to within the target (a note heading slug), when one
	 * resolved. `null` when the link targets just the entity. The GUI navigates the hash + scrolls; the
	 * anchor is a deterministic slug the core computed, so the scroll target is stable (Contract 1).
	 */
	hashAnchor: string | null;
}

/** Why a deep link could not be restored. The *message* is generic for every reason so
 *  the result never leaks whether a hidden target exists (NAV-005 AC2). */
export type DeepLinkUnavailableReason = 'hidden' | 'not-cached' | 'not-found' | 'unsupported';

export interface DeepLinkUnavailable {
	kind: 'unavailable';
	/** Internal reason bucket. Not user-facing copy — used for diagnostics/tests only. */
	reason: DeepLinkUnavailableReason;
	type: DeepLinkEntityType;
	/** Preserved non-sensitive route state so the shell renders a coherent page
	 *  (NAV-005 AC3). Never includes the target's name or any hidden detail. */
	sectionId: string;
	/** The single generic, non-leaking unavailable message shown for every reason. */
	message: string;
}

export type DeepLinkResolution = DeepLinkRestore | DeepLinkUnavailable;

/** The Processing-Core state slices deep-link resolution reads. */
export interface DeepLinkStateView {
	scenes: SceneState;
	maps: MapState;
	permissions: PermissionState;
	/** Content (notes/objects) — read through the actor-filtered content query (CONTENT-011). Optional so a
	 *  caller resolving only map/Scene links need not provide it; a note/object link without it is `not-cached`. */
	content?: VaultContentState;
	/** Session — supplies the actor's delivered/projected maps so a shared-but-projected map POI can resolve. */
	session?: SessionState;
}

/**
 * The one generic unavailable message. It is identical for hidden, not-cached, and
 * not-found targets so a player cannot tell a hidden target apart from a missing one
 * (NAV-005 AC2), and it names no entity.
 */
export const DEEP_LINK_UNAVAILABLE_MESSAGE =
	'This content is unavailable. It may not exist, may not be available on this device, or you may not have access.';

function unavailable(
	type: DeepLinkEntityType,
	sectionId: string,
	reason: DeepLinkUnavailableReason,
): DeepLinkUnavailable {
	return {
		kind: 'unavailable',
		reason,
		type,
		sectionId,
		message: DEEP_LINK_UNAVAILABLE_MESSAGE,
	};
}

/** Resolve a map deep link: focus the named region/POI in the map viewport when the
 *  map (and the actor) allow it (NAV-005 AC1). */
function resolveMapDeepLink(
	state: DeepLinkStateView,
	actorId: ActorId,
	target: DeepLinkTarget,
): DeepLinkResolution {
	const actor = state.permissions.actors[actorId];
	// Unknown actor or absent map: fail closed as a single generic unavailable; a
	// player cannot tell "no such map" from "hidden from you".
	if (!actor) return unavailable('map', target.sectionId, 'hidden');
	const map = state.maps.maps[target.entityId];
	if (!map) return unavailable('map', target.sectionId, 'not-cached');

	// Map visibility (Contract 3): a dm-only map is hidden from non-DM actors. `shared`
	// maps are not exposed by a bare deep link without an active projection, so a
	// non-DM actor without DM access sees the same generic unavailable.
	if (!hasDmAuthority(actor.role)) {
		if (map.visibility === 'dm-only' || map.visibility === 'shared') {
			return unavailable('map', target.sectionId, 'hidden');
		}
	}

	// Restore the requested region/POI as the viewport focus. A deep link to a region
	// that does not exist still opens the map at its default region rather than 404-ing
	// the whole map, so a stale POI link degrades gracefully (NAV-005 AC1/AC3).
	const requested = target.selectionId
		? (map.regions.find((candidate) => candidate.id === target.selectionId) ?? null)
		: null;
	const fallback = map.defaultRegionId
		? (map.regions.find((candidate) => candidate.id === map.defaultRegionId) ?? null)
		: null;
	const region = requested ?? fallback;
	const selectionId = region?.id ?? null;
	// SRCH-007 AC1 — center the viewport on the resolved region's bounds (normalized map space). The
	// region is the actor-visible one resolved above, so no hidden region contributes a focus.
	const viewport: DeepLinkViewportFocus | null = region
		? { mapId: map.id, x: region.bounds.x + region.bounds.w / 2, y: region.bounds.y + region.bounds.h / 2 }
		: null;
	return {
		kind: 'restore',
		type: 'map',
		sectionId: target.sectionId,
		entityId: map.id,
		entityName: map.name,
		selectionId,
		selectionLabel: region?.name ?? null,
		route: '/atlas/',
		viewport,
		hashAnchor: null,
	};
}

/**
 * SRCH-007 AC1 — resolve a POI deep link: focus the map viewport on the POI's `x`/`y` when the POI (and
 * its map) are VISIBLE to the actor. The POI is resolved through the actor-filtered map query, so a
 * `dm-only` POI / a POI on a hidden layer / a POI on a hidden map is never resolvable — it fails closed to
 * the SAME generic unavailable as a missing one (no leak). The `selectionId` is the POI id; the viewport
 * carries the POI's normalized coordinate so the GUI centers on it without re-deriving it (Contract 1).
 */
function resolvePoiDeepLink(
	state: DeepLinkStateView,
	actorId: ActorId,
	target: DeepLinkTarget,
): DeepLinkResolution {
	const actor = state.permissions.actors[actorId];
	if (!actor) return unavailable('poi', target.sectionId, 'hidden');
	// The POI's owning map is required — a POI link addresses `<map>#<poi>`. The map id is the entityId.
	const map = state.maps.maps[target.entityId];
	if (!map) return unavailable('poi', target.sectionId, 'not-cached');
	const deliveredMapIds = deliveredMapIdsForActor(state.session, actorId);
	const view = getMapViewForActor(state.maps, state.permissions, actorId, map.id, { deliveredMapIds });
	if (view.kind !== 'available') {
		// The map is hidden from this actor → generic unavailable, indistinguishable from missing.
		return unavailable('poi', target.sectionId, 'hidden');
	}
	const poi: MapPoiView | null = target.selectionId
		? (view.pois.find((candidate) => candidate.id === target.selectionId) ?? null)
		: null;
	if (!poi) {
		// The requested POI is not visible to the actor (hidden POI/layer) or does not exist. Fail closed to
		// the generic unavailable — a player cannot tell a hidden POI from a missing one (SRCH-007 fail-closed).
		return unavailable('poi', target.sectionId, 'hidden');
	}
	return {
		kind: 'restore',
		type: 'poi',
		sectionId: target.sectionId,
		entityId: map.id,
		entityName: map.name,
		selectionId: poi.id,
		selectionLabel: poi.label,
		route: '/atlas/',
		viewport: { mapId: map.id, x: poi.position.x, y: poi.position.y },
		hashAnchor: null,
	};
}

/**
 * SRCH-007 AC2 — resolve a NOTE/OBJECT deep link: open the note/object view and, when the link carries a
 * heading anchor, restore the heading hash + scroll target. The item is resolved through the actor-filtered
 * content read (CONTENT-011), so a `dm-only`/deleted note is never resolvable — it fails closed to the same
 * generic unavailable as a missing one (no leak). The heading anchor is matched against the note's
 * DETERMINISTIC heading slugs; an anchor that does not match a visible heading is dropped to the note root
 * rather than 404-ing, so a stale heading link degrades gracefully (NAV-005 AC3).
 */
function resolveContentDeepLink(
	state: DeepLinkStateView,
	actorId: ActorId,
	target: DeepLinkTarget,
): DeepLinkResolution {
	const actor = state.permissions.actors[actorId];
	if (!actor) return unavailable(target.type, target.sectionId, 'hidden');
	// Without a content slice the note/object domain is not cached on this device (offline / not provided).
	if (!state.content) return unavailable(target.type, target.sectionId, 'not-cached');
	// The actor-filtered content read decides visibility BEFORE we see the item; a hidden/deleted note is
	// simply absent here, so it can never resolve to a leak.
	const items = getContentItemsForActor(state.content, state.permissions, actorId);
	const item: ContentItemView | undefined = items.find((candidate) => candidate.id === target.entityId);
	if (!item) {
		// Not visible to the actor (hidden/deleted) OR genuinely absent — both fail closed to the generic
		// unavailable so a player cannot distinguish "hidden from you" from "does not exist" (NAV-005 AC2).
		// `not-cached` vs `hidden` is an internal diagnostic bucket only; the message is identical.
		return unavailable(target.type, target.sectionId, state.content.items[target.entityId] ? 'hidden' : 'not-cached');
	}
	// The hit type must match the item kind (a `note` link to an object — or vice versa — does not resolve).
	const itemType: DeepLinkEntityType = item.kind === 'object' ? 'object' : 'note';
	if (itemType !== target.type) return unavailable(target.type, target.sectionId, 'not-found');
	// SRCH-007 AC2 — restore a heading anchor only when it matches a heading in the VISIBLE body. The body
	// here is the actor's visible note body (the read omits a hidden note entirely), so a heading slug can
	// never name a hidden section. An unmatched anchor drops to the note root (graceful degrade).
	let hashAnchor: string | null = null;
	let selectionId: string | null = null;
	let selectionLabel: string | null = null;
	if (target.selectionId) {
		const body = parseMarkdownNote(item.body).body;
		const heading = headingAnchors(body).find((candidate) => candidate.anchor === target.selectionId);
		if (heading) {
			hashAnchor = heading.anchor;
			selectionId = heading.anchor;
			selectionLabel = heading.text;
		}
	}
	return {
		kind: 'restore',
		type: target.type,
		sectionId: target.sectionId,
		entityId: item.id,
		entityName: item.title,
		selectionId,
		selectionLabel,
		// The Knowledge section is a single work surface; the note is selected WITHIN it (the GUI carries the
		// note id as an in-section param + the heading as the hash), so the route is the section root. This
		// mirrors the map deep link's `/atlas/?map=…` convention.
		route: '/knowledge/',
		viewport: null,
		hashAnchor,
	};
}

/** Resolve a Scene deep link: select the open Scene (and optional tab/section) when it
 *  is visible to the actor (NAV-005 AC1). */
function resolveSceneDeepLink(
	state: DeepLinkStateView,
	actorId: ActorId,
	target: DeepLinkTarget,
): DeepLinkResolution {
	const actor = state.permissions.actors[actorId];
	if (!actor) return unavailable('scene', target.sectionId, 'hidden');
	const scene = state.scenes.scenes[target.entityId];
	if (!scene) return unavailable('scene', target.sectionId, 'not-cached');

	const visibility = evaluateSceneVisibility(scene, actor, state.permissions);
	if (visibility.kind !== 'visible') {
		// Hidden from this actor → generic unavailable, indistinguishable from missing.
		return unavailable('scene', target.sectionId, 'hidden');
	}

	// Restore an optional section/tab selection, but only one the actor may see: when a
	// player-view assignment scopes them to specific sections, a deep link to a section
	// outside that set is dropped to the Scene root rather than revealing it.
	let selectionId: string | null = null;
	let selectionLabel: string | null = null;
	if (target.selectionId) {
		const sectionAllowed =
			visibility.assignedSectionIds === null ||
			visibility.assignedSectionIds.includes(target.selectionId);
		const section = scene.sections.find((candidate) => candidate.id === target.selectionId);
		if (sectionAllowed && section) {
			selectionId = section.id;
			selectionLabel = section.name ?? section.id;
		}
	}
	return {
		kind: 'restore',
		type: 'scene',
		sectionId: target.sectionId,
		entityId: scene.id,
		entityName: scene.name,
		selectionId,
		selectionLabel,
		route: `/scene/${scene.id}/`,
		viewport: null,
		hashAnchor: null,
	};
}

/**
 * Resolve a deep link for one actor (NAV-005). Visibility is evaluated in the core
 * before any selection is returned, so a hidden target is `unavailable` with a generic
 * message (NAV-005 AC2) and a not-cached/offline target is `unavailable` while the
 * non-sensitive section is preserved (NAV-005 AC3).
 */
export function resolveDeepLink(
	state: DeepLinkStateView,
	actorId: ActorId,
	target: DeepLinkTarget,
): DeepLinkResolution {
	switch (target.type) {
		case 'map':
			return resolveMapDeepLink(state, actorId, target);
		case 'poi':
			// SRCH-007 AC1 — a POI deep link focuses the map viewport on the POI's coordinate.
			return resolvePoiDeepLink(state, actorId, target);
		case 'note':
		case 'object':
			// SRCH-007 AC2 — a note/object deep link opens the content view, restoring a heading hash when one
			// matches a VISIBLE heading. Resolved through the actor-filtered content read (fail closed).
			return resolveContentDeepLink(state, actorId, target);
		case 'scene':
			return resolveSceneDeepLink(state, actorId, target);
		case 'character':
		case 'search-result':
			// These domains are not yet in v2 durable state. Their entities are therefore
			// not cached locally, so a deep link to one is `unavailable:not-cached` — never
			// a leak, and route state is preserved (NAV-005 AC3). Each domain plugs a
			// visibility-filtered lookup into its branch here when it lands.
			return unavailable(target.type, target.sectionId, 'not-cached');
		default:
			return unavailable(target.type, target.sectionId, 'unsupported');
	}
}
