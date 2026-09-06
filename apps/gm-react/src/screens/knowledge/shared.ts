import type { MessageKey } from '../../i18n';

/* The Knowledge screen's shared option tables. Extracted from Knowledge.tsx (RC-STB-2.6). */

/** The lookup an option list is built with, once per locale rather than once at module load. */
type Translate = (key: MessageKey) => string;

// Core visibility (`dm-only` / `player-visible` / `shared`) → the safety-critical VisibilityChip level.
// The Core never emits a "hidden" level for a returned item (hidden items are omitted entirely).
export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
export const visibilityOptions = (t: Translate) => [
	{ value: 'dm-only', label: t('common.visibility.dmOnly') },
	{ value: 'player-visible', label: t('knowledge.visPlayers') },
	{ value: 'shared', label: t('common.visibility.shared') },
];
export const importPolicies = (t: Translate) => [
	{ value: 'skip', label: t('knowledge.policySkip') },
	{ value: 'overwrite', label: t('knowledge.policyOverwrite') },
	{ value: 'keep-both', label: t('knowledge.policyKeepBoth') },
];
