import React from 'react';

/**
 * Skeleton — the loading placeholder: a sunken block with a single warm shimmer sweep (the only
 * load affordance in the system). The shimmer collapses under the resolved reduce-motion
 * preference. Use `variant="text"` for line runs (set `lines`), `circle` for avatars, `rect` for
 * media/cards. Match the skeleton's size to the content it stands in for so layout doesn't jump.
 */
export function Skeleton({ variant = 'rect', width, height, lines = 1, radius, style, ...rest }) {
	const base = {
		background: 'linear-gradient(90deg, var(--color-surface-sunken) 25%, var(--color-surface-alt) 37%, var(--color-surface-sunken) 63%)',
		backgroundSize: '400% 100%',
		animation: 'dnd-shimmer 1.4s ease-in-out infinite',
		borderRadius: radius || 'var(--radius-sm)',
	};

	if (variant === 'circle') {
		const d = width || height || 40;
		return <span className="dnd-skeleton" aria-hidden="true" style={{ ...base, display: 'inline-block', width: d, height: d, borderRadius: 'var(--radius-full)', ...style }} {...rest} />;
	}

	if (variant === 'text') {
		return (
			<span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: width || '100%', ...style }} {...rest}>
				{Array.from({ length: lines }).map((_, i) => (
					<span key={i} className="dnd-skeleton" style={{ ...base, height: height || 12, width: i === lines - 1 && lines > 1 ? '60%' : '100%', borderRadius: 'var(--radius-sm)' }} />
				))}
			</span>
		);
	}

	return <span className="dnd-skeleton" aria-hidden="true" style={{ ...base, display: 'block', width: width || '100%', height: height || 80, borderRadius: radius || 'var(--radius-md)', ...style }} {...rest} />;
}
