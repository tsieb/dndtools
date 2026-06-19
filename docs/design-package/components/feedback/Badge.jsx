import React from 'react';
import { Icon } from '../core/Icon.jsx';

const STATUS = {
	success: { fg: 'var(--color-status-success-text)', bg: 'var(--color-status-success-subtle)', bd: 'var(--color-status-success)', icon: 'success' },
	warning: { fg: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-subtle)', bd: 'var(--color-status-warning)', icon: 'warning' },
	error: { fg: 'var(--color-status-error-text)', bg: 'var(--color-status-error-subtle)', bd: 'var(--color-status-error)', icon: 'error' },
	info: { fg: 'var(--color-status-info-text)', bg: 'var(--color-status-info-subtle)', bd: 'var(--color-status-info)', icon: 'info' },
	accent: { fg: 'var(--color-accent)', bg: 'var(--color-accent-subtle)', bd: 'var(--color-accent-border)', icon: null },
	neutral: { fg: 'var(--color-text-secondary)', bg: 'var(--color-surface-overlay)', bd: 'var(--color-border-strong)', icon: null },
};

/**
 * Badge — a small status pill that encodes state/severity with COLOR + a redundant icon shape
 * (never color alone, A11Y-011). `status` picks the role; the icon is automatic but overridable.
 */
export function Badge({ status = 'neutral', icon, children, style, ...rest }) {
	const s = STATUS[status] || STATUS.neutral;
	const glyph = icon === undefined ? s.icon : icon;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: '2px var(--space-2)',
				borderRadius: 'var(--radius-full)',
				background: s.bg,
				color: s.fg,
				border: `1px solid ${s.bd}`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-xs)',
				fontWeight: 'var(--font-weight-semibold)',
				lineHeight: 1.4,
				whiteSpace: 'nowrap',
				...style,
			}}
			{...rest}
		>
			{glyph && <Icon name={glyph} size={14} />}
			{children}
		</span>
	);
}
