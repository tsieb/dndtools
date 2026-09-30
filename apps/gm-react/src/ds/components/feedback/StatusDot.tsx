export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
	status?: 'live' | 'idle' | 'warning' | 'error' | 'syncing' | 'pending' | (string & {});
	/** Animated pulse ring (e.g. session live). */
	pulse?: boolean;
	/** Adjacent text label — always provide one for meaning. */
	label?: React.ReactNode;
}

import React from 'react';

const PULSE = '1.8s var(--easing-accelerate) infinite reverse';

/**
 * StatusDot — a tiny pulsing/solid dot for live state (session live, syncing, offline). Always
 * pair with an adjacent text label; the dot is a reinforcing cue, never the sole signal.
 *
 * The pulse ring animates with keyframes from the motion stylesheet (styles/index.css). It used to
 * carry its own as an inline `<style>` child, and a `<style>`'s text is text content: the sidebar
 * rows that hold a dot, when named from their content, announced `@keyframes dndPulse{…}` before
 * their real name (RC-ENG-9.1).
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
					style={
						{
							position: 'absolute',
							inset: 0,
							borderRadius: '50%',
							// Half strength in the colour, not in `opacity`: the fade below animates opacity.
							background: `color-mix(in srgb, ${c} 50%, transparent)`,
							// Two entrances from the motion vocabulary, played backwards: the sheet slide from
							// `--motion-sheet-from` (a scale here, not an edge) grows the ring, the fade-in
							// fades it. `accelerate` reversed is a fast start that settles, like a ripple.
							'--motion-sheet-from': 'scale(2.6)',
							animation: `${PULSE} motion-sheet-slide, ${PULSE} motion-fade-in`,
						} as React.CSSProperties
					}
				/>
			)}
			<span
				style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: c }}
			/>
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
