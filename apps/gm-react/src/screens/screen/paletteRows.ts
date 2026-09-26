import type { ScreenListEntry } from '@dndtools/core';
import type { useI18n } from '../../i18n';
import { screenPath, SCREENS_PATH } from './screenModel';

type Translate = ReturnType<typeof useI18n>['t'];

/** The shape of a palette destination row (`CommandPalette`'s own row type is structural). */
export interface ScreenPaletteRow {
	id: string;
	kind: 'destination';
	label: string;
	icon: string;
	group: string;
	keywords: string;
	description?: string;
	meta?: string;
	run: () => void;
}

/**
 * RC-CAN-7.3 — the command palette's screen actions: "All screens" in Go to, then one row per screen
 * that jumps to it. Each row is ONE navigation, so it pushes one history entry. The home screen is
 * already the Go to "GM screen" row, so it is not listed twice.
 */
export function screenPaletteRows(
	entries: readonly ScreenListEntry[],
	nameOf: (entry: ScreenListEntry) => string,
	t: Translate,
	goTo: (id: string, path: string) => () => void,
): { library: ScreenPaletteRow; screens: ScreenPaletteRow[] } {
	return {
		library: {
			id: 'nav:screens',
			kind: 'destination',
			label: t('palette.screens.all'),
			icon: 'layout-list',
			group: t('palette.group.goTo'),
			keywords: t('palette.screens.allKeywords'),
			run: goTo('nav:screens', SCREENS_PATH),
		},
		screens: entries
			.filter((entry) => !entry.isHome)
			.map((entry) => ({
				id: `screen:${entry.id}`,
				kind: 'destination',
				label: nameOf(entry),
				icon: entry.pinned ? 'pin' : 'scene',
				group: t('palette.group.screens'),
				keywords: entry.tags.join(' '),
				description: t(
					entry.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared',
				),
				meta: entry.isLive ? t('screens.live') : undefined,
				run: goTo(`screen:${entry.id}`, screenPath(entry.id)),
			})),
	};
}
