import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Button — the crafted action control. One primary (gold) action per region; secondary and ghost
 * recede. Consumes the token system entirely; no bare colors.
 */
export function Button({
	variant = 'secondary',
	size = 'md',
	icon,
	iconRight,
	disabled = false,
	type = 'button',
	children,
	style,
	onClick,
	...rest
}) {
	// Two flavours of unavailable. `disabled` is the hard one: the browser removes the button from
	// the tab order, which also makes its `title` / `aria-label` explanation unreachable — so a
	// carefully-worded "why can't I press this" is never announced. Callers that have such an
	// explanation pass `aria-disabled` instead: the button keeps its place in the tab order and
	// still reads out, but it looks unavailable and swallows activation.
	const soft = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
	const inert = disabled || soft;
	const sizes = {
		sm: {
			px: 'var(--space-3)',
			py: 'var(--space-1-5)',
			font: 'var(--text-sm)',
			gap: 'var(--space-1-5)',
		},
		md: {
			px: 'var(--space-4)',
			py: 'var(--space-2)',
			font: 'var(--text-base)',
			gap: 'var(--space-2)',
		},
		lg: {
			px: 'var(--space-5)',
			py: 'var(--space-3)',
			font: 'var(--text-md)',
			gap: 'var(--space-2)',
		},
	};
	const s = sizes[size] || sizes.md;

	const variants = {
		primary: {
			background: 'var(--color-accent)',
			color: 'var(--color-accent-foreground)',
			border: '1px solid var(--color-accent)',
			boxShadow: 'var(--shadow-sm)',
		},
		secondary: {
			background: 'var(--color-surface-raised)',
			color: 'var(--color-text-primary)',
			border: '1px solid var(--color-border-strong)',
		},
		ghost: {
			background: 'transparent',
			color: 'var(--color-text-secondary)',
			border: '1px solid transparent',
		},
		danger: {
			background: 'var(--color-status-error)',
			color: 'var(--color-status-error-foreground)',
			border: '1px solid var(--color-status-error)',
		},
		// Mirrors IconButton's `accent`. The two vocabularies had diverged, and an unknown variant
		// falls through to `secondary` SILENTLY (see `v` below) — so `variant="accent"` rendered the
		// live-session dice roller's primary action as a plain raised button, not the gold it asked
		// for, with nothing to catch it (ds/index.d.ts types every export as Record<string, unknown>).
		accent: {
			background: 'var(--color-accent-subtle)',
			color: 'var(--color-accent)',
			border: '1px solid var(--color-accent-border)',
		},
	};
	const v = variants[variant] || variants.secondary;

	return (
		<button
			type={type}
			disabled={disabled}
			onClick={soft ? undefined : onClick}
			style={{
				display: 'inline-flex',
				minWidth: 'var(--density-touch-target, 0)',
				maxWidth: '100%',
				alignItems: 'center',
				justifyContent: 'center',
				gap: s.gap,
				padding: `${s.py} ${s.px}`,
				minHeight: 'var(--density-button-height, 2.25rem)',
				fontFamily: 'var(--font-sans)',
				fontSize: s.font,
				fontWeight: 'var(--font-weight-semibold)',
				lineHeight: 1.2,
				borderRadius: 'var(--radius-md)',
				cursor: inert ? 'not-allowed' : 'pointer',
				opacity: inert ? 0.5 : 1,
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard), filter var(--duration-fast) var(--easing-standard)',
				whiteSpace: 'normal',
				overflowWrap: 'anywhere',
				...v,
				...style,
			}}
			onMouseEnter={(e) => {
				if (inert) return;
				if (variant === 'primary') e.currentTarget.style.background = 'var(--color-accent-hover)';
				else if (variant === 'danger') e.currentTarget.style.filter = 'brightness(1.1)';
				else {
					e.currentTarget.style.background = 'var(--color-surface-overlay)';
					e.currentTarget.style.color = 'var(--color-text-primary)';
				}
			}}
			onMouseLeave={(e) => {
				if (inert) return;
				e.currentTarget.style.background = v.background;
				e.currentTarget.style.color = v.color;
				e.currentTarget.style.filter = 'none';
			}}
			{...rest}
		>
			{icon && <Icon name={icon} size="sm" />}
			{children}
			{iconRight && <Icon name={iconRight} size="sm" />}
		</button>
	);
}
