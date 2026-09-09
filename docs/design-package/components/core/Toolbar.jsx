import React from 'react';

/**
 * Toolbar — command-row wrapper with token-safe spacing, role attribution, and
 * toolbar keyboard semantics for keyboard shortcuts.
 */
export function Toolbar({
	ariaLabel = 'Toolbar',
	gap = 'var(--space-2)',
	dense = false,
	style,
	children,
	onKeyDown,
	...rest
}) {
	return (
		<div
			role="toolbar"
			aria-label={ariaLabel}
			style={{
				display: 'flex',
				alignItems: 'center',
				flexWrap: 'wrap',
				gap,
				...(dense ? { gap: 'var(--space-1-5)' } : {}),
				...style,
			}}
			{...rest}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (
					event.defaultPrevented ||
					!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
				)
					return;
				if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
				const items = Array.from(
					event.currentTarget.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]'),
				);
				const index = items.indexOf(document.activeElement);
				if (index < 0 || !items.length) return;
				const next =
					event.key === 'Home'
						? 0
						: event.key === 'End'
							? items.length - 1
							: (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
				event.preventDefault();
				items[next]?.focus();
			}}
		>
			{children}
		</div>
	);
}
