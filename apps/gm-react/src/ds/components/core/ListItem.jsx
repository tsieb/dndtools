import React from 'react';

/**
 * ListItem — the standard row shell for row-based surfaces. It provides consistent
 * spacing, border radii and selection styling so list rows share one visual contract
 * across surfaces.
 *
 * The `<li>` always keeps its listitem role so the parent `ul`/`ol` stays a valid list
 * (WCAG 1.3.1). An `interactive` row puts a native toggle button inside the item rather
 * than overriding the item's role: Enter/Space activation, focus and `disabled` come from
 * the platform, and `selected` is exposed as `aria-pressed`.
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

	const shell = {
		listStyle: 'none',
		borderRadius: 'var(--radius-md)',
		border: tone.border,
		background: tone.background,
		color: tone.color,
		transition:
			'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
		opacity: disabled ? 0.5 : 1,
	};
	const rowBox = {
		display: 'block',
		padding: 'var(--space-2) var(--space-3)',
		minHeight: 'var(--density-touch-target, 0)',
	};

	if (!interactive) {
		return (
			<li
				data-selected={selected}
				style={{ ...shell, ...rowBox, ...style }}
				{...rest}
				onClick={onClick}
				onKeyDown={onKeyDown}
			>
				{children}
			</li>
		);
	}

	return (
		<li data-selected={selected} style={{ ...shell, padding: 0, ...style }} {...rest}>
			<button
				type="button"
				aria-pressed={selected}
				disabled={disabled}
				onClick={(event) => {
					onSelect?.();
					onClick?.(event);
				}}
				onKeyDown={onKeyDown}
				style={{
					...rowBox,
					boxSizing: 'border-box',
					width: '100%',
					margin: 0,
					border: 'none',
					borderRadius: 'inherit',
					background: 'transparent',
					color: 'inherit',
					font: 'inherit',
					textAlign: 'start',
					cursor: disabled ? 'default' : 'pointer',
				}}
			>
				{children}
			</button>
		</li>
	);
}
