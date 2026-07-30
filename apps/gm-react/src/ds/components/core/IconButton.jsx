import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * IconButton — a square, icon-only control with a required accessible name. Used in toolbars,
 * widget headers, and dense controls. Sizes are fixed per `size` (sm 1.75rem / md 2.25rem /
 * lg 2.75rem); it does not currently scale with the density tokens (unlike Button).
 */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', disabled = false, style, onClick, ...rest }) {
	const dim = size === 'sm' ? '1.75rem' : size === 'lg' ? '2.75rem' : '2.25rem';
	// Same two flavours of unavailable that Button draws: `disabled` is the hard native one, while a
	// truthy `aria-disabled` keeps the control focusable (so its `label` — the only place an
	// icon-only button can explain itself — stays reachable) but looks unavailable and swallows the
	// click. Callers that used to guard inside `onClick` rendered a button that looked perfectly live
	// and silently did nothing.
	const soft = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
	const inert = disabled || soft;
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
			onClick={inert ? undefined : onClick}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: dim,
				height: dim,
				borderRadius: 'var(--radius-md)',
				cursor: inert ? 'not-allowed' : 'pointer',
				opacity: inert ? 0.5 : 1,
				transition: 'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
				...v,
				...style,
			}}
			// `outline` is the variant used for dense +/- steppers (CharBuilder's ability scores, the
			// NumSteppers) and it had NO pointer feedback at all, because this guard only let `ghost`
			// through. There is no global `button:hover` rule to fall back on.
			// `outline` follows Button's `secondary` (raised -> overlay) rather than the translucent
			// interactive tint, which would have dissolved its raised surface instead of lifting it.
			onMouseEnter={(e) => { if (inert || variant === 'accent') return; e.currentTarget.style.background = variant === 'outline' ? 'var(--color-surface-overlay)' : 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
			onMouseLeave={(e) => { if (!inert) { e.currentTarget.style.background = v.background; e.currentTarget.style.color = v.color; } }}
			{...rest}
		>
			<Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />
		</button>
	);
}
