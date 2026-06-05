import type { ActorId } from '../state/ids';
import type { ActorRole, PermissionState } from '../state/permission-state';
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
	/** SvelteKit route the GUI navigates to. */
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
