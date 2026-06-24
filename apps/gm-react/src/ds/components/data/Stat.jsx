import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Stat — a dashboard metric tile: an uppercase tracked label, a large mono figure, and an optional
 * trend delta (up = success, down = error, by default; pass `invert` when down is good). For
 * campaign/session summaries — sessions run, XP awarded, handouts pushed. Larger and more emphatic
 * than StatPill (which is an inline glance-stat). Drop several in a responsive grid.
 */
export function Stat({ label, value, unit, icon, delta, deltaLabel, invert = false, tone = 'default', style, ...rest }) {
	const up = typeof delta === 'number' ? delta > 0 : String(delta || '').trim().startsWith('+');
	const good = invert ? !up : up;
	const deltaColor = delta == null ? 'var(--color-text-tertiary)' : good ? 'var(--color-status-success-text)' : 'var(--color-status-error-text)';
	const valueColor = tone === 'accent' ? 'var(--color-accent)' : 'var(--color-text-primary)';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-4)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface)',
				border: '1px solid var(--color-border)',
				boxShadow: 'var(--shadow-sm)',
				minWidth: 0,
				...style,
			}}
			{...rest}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
				{icon && <Icon name={icon} size="sm" color="var(--color-text-tertiary)" aria-hidden="true" />}
			</div>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1, color: valueColor }}>{value}</span>
				{unit && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>{unit}</span>}
			</div>
			{(delta != null || deltaLabel) && (
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: deltaColor, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
					{delta != null && <Icon name={up ? 'chevron-up' : 'chevron-down'} size={13} aria-hidden="true" />}
					<span style={{ fontFamily: 'var(--font-mono)' }}>{typeof delta === 'number' ? `${up ? '+' : ''}${delta}` : delta}</span>
					{deltaLabel && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-weight-regular)' }}>{deltaLabel}</span>}
				</div>
			)}
		</div>
	);
}
