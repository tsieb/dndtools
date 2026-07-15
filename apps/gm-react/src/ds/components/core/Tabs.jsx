import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Tabs — segmented in-surface navigation (e.g. workflow modes, scene tabs). Controlled via
 * `value` / `onChange`; the active tab carries the gold underline + primary text.
 */

export function Tabs({ tabs = [], value, onChange, style, ...rest }) {
	const refs = React.useRef([]);
	const normalized = tabs.map((tab) =>
		typeof tab === 'string' ? { id: tab, label: tab, disabled: false } : tab,
	);
	const selectedIndex = normalized.findIndex((tab) => tab.id === value && !tab.disabled);
	const tabStopIndex =
		selectedIndex >= 0 ? selectedIndex : normalized.findIndex((tab) => !tab.disabled);

	const moveFocus = (from, direction) => {
		if (normalized.length === 0) return;
		for (let offset = 1; offset <= normalized.length; offset += 1) {
			const index = (from + direction * offset + normalized.length) % normalized.length;
			if (normalized[index]?.disabled) continue;
			refs.current[index]?.focus();
			onChange && onChange(normalized[index].id);
			return;
		}
	};

	return (
		<div
			role="tablist"
			aria-label="Sections"
			aria-orientation="horizontal"
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--space-1)',
				maxWidth: '100%',
				borderBottom: '1px solid var(--color-border)',
				...style,
			}}
			{...rest}
		>
			{normalized.map((t, index) => {
				const { id, label } = t;
				const icon = t.icon;
				const active = id === value;
				return (
					<button
						key={id}
						ref={(node) => {
							refs.current[index] = node;
						}}
						role="tab"
						type="button"
						aria-selected={active}
						tabIndex={index === tabStopIndex ? 0 : -1}
						disabled={t.disabled}
						onClick={() => onChange && onChange(id)}
						onKeyDown={(event) => {
							if (event.key === 'ArrowRight') {
								event.preventDefault();
								moveFocus(index, 1);
							} else if (event.key === 'ArrowLeft') {
								event.preventDefault();
								moveFocus(index, -1);
							} else if (event.key === 'Home' || event.key === 'End') {
								event.preventDefault();
								const target = event.key === 'Home' ? -1 : 0;
								moveFocus(target, event.key === 'Home' ? 1 : -1);
							}
						}}
						style={{
							display: 'inline-flex',
							minWidth: 0,
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
							cursor: t.disabled ? 'not-allowed' : 'pointer',
							opacity: t.disabled ? 0.45 : 1,
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
