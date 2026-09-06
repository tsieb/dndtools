/* The Knowledge screen's shared option tables. Extracted from Knowledge.tsx (RC-STB-2.6). */

// Core visibility (`dm-only` / `player-visible` / `shared`) → the safety-critical VisibilityChip level.
// The Core never emits a "hidden" level for a returned item (hidden items are omitted entirely).
export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
export const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Players' },
	{ value: 'shared', label: 'Shared' },
];
export const IMPORT_POLICIES = [
	{ value: 'skip', label: 'Skip collisions' },
	{ value: 'overwrite', label: 'Overwrite existing' },
	{ value: 'keep-both', label: 'Keep both' },
];
