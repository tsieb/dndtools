import React from 'react';
import { Icon } from './Icon.jsx';

const tones = {
	info: {
		icon: 'info',
		bg: 'var(--color-surface-sunken)',
		border: '1px solid var(--color-border)',
	},
	success: {
		icon: 'check',
		bg: 'var(--color-surface-alt)',
		border: '1px solid var(--color-status-success)',
	},
	warning: {
		icon: 'warning',
		bg: 'var(--color-surface-alt)',
		border: '1px solid var(--color-status-warning)',
	},
};

/**
 * HelpTip — compact in-flow guidance with a tiny icon + helper text.
 */
export function HelpTip({ tone = 'info', title, children, style, ...rest }) {
	const palette = tones[tone] || tones.info;

	return (
		<div
			role="note"
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1-5)',
				padding: 'var(--space-1-5) var(--space-2)',
				borderRadius: 'var(--radius-sm)',
				background: palette.bg,
				border: palette.border,
				color: 'var(--color-text-secondary)',
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-2xs)',
				...style,
			}}
			{...rest}
		>
			<Icon name={palette.icon} size="sm" />
			{title && <strong style={{ color: 'var(--color-text-primary)' }}>{title}</strong>}
			<span>{children}</span>
		</div>
	);
}
