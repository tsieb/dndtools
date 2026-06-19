import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Tabs — segmented in-surface navigation (e.g. workflow modes, scene tabs). Controlled via
 * `value` / `onChange`; the active tab carries the gold underline + primary text.
 */
export function Tabs({ tabs = [], value, onChange, style, ...rest }) {
	return (
		<div
			role="tablist"
			style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--color-border)', ...style }}
			{...rest}
		>
			{tabs.map((t) => {
				const id = typeof t === 'string' ? t : t.id;
				const label = typeof t === 'string' ? t : t.label;
				const icon = typeof t === 'string' ? null : t.icon;
				const active = id === value;
				return (
					<button
						key={id}
						role="tab"
						type="button"
						aria-selected={active}
						onClick={() => onChange && onChange(id)}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 'var(--space-1-5)',
							padding: 'var(--space-2) var(--space-3)',
							background: 'transparent',
							border: 'none',
							borderBottom: `2px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
							marginBottom: '-1px',
							color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-sm)',
							fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
							cursor: 'pointer',
							transition: 'color var(--duration-fast) var(--easing-standard)',
						}}
					>
						{icon && <Icon name={icon} size="sm" />}
						{label}
					</button>
				);
			})}
		</div>
	);
}
