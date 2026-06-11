/**
 * Pure transforms for device-local pinned/recent navigation lists (NAV-003).
 *
 * Pinned and recent items are device-local GUI preferences: they are not durable
 * vault/campaign state and never enter the operation log or sync stream (Contract 1
 * "Local display preferences"; Contract 2 device-local storage). Keeping the list
 * transforms here as pure functions lets the store wrapper stay thin and lets these
 * rules be unit-tested without the DOM.
 */

export interface NavEntry {
	route: string;
	title: string;
}

export const MAX_RECENT = 8;

/** UX-NAV-015 display caps for the sidebar/rail strip: up to 8 pinned items, and the 5 most
 *  recent reachable destinations ("up to 5 recent items"). The store retains more history; the
 *  strip surfaces the most relevant slice so the sidebar stays glanceable. */
export const STRIP_PINNED_LIMIT = 8;
export const STRIP_RECENT_LIMIT = 5;

/** Add a visit to the front of the recent list, de-duplicating by route and
 *  capping the length. The most recent visit wins its title. */
export function addRecentEntry(recent: NavEntry[], entry: NavEntry, max = MAX_RECENT): NavEntry[] {
	const withoutDuplicate = recent.filter((existing) => existing.route !== entry.route);
	return [entry, ...withoutDuplicate].slice(0, Math.max(0, max));
}

/** Toggle a route's pinned state, preserving insertion order for stable display. */
export function togglePinnedEntry(pinned: NavEntry[], entry: NavEntry): NavEntry[] {
	if (pinned.some((existing) => existing.route === entry.route)) {
		return pinned.filter((existing) => existing.route !== entry.route);
	}
	return [...pinned, entry];
}

export function isPinned(pinned: NavEntry[], route: string): boolean {
	return pinned.some((existing) => existing.route === route);
}

/**
 * Keep only entries whose route is currently reachable by the active actor, and
 * refresh each title from the reachable set so renames are reflected. This fails
 * closed: a route that is no longer reachable (for example a DM-only Scene while
 * viewing as a player) is dropped rather than surfaced.
 */
export function filterReachable(
	entries: NavEntry[],
	reachable: ReadonlyArray<{ route: string; title: string }>,
): NavEntry[] {
	const titleByRoute = new Map(reachable.map((destination) => [destination.route, destination.title]));
	const out: NavEntry[] = [];
	for (const entry of entries) {
		const title = titleByRoute.get(entry.route);
		if (title === undefined) continue;
		out.push({ route: entry.route, title });
	}
	return out;
}

/** The actor-filtered pinned + recent lists the strip renders (UX-NAV-015). */
export interface StripLists {
	pinned: NavEntry[];
	recent: NavEntry[];
}

/**
 * Build the pinned/recent strip lists for the active actor (UX-NAV-015).
 *
 * Both lists are filtered through {@link filterReachable} against the actor-reachable set, so a
 * route the active actor cannot reach — e.g. a DM-only Scene while viewing as a player — is dropped
 * entirely (no leak, UX-NAV-013), and each title is refreshed from the reachable set so a rename
 * never leaves a stale label. Recents exclude routes already pinned (they appear once, above), and
 * each list is capped to its display limit so the strip stays glanceable.
 */
export function selectStripLists(
	pinned: NavEntry[],
	recent: NavEntry[],
	reachable: ReadonlyArray<{ route: string; title: string }>,
): StripLists {
	const filteredPinned = filterReachable(pinned, reachable);
	const pinnedRoutes = new Set(filteredPinned.map((entry) => entry.route));
	const filteredRecent = filterReachable(recent, reachable).filter(
		// Exclude already-pinned routes (shown once, above) and the Command Center home, which is
		// always one click away via the home item — auto-listing it as "recent" is redundant noise.
		(entry) => !pinnedRoutes.has(entry.route) && entry.route !== '/',
	);
	return {
		pinned: filteredPinned.slice(0, STRIP_PINNED_LIMIT),
		recent: filteredRecent.slice(0, STRIP_RECENT_LIMIT),
	};
}
