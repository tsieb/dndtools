import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * VisibilityChip — the safety-critical DM-only vs player-visible signal. The single most
 * important state cue in the product: a DM must read at a glance (and in grayscale) what players
 * can see. Each level has a distinct icon + label + color so it never relies on color alone.
 */
export function VisibilityChip({ level = 'dm-only', compact = false, style, ...rest }) {
	const levels = {
		'dm-only': { label: 'DM only', icon: 'dm-only', fg: 'var(--color-dm-only-badge)', bg: 'var(--color-dm-only-subtle)', bd: 'var(--color-dm-only-badge)' },
		players: { label: 'Players', icon: 'visibility-players', fg: 'var(--color-status-success-text)', bg: 'var(--color-status-success-subtle)', bd: 'var(--color-status-success)' },
		hidden: { label: 'Hidden', icon: 'hidden', fg: 'var(--color-text-tertiary)', bg: 'var(--color-surface-sunken)', bd: 'var(--color-border-strong)' },
		mixed: { label: 'Mixed', icon: 'visibility-mixed', fg: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-subtle)', bd: 'var(--color-status-warning)' },
	};
	// Callers sometimes hold a RAW core visibility value ('player-visible' / 'shared') rather than a
	// chip level. Falling those through to the `dm-only` default inverts the meaning of the app's
	// most safety-critical cue — a shared entity would read as a red "DM ONLY". Normalize instead.
	const CORE_ALIASES = { 'player-visible': 'players', shared: 'players', 'dm-only': 'dm-only' };
	const l = levels[level] || levels[CORE_ALIASES[level]] || levels['dm-only'];
	return (
		<span
			// The icon carries the accessible name ONLY when the text is hidden. Naming both made
			// every non-compact chip — the majority of ~33 live sites — announce "DM only DM only",
			// and `title` added a third copy as a tooltip over text that is already on screen.
			// ds/components/condition/ConditionBadge.jsx:70 already had this right.
			title={compact ? l.label : undefined}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: compact ? '2px var(--space-1-5)' : '2px var(--space-2)',
				borderRadius: 'var(--radius-full)',
				background: l.bg,
				color: l.fg,
				border: `1px solid ${l.bd}`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-xs)',
				fontWeight: 'var(--font-weight-semibold)',
				letterSpacing: 'var(--tracking-wide)',
				textTransform: 'uppercase',
				whiteSpace: 'nowrap',
				...style,
			}}
			{...rest}
		>
			<Icon name={l.icon} size={13} label={compact ? l.label : undefined} />
			{!compact && l.label}
		</span>
	);
}
