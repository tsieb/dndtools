import React from 'react';

/**
 * Card — the panel/widget container. Elevation and surface tone encode importance, so primary and
 * secondary panels read differently under the squint test (UX-VIS-007). Use `elevation="raised"`
 * + `accent` for the one primary region; flat/sunken for supporting tiles.
 */
export function Card({ elevation = 'flat', accent = false, padding = 'md', interactive = false, style, children, ...rest }) {
	// An interactive card is a control, not decoration: without a role/tab stop/key handler the
	// whole tile is mouse-only and announces as plain text (WCAG 2.1.1, 4.1.2). Only applied when
	// there is something to activate, and placed before `...rest` so a call site can override.
	const activatable = interactive && typeof rest.onClick === 'function';
	const a11y = activatable
		? {
				role: 'button',
				tabIndex: 0,
				onKeyDown: (e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						rest.onClick(e);
					}
					rest.onKeyDown?.(e);
				},
			}
		: null;
	const surfaces = {
		sunken: { background: 'var(--color-surface-sunken)', shadow: 'none' },
		flat: { background: 'var(--color-surface)', shadow: 'var(--shadow-sm)' },
		raised: { background: 'var(--color-surface-raised)', shadow: 'var(--shadow-md)' },
		overlay: { background: 'var(--color-surface-overlay)', shadow: 'var(--shadow-lg)' },
	};
	const s = surfaces[elevation] || surfaces.flat;
	const pad = padding === 'none' ? '0' : padding === 'sm' ? 'var(--space-3)' : padding === 'lg' ? 'var(--space-6)' : 'var(--component-card-padding)';
	return (
		<div
			style={{
				background: s.background,
				border: accent ? '1px solid var(--color-accent-border)' : '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				boxShadow: accent ? 'var(--shadow-md)' : s.shadow,
				padding: pad,
				color: 'var(--color-text-primary)',
				transition: interactive ? 'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)' : 'none',
				cursor: interactive ? 'pointer' : 'default',
				...style,
			}}
			onMouseEnter={interactive ? (e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; } : undefined}
			onMouseLeave={interactive ? (e) => { e.currentTarget.style.borderColor = accent ? 'var(--color-accent-border)' : 'var(--color-border)'; e.currentTarget.style.boxShadow = accent ? 'var(--shadow-md)' : s.shadow; } : undefined}
			{...a11y}
			{...rest}
			onKeyDown={a11y ? a11y.onKeyDown : rest.onKeyDown}
		>
			{children}
		</div>
	);
}

/**
 * CardHeader — widget/panel header: an uppercase tracked eyebrow title on the left, optional
 * actions on the right. Matches the live-play widget vocabulary.
 */
export function CardHeader({ title, eyebrow = true, actions, style, ...rest }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: 'var(--space-3)',
				marginBottom: 'var(--space-3)',
				...style,
			}}
			{...rest}
		>
			<h3
				style={{
					margin: 0,
					fontFamily: 'var(--font-sans)',
					fontSize: eyebrow ? 'var(--text-xs)' : 'var(--text-md)',
					fontWeight: eyebrow ? 'var(--font-weight-semibold)' : 'var(--font-weight-semibold)',
					letterSpacing: eyebrow ? 'var(--tracking-wider)' : 'var(--tracking-normal)',
					textTransform: eyebrow ? 'uppercase' : 'none',
					color: eyebrow ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
				}}
			>
				{title}
			</h3>
			{actions && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>{actions}</div>}
		</div>
	);
}
