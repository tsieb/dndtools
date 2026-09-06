// The single navigation source of truth for the React app — the prototype's grouped IA
// (Run the table / Library / Platform + Player view + Settings), mapped to real react-router routes.
//
// Every user-visible word here is a MESSAGE KEY, never English text (RC-UX-1.2): navigation is the
// one place the whole app reads its own names from, so a literal here would leak untranslated into
// the sidebar, the rail, the phone tab bar, the More sheet and the top bar at once. The keys whose
// message carries a `{gm}`/`{player}` placeholder additionally follow the active system package's
// vocabulary (RC-SYS-2.6) — the board section is the "DM screen" under 5e and the "GM screen" under
// Generic without this file knowing either word.

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

/** Run the table — the live-play destinations. */
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

const ALL = [...RUN, ...LIBRARY, ...PLATFORM, PLAYER_SECTION, SETTINGS_SECTION];

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
	graph: ['nav.graph', 'section.sub.graph'],
	audio: ['section.audio', 'section.sub.audio'],
	extensibility: ['section.extensibility', 'section.sub.extensibility'],
	community: ['nav.community', 'section.sub.community'],
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
