import React from 'react';

/**
 * ListItem — the standard row shell for row-based surfaces. It provides consistent
 * spacing, border radii, hover treatment, and optional interactive styling so
 * list rows share one visual contract across surfaces.
 */
export function ListItem({
	selected = false,
	interactive = false,
	disabled = false,
	onSelect,
	onClick,
	onKeyDown,
	style,
	children,
	...rest
}) {
	const handleSelect = (event) => {
		if (disabled || !interactive) return;
		event.preventDefault();
		onSelect?.();
		onClick?.(event);
	};

	const handleKeyDown = (event) => {
		if (!interactive || disabled) {
			onKeyDown?.(event);
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			handleSelect(event);
		}
		onKeyDown?.(event);
	};

	const tone = selected
		? {
				border: '1px solid var(--color-accent-border)',
				background: 'var(--color-accent-subtle)',
				color: 'var(--color-text-primary)',
			}
		: {
				border: '1px solid var(--color-border)',
				background: 'var(--color-surface)',
				color: 'var(--color-text-primary)',
			};

	return (
		<li
			role={interactive ? 'button' : undefined}
			tabIndex={interactive && !disabled ? 0 : disabled ? -1 : undefined}
			data-selected={selected}
			aria-pressed={interactive ? selected : undefined}
			aria-disabled={disabled || undefined}
			style={{
				listStyle: 'none',
				borderRadius: 'var(--radius-md)',
				padding: 'var(--space-2) var(--space-3)',
				display: 'block',
				minHeight: 'var(--density-touch-target, 0)',
				border: tone.border,
				background: tone.background,
				color: tone.color,
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
				opacity: disabled ? 0.5 : 1,
				cursor: interactive && !disabled ? 'pointer' : 'default',
				...style,
			}}
			{...rest}
			onClick={interactive ? handleSelect : onClick}
			onKeyDown={handleKeyDown}
		>
			{children}
		</li>
	);
}
