import type { ActorRole } from '../state/permission-state';

/**
 * Canonical top-level Navigation Section registry (NAV-001, NAV-009).
 *
 * This module is the single source of truth for the application's information
 * architecture: the approved set of top-level Navigation Sections, the Command
 * Center home surface, and the per-section metadata an IA review requires before a
 * section may be scaffolded. NAV-009 mandates that the registry defines, for every
 * section: owner, route root, player/observer availability, aliases, landmark, the
 * local navigation contract, and release status. {@link CanonicalNavigationSection}
 * carries exactly those fields, and {@link validateNavigationSections} fails closed
 * if any are missing — that validator is the programmatic form of the IA-review gate
 * (NAV-009 AC1).
 *
 * Runtime vs. canonical:
 * - The canonical registry below names every approved section, including ones the
 *   prototype has not yet built (Knowledge, Atlas, Session, Campaign, Characters,
 *   Audio, MCP). Those carry `releaseStatus: 'planned'`.
 * - Only `released` sections are reachable at runtime. The runtime navigation view
 *   ({@link ../queries/navigation.listNavigationSections}) filters to released *and*
 *   actor-available sections, so the primary nav never renders a dead link to an
 *   unimplemented route, yet the approved IA is still maintained as data (NAV-001).
 *
 * Fail-closed availability (Contract 3): each section declares per-role availability.
 * A DM-only section (e.g. Scenes authoring, Audio, MCP) is *absent* for players and
 * observers — both at runtime and in any actor-filtered registry view — so navigation
 * data never reveals that a hidden section exists (NAV-009 AC2, NAV-001 AC3).
 *
 * Route aliases are stored here as canonical data (NAV-009). The alias *redirect*
 * machinery — generating legacy redirect stubs and preserving query/hash — is owned by
 * NAV-route-aliases-and-deep-links (NAV-002/004/005); this module only declares the
 * alias roots so IA review and that future epic share one source of truth.
 */

/** The product domain that owns a section's route surface (NAV-009 owner). */
export type SectionOwnerDomain =
	| 'CMD'
	| 'CANVAS'
	| 'CONTENT'
	| 'MAP'
	| 'SES'
	| 'CHAR'
	| 'AUDIO'
	| 'MCP'
	| 'PLAT';

/** Whether a section is implemented and reachable, or approved but not yet built. */
export type SectionReleaseStatus = 'released' | 'planned';

/** GUI grouping for a section's nav entry. Mirrors the runtime nav category. */
export type NavigationCategory = 'navigation' | 'settings';

/**
 * The shape of a section's local (in-section) navigation (NAV-009 local navigation
 * contract). `kind` names what the local section nav lists when the section is open;
 * `description` is the human-readable contract an IA reviewer signs off on.
 */
export type LocalNavigationContractKind =
	| 'none'
	| 'scene-list'
	| 'note-tree'
	| 'map-list'
	| 'session-timeline'
	| 'campaign-overview'
	| 'character-roster'
	| 'audio-library'
	| 'agent-tools'
	| 'settings-categories';

export interface LocalNavigationContract {
	kind: LocalNavigationContractKind;
	description: string;
}

/** Per-role reachability for a section (NAV-009 player/observer availability). */
export interface SectionActorAvailability {
	dm: boolean;
	player: boolean;
	observer: boolean;
}

/** A canonical top-level Navigation Section and the full IA metadata NAV-009 requires. */
export interface CanonicalNavigationSection {
	/** Stable section id, also used as the navigation registry key. */
	id: string;
	/** Display title shown in primary nav, breadcrumbs, and page title. */
	title: string;
	/** Owning product domain (NAV-009). */
	owner: SectionOwnerDomain;
	/** Canonical route root, e.g. `/atlas`. The home section's root is `/`. (NAV-009) */
	routeRoot: string;
	/** Per-role availability; DM-only sections set player/observer to false. (NAV-009) */
	availability: SectionActorAvailability;
	/** Legacy/alternate route roots that resolve to this section. (NAV-009; NAV-002) */
	aliases: string[];
	/** Route landmark / accessibility landmark id for this section. (NAV-009, NAV-007) */
	landmark: string;
	/** The in-section local navigation contract. (NAV-009) */
	localNav: LocalNavigationContract;
	/** Implemented-and-reachable vs. approved-but-not-built. (NAV-009) */
	releaseStatus: SectionReleaseStatus;
	/** Command-palette / search keywords for the section. */
	keywords: string[];
	/** GUI nav grouping. */
	category: NavigationCategory;
	/** Exactly one section is the application home surface — the Command Center. (NAV-001) */
	home: boolean;
}

