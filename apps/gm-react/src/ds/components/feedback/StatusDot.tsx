export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
	status?: 'live' | 'idle' | 'warning' | 'error' | 'syncing' | 'pending' | (string & {});
	/** Animated pulse ring (e.g. session live). */
	pulse?: boolean;
	/** Adjacent text label — always provide one for meaning. */
	label?: React.ReactNode;
}

import React from 'react';

/**
 * StatusDot — a tiny pulsing/solid dot for live state (session live, syncing, offline). Always
 * pair with an adjacent text label; the dot is a reinforcing cue, never the sole signal.
 */
export function StatusDot({
	status = 'idle',
	pulse = false,
	label,
	style,
	...rest
}: StatusDotProps) {
	const colors: Record<string, string> = {
		live: 'var(--color-status-success)',
		idle: 'var(--color-text-tertiary)',
		warning: 'var(--color-status-warning)',
		error: 'var(--color-status-error)',
		syncing: 'var(--color-status-info)',
		pending: 'var(--color-status-info)',
	};
	const c = colors[status] || colors.idle;
	const dot = (
		<span
			style={{
				position: 'relative',
				display: 'inline-flex',
				width: 9,
				height: 9,
				flex: '0 0 auto',
			}}
		>
			{pulse && (
				<span
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: '50%',
						background: c,
						opacity: 0.5,
						animation: 'dndPulse 1.8s var(--easing-standard) infinite',
					}}
				/>
			)}
			<span
				style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: c }}
			/>
			<style>
				{
					'@keyframes dndPulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(2.6);opacity:0}100%{opacity:0}}'
				}
			</style>
		</span>
	);
	if (!label) return dot;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1-5)',
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-sm)',
				color: 'var(--color-text-secondary)',
				...style,
			}}
			{...rest}
		>
			{dot}
			{label}
		</span>
	);
}
