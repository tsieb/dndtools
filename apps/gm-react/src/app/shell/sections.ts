import {
	isFeatureVisible,
	listScreensForActor,
	SECTION_FEATURE_GATES,
	type CoreStateSlice,
	type FeatureTier,
} from '@dndtools/core';
import { screenPath } from '../../screens/screen/screenModel';
import {
	isNavSectionVisible,
	LIBRARY,
	LOCAL_ENTRIES,
	PLATFORM,
	PLAYER_SECTION,
	PRIMARY,
	RUN,
	SCREENS_SECTION,
	SETTINGS_SECTION,
	TOOLS_SECTION,
	type NavSection,
	type PrimarySectionId,
} from '../nav';

export const SECTION_PATH: Record<string, string> = {
	home: '/',
	board: '/board',
	session: '/session',
	characters: '/characters',
	atlas: '/atlas',
	campaign: '/campaign',
	knowledge: '/knowledge',
	screens: '/screens',
	tools: '/tools',
	graph: '/graph',
	audio: '/audio',
	extensibility: '/extensions',
	community: '/community',
	pricing: '/upgrade',
	player: '/player',
	settings: '/settings',
};

/** Every shell destination: the six primary sections, the Run shortcuts, the platform tools, the
 * player sheet and Settings. Presentation decides where each appears; nothing here adds a section. */
export const ALL_SECTIONS: NavSection[] = [
	SCREENS_SECTION,
	...RUN,
	...LIBRARY,
	TOOLS_SECTION,
	...PLATFORM,
	PLAYER_SECTION,
	SETTINGS_SECTION,
];

/** RC-UX-6.4 — the nav sections the experience tier hides, keyed to their complexity-map gate.
 * Only these two: the other `nav.*` gates describe surfaces a Beginner still reaches from the rail. */
export const SECTION_TIER_GATES: Record<string, string> = {
	extensibility: 'nav.extensions',
	community: 'nav.community',
};

/** A section's nav entry at this tier: usage-earned (RC-UX-3.5) and at or above its tier gate. The
 * route itself stays open, so a bookmark or the command palette still reaches it. */
export function isSectionShown(id: string, state: CoreStateSlice, tier: FeatureTier): boolean {
	const gate = SECTION_TIER_GATES[id];
	return (
		isNavSectionVisible(id, state) && (!gate || isFeatureVisible(gate, tier, SECTION_FEATURE_GATES))
	);
}

/** Phone (IA-1): Screens, Characters and Maps as tabs, then More, which lists the other three
 * primary sections. Screens opens its chooser, so every run screen and pin is one more tap away. */
export const PHONE_TABS: NavSection[] = PRIMARY.slice(0, 3);

/** The primary sections the phone More sheet lists, in order. */
export const MORE_SECTIONS: NavSection[] = PRIMARY.slice(3);

/** A section's local pages that this tier shows (the page you're on always stays listed). */
export function localEntriesFor(
	owner: string | null,
	activeId: string,
	state: CoreStateSlice,
	tier: FeatureTier,
): NavSection[] {
	const entries = owner ? (LOCAL_ENTRIES[owner as PrimarySectionId] ?? []) : [];
	return entries.filter((s) => s.id === activeId || isSectionShown(s.id, state, tier));
}

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
