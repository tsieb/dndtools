import React from 'react';

/**
 * Avatar — a participant/character marker. Initials on a warm tinted disc by default; pass `src`
 * for an image. Optional status ring (e.g. connected/active turn) via `ring`.
 */
export function Avatar({ name = '', src, size = 'md', ring, style, ...rest }) {
	const dims = { sm: 28, md: 36, lg: 48, xl: 64 };
	const d = dims[size] || dims.md;
	const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
	const ringColor = ring === 'active' ? 'var(--color-status-success)' : ring === 'turn' ? 'var(--color-accent)' : ring === 'danger' ? 'var(--color-status-error)' : null;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: d,
				height: d,
				borderRadius: 'var(--radius-full)',
				background: 'var(--color-accent-subtle)',
				color: 'var(--color-accent)',
				fontFamily: 'var(--font-sans)',
				fontSize: d * 0.38,
				fontWeight: 'var(--font-weight-semibold)',
				flex: '0 0 auto',
				overflow: 'hidden',
				boxShadow: ringColor ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${ringColor}` : 'none',
				...style,
			}}
			{...rest}
		>
			{src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials || '?'}
		</span>
	);
}
