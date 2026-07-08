import { redirect } from '@sveltejs/kit';
import { resolveRouteAlias } from '@dndtools/core';

/**
 * Shared legacy-alias redirect for the GUI route stubs (NAV-002).
 *
 * Each legacy alias route (e.g. `src/routes/maps/+page.ts`) is a *thin redirect stub*:
 * it does no rendering of its own and simply calls this helper, which asks the
 * Processing Core's {@link resolveRouteAlias} for the canonical target and performs a
 * 301 redirect, **preserving the search parameters and hash by default** (NAV-002 AC1).
 *
 * Keeping every stub a one-line call to one shared helper is what makes the
 * "redirect stub, not a duplicate implementation" rule (NAV-002 AC2) easy to honor and
 * to audit: a stub that re-implemented its canonical destination would be a different,
 * larger module. The alias → canonical mapping lives in the core registry, not here, so
 * the registry stays the single source of truth.
 *
 * Route-shape knowledge (the URL, search, and hash) belongs to the GUI (Contract 1);
 * the alias table and target composition belong to the core.
 */
export function redirectLegacyAlias(url: URL): never {
	const redirectTarget = resolveRouteAlias({
		path: url.pathname,
		search: url.search,
		hash: url.hash,
	});
	if (!redirectTarget) {
		// The route should not have been mounted if it is not a declared alias; treat an
		// unexpected non-alias as "go home" rather than loop or 404.
		throw redirect(301, '/');
	}
	throw redirect(301, redirectTarget.target);
}
