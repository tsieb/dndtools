import type { SceneVisibility } from '@dndtools/core';
import type { MessageKey } from '../../../i18n';

/**
 * The inspector's data-only vocabulary: the core-visibility → DS chip map, the POI category
 * vocabulary and the visibility Select's key table.
 *
 * Extracted from `InspectorPanel.tsx` unchanged so that file stays under its RC-STB-2.7 line
 * baseline while RC-UX-1.2 moves its copy into the message catalog.
 */

export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
export const POI_CATEGORIES = [
	'settlement',
	'landmark',
	'dungeon',
	'quest',
	'hazard',
	'shop',
	'npc',
	'note',
	'other',
] as const;

/** The three visibility levels as the Select renders them — the same copy `VIS_TEXT` carries, but
 * addressed by key so a translated build shows a translated option. */
export const VIS_OPTION_KEYS: { value: SceneVisibility; label: MessageKey }[] = [
	{ value: 'dm-only', label: 'common.visibility.dmOnly' },
	{ value: 'player-visible', label: 'common.visibility.playerVisible' },
	{ value: 'shared', label: 'common.visibility.shared' },
];
