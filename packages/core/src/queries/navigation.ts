import type { ActorId } from '../state/ids';
import type { ActorRole, PermissionState } from '../state/permission-state';
import { DEEP_LINK_UNAVAILABLE_MESSAGE } from './deep-links';
import {
	CANONICAL_NAVIGATION_SECTIONS,
	isSectionAvailableForRole,
	sectionRuntimeRoute,
	type CanonicalNavigationSection,
	type LocalNavigationContract,
	type NavigationCategory,
	type SectionActorAvailability,
	type SectionOwnerDomain,
	type SectionReleaseStatus,
} from './navigation-sections';

/**
 * Runtime navigation availability (NAV-001, NAV-008, NAV-010).
 *
 * The navigation surface is just another GUI surface that reads actor-filtered
 * availability from the Processing Core (Contract 1, Contract 3). The canonical IA —
 * owner, route root, aliases, landmark, local navigation contract, and release status
 * for every approved section — lives in {@link CANONICAL_NAVIGATION_SECTIONS}
 * (NAV-009). This module derives the *runtime* view from it:
 *
 * - {@link listNavigationSections} returns the sections the actor may actually reach:
 *   `released` sections that are available to the actor's role. DM-only sections are
 *   *absent* for players and observers (not disabled), so navigation never reveals a
 *   hidden section exists (NAV-010 AC1, NAV-009 AC2). Planned-but-unbuilt sections are
 *   absent for everyone, so the primary nav never renders a dead link.
 * - {@link listNavigationRegistryForActor} returns the richer IA metadata for the
 *   sections an actor may know about, for surfaces that display the canonical IA (e.g.
 *   a Settings registry view). It applies the same role filter, so DM-only sections
 *   never leak into player/observer navigation data (NAV-009 AC2).
 */

export type {
	LocalNavigationContract,
	LocalNavigationContractKind,
	NavigationCategory,
	SectionActorAvailability,
	SectionOwnerDomain,
	SectionReleaseStatus,
} from './navigation-sections';

/** Which roles may reach a section. `all` includes DM, player, and observer.
 *  Derived from the canonical per-role availability for back-compatible consumers. */
export type NavigationAudience = 'all' | 'dm-only';

export interface NavigationSectionDef {
	id: string;
	title: string;
	/** Route the GUI navigates to. */
	route: string;
	keywords: string[];
	audience: NavigationAudience;
	category: NavigationCategory;
}

function audienceOf(availability: SectionActorAvailability): NavigationAudience {
	return availability.player && availability.observer ? 'all' : 'dm-only';
}

/**
 * The prototype's *released* top-level navigation sections, in canonical order:
 * Command Center (home), the DM-only Scenes authoring surface, the Atlas map deep-link
 * surface, and Settings. Derived from the canonical registry so the released runtime
 * nav and the approved IA can never drift.
 */
export const NAVIGATION_SECTIONS: readonly NavigationSectionDef[] = Object.freeze(
	CANONICAL_NAVIGATION_SECTIONS.filter((section) => section.releaseStatus === 'released').map(
		(section) => ({
			id: section.id,
			title: section.title,
			route: sectionRuntimeRoute(section),
			keywords: section.keywords,
			audience: audienceOf(section.availability),
			category: section.category,
		}),
	),
);

/** The actor-reachable runtime view of a navigation section. */
export interface NavigationSection {
	id: string;
	title: string;
	route: string;
	keywords: string[];
	category: NavigationCategory;
	/** Route landmark id for this section (NAV-001 AC2). */
	landmark: string;
}

/** The actor-filtered canonical IA metadata for a section (NAV-009). Carries the full
 *  registry detail a section-registry view renders, after role availability filtering. */
export interface NavigationRegistryEntry {
	id: string;
	title: string;
	owner: SectionOwnerDomain;
	/** The primary user task this section serves (NAV-006 task fit). */
	taskFit: string;
	routeRoot: string;
	route: string;
	availability: SectionActorAvailability;
	aliases: string[];
	landmark: string;
	localNav: LocalNavigationContract;
	releaseStatus: SectionReleaseStatus;
	category: NavigationCategory;
	/** True when the actor can navigate here now (released and role-available). */
	reachable: boolean;
	home: boolean;
}

function roleOf(permission: PermissionState, actorId: ActorId): ActorRole | undefined {
	return permission.actors[actorId]?.role;
}

/**
 * List the navigation sections reachable by an actor. This is the single
 * actor-filtered navigation availability API consumed by both the primary nav and
 * the command palette (NAV-010). An unknown actor receives an empty list (fail
 * closed). DM-only sections are omitted entirely for non-DM actors, and planned
 * (unbuilt) sections are omitted for everyone.
 */
export function listNavigationSections(
	permission: PermissionState,
	actorId: ActorId,
): NavigationSection[] {
	const role = roleOf(permission, actorId);
	if (!role) return [];
	return CANONICAL_NAVIGATION_SECTIONS.filter(
		(section) => section.releaseStatus === 'released' && isSectionAvailableForRole(section, role),
	).map((section) => ({
		id: section.id,
		title: section.title,
		route: sectionRuntimeRoute(section),
		keywords: section.keywords,
		category: section.category,
		landmark: section.landmark,
	}));
}

