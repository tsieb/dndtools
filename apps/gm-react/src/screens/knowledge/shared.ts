import type { CSSProperties } from 'react';
import { T } from '../../app/screen-kit';
import type { MessageKey } from '../../i18n';

/* The Knowledge screen's shared option tables and text styles. Extracted from Knowledge.tsx
 * (RC-STB-2.6); the text styles are RC-POL-1.11's type scale for this surface. */

/** The lookup an option list is built with, once per locale rather than once at module load. */
type Translate = (key: MessageKey) => string;

/*
 * The surface's four sizes: meta (--text-xs), body (--text-sm), card titles (--text-base) and the
 * open note's title (--text-xl, the first size Cinzel is allowed at). Prose inside a note is the
 * shared markdown renderer's own scale.
 */

/** Timestamps, counts and helper lines. */
export const META: CSSProperties = { font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter };

/** Running UI text: intros, empty lines, list rows. */
export const BODY: CSSProperties = { font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub };

/**
 * A supporting panel's heading. screen-kit's Panel renders its title in Cinzel at 14px; Cinzel is
 * reserved for 24px and up, so the Knowledge panels pass a sans label instead.
 */
export const PANEL_TITLE: CSSProperties = {
	font: `600 var(--text-sm) ${T.sans}`,
	color: T.ink,
	letterSpacing: 'var(--tracking-normal)',
};

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
