import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * IconButton — a square, icon-only control with a required accessible name. Used in toolbars,
 * widget headers, and dense controls. Sizes are fixed per `size` (sm 1.75rem / md 2.25rem /
 * lg 2.75rem); it does not currently scale with the density tokens (unlike Button).
 */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', disabled = false, style, ...rest }) {
	const dim = size === 'sm' ? '1.75rem' : size === 'lg' ? '2.75rem' : '2.25rem';
	const variants = {
		ghost: { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' },
		outline: { background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-strong)' },
		accent: { background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)' },
	};
	const v = variants[variant] || variants.ghost;
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: dim,
				height: dim,
				borderRadius: 'var(--radius-md)',
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
				transition: 'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
				...v,
				...style,
			}}
			onMouseEnter={(e) => { if (!disabled && variant === 'ghost') { e.currentTarget.style.background = 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
			onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = v.background; e.currentTarget.style.color = v.color; } }}
			{...rest}
		>
			<Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />
		</button>
	);
}
