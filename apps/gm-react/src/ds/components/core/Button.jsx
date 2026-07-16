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
	...rest
}) {
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
			color: '#fff',
			border: '1px solid var(--color-status-error)',
		},
	};
	const v = variants[variant] || variants.secondary;

	return (
		<button
			type={type}
			disabled={disabled}
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
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard), filter var(--duration-fast) var(--easing-standard)',
				whiteSpace: 'normal',
				overflowWrap: 'anywhere',
				...v,
				...style,
			}}
			onMouseEnter={(e) => {
				if (disabled) return;
				if (variant === 'primary') e.currentTarget.style.background = 'var(--color-accent-hover)';
				else if (variant === 'danger') e.currentTarget.style.filter = 'brightness(1.1)';
				else {
					e.currentTarget.style.background = 'var(--color-surface-overlay)';
					e.currentTarget.style.color = 'var(--color-text-primary)';
				}
			}}
			onMouseLeave={(e) => {
				if (disabled) return;
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
