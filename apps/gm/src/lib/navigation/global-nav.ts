import type { NavigationRegistryEntry } from '@dndtools/core';
import type { IconName } from '$lib/gui/icons';

/**
 * UX-SHELL — the seven-destination global navigation presentation (UX-NAV-002, UX-NAV-004,
 * UX-NAV-005, UX-NAV-006).
 *
 * This module is the GUI-layer presentation refinement the navigation contract delegates to:
 * it presents the SEVEN accepted global destinations — Command Center, Session, Characters, Atlas, Campaign,
 * Knowledge, Settings — in their fixed canonical order, and treats Scenes/Audio/MCP as
 * non-global capabilities that are reached through the command palette and section-local
 * surfaces rather than a primary-nav slot.
 *
 * It CONSUMES, never redefines, the source-of-truth registry:
 * - The ordered ids below are validated against
 *   `apps/gm/tests/fixtures/navigation-registry.yaml` by `global-nav.test.ts`, so this list cannot
 *   drift from the accepted contract.
 * - The runtime title / route / landmark / role-availability for each item come from the
 *   actor-filtered functional registry view ({@link NavigationRegistryEntry} from
 *   `listNavigationRegistryForActor`), so DM-only / observer-hidden sections are ABSENT from the
 *   produced nav (not hidden), and the data the shell renders is exactly the data the command
 *   palette and visible controls read (NAV-010, UX-NAV-013 / actor safety).
 *
 * This module is pure (no Svelte runtime, no DOM): the shell and {@link GlobalNav} component
 * render its output and the unit tests exercise it directly.
 */

/** The fixed canonical order of the seven global navigation destinations (UX-NAV-002). */
export const GLOBAL_NAV_ORDER = [
	'command-center',
	'session',
	'characters',
	'atlas',
	'campaign',
	'knowledge',
	'settings',
] as const;

export type GlobalNavId = (typeof GLOBAL_NAV_ORDER)[number];

/** Capability / authoring sections that are explicitly NOT global nav items (reached via the
 *  command palette, Command Center widget drawer, and Settings — never the primary nav). */
export const NON_GLOBAL_CAPABILITY_IDS = ['scenes', 'audio', 'mcp'] as const;

const ORDER_INDEX: Readonly<Record<string, number>> = Object.freeze(
	Object.fromEntries(GLOBAL_NAV_ORDER.map((id, index) => [id, index])),
);

/** Per-section presentation metadata the registry does not carry (icon + compact label). The
 *  icon ids mirror `navigation-registry.yaml` and resolve through the shared icon registry. */
interface GlobalNavPresentation {
	icon: IconName;
	/** Short label used in the compact (Mobile) tab bar where width is tight (UX-NAV-001). */
	shortLabel: string;
}

const PRESENTATION: Readonly<Record<GlobalNavId, GlobalNavPresentation>> = Object.freeze({
	'command-center': { icon: 'home', shortLabel: 'Home' },
	session: { icon: 'session-bolt', shortLabel: 'Session' },
	characters: { icon: 'characters-person', shortLabel: 'Party' },
	atlas: { icon: 'atlas-map', shortLabel: 'Atlas' },
	campaign: { icon: 'campaign-scroll', shortLabel: 'Campaign' },
	knowledge: { icon: 'knowledge-book', shortLabel: 'Notes' },
	settings: { icon: 'settings-gear', shortLabel: 'Settings' },
});

/** A resolved global-nav item the shell renders on every platform profile. */
export interface GlobalNavItem {
	id: GlobalNavId;
	title: string;
	/** Short label for the compact (Mobile) tab bar. */
	shortLabel: string;
	/** The SvelteKit route the item links to (already trailing-slash normalized by the core). */
	route: string;
	icon: IconName;
	/** Route landmark id for the section (NAV-007 / UX-NAV-009). */
	landmark: string;
	/** True when the current route is within this section. */
	active: boolean;
	/** 1-based position among visible items; drives the `Alt+<n>` shortcut (UX-NAV-002). */
	position: number;
	/** True for the Settings item, which is divider-separated and pinned last (UX-NAV-002). */
	last: boolean;
	/** True for the Command Center home item, pinned first (UX-NAV-001). */
	home: boolean;
}

