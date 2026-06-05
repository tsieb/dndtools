import {
	CANONICAL_NAVIGATION_SECTIONS,
	type CanonicalNavigationSection,
} from './navigation-sections';

/**
 * Legacy route alias resolution (NAV-002).
 *
 * The canonical Navigation Section registry ({@link CANONICAL_NAVIGATION_SECTIONS})
 * already declares, for every section, the legacy/alternate route roots that should
 * resolve to it (NAV-009 `aliases`). This module owns the *redirect* behavior that
 * the registry deliberately deferred: given a requested path — plus its search string
 * and hash — it computes the canonical redirect target, **preserving search parameters
 * and hashes by default** (NAV-002 AC1). The GUI route shell mounts a thin redirect
 * stub per alias root and calls {@link resolveRouteAlias}; it owns no alias table of
 * its own, so the registry stays the single source of truth.
 *
 * This is a pure data transform (Contract 1): it knows alias → canonical-root mappings
 * and how to recompose a path/search/hash. It performs no navigation and touches no DOM
 * — the GUI applies the returned target.
 *
 * The "redirect stub, not a duplicate implementation" rule (NAV-002 AC2) is enforced by
 * {@link auditRouteAliasStubs}: an alias route that re-implements its canonical
 * destination instead of redirecting to it fails the gate.
 */

/** A query parameter the GUI passes through from a legacy URL, e.g. `poi=abc`. */
export interface RouteAliasSearchParam {
	key: string;
	value: string;
}

/** The request the GUI hands the alias resolver: the requested path plus the raw
 *  search string and hash from the legacy URL. */
export interface RouteAliasRequest {
	/** The requested path, e.g. `/maps` or `/maps/`. Trailing slashes are normalized. */
	path: string;
	/**
	 * The raw search string including a leading `?`, or `''`. Preserved verbatim by
	 * default so a legacy `?poi=abc&x=1&y=2` survives the redirect (NAV-002 AC1).
	 */
	search?: string;
	/** The raw hash including a leading `#`, or `''`. Preserved by default. */
	hash?: string;
}

/** The redirect the GUI performs, or `null` when the path is already canonical / unknown. */
export interface RouteAliasRedirect {
	/** The canonical section root the alias resolves to, e.g. `/atlas`. */
	canonicalRoot: string;
	/** The owning canonical section id. */
	sectionId: string;
	/** The full redirect target path, including the preserved search and hash. */
	target: string;
	/** True when the original request carried a search string that was preserved. */
	preservedSearch: boolean;
	/** True when the original request carried a hash that was preserved. */
	preservedHash: boolean;
}

/** Normalize a route path for alias comparison: strip trailing slashes, keep `/`. */
function normalizePath(path: string): string {
	return path.replace(/\/+$/, '') || '/';
}

/** A canonical alias-table entry: the canonical destination plus whether that
 *  destination section is released (and so has a real route to redirect to). */
export interface RouteAliasTableEntry {
	canonicalRoot: string;
	sectionId: string;
	/** True when the destination section is `released`, so its route is scaffolded and a
	 *  redirect lands on a real page rather than an unbuilt one. */
	released: boolean;
}

/**
 * The canonical alias table, derived from the registry: every declared alias root maps
 * to its owning section's canonical route root. This is data, not a hand-maintained
 * second list — adding an alias to the registry adds it here (NAV-002, NAV-009).
 */
export function buildRouteAliasTable(
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): Map<string, RouteAliasTableEntry> {
	const table = new Map<string, RouteAliasTableEntry>();
	for (const section of sections) {
		for (const alias of section.aliases) {
			table.set(normalizePath(alias), {
				canonicalRoot: section.routeRoot,
				sectionId: section.id,
				released: section.releaseStatus === 'released',
			});
		}
	}
	return table;
}

/**
 * The alias route roots that need a redirect stub mounted now, derived from the
 * registry. By default only aliases whose destination section is *released* are
 * included, because a redirect to an unbuilt section would land on a missing page; pass
 * `{ includePlanned: true }` to list every declared alias (e.g. for the full audit).
 */
export function listAliasRoutes(
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
	options: { includePlanned?: boolean } = {},
): string[] {
	const table = buildRouteAliasTable(sections);
	return [...table.entries()]
		.filter(([, entry]) => options.includePlanned || entry.released)
		.map(([route]) => route)
		.sort();
}

/** Recompose a canonical root with a preserved search string and hash, honoring
 *  `trailingSlash: 'always'` for non-root section roots. */
function composeTarget(canonicalRoot: string, search: string, hash: string): string {
	const root = canonicalRoot === '/' ? '/' : `${canonicalRoot}/`;
	return `${root}${search}${hash}`;
}