/**
 * The approved top-level Navigation Sections (NAV-001, NAV-009).
 *
 * Order is the canonical IA order: the Command Center home, the Scenes authoring
 * surface, then the approved content/play sections (Knowledge, Atlas, Session,
 * Campaign, Characters, Audio, MCP), and finally Settings. The released subset —
 * Command Center, Scenes, Settings — is what the prototype renders today; the rest are
 * declared as approved IA with `releaseStatus: 'planned'`.
 */
export const CANONICAL_NAVIGATION_SECTIONS: readonly CanonicalNavigationSection[] = Object.freeze([
	{
		id: 'command-center',
		title: 'Command Center',
		owner: 'CMD',
		routeRoot: '/',
		availability: { dm: true, player: true, observer: true },
		aliases: ['/home'],
		landmark: 'command-center',
		localNav: {
			kind: 'none',
			description: 'The home Scene itself; no local section list — tools are widgets on the Scene.',
		},
		releaseStatus: 'released',
		keywords: ['home', 'command center', 'dashboard'],
		category: 'navigation',
		home: true,
	},
	{
		id: 'scenes',
		title: 'Scenes',
		owner: 'CANVAS',
		routeRoot: '/scenes',
		availability: { dm: true, player: false, observer: false },
		aliases: ['/canvas'],
		landmark: 'scenes',
		localNav: {
			kind: 'scene-list',
			description: 'The DM-authored Scenes in the vault, visibility-filtered for the actor.',
		},
		releaseStatus: 'released',
		keywords: ['scenes', 'authoring', 'widget packages', 'library'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'knowledge',
		title: 'Knowledge',
		owner: 'CONTENT',
		routeRoot: '/knowledge',
		availability: { dm: true, player: true, observer: false },
		aliases: ['/notes', '/wiki', '/vault'],
		landmark: 'knowledge',
		localNav: {
			kind: 'note-tree',
			description: 'The note/object tree and backlinks, visibility-filtered per actor.',
		},
		releaseStatus: 'planned',
		keywords: ['knowledge', 'notes', 'wiki', 'vault', 'content', 'lore'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'atlas',
		title: 'Atlas',
		owner: 'MAP',
		routeRoot: '/atlas',
		availability: { dm: true, player: true, observer: true },
		aliases: ['/maps', '/map'],
		landmark: 'atlas',
		localNav: {
			kind: 'map-list',
			description: 'The map list and the open map’s layers, visibility-filtered per actor.',
		},
		releaseStatus: 'planned',
		keywords: ['atlas', 'maps', 'map', 'world', 'regions'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'session',
		title: 'Session',
		owner: 'SES',
		routeRoot: '/session',
		availability: { dm: true, player: true, observer: true },
		aliases: ['/sessions', '/play'],
		landmark: 'session',
		localNav: {
			kind: 'session-timeline',
			description: 'The session timeline and live session tools for the current workflow state.',
		},
		releaseStatus: 'planned',
		keywords: ['session', 'sessions', 'play', 'combat', 'recap'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'campaign',
		title: 'Campaign',
		owner: 'CONTENT',
		routeRoot: '/campaign',
		availability: { dm: true, player: true, observer: false },
		aliases: ['/world'],
		landmark: 'campaign',
		localNav: {
			kind: 'campaign-overview',
			description: 'The campaign overview, calendar, and continuity, visibility-filtered per actor.',
		},
		releaseStatus: 'planned',
		keywords: ['campaign', 'world', 'calendar', 'timeline'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'characters',
		title: 'Characters',
		owner: 'CHAR',
		routeRoot: '/characters',
		availability: { dm: true, player: true, observer: false },
		aliases: ['/party', '/pcs'],
		landmark: 'characters',
		localNav: {
			kind: 'character-roster',
			description: 'The party roster; a player sees their owned character plus shared party records.',
		},
		releaseStatus: 'planned',
		keywords: ['characters', 'party', 'pcs', 'roster', 'sheet'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'audio',
		title: 'Audio',
		owner: 'AUDIO',
		routeRoot: '/audio',
		availability: { dm: true, player: false, observer: false },
		aliases: ['/sound', '/music'],
		landmark: 'audio',
		localNav: {
			kind: 'audio-library',
			description: 'The DM audio library and playlists. Player devices receive playback, not this control surface.',
		},
		releaseStatus: 'planned',
		keywords: ['audio', 'sound', 'music', 'ambience', 'playlist'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'mcp',
		title: 'MCP',
		owner: 'MCP',
		routeRoot: '/mcp',
		availability: { dm: true, player: false, observer: false },
		aliases: ['/ai', '/agents'],
		landmark: 'mcp',
		localNav: {
			kind: 'agent-tools',
			description: 'The optional MCP agent tools, identities, and staged-write review queue (DM-only).',
		},
		releaseStatus: 'planned',
		keywords: ['mcp', 'ai', 'agents', 'tools', 'staged writes'],
		category: 'navigation',
		home: false,
	},
	{
		id: 'settings',
		title: 'Settings',
		owner: 'PLAT',
		routeRoot: '/settings',
		availability: { dm: true, player: true, observer: true },
		aliases: ['/preferences'],
		landmark: 'settings',
		localNav: {
			kind: 'settings-categories',
			description: 'Device-local settings categories: platform profile, viewing actor, and reachable sections.',
		},
		releaseStatus: 'released',
		keywords: ['settings', 'preferences', 'profile', 'view as'],
		category: 'settings',
		home: false,
	},
]);

/** Compute the runtime route for a section's root, honoring `trailingSlash: 'always'`. */
export function sectionRuntimeRoute(section: CanonicalNavigationSection): string {
	return section.routeRoot === '/' ? '/' : `${section.routeRoot}/`;
}

/** Whether a section is reachable by the given role. An unknown role reaches nothing. */
export function isSectionAvailableForRole(
	section: CanonicalNavigationSection,
	role: ActorRole | undefined,
): boolean {
	if (!role) return false;
	return section.availability[role];
}

/**
 * The application home section — the Command Center (NAV-001 AC1). The registry is
 * validated to contain exactly one `home` section; this returns it or throws if the
 * registry is malformed (which {@link validateNavigationSections} also reports).
 */
export function getHomeSection(
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): CanonicalNavigationSection {
	const home = sections.find((section) => section.home);
	if (!home) throw new Error('navigation registry has no home section');
	return home;
}

/**
 * Resolve a route path to its owning canonical section by route root or alias
 * (NAV-009). Trailing slashes are normalized. This is a data-level lookup only; the
 * alias *redirect* behavior (NAV-002) lives in NAV-route-aliases-and-deep-links.
 */
export function findSectionByRoute(
	path: string,
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): CanonicalNavigationSection | undefined {
	const normalized = path.replace(/\/+$/, '') || '/';
	return sections.find(
		(section) => section.routeRoot === normalized || section.aliases.includes(normalized),
	);
}

/** A problem found by the IA-review validator: which section, which field, and why. */
export interface NavigationSectionProblem {
	sectionId: string;
	field: string;
	message: string;
}

const VALID_OWNERS: ReadonlySet<SectionOwnerDomain> = new Set([
	'CMD',
	'CANVAS',
	'CONTENT',
	'MAP',
	'SES',
	'CHAR',
	'AUDIO',
	'MCP',
	'PLAT',
]);

const VALID_LOCAL_NAV_KINDS: ReadonlySet<LocalNavigationContractKind> = new Set([
	'none',
	'scene-list',
	'note-tree',
	'map-list',
	'session-timeline',
	'campaign-overview',
	'character-roster',
	'audio-library',
	'agent-tools',
	'settings-categories',
]);

/**
 * Validate a Navigation Section registry against the IA-review contract (NAV-009 AC1,
 * NAV-001). This is the programmatic IA gate: it fails closed when a section omits the
 * required metadata — owner, route root, aliases, actor availability, local navigation
 * contract — and when the registry's structural invariants are violated (duplicate
 * ids/route roots/landmarks, alias collisions, or anything other than exactly one
 * home section reachable by every role).
 *
 * Returns an empty array when the registry is well-formed. A non-empty result is the
 * list of problems an IA reviewer (or CI gate) must resolve before scaffolding.
 */
export function validateNavigationSections(
	sections: readonly CanonicalNavigationSection[] = CANONICAL_NAVIGATION_SECTIONS,
): NavigationSectionProblem[] {
	const problems: NavigationSectionProblem[] = [];
	const seenIds = new Map<string, number>();
	const seenRouteRoots = new Map<string, string>();
	const seenLandmarks = new Map<string, string>();
	const seenRoutePaths = new Map<string, string>();
	let homeCount = 0;

	for (const section of sections) {
		const id = section.id || '<missing-id>';

		// --- Required IA-review fields (NAV-009 AC1). ---
		if (!section.id.trim()) {
			problems.push({ sectionId: id, field: 'id', message: 'section id is required' });
		}
		if (!section.title.trim()) {
			problems.push({ sectionId: id, field: 'title', message: 'title is required' });
		}
		if (!VALID_OWNERS.has(section.owner)) {
			problems.push({ sectionId: id, field: 'owner', message: 'owner must be a known product domain' });
		}
		if (!section.routeRoot.startsWith('/')) {
			problems.push({
				sectionId: id,
				field: 'routeRoot',
				message: 'route root is required and must start with "/"',
			});
		}
		if (!Array.isArray(section.aliases)) {
			problems.push({ sectionId: id, field: 'aliases', message: 'aliases must be declared (may be empty)' });
		} else {
			for (const alias of section.aliases) {
				if (!alias.startsWith('/')) {
					problems.push({
						sectionId: id,
						field: 'aliases',
						message: `alias "${alias}" must start with "/"`,
					});
				}
			}
		}
		if (
			typeof section.availability?.dm !== 'boolean' ||
			typeof section.availability?.player !== 'boolean' ||
			typeof section.availability?.observer !== 'boolean'
		) {
			problems.push({
				sectionId: id,
				field: 'availability',
				message: 'actor availability must declare dm/player/observer booleans',
			});
		}
		if (!section.landmark.trim()) {
			problems.push({ sectionId: id, field: 'landmark', message: 'landmark is required' });
		}
		if (!section.localNav || !VALID_LOCAL_NAV_KINDS.has(section.localNav.kind)) {
			problems.push({
				sectionId: id,
				field: 'localNav',
				message: 'a local navigation contract kind is required',
			});
		} else if (!section.localNav.description.trim()) {
			problems.push({
				sectionId: id,
				field: 'localNav',
				message: 'the local navigation contract must describe its behavior',
			});
		}
		if (section.releaseStatus !== 'released' && section.releaseStatus !== 'planned') {
			problems.push({
				sectionId: id,
				field: 'releaseStatus',
				message: 'release status must be "released" or "planned"',
			});
		}

		// --- Structural invariants (uniqueness + route-space collisions). ---
		seenIds.set(section.id, (seenIds.get(section.id) ?? 0) + 1);
		if (seenRouteRoots.has(section.routeRoot)) {
			problems.push({
				sectionId: id,
				field: 'routeRoot',
				message: `route root "${section.routeRoot}" is already owned by "${seenRouteRoots.get(section.routeRoot)}"`,
			});
		} else {
			seenRouteRoots.set(section.routeRoot, section.id);
		}
		if (section.landmark.trim()) {
			if (seenLandmarks.has(section.landmark)) {
				problems.push({
					sectionId: id,
					field: 'landmark',
					message: `landmark "${section.landmark}" is already used by "${seenLandmarks.get(section.landmark)}"`,
				});
			} else {
				seenLandmarks.set(section.landmark, section.id);
			}
		}
		// A route root and every alias must resolve to exactly one section.
		for (const path of [section.routeRoot, ...(section.aliases ?? [])]) {
			if (seenRoutePaths.has(path)) {
				problems.push({
					sectionId: id,
					field: 'aliases',
					message: `route path "${path}" already resolves to "${seenRoutePaths.get(path)}"`,
				});
			} else {
				seenRoutePaths.set(path, section.id);
			}
		}

		if (section.home) {
			homeCount += 1;
			if (!(section.availability.dm && section.availability.player && section.availability.observer)) {
				problems.push({
					sectionId: id,
					field: 'home',
					message: 'the home section must be reachable by every role',
				});
			}
		}
	}

	for (const [dupId, count] of seenIds) {
		if (count > 1) {
			problems.push({ sectionId: dupId, field: 'id', message: `duplicate section id (${count}×)` });
		}
	}
	if (homeCount !== 1) {
		problems.push({
			sectionId: '<registry>',
			field: 'home',
			message: `exactly one home section is required, found ${homeCount}`,
		});
	}

	return problems;
}
