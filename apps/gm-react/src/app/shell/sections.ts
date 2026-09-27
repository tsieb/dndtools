import { listScreensForActor, type CoreStateSlice } from '@dndtools/core';
import { screenPath } from '../../screens/screen/screenModel';
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

/** Resolve Run shortcuts without replacing their global IA entries. Until provisioning supplies
 * default origins, existing aliases remain responsible for their established surfaces. */
export function sectionPath(id: string, state: CoreStateSlice, actorId: string): string {
	const key = (
		{ home: 'command-center', board: 'gm-screen', session: 'session' } as Record<string, string>
	)[id];
	if (key) {
		const screen = listScreensForActor(state.scenes, state.permissions, actorId).find(
			(entry) => entry.origin?.kind === 'default' && entry.origin.defaultKey === key,
		);
		if (screen) return screenPath(screen.id);
	}
	return SECTION_PATH[id] ?? '/';
}
