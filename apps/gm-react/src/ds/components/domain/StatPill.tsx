export interface StatPillProps extends React.HTMLAttributes<HTMLDivElement> {
	label: React.ReactNode;
	value: React.ReactNode;
	tone?: 'default' | 'accent' | 'success' | 'warning' | 'error';
	/** Render the value in the mono face (default true) — for numerals. */
	mono?: boolean;
	align?: 'left' | 'center';
}

import React from 'react';

/**
 * StatPill — a labeled glance-stat: an uppercase tracked eyebrow over a large mono value. The
 * session-status vocabulary (CURRENT TURN, PLAYERS, AC, INITIATIVE). Use `tone` to color the
 * value for state.
 */
export function StatPill({
	label,
	value,
	tone = 'default',
	mono = true,
	align = 'left',
	style,
	...rest
}: StatPillProps) {
	const tones = {
		default: 'var(--color-text-primary)',
		accent: 'var(--color-accent)',
		success: 'var(--color-status-success-text)',
		warning: 'var(--color-status-warning-text)',
		error: 'var(--color-status-error-text)',
	};
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 2,
				alignItems: align === 'center' ? 'center' : 'flex-start',
				minWidth: 0,
				...style,
			}}
			{...rest}
		>
			<span
				style={{
					fontFamily: 'var(--font-sans)',
					fontSize: 'var(--text-2xs)',
					fontWeight: 'var(--font-weight-semibold)',
					letterSpacing: 'var(--tracking-wider)',
					textTransform: 'uppercase',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{label}
			</span>
			<span
				style={{
					fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
					fontSize: 'var(--text-lg)',
					fontWeight: 'var(--font-weight-semibold)',
					lineHeight: 1.1,
					color: tones[tone] || tones.default,
				}}
			>
				{value}
			</span>
		</div>
	);
}
