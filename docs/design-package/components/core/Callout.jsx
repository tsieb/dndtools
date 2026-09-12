import React from 'react';
import { Icon } from './Icon.jsx';

const TONES = {
	info: {
		icon: 'info',
		border: 'var(--color-status-info)',
		bg: 'var(--color-surface-alt)',
	},
	warning: {
		icon: 'warning',
		border: 'var(--color-status-warning)',
		bg: 'var(--color-surface-alt)',
	},
	success: {
		icon: 'check',
		border: 'var(--color-status-success)',
		bg: 'var(--color-surface-alt)',
	},
	error: {
		icon: 'error',
		border: 'var(--color-status-error)',
		bg: 'var(--color-surface-alt)',
	},
};

/**
 * Callout — non-modal, tone-based information blocks used for inline guidance.
 */
export function Callout({ tone = 'info', title, style, children, icon, role, ...rest }) {
	const palette = TONES[tone] || TONES.info;

	return (
		<div
			role={role || 'note'}
			style={{
				display: 'flex',
				gap: 'var(--space-2)',
				alignItems: 'flex-start',
				padding: 'var(--space-2) var(--space-3)',
				borderRadius: 'var(--radius-md)',
				borderLeft: `3px solid ${palette.border}`,
				background: palette.bg,
				color: 'var(--color-text-primary)',
				fontFamily: 'var(--font-sans)',
				...style,
			}}
			{...rest}
		>
			<Icon name={icon || palette.icon} size="sm" />
			<div style={{ minWidth: 0 }}>
				{title && (
					<div
						style={{
							fontWeight: 'var(--font-weight-semibold)',
							marginBottom: 2,
							fontSize: 'var(--text-xs)',
							letterSpacing: 'var(--tracking-wider)',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{title}
					</div>
				)}
				<div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
					{children}
				</div>
			</div>
		</div>
	);
}
