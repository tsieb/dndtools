import React from 'react';

/**
 * SegmentedControl — a compact 2–4 option single-select rendered as one connected control. The
 * maps surface uses it for generation type (Terrain · Settlement · Dungeon) and elevation
 * profile (Flat · Rolling · Mountainous) — short, mutually-exclusive choices that must stay
 * visible (UX-MAP-008). The active segment carries the one gold fill; the rest recede.
 */
export function SegmentedControl({ options = [], value, onChange, size = 'md', fullWidth = false, ariaLabel, style, ...rest }) {
	const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
	const pad = size === 'sm' ? '5px var(--space-2)' : 'var(--space-1-5) var(--space-3)';
	const font = size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)';
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			style={{
				display: fullWidth ? 'grid' : 'inline-grid',
				gridAutoFlow: 'column',
				gridAutoColumns: fullWidth ? '1fr' : 'max-content',
				gap: 2,
				padding: 2,
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				...style,
			}}
			{...rest}
		>
			{opts.map((o) => {
				const active = o.value === value;
				return (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={active}
						disabled={o.disabled}
						onClick={() => onChange && onChange(o.value)}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 'var(--space-1-5)',
							padding: pad,
							border: '1px solid ' + (active ? 'var(--color-accent)' : 'transparent'),
							borderRadius: 'var(--radius-sm)',
							background: active ? 'var(--color-accent)' : 'transparent',
							color: active ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
							fontFamily: 'var(--font-sans)',
							fontSize: font,
							fontWeight: 'var(--font-weight-semibold)',
							lineHeight: 1,
							whiteSpace: 'nowrap',
							cursor: o.disabled ? 'not-allowed' : 'pointer',
							opacity: o.disabled ? 0.45 : 1,
							transition: 'background var(--duration-micro) var(--easing-standard), color var(--duration-micro) var(--easing-standard)',
						}}
						onMouseEnter={(e) => { if (!active && !o.disabled) { e.currentTarget.style.background = 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
						onMouseLeave={(e) => { if (!active && !o.disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}
