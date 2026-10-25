// The single navigation source of truth for the React app, mapped to real react-router routes.
// RC-ENG-15.1 implements IA-1 (docs/planning/IA_REVIEW.md, ADR-013 as amended): six primary
// sections — Screens, Characters, Maps, Story, Notes, Tools — with the default run screens and the
// user's pins as workspace shortcuts beside them, and Settings as a secondary utility. The Run,
// Library and Platform lists below survive as the shortcut, section and tool inventories that the
// palette and the home widgets read; the shell renders `PRIMARY`.
//
// Every user-visible word here is a MESSAGE KEY, never English text (RC-UX-1.2): navigation is the
// one place the whole app reads its own names from, so a literal here would leak untranslated into
// the sidebar, the rail, the phone tab bar, the More sheet and the top bar at once. The keys whose
// message carries a `{gm}`/`{player}` placeholder additionally follow the active system package's
// vocabulary (RC-SYS-2.6) — the board section is the "DM screen" under 5e and the "GM screen" under
// Generic without this file knowing either word.

import { matchPath } from 'react-router-dom';
import { isMaturitySignalReached, MATURITY_SIGNALS, type CoreStateSlice } from '@dndtools/core';
import type { MessageKey } from '../i18n';

export interface NavSection {
	id: string;
	labelKey: MessageKey;
	icon: string;
	path: string;
	/** Optional secondary line shown under the label in the sidebar. */
	subKey?: MessageKey;
	/**
	 * RC-SES-1.1 — this entry carries the session-live posture: while `session.workflow === 'active'`
	 * the sidebar row and the tablet rail mark it live (a pulsing ring that reduced motion renders
	 * static). Declared here, on the one navigation source of truth, so the three navigations cannot
	 * disagree about which destination is the live one.
	 */
	liveBadge?: boolean;
}

/** Run the table — the default run screens. Under IA-1 these are Screens shortcuts, not primary
 * sections: the sidebar, rail and phone Screens chooser list them beside the user's pins. */
export const RUN: NavSection[] = [
	{
		id: 'home',
		labelKey: 'nav.commandCenter',
		icon: 'home',
		path: '/',
		subKey: 'nav.sub.home',
	},
	{
		id: 'board',
		labelKey: 'nav.gmScreen',
		icon: 'widget',
		path: '/board',
		subKey: 'nav.sub.board',
	},
	{
		id: 'session',
		labelKey: 'nav.session',
		icon: 'session-bolt',
		path: '/session',
		subKey: 'nav.sub.session',
		liveBadge: true,
	},
];

/** The content library — the four browse-able sections. The sidebar overrides `sub` with live
 * counts; these static subs describe what each section OWNS (shown on the phone More sheet). */
export const LIBRARY: NavSection[] = [
	{
		id: 'characters',
		labelKey: 'nav.characters',
		icon: 'characters-person',
		path: '/characters',
		subKey: 'nav.sub.characters',
	},
	{
		id: 'atlas',
		labelKey: 'nav.maps',
		icon: 'atlas-map',
		path: '/atlas',
		subKey: 'nav.sub.atlas',
	},
	{
		id: 'campaign',
		labelKey: 'nav.story',
		icon: 'campaign-scroll',
		path: '/campaign',
		subKey: 'nav.sub.campaign',
	},
	{
		id: 'knowledge',
		labelKey: 'nav.notes',
		icon: 'knowledge-book',
		path: '/knowledge',
		subKey: 'nav.sub.knowledge',
	},
];

/** Platform surfaces — graph, audio, extensions, community, plans & cloud. */
export const PLATFORM: NavSection[] = [
	{
		id: 'graph',
		labelKey: 'nav.graph',
		icon: 'group',
		path: '/graph',
		subKey: 'nav.sub.graph',
	},
	{
		id: 'audio',
		labelKey: 'nav.audio',
		icon: 'audio',
		path: '/audio',
		subKey: 'nav.sub.audio',
	},
	{
		id: 'extensibility',
		labelKey: 'nav.extensions',
		icon: 'widget',
		path: '/extensions',
		subKey: 'nav.sub.extensibility',
	},
	{
		id: 'community',
		labelKey: 'nav.community',
		icon: 'globe',
		path: '/community',
		subKey: 'nav.sub.community',
	},
	{
		id: 'pricing',
		labelKey: 'nav.pricing',
		icon: 'CreditCard',
		path: '/upgrade',
		subKey: 'nav.sub.pricing',
	},
];