/**
 * Resolve a requested path to its canonical redirect, preserving the search string and
 * hash by default (NAV-002 AC1).
 *
 * Returns `null` when the path is not a known alias (it is already canonical, or it is
 * an unrelated route the GUI handles itself). When the path *is* an alias, the search
 * and hash are carried through verbatim: a legacy `/maps?poi=abc&x=1&y=2#layers`
 * redirects to `/atlas/?poi=abc&x=1&y=2#layers` with every parameter intact.
 */
export function resolveRouteAlias(
	request: RouteAliasRequest,
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): RouteAliasRedirect | null {
	const table = buildRouteAliasTable(sections);
	const normalized = normalizePath(request.path);
	const entry = table.get(normalized);
	if (!entry) return null;

	// Preserve search and hash verbatim. Tolerate callers that pass the value with or
	// without the leading `?`/`#` so the GUI can hand us either `location.search` or a
	// reconstructed string.
	const rawSearch = request.search ?? '';
	const rawHash = request.hash ?? '';
	const search = rawSearch && !rawSearch.startsWith('?') ? `?${rawSearch}` : rawSearch;
	const hash = rawHash && !rawHash.startsWith('#') ? `#${rawHash}` : rawHash;

	return {
		canonicalRoot: entry.canonicalRoot,
		sectionId: entry.sectionId,
		target: composeTarget(entry.canonicalRoot, search, hash),
		preservedSearch: search.length > 0,
		preservedHash: hash.length > 0,
	};
}

/** A problem found by the alias-stub audit (NAV-002 AC2). */
export interface RouteAliasStubProblem {
	kind: 'duplicate-implementation' | 'unknown-alias-route' | 'missing-alias-stub';
	/** The alias route the problem concerns. */
	route: string;
	message: string;
}

/**
 * Describe a scaffolded alias route so the audit can tell a thin redirect stub from a
 * full duplicate of the canonical destination (NAV-002 AC2). The GUI computes these
 * facts about its own route files (route-shape knowledge is the GUI's — Contract 1) and
 * hands them to this pure audit.
 */
export interface AliasRouteDescriptor {
	/** The alias route root, e.g. `/maps`. */
	route: string;
	/**
	 * True when the route module redirects to its canonical destination rather than
	 * rendering its own copy of the destination's UI. A redirect stub sets this true; a
	 * route that re-implements the canonical section sets it false.
	 */
	redirectsToCanonical: boolean;
}

export interface RouteAliasAuditInput {
	/** The alias routes the GUI has scaffolded, with whether each is a redirect stub. */
	aliasRoutes: readonly AliasRouteDescriptor[];
}

/**
 * Audit the scaffolded alias routes against the canonical alias table (NAV-002 AC2).
 *
 * Fails closed in three ways:
 *
 * 1. `duplicate-implementation` — an alias route exists but does **not** redirect to its
 *    canonical destination (it re-implements it). This is the "a full duplicate legacy
 *    implementation exists instead of a redirect stub → the gate fails" criterion
 *    (NAV-002 AC2).
 * 2. `unknown-alias-route` — a scaffolded "alias" route is not declared as an alias in
 *    the canonical registry, so it has no canonical destination to redirect to.
 * 3. `missing-alias-stub` — a declared alias has no scaffolded redirect stub, so the
 *    legacy URL would 404 instead of redirecting.
 *
 * Returns an empty array when every declared alias has exactly one redirect stub and no
 * duplicate implementation exists.
 */
export function auditRouteAliasStubs(
	input: RouteAliasAuditInput,
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): RouteAliasStubProblem[] {
	const problems: RouteAliasStubProblem[] = [];
	const table = buildRouteAliasTable(sections);
	const scaffolded = new Map<string, AliasRouteDescriptor>();

	for (const descriptor of input.aliasRoutes) {
		const route = normalizePath(descriptor.route);
		scaffolded.set(route, descriptor);
		if (!table.has(route)) {
			problems.push({
				kind: 'unknown-alias-route',
				route,
				message: `alias route "${route}" is not declared in the canonical Navigation Section registry`,
			});
			continue;
		}
		if (!descriptor.redirectsToCanonical) {
			problems.push({
				kind: 'duplicate-implementation',
				route,
				message: `alias route "${route}" must be a redirect stub to "${table.get(route)?.canonicalRoot}", not a duplicate implementation`,
			});
		}
	}

	// Only aliases whose destination section is released need a stub today: an alias to a
	// `planned` (unbuilt) section has no real route to redirect to yet, and its stub is
	// added when that section's feature epic releases it.
	for (const [aliasRoute, entry] of table) {
		if (!entry.released) continue;
		if (!scaffolded.has(aliasRoute)) {
			problems.push({
				kind: 'missing-alias-stub',
				route: aliasRoute,
				message: `declared alias "${aliasRoute}" for released section "${entry.sectionId}" has no scaffolded redirect stub`,
			});
		}
	}

	return problems;
}
