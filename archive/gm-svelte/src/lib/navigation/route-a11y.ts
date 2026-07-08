import {
	resolveRouteAccessibility,
	type NavigationLocation,
	type NavigationRegistryEntry,
	type NavigationView,
	type RouteAccessibility,
} from '@dndtools/core';

/**
 * UX-SHELL — resolve the accessible route semantics for the shell (UX-NAV-009/010/011).
 *
 * The core {@link resolveRouteAccessibility} derives the single `h1`, the document title, the
 * route landmark, and the live route announcement from the contextual navigation view. That view
 * only resolves *released* sections, so a global destination that is approved-but-not-yet-built
 * (Knowledge, Campaign) would otherwise fall back to the app name. Since the seven-section global
 * nav presents those destinations now (with scaffolded honest-empty-state roots), the shell needs
 * their canonical title and landmark too.
 *
 * This helper consumes the actor-filtered IA registry view (`listNavigationRegistryForActor`,
 * already role-filtered) to fill that gap. It NEVER widens visibility: if the active actor cannot
 * reach the section, the registry omits it and we keep the core's fail-closed fallback, so a
 * player/observer who deep-links a section they cannot reach gets no leaked title (UX-NAV-013).
 */
export function resolveShellRouteAccessibility(
	view: NavigationView,
	registry: readonly NavigationRegistryEntry[],
	location: NavigationLocation,
	options: { appName: string },
): RouteAccessibility {
	const base = resolveRouteAccessibility(view, options);
	// A non-empty landmark means the core resolved a released section (or an open entity); use it.
	if (base.landmark) return base;

	// Planned-but-reachable section (role-filtered): present its canonical title + landmark.
	const section = registry.find((entry) => entry.id === location.sectionId && !entry.home);
	if (section) {
		return {
			heading: section.title,
			documentTitle: `${section.title} — ${options.appName}`,
			landmark: section.landmark,
			landmarkLabel: `${section.title} section`,
			announcement: section.title,
		};
	}

	// Actor cannot reach this section, or it is the home fallback: keep the core result (no leak).
	return base;
}
