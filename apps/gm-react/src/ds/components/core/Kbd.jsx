import React from 'react';

/**
 * Kbd — keyboard shortcut token used by command palettes and command references.
 */
export function Kbd({ children, tone = 'neutral', style, ...rest }) {
	const toneStyles = {
		neutral: {
			border: '1px solid var(--color-border)',
			background: 'var(--color-surface-sunken)',
			color: 'var(--color-text-tertiary)',
		},
		accent: {
			border: '1px solid var(--color-accent-border)',
			background: 'var(--color-accent-subtle)',
			color: 'var(--color-accent)',
		},
	};

	const t = toneStyles[tone] ?? toneStyles.neutral;

	return (
		<kbd
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				minWidth: 18,
				height: 18,
				padding: '0 5px',
				fontFamily: 'var(--font-mono)',
				fontSize: 'var(--text-2xs)',
				fontWeight: 'var(--font-weight-medium)',
				lineHeight: 1,
				borderRadius: 'var(--radius-sm)',
				...t,
				...style,
			}}
			{...rest}
		>
			{children}
		</kbd>
	);
}