/** IA-1 — the Screens section: the library at `/screens` and every screen under it. It carries the
 * live posture on every tier, since the phone no longer has a Session tab of its own. */
export const SCREENS_SECTION: NavSection = {
	id: 'screens',
	labelKey: 'nav.screens',
	icon: 'scene',
	path: '/screens',
	subKey: 'nav.sub.screens',
	liveBadge: true,
};

/** IA-1 — the Tools landing (`/tools`), additive: Audio, Extensions and Community keep their routes. */
export const TOOLS_SECTION: NavSection = {
	id: 'tools',
	labelKey: 'nav.tools',
	icon: 'toolbox',
	path: '/tools',
	subKey: 'nav.sub.tools',
};

/** The six primary sections, in order. Every tier renders exactly these; phone More changes the
 * presentation of the last three, never their membership. */
export const PRIMARY: NavSection[] = [SCREENS_SECTION, ...LIBRARY, TOOLS_SECTION];

export type PrimarySectionId =
	| 'screens'
	| 'characters'
	| 'atlas'
	| 'campaign'
	| 'knowledge'
	| 'tools';

/** The tools the `/tools` landing links to, in its order. Tier gates still apply (sections.ts). */
export const TOOLS: NavSection[] = PLATFORM.filter((s) =>
	['audio', 'extensibility', 'community'].includes(s.id),
);

export const GRAPH_SECTION: NavSection = PLATFORM.find((s) => s.id === 'graph')!;

export const PLAYER_SECTION: NavSection = {
	id: 'player',
	labelKey: 'nav.playerView',
	icon: 'UserCircle',
	path: '/player',
	subKey: 'nav.sub.player',
};

export const SETTINGS_SECTION: NavSection = {
	id: 'settings',
	labelKey: 'nav.settings',
	icon: 'settings-gear',
	path: '/settings',
};

/** Local entries the shell lists under their owning section while it is current (IA-1): the
 * player sheet belongs to Characters, Graph & search to Notes. */
export const LOCAL_ENTRIES: Partial<Record<PrimarySectionId, NavSection[]>> = {
	characters: [PLAYER_SECTION],
	knowledge: [GRAPH_SECTION],
};

/**
 * IA-1 — every shelled content route and its ONE owning section. The patterns are the exact
 * `<Route path>` strings in App.tsx's shell (nav.test.ts holds the two lists equal), so a new route
 * cannot ship without an owner. `settings` is the secondary utility, not a primary section.
 * Chrome-less routes (`/play`, `/join`, `/wiki`, `/display`, `/legal/*`) have no shell and no owner.
 */
export const ROUTE_OWNERS: ReadonlyArray<readonly [string, PrimarySectionId | 'settings']> = [
	['/', 'screens'],
	['/screens', 'screens'],
	['/scenes', 'screens'],
	['/scene-cards', 'screens'],
	['/screen/:id', 'screens'],
	['/scene/:id', 'screens'],
	['/session', 'screens'],
	['/board', 'screens'],
	['/characters/:id?', 'characters'],
	['/player', 'characters'],
	['/atlas', 'atlas'],
	['/campaign', 'campaign'],
	['/campaign/calendar', 'campaign'],
	['/campaign/relationships', 'campaign'],
	['/knowledge/:id?', 'knowledge'],
	['/graph', 'knowledge'],
	['/graph/repair', 'knowledge'],
	['/tools', 'tools'],
	['/audio', 'tools'],
	['/extensions', 'tools'],
	['/community', 'tools'],
	['/upgrade', 'settings'],
	['/settings', 'settings'],
];

/** The section that owns a pathname: one of the six, `settings`, or null for no shelled route. */
export function routeOwner(pathname: string): PrimarySectionId | 'settings' | null {
	for (const [path, owner] of ROUTE_OWNERS) {
		if (matchPath({ path, end: true }, pathname)) return owner;
	}
	return null;
}

