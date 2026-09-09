import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * RadioCard — single-select, card-shaped radio option. Visual and a11y contracts
 * match the app's existing radiogroup surfaces: one tab stop for the selected card and activation
 * on Enter/Space.
 */
export function RadioCard({
	value,
	checked = false,
	disabled = false,
	onChange,
	onClick,
	tabIndex,
	onKeyDown,
	heading,
	icon,
	children,
	style,
	...rest
}) {
	const activate = () => {
		if (disabled) return;
		onChange?.(value);
	};

	const handleKeyDown = (event) => {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			activate();
		}
		onKeyDown?.(event);
	};
	const handleClick = (event) => {
		activate();
		onClick?.(event);
	};

	return (
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			aria-disabled={disabled || undefined}
			tabIndex={tabIndex ?? (checked ? 0 : -1)}
			disabled={disabled}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				alignItems: 'flex-start',
				textAlign: 'left',
				padding: 'var(--space-3)',
				borderRadius: 'var(--radius-md)',
				border: checked ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
				background: checked ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)',
				boxShadow: checked ? '0 0 0 var(--focus-ring-width, 0) var(--color-border-focus)' : 'none',
				cursor: disabled ? 'not-allowed' : 'pointer',
				minWidth: 0,
				color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
				transition:
					'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
				...style,
			}}
			onMouseEnter={(event) => {
				if (disabled || checked) return;
				event.currentTarget.style.borderColor = 'var(--color-border-focus)';
				event.currentTarget.style.background = 'var(--color-interactive-hover)';
			}}
			onMouseLeave={(event) => {
				if (disabled || checked) return;
				event.currentTarget.style.borderColor = 'var(--color-border)';
				event.currentTarget.style.background = 'var(--color-surface-sunken)';
			}}
			{...rest}
		>
			{icon && <Icon name={icon} size="sm" />}
			{heading && (
				<div
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						fontWeight: 'var(--font-weight-semibold)',
						color: checked ? 'var(--color-accent)' : 'var(--color-text-primary)',
					}}
				>
					{heading}
				</div>
			)}
			{children && (
				<div
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-xs)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{children}
				</div>
			)}
		</button>
	);
}
