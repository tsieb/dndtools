// The single navigation source of truth for the React app — the prototype's grouped IA
// (Run the table / Library / Platform + Player view + Settings), mapped to real react-router routes.

export interface NavSection {
	id: string;
	label: string;
	icon: string;
	path: string;
	/** Optional secondary line shown under the label in the sidebar. */
	sub?: string;
}

/** Run the table — the live-play destinations. */
export const RUN: NavSection[] = [
	{ id: 'home', label: 'Command Center', icon: 'home', path: '/' },
	{ id: 'board', label: 'Command board', icon: 'widget', path: '/board', sub: 'Spatial widget board' },
	{ id: 'session', label: 'Session', icon: 'session-bolt', path: '/session' },
];

/** The content library — the four browse-able sections (with at-a-glance counts). */
export const LIBRARY: NavSection[] = [
	{ id: 'characters', label: 'Characters', icon: 'characters-person', path: '/characters', sub: '4 PCs · 23 NPCs' },
	{ id: 'atlas', label: 'Atlas', icon: 'atlas-map', path: '/atlas', sub: '12 maps' },
	{ id: 'campaign', label: 'Campaign', icon: 'campaign-scroll', path: '/campaign', sub: '6 arcs · 5 quests' },
	{ id: 'knowledge', label: 'Knowledge', icon: 'knowledge-book', path: '/knowledge', sub: '38 notes' },
];

/** Platform surfaces — graph, audio, extensions, community, plans & cloud. */
export const PLATFORM: NavSection[] = [
	{ id: 'graph', label: 'Graph & Search', icon: 'group', path: '/graph', sub: 'Relationships' },
	{ id: 'audio', label: 'Audio', icon: 'audio', path: '/audio', sub: 'Soundboard · ambience' },
	{ id: 'extensibility', label: 'Extensions', icon: 'widget', path: '/extensions', sub: 'Plugins · systems' },
	{ id: 'community', label: 'Community', icon: 'globe', path: '/community', sub: 'Browse · publish' },
	{ id: 'pricing', label: 'Plans & cloud', icon: 'CreditCard', path: '/upgrade', sub: 'Compare · upgrade' },
];

export const PLAYER_SECTION: NavSection = {
	id: 'player',
	label: 'Player view',
	icon: 'UserCircle',
	path: '/player',
	sub: 'Your character · second persona',
};

export const SETTINGS_SECTION: NavSection = {
	id: 'settings',
	label: 'Settings',
	icon: 'settings-gear',
	path: '/settings',
};

const ALL = [...RUN, ...LIBRARY, ...PLATFORM, PLAYER_SECTION, SETTINGS_SECTION];

/** Per-section [title, subtitle] for the top bar — mirrors the prototype's SECTION_TITLES. */
export const SECTION_TITLES: Record<string, [string, string]> = {
	home: ['Command Center', 'Your campaign hub — resume the live scene or jump anywhere'],
	board: ['Command board', 'Your spatial widget board — glanceable trackers at the table'],
	session: ['Session', 'The live scene: combat, dice, maps, and what players see'],
	characters: ['Characters', 'The party, your NPCs, and the bestiary'],
	atlas: ['Atlas', 'Maps, layers, fog, and projection'],
	campaign: ['Campaign', 'Arcs, quests, factions, and the session log'],
	knowledge: ['Knowledge', 'Notes, handouts, and read-aloud text'],
	graph: ['Graph & Search', 'Every entity and how it connects — actor-filtered'],
	audio: ['Audio & Atmosphere', 'Soundboard cues, layered ambience, and scene bindings'],
	extensibility: ['Extensions & Systems', 'Plugins, the compendium, custom objects, and the rules module'],
	community: ['Community', 'Browse modules, export your work, and publish the campaign wiki'],
	pricing: ['Plans & cloud', 'Local-first is free. Cloud features are paid to cover what they cost to run'],
	player: ['Player', 'The second persona: your own sheet, resources, and journal'],
	settings: ['Settings', 'Appearance, players, permissions, and systems'],
};

/** Resolve the active section id for a pathname (longest matching path wins; `/` is home). */
export function activeSectionId(pathname: string): string {
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

export function sectionLabel(id: string): string {
	return SECTION_TITLES[id]?.[0] ?? ALL.find((s) => s.id === id)?.label ?? 'Command Center';
}

export function sectionSubtitle(id: string): string {
	return SECTION_TITLES[id]?.[1] ?? '';
}
