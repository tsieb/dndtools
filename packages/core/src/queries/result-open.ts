import type { ActorId } from '../state/ids';
import type { SearchContentType } from '../state/saved-search';
import {
	resolveDeepLink,
	type DeepLinkResolution,
	type DeepLinkStateView,
	type DeepLinkTarget,
} from './deep-links';

/**
 * SRCH-007 — OPEN a chosen SEARCH RESULT into the correct route, Scene, map viewport, note heading, or
 * object view, preserving browser history and search parameters.
 *
 * This is the Processing-Core "open the result" surface. It does NOT navigate — that is the GUI's job — it
 * DETERMINISTICALLY computes, for the actor, WHERE a chosen hit should open and WHAT in-target selection to
 * focus, by COMPOSING the single deep-link resolver ({@link resolveDeepLink}). The GUI passes the descriptor
 * of the hit the user clicked; the core maps it to a {@link DeepLinkTarget}, re-checks visibility through
 * the same actor-filtered reads, and returns a {@link DeepLinkResolution} the GUI renders/navigates to
 * (Architecture Contract 1: the GUI navigates computed results only; the core owns resolution + visibility).
 *
 * The mapping from a search hit's DOMAIN to a deep-link target is the load-bearing part (SRCH-007 AC1/AC2):
 *
 *   - `note` / `object`  → a note/object deep link into Knowledge. A `headingAnchor` (a deterministic
 *     heading slug, SRCH-007 AC2) restores the hash + scroll target within the note.
 *   - `poi`              → a map POI deep link: focus the map viewport on the POI's normalized `x`/`y`
 *     (SRCH-007 AC1). The owning map id + the POI id come from the hit descriptor.
 *   - `handout` / `session-artifact` → these live in the Session section and have no in-section deep-link
 *     target in the prototype's durable state; they open the Session section route. They are returned as a
 *     simple route open (no viewport/heading) rather than failing — the user still lands on the right
 *     surface. (A future SES deep-link epic can focus the specific handout/roll here without changing this
 *     contract.)
 *
 * OPEN-TIME RE-CHECK + FAIL CLOSED (SRCH-007): the descriptor names only an id + domain — never content.
 * Visibility is re-evaluated AT OPEN TIME by {@link resolveDeepLink}, which resolves through the SAME
 * actor-filtered reads as the rest of the app. So a hit descriptor for a target that has since been hidden
 * or deleted resolves to the generic `unavailable` (no leak, no crash, a clear "unavailable" state) — the
 * stale descriptor can never open hidden content. An unknown/unauthenticated actor fails closed everywhere.
 *
 * Pure + deterministic: a function of (state, actor, descriptor) only. No DOM, no navigation, no clock.
 */

/**
 * The minimal, NON-LEAKING descriptor of the search hit the user chose to open. It carries ONLY the hit's
 * domain + id + the in-target selection — never content, never a snippet, never a hidden id. The GUI builds
 * it from a rendered {@link import('./search-query').SearchHit} or a {@link
 * import('./quick-switcher-query').QuickSwitcherNavigationEntry}; the core re-checks visibility on open.
 */
export interface SearchResultOpenTarget {
	/** The hit's searchable domain (decides which route/deep-link target it maps to). */
	type: SearchContentType;
	/** The hit's id within its domain (the content-item id, the POI id, the handout id, the roll id). */
	id: string;
	/** For a POI hit: the id of the MAP the POI lives on (a POI link addresses `<map>#<poi>`). Else ignored. */
	mapId?: string | null;
	/**
	 * SRCH-007 AC2 — an optional in-target selection: a note/object HEADING ANCHOR (slug) to restore the hash
	 * + scroll to. Ignored for POI/handout/session-artifact hits. An anchor that does not match a visible
	 * heading is dropped to the target root by the resolver (graceful degrade).
	 */
	headingAnchor?: string | null;
}

/** The canonical section a domain's route lives under (mirrors the navigation registry's route roots). */
const SECTION_BY_TYPE: Record<SearchContentType, string> = {
	note: 'knowledge',
	object: 'knowledge',
	poi: 'atlas',
	handout: 'session',
	'session-artifact': 'session',
};

/** The section ROUTE root a handout/session-artifact hit opens to (no in-section deep-link target yet). */
const ROUTE_ROOT_BY_SECTION: Record<string, string> = {
	knowledge: '/knowledge/',
	atlas: '/atlas/',
	session: '/session/',
};

/**
 * SRCH-007 — map a chosen {@link SearchResultOpenTarget} to a {@link DeepLinkTarget}, or `null` when the
 * domain has no precise in-section deep-link target in the prototype's durable state (handout /
 * session-artifact — those open the section route). Pure.
 */
function targetForOpen(open: SearchResultOpenTarget): DeepLinkTarget | null {
	const sectionId = SECTION_BY_TYPE[open.type];
	switch (open.type) {
		case 'note':
		case 'object':
			return {
				type: open.type,
				entityId: open.id,
				...(open.headingAnchor ? { selectionId: open.headingAnchor } : {}),
				sectionId,
			};
		case 'poi':
			// A POI link addresses the OWNING MAP (entityId) + the POI id (selectionId). Without a map id we
			// cannot address the POI, so it falls through to a section-route open (fail closed, no guess).
			if (!open.mapId) return null;
			return { type: 'poi', entityId: open.mapId, selectionId: open.id, sectionId };
		case 'handout':
		case 'session-artifact':
			// No in-section deep-link target for these in the prototype's durable state — open the section.
			return null;
	}
}

/**
 * SRCH-007 — RESOLVE how a chosen search result should OPEN for an actor. Composes {@link resolveDeepLink}
 * for the domains with a precise in-section target (note/object heading, map POI viewport); for domains
 * without one (handout / session-artifact) it returns a plain `restore` to the section route. Visibility is
 * re-checked AT OPEN TIME through the same actor-filtered reads, so a now-hidden/now-deleted target resolves
 * to the generic `unavailable` (no leak). Pure + deterministic.
 */
export function resolveSearchResultOpen(
	state: DeepLinkStateView,
	actorId: ActorId,
	open: SearchResultOpenTarget,
): DeepLinkResolution {
	const target = targetForOpen(open);
	if (target) return resolveDeepLink(state, actorId, target);

	// Handout / session-artifact: no precise deep-link target yet — open the owning section route. This still
	// fails closed: an unknown actor (no actor record) gets the generic unavailable rather than a route.
	const sectionId = SECTION_BY_TYPE[open.type];
	const actor = state.permissions.actors[actorId];
	if (!actor) {
		return resolveDeepLink(state, actorId, { type: 'search-result', entityId: open.id, sectionId });
	}
	return {
		kind: 'restore',
		type: 'search-result',
		sectionId,
		entityId: open.id,
		// The section-route open carries no entity NAME (we are not resolving the handout/roll entity here, only
		// routing to its section), so it never leaks a title.
		entityName: '',
		selectionId: null,
		selectionLabel: null,
		route: ROUTE_ROOT_BY_SECTION[sectionId] ?? '/',
		viewport: null,
		hashAnchor: null,
	};
}