const ALL = [...RUN, ...LIBRARY, ...PLATFORM, TOOLS_SECTION, PLAYER_SECTION, SETTINGS_SECTION];

/** RC-CAN-8.7 — the scene cards' own page, linked from the Screens library's player section. */
export const SCENE_CARDS_PATH = '/scene-cards';

/** Per-section [title key, subtitle key] for the top bar — mirrors the prototype's SECTION_TITLES.
 * Keys, not text: the top bar renders them with `t`, so both the locale and the system package's
 * vocabulary reach the largest words on the screen. */
export const SECTION_TITLES: Record<string, [MessageKey, MessageKey]> = {
	home: ['nav.commandCenter', 'section.sub.home'],
	board: ['nav.gmScreen', 'section.sub.board'],
	session: ['nav.session', 'section.sub.session'],
	characters: ['nav.characters', 'section.sub.characters'],
	atlas: ['nav.maps', 'section.sub.atlas'],
	campaign: ['nav.story', 'section.sub.campaign'],
	knowledge: ['nav.notes', 'section.sub.knowledge'],
	scenes: ['nav.scenes', 'section.sub.scenes'],
	screens: ['nav.screens', 'section.sub.screens'],
	sceneCards: ['sceneCards.title', 'section.sub.sceneCards'],
	graph: ['nav.graph', 'section.sub.graph'],
	audio: ['section.audio', 'section.sub.audio'],
	extensibility: ['section.extensibility', 'section.sub.extensibility'],
	community: ['nav.community', 'section.sub.community'],
	tools: ['nav.tools', 'section.sub.tools'],
	pricing: ['nav.pricing', 'section.sub.pricing'],
	player: ['section.player', 'section.sub.player'],
	settings: ['nav.settings', 'section.sub.settings'],
};

/** Resolve the active section id for a pathname (longest matching path wins; `/` is home). */
export function activeSectionId(pathname: string): string {
	// Scene routes are their own pseudo-section (the sidebar Scenes group, not a nav row): without
	// this the fallback is 'home' and the top bar claims "Command Center" while editing a scene.
	if (pathname === '/scenes' || pathname === '/scene' || pathname.startsWith('/scene/'))
		return 'scenes';
	// RC-CAN-7.3 — the Screens library and every screen (ADR-041). A screen is user content, not a
	// global destination, so no nav row claims it; the screen names itself in its own header.
	if (pathname === '/screens' || pathname.startsWith('/screen/')) return 'screens';
	// RC-CAN-8.7 — the scene cards' own page, titled for itself rather than claimed by a nav row.
	if (pathname === SCENE_CARDS_PATH) return 'sceneCards';
	let best: NavSection | null = null;
	for (const section of ALL) {
		if (section.path === '/') {
			if (pathname === '/' && !best) best = section;
			continue;
		}
		if (pathname === section.path || pathname.startsWith(section.path + '/')) {
			if (!best || section.path.length > best.path.length) best = section;
		}
	}
	return best?.id ?? 'home';
}

/** The top bar's title, as a message key the caller renders with `t`. */
export function sectionLabelKey(id: string): MessageKey {
	return SECTION_TITLES[id]?.[0] ?? ALL.find((s) => s.id === id)?.labelKey ?? 'nav.commandCenter';
}

/** The top bar's subtitle key, or null for a section that has no second line. */
export function sectionSubtitleKey(id: string): MessageKey | null {
	return SECTION_TITLES[id]?.[1] ?? null;
}

/**
 * RC-UX-3.5 — maturity-signal disclosure. A nav section id that names a declared
 * `MaturitySignal` (currently only `graph`) stays hidden from every nav surface until the DM's own
 * usage earns it (three linked notes reveal the graph); a section with no matching signal is always
 * visible — this never hides an unrelated destination by accident. The route itself is never
 * blocked: a bookmark still opens it, so this is progressive disclosure, not a dead end.
 */
export function isNavSectionVisible(id: string, state: CoreStateSlice): boolean {
	const isGatedSection = MATURITY_SIGNALS.some((signal) => signal.id === id);
	return !isGatedSection || isMaturitySignalReached(id, state);
}
