import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Chip — a compact, optionally-removable token (conditions, tags, filters). Square-ish pill;
 * pass `onRemove` to render a close affordance, `icon` for a leading glyph, `tone` to tint.
 */
export function Chip({ icon, tone = 'neutral', onRemove, selected = false, children, style, onClick, ...rest }) {
	const tones = {
		neutral: { bg: selected ? 'var(--color-interactive-selected)' : 'var(--color-surface-overlay)', fg: 'var(--color-text-primary)', bd: 'var(--color-border-strong)' },
		accent: { bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent)', bd: 'var(--color-accent-border)' },
		danger: { bg: 'var(--color-status-error-subtle)', fg: 'var(--color-status-error-text)', bd: 'var(--color-status-error)' },
		info: { bg: 'var(--color-status-info-subtle)', fg: 'var(--color-status-info-text)', bd: 'var(--color-status-info)' },
	};
	const t = tones[tone] || tones.neutral;
	return (
		<span
			onClick={onClick}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: '3px var(--space-2)',
				borderRadius: 'var(--radius-sm)',
				background: t.bg,
				color: t.fg,
				border: `1px solid ${t.bd}`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-xs)',
				fontWeight: 'var(--font-weight-medium)',
				cursor: onClick ? 'pointer' : 'default',
				...style,
			}}
			{...rest}
		>
			{icon && <Icon name={icon} size={13} />}
			{children}
			{onRemove && (
				<button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, marginLeft: 2 }}>
					<Icon name="close" size={12} />
				</button>
			)}
		</span>
	);
}
