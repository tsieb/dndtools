import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { MapState } from '../state/map-state';
import { evaluateSceneVisibility } from '../permissions/visibility';

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
 * Scope: the prototype's durable state covers Scenes and Maps, so those two targets
 * resolve against real state. `note` / `object` / `character` / `search-result` targets
 * are first-class in the {@link DeepLinkTarget} union and resolve through the same
 * result shape; until their domains land in v2 their entities are not in local state, so
 * they currently resolve to `unavailable:not-cached` (fail-closed, never leaking). Each
 * future domain plugs its visibility-filtered lookup into the matching branch here
 * without changing the result contract.
 */

/** The entity kinds a deep link can target (NAV-005). */
export type DeepLinkEntityType =
	| 'map'
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

/** Where the restored deep link lands: the entity and the in-entity selection. */
export interface DeepLinkRestore {
	kind: 'restore';
	type: DeepLinkEntityType;
	sectionId: string;
	entityId: string;
	/** Human-readable entity name for the heading/title (already visibility-filtered). */
	entityName: string;
	/** The restored in-entity selection (region/tab/section), when one resolved. */
	selectionId: string | null;
	/** A human-readable label for the restored selection, when one resolved. */
	selectionLabel: string | null;
	/** The route to navigate to / restore, e.g. `/atlas/` or `/scene/<id>/`. */
	route: string;
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
	if (actor.role !== 'dm') {
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
	return {
		kind: 'restore',
		type: 'map',
		sectionId: target.sectionId,
		entityId: map.id,
		entityName: map.name,
		selectionId,
		selectionLabel: region?.name ?? null,
		route: '/atlas/',
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
		case 'scene':
			return resolveSceneDeepLink(state, actorId, target);
		case 'note':
		case 'object':
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
