import type { ActorId } from '../state/ids';
import type { ActorRole, PermissionState } from '../state/permission-state';

/**
 * Navigation section registry and actor filtering (NAV-008, NAV-010).
 *
 * The navigation surface is just another GUI surface that reads actor-filtered
 * availability from the Processing Core (Contract 1, Contract 3). This module owns
 * the small registry of top-level sections the prototype ships and decides, per
 * actor role, which sections are reachable. DM-only sections are *absent* for
 * players and observers rather than disabled, so navigation never reveals that a
 * hidden section exists (NAV-010 AC1).
 *
 * Scope note: the full canonical Navigation Section registry — owner, aliases,
 * landmarks, release status, and the complete section list (Knowledge, Atlas,
 * Session, Campaign, Characters, Audio, MCP, Settings) — is owned by
 * NAV-home-and-canonical-sections (NAV-001/NAV-009). This registry is intentionally
 * limited to the routes the prototype actually renders.
 */

/** Which roles may reach a section. `all` includes DM, player, and observer. */
export type NavigationAudience = 'all' | 'dm-only';

export type NavigationCategory = 'navigation' | 'settings';

export interface NavigationSectionDef {
	id: string;
	title: string;
	/** SvelteKit route the GUI navigates to. */
	route: string;
	keywords: string[];
	audience: NavigationAudience;
	category: NavigationCategory;
}

/**
 * The prototype's top-level navigation sections. Command Center is the home
 * surface and is reachable by every role; the Scenes authoring surface is DM-only;
 * Settings exposes local, device-scoped display preferences to every role.
 */
export const NAVIGATION_SECTIONS: readonly NavigationSectionDef[] = Object.freeze([
	{
		id: 'command-center',
		title: 'Command Center',
		route: '/',
		keywords: ['home', 'command center', 'dashboard'],
		audience: 'all',
		category: 'navigation',
	},
	{
		id: 'scenes',
		title: 'Scenes',
		route: '/scenes/',
		keywords: ['scenes', 'authoring', 'widget packages', 'library'],
		audience: 'dm-only',
		category: 'navigation',
	},
	{
		id: 'settings',
		title: 'Settings',
		route: '/settings/',
		keywords: ['settings', 'preferences', 'profile', 'view as'],
		audience: 'all',
		category: 'settings',
	},
]);

export interface NavigationSection {
	id: string;
	title: string;
	route: string;
	keywords: string[];
	category: NavigationCategory;
}

function audienceAllows(audience: NavigationAudience, role: ActorRole | undefined): boolean {
	if (!role) return false;
	if (audience === 'all') return true;
	return role === 'dm';
}

/**
 * List the navigation sections reachable by an actor. This is the single
 * actor-filtered navigation availability API consumed by both the primary nav and
 * the command palette (NAV-010). An unknown actor receives an empty list (fail
 * closed). DM-only sections are omitted entirely for non-DM actors.
 */
export function listNavigationSections(
	permission: PermissionState,
	actorId: ActorId,
): NavigationSection[] {
	const role = permission.actors[actorId]?.role;
	return NAVIGATION_SECTIONS.filter((section) => audienceAllows(section.audience, role)).map(
		(section) => ({
			id: section.id,
			title: section.title,
			route: section.route,
			keywords: section.keywords,
			category: section.category,
		}),
	);
}
