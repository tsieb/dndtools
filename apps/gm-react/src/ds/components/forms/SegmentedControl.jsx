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
	const refs = React.useRef([]);
	// ARIA radiogroup: exactly one radio is a tab stop, and Arrow/Home/End move the selection
	// between them (mirrors the roving-tabIndex contract already implemented in core/Tabs.jsx).
	const selectedIndex = opts.findIndex((o) => o.value === value && !o.disabled);
	const tabStopIndex = selectedIndex >= 0 ? selectedIndex : opts.findIndex((o) => !o.disabled);
	const moveSelection = (from, direction) => {
		if (opts.length === 0) return;
		for (let offset = 1; offset <= opts.length; offset += 1) {
			const index = (from + direction * offset + opts.length) % opts.length;
			if (opts[index]?.disabled) continue;
			refs.current[index]?.focus();
			onChange && onChange(opts[index].value);
			return;
		}
	};
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			style={{
				display: fullWidth ? 'grid' : 'inline-grid',
				gridAutoFlow: 'column',
				// minmax(0, …) so long/dynamic option labels shrink instead of overflowing a phone
				gridAutoColumns: fullWidth ? 'minmax(0, 1fr)' : 'minmax(0, max-content)',
				maxWidth: '100%',
				gap: 2,
				padding: 2,
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				...style,
			}}
			{...rest}
		>
			{opts.map((o, index) => {
				const active = o.value === value;
				return (
					<button
						key={o.value}
						ref={(node) => {
							refs.current[index] = node;
						}}
						type="button"
						role="radio"
						aria-checked={active}
						tabIndex={index === tabStopIndex ? 0 : -1}
						disabled={o.disabled}
						onClick={() => onChange && onChange(o.value)}
						onKeyDown={(event) => {
							if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
								event.preventDefault();
								moveSelection(index, 1);
							} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
								event.preventDefault();
								moveSelection(index, -1);
							} else if (event.key === 'Home' || event.key === 'End') {
								event.preventDefault();
								moveSelection(event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1);
							}
						}}
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
							minWidth: 0,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
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
