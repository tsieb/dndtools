import type { NavigationLocation } from '@dndtools/v2-core';

/**
 * Map a SvelteKit route pathname to the Processing-Core {@link NavigationLocation}
 * (NAV-003). The route is the single source of truth for "where am I"; the whole
 * contextual navigation view is recomputed from this one location, so no navigation
 * surface keeps a competing copy of route state.
 *
 * Route knowledge belongs to the GUI (Contract 1): the app knows its SvelteKit
 * route shapes; the core only knows section/entity ids. Trailing slashes are
 * normalized because the app uses `trailingSlash: 'always'`.
 *
 * Every global section root (UX-SHELL / UX-NAV-002) maps here so the shell resolves the
 * correct route landmark, single `h1`, page title, and route announcement for each of the
 * seven destinations — not just the home Scene. The non-global Scenes capability and its
 * `/scene/:id` editor map to the Scenes section id.
 */

/** Section root pathname (trailing slash stripped) → canonical section id. */
const SECTION_ROOTS: Readonly<Record<string, string>> = {
	'/settings': 'settings',
	'/session': 'session',
	'/characters': 'characters',
	'/atlas': 'atlas',
	'/campaign': 'campaign',
	'/knowledge': 'knowledge',
	'/scenes': 'scenes',
};

export function locationFromPath(pathname: string): NavigationLocation {
	const path = pathname.replace(/\/+$/, '') || '/';
	if (path === '/') return { sectionId: 'command-center' };

	const sceneMatch = /^\/scene\/([^/]+)$/.exec(path);
	if (sceneMatch) {
		return { sectionId: 'scenes', entity: { type: 'scene', id: sceneMatch[1]! } };
	}

	// Resolve a section root or any descendant route (e.g. `/session/123`) to its section.
	for (const [root, sectionId] of Object.entries(SECTION_ROOTS)) {
		if (path === root || path.startsWith(`${root}/`)) return { sectionId };
	}

	// Unknown routes resolve to the home section so navigation never dead-ends.
	return { sectionId: 'command-center' };
}