/**
 * List the canonical IA registry entries an actor may receive (NAV-001, NAV-009).
 * Unlike {@link listNavigationSections}, this includes approved-but-`planned` sections
 * so a section-registry view can show the maintained IA, but it still applies the role
 * availability filter so a DM-only section is *absent* for players and observers
 * (NAV-009 AC2) — navigation data never leaks a hidden section. An unknown actor
 * receives an empty list (fail closed).
 */
export function listNavigationRegistryForActor(
	permission: PermissionState,
	actorId: ActorId,
): NavigationRegistryEntry[] {
	const role = roleOf(permission, actorId);
	if (!role) return [];
	return CANONICAL_NAVIGATION_SECTIONS.filter((section) =>
		isSectionAvailableForRole(section, role),
	).map((section) => toRegistryEntry(section, role));
}

/**
 * The access decision for loading a section-rooted route directly (UX-NAV-013 AC2).
 * `available` means the shell renders the route's content; `unavailable` means the shell
 * must render the generic, non-leaking "Not available" page instead — never the section.
 */
export type SectionRouteAccess =
	| { kind: 'available' }
	| { kind: 'unavailable'; message: string };

/** Normalize a path for prefix comparison: strip trailing slashes, keep the root. */
function normalizeRoutePath(path: string): string {
	return path.replace(/\/+$/, '') || '/';
}

/** Whether `pathname` is the section root `root` or a route nested under it. The home root
 *  (`/`) is excluded: it is a prefix of every path and is reachable by all roles, so it never
 *  acts as a guard root. */
function pathWithinRoot(pathname: string, root: string): boolean {
	const path = normalizeRoutePath(pathname);
	const sectionRoot = normalizeRoutePath(root);
	if (sectionRoot === '/') return false;
	return path === sectionRoot || path.startsWith(`${sectionRoot}/`);
}

/**
 * Find the most specific canonical section that owns `pathname` (matching its route root or
 * any legacy alias, root-or-descendant). Returns `undefined` for routes that are not section
 * roots (entity routes such as `/scene/<id>/`, or unowned paths), which are guarded by their
 * own page-level visibility checks rather than this section-level gate.
 */
function findSectionForPath(pathname: string): CanonicalNavigationSection | undefined {
	let best: CanonicalNavigationSection | undefined;
	for (const section of CANONICAL_NAVIGATION_SECTIONS) {
		const roots = [section.routeRoot, ...section.aliases];
		if (!roots.some((root) => pathWithinRoot(pathname, root))) continue;
		if (!best || section.routeRoot.length > best.routeRoot.length) best = section;
	}
	return best;
}

/**
 * Decide whether the active actor may load a section route directly (UX-NAV-013 AC2 / NAV-001).
 *
 * The seven global destinations are all player-reachable, so navigating to one is always
 * available (a section may still render its own actor-filtered, possibly empty, content). The
 * DM-only *capability* sections — Scenes, Audio, MCP — are absent from the player/observer
 * navigation entirely; if a non-DM session reaches one by typing or following a stale link, the
 * shell must render the single generic "Not available" page (no entity, route, or section name)
 * rather than the capability surface. This is the route-level counterpart to the actor-filtered
 * nav data ({@link listNavigationRegistryForActor}) and command list, so a hidden capability can
 * never be reached through nav, the palette, OR a direct URL. Fail closed: an unknown actor is
 * treated as non-DM, so a DM-only route is unavailable to it.
 */
export function resolveSectionRouteAccess(
	permission: PermissionState,
	actorId: ActorId,
	pathname: string,
): SectionRouteAccess {
	const section = findSectionForPath(pathname);
	// Not a guarded section root (entity routes, settings sub-routes, unowned paths): the page
	// owns its own visibility; the section gate does not apply.
	if (!section) return { kind: 'available' };
	// Only genuinely DM-only *capability* sections (no player AND no observer access — Scenes,
	// Audio, MCP) are hard-gated at the route level. Player-visible sections, even observer-hidden
	// ones like Characters/Campaign/Knowledge, render their own actor-filtered (possibly empty)
	// content, so they are never replaced by the unavailable page here.
	const dmOnlyCapability = !section.availability.player && !section.availability.observer;
	if (!dmOnlyCapability) return { kind: 'available' };
	const role = roleOf(permission, actorId);
	if (role === 'dm') return { kind: 'available' };
	return { kind: 'unavailable', message: DEEP_LINK_UNAVAILABLE_MESSAGE };
}

function toRegistryEntry(
	section: CanonicalNavigationSection,
	role: ActorRole,
): NavigationRegistryEntry {
	return {
		id: section.id,
		title: section.title,
		owner: section.owner,
		taskFit: section.taskFit,
		routeRoot: section.routeRoot,
		route: sectionRuntimeRoute(section),
		availability: section.availability,
		aliases: section.aliases,
		landmark: section.landmark,
		localNav: section.localNav,
		releaseStatus: section.releaseStatus,
		category: section.category,
		reachable: section.releaseStatus === 'released' && isSectionAvailableForRole(section, role),
		home: section.home,
	};
}
