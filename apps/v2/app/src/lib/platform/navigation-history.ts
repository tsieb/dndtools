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
