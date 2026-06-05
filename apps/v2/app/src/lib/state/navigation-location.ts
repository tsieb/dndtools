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
 */
export function locationFromPath(pathname: string): NavigationLocation {
	const path = pathname.replace(/\/+$/, '') || '/';
	if (path === '/') return { sectionId: 'command-center' };
	if (path === '/settings') return { sectionId: 'settings' };
	if (path === '/scenes') return { sectionId: 'scenes' };
	if (path === '/atlas') return { sectionId: 'atlas' };
	const sceneMatch = /^\/scene\/([^/]+)$/.exec(path);
	if (sceneMatch) {
		return { sectionId: 'scenes', entity: { type: 'scene', id: sceneMatch[1]! } };
	}
	// Unknown routes resolve to the home section so navigation never dead-ends.
	return { sectionId: 'command-center' };
}