/** Normalize a route path for active-section comparison: strip trailing slashes, keep root. */
function normalizePath(path: string): string {
	return path.replace(/\/+$/, '') || '/';
}

/**
 * Whether `pathname` is within the section rooted at `route`. The Command Center home (`/`) is
 * active only on the exact root so a deeper route never lights up Home; every other section is
 * active on its root and any descendant route.
 */
export function isSectionActive(pathname: string, route: string, home: boolean): boolean {
	const path = normalizePath(pathname);
	const root = normalizePath(route);
	if (home || root === '/') return path === '/';
	return path === root || path.startsWith(`${root}/`);
}

/**
 * Build the ordered, actor-filtered global navigation from the functional registry view.
 *
 * `entries` is the output of `listNavigationRegistryForActor` (already role-filtered, so a
 * section the actor cannot reach is absent). We keep only the seven global destinations, drop
 * the non-global capabilities (Scenes/Audio/MCP), and order them by the canonical sequence.
 * The result is the single source the sidebar, rail, and tab bar all render, so the section
 * set and order are identical across Desktop, Tablet, and Mobile (UX-NAV-002 / platform parity).
 */
export function buildGlobalNav(
	entries: readonly NavigationRegistryEntry[],
	pathname: string,
): GlobalNavItem[] {
	const items = entries
		.filter((entry): entry is NavigationRegistryEntry & { id: GlobalNavId } =>
			Object.prototype.hasOwnProperty.call(ORDER_INDEX, entry.id),
		)
		.sort((a, b) => ORDER_INDEX[a.id]! - ORDER_INDEX[b.id]!)
		.map((entry, index) => {
			const presentation = PRESENTATION[entry.id];
			return {
				id: entry.id,
				title: entry.title,
				shortLabel: presentation.shortLabel,
				route: entry.route,
				icon: presentation.icon,
				landmark: entry.landmark,
				active: isSectionActive(pathname, entry.route, entry.home),
				position: index + 1,
				last: entry.id === 'settings',
				home: entry.home,
			} satisfies GlobalNavItem;
		});
	return items;
}

/** The split a compact bottom tab bar renders: up to five slots, the last being a "More" sheet
 *  trigger when there are extra sections (UX-NAV-005 portrait / UX-NAV-006). */
export interface TabBarLayout {
	/** The directly-visible tabs (≤ 4 when an overflow sheet is needed, otherwise ≤ 5). */
	primary: GlobalNavItem[];
	/** Sections revealed through the "More" sheet; empty when everything fits. */
	overflow: GlobalNavItem[];
}

/**
 * Split global nav items for the compact bottom tab bar (UX-NAV-006): a bottom bar shows at
 * most five destinations. When the actor can reach more than five sections, the first four
 * stay as direct tabs and the rest move into a "More" overflow sheet (so the bar is exactly
 * four tabs + a More button). Five or fewer sections all render as direct tabs.
 */
export function splitForTabBar(items: readonly GlobalNavItem[], maxTabs = 5): TabBarLayout {
	if (items.length <= maxTabs) {
		return { primary: [...items], overflow: [] };
	}
	const primaryCount = maxTabs - 1;
	return {
		primary: items.slice(0, primaryCount),
		overflow: items.slice(primaryCount),
	};
}

/** The keyboard shortcut hint shown for a section item: `Alt+<position>` (UX-NAV-002). The
 *  Command Center additionally answers `Alt+Shift+H` (UX-NAV-001), surfaced separately. */
export function shortcutHint(item: GlobalNavItem): string {
	return `Alt+${item.position}`;
}
