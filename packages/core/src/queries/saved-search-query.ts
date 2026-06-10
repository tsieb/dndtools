import type { Actor, PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import type { CalendarDateFormat } from '../state/calendar';
import {
	SAVED_SEARCH_ENTITY_TYPE,
	type SavedSearch,
	type SearchFilter,
} from '../state/saved-search';
import { hasGrantedCapability } from '../permissions/grants';
import { searchVaultForActor, type SearchResult } from './search-query';

/**
 * SRCH-004 — THE actor-filtered SAVED-SEARCH read. The DM creates/edits/pins/deletes saved searches; this
 * read decides which saved searches an actor may SEE and runs each one's filter LIVE.
 *
 * Two fail-closed guarantees this read enforces, both keystone to the SRCH-003 AC4 / SRCH-004 AC2 no-leak
 * contract (Cross-Contract Non-Negotiable 2):
 *
 *   1. A SAVED SEARCH IS VISIBILITY-FILTERED LIKE ANY ENTITY. A `dm-only` saved search is OMITTED ENTIRELY
 *      from a non-DM's list — its name, criteria, and even its existence never leak (SRCH-004 AC2). Only a
 *      `player-visible` saved search (or a `shared` one delivered to the actor) appears for a player; the
 *      default fails closed to `dm-only`, so DM-only criteria are never exposed.
 *   2. RESULTS ARE ALWAYS RE-EVALUATED LIVE. A saved search stores ONLY its {@link SearchFilter} — never a
 *      cached result set. Each run re-evaluates the filter through {@link searchVaultForActor} for the
 *      RUNNING actor, which decides visibility BEFORE producing any hit. So even if a `player-visible`
 *      saved search references content that has since been hidden, the player's run simply omits it — a
 *      stale result can NEVER serve a now-hidden item (SRCH-003 AC1, AC4). The same saved search run by the
 *      DM and by a player yields each actor's OWN visible hits — the filter is shared, the results are not.
 *
 * Pure + deterministic: the same (state, actor) always returns the same list + results. The Processing
 * Core owns the filter evaluation; the GUI renders the computed result and dispatches command intents only.
 */

/** A saved search projected to an actor, WITH its LIVE result for that actor. The criteria are echoed for the DM. */
export interface SavedSearchView {
	id: string;
	name: string;
	pinned: boolean;
	/** The saved search's own visibility (the DM authoring level). */
	visibility: SavedSearch['visibility'];
	/**
	 * The persisted filter criteria. Exposed so the DM can edit and the GUI can render the applied facets.
	 * (A `player-visible`/`shared` saved search is, by the DM's choice, allowed to be seen by its audience;
	 * a `dm-only` one is never in a non-DM's list at all, so its criteria never reach a player.)
	 */
	filter: SearchFilter;
	/** The LIVE result of running the filter for THIS actor. Re-evaluated on every read — never cached. */
	result: SearchResult;
	revision: number;
}

/** Whether ONE saved search is visible to an actor. Mirrors the content-item visibility rule. Fail closed. */
function savedSearchVisibleToActor(
	search: SavedSearch,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	if (actor.role === 'dm') return true;
	if (search.visibility === 'dm-only') return false;
	if (search.visibility === 'player-visible') return actor.role === 'player' || actor.role === 'observer';
	// `shared`: delivered only through an explicit channel — `sharedWith` membership OR a viewer grant on
	// the saved-search entity (mirrors the content-item `shared` rule).
	if (search.sharedWith.includes(actor.id)) return true;
	return hasGrantedCapability(permissions, actor, SAVED_SEARCH_ENTITY_TYPE, search.id, 'viewer');
}

/** The actor-filtered list of saved searches the actor may see, in stable id order (no results yet). */
function visibleSavedSearches(
	content: VaultContentState,
	permissions: PermissionState,
	actor: Actor,
): SavedSearch[] {
	return Object.values(content.savedSearches)
		.filter((search) => savedSearchVisibleToActor(search, actor, permissions))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Build the projected view of one saved search, running its filter LIVE for the actor. */
function projectSavedSearch(
	search: SavedSearch,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	dateFormat: CalendarDateFormat,
): SavedSearchView {
	return {
		id: search.id,
		name: search.name,
		pinned: search.pinned,
		visibility: search.visibility,
		filter: search.filter,
		// The result is re-evaluated LIVE for the running actor — never a cached result set.
		result: searchVaultForActor(content, maps, permissions, session, actorId, search.filter, dateFormat),
		revision: search.revision,
	};
}

/**
 * SRCH-004 — the actor-filtered SAVED-SEARCH list, each run LIVE for the actor. A non-DM never sees a
 * `dm-only` saved search (SRCH-004 AC2), and every visible saved search's results are re-evaluated for the
 * running actor (no stale leak — SRCH-003 AC1/AC4). An unknown/unauthenticated actor gets an empty list.
 * Deterministically ordered by id.
 */
export function getSavedSearchesForActor(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	dateFormat: CalendarDateFormat = 'medium',
): SavedSearchView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	return visibleSavedSearches(content, permissions, actor).map((search) =>
		projectSavedSearch(search, content, maps, permissions, session, actorId, dateFormat),
	);
}

/**
 * SRCH-004 AC1 — the PINNED saved searches for the actor, run LIVE, for the Command Center widget. A
 * non-DM only ever receives pinned saved searches that are visible to them; a `dm-only` pinned saved
 * search is absent from a player's Command Center / shared navigation (SRCH-004 AC2). Deterministic order.
 */
export function getPinnedSavedSearchesForActor(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	dateFormat: CalendarDateFormat = 'medium',
): SavedSearchView[] {
	return getSavedSearchesForActor(content, maps, permissions, session, actorId, dateFormat).filter(
		(view) => view.pinned,
	);
}

/**
 * SRCH-004 — run ONE saved search by id, LIVE, for the actor. Returns the projected view, or `null` when
 * the saved search does not exist OR is not visible to the actor (the two are indistinguishable — a player
 * cannot tell "hidden from you" from "does not exist", so a `dm-only` saved search's id never leaks).
 */
export function runSavedSearchForActor(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	savedSearchId: string,
	dateFormat: CalendarDateFormat = 'medium',
): SavedSearchView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const search = content.savedSearches[savedSearchId];
	if (!search || !savedSearchVisibleToActor(search, actor, permissions)) return null;
	return projectSavedSearch(search, content, maps, permissions, session, actorId, dateFormat);
}

/** Whether an actor may AUTHOR saved searches (the DM). The command layer re-checks fail-closed. */
export function actorCanAuthorSavedSearch(permissions: PermissionState, actorId: string): boolean {
	const actor = permissions.actors[actorId];
	return !!actor && actor.role === 'dm';
}
