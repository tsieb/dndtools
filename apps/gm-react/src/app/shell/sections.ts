import { LIBRARY, PLATFORM, PLAYER_SECTION, RUN, SETTINGS_SECTION, type NavSection } from '../nav';

export const SECTION_PATH: Record<string, string> = {
	home: '/',
	board: '/board',
	session: '/session',
	characters: '/characters',
	atlas: '/atlas',
	campaign: '/campaign',
	knowledge: '/knowledge',
	graph: '/graph',
	audio: '/audio',
	extensibility: '/extensions',
	community: '/community',
	pricing: '/upgrade',
	player: '/player',
	settings: '/settings',
};

/** All sections in rail order — the same IA as the sidebar, flattened (a presentation change,
 * never an IA change). */
export const ALL_SECTIONS: NavSection[] = [
	...RUN,
	...LIBRARY,
	...PLATFORM,
	PLAYER_SECTION,
	SETTINGS_SECTION,
];

/** Phone: the 4 hot destinations + "More" (a bottom sheet listing the rest of the IA). */
export const PHONE_TABS: NavSection[] = [RUN[0], RUN[2], LIBRARY[0], LIBRARY[1]];
