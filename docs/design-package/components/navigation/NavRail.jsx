import React from 'react';
import { NavItem } from './NavItem.jsx';

/**
 * NavRail — the tablet expression of the same IA: a narrow icon-only column. Labels move to the
 * accessible name + native tooltip; the active item keeps the gold tint. Same `items`/`active`
 * contract as NavSidebar so the switch between breakpoints is a presentation change, never an IA
 * change. A badge collapses to a single accent dot.
 */
export function NavRail({ items = [], active, onSelect, header, footer, width = 64, style, ...rest }) {
	return (
		<nav
			aria-label="Primary"
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				width,
				flex: '0 0 auto',
				height: '100%',
				boxSizing: 'border-box',
				padding: 'var(--space-2)',
				gap: 'var(--space-1)',
				background: 'var(--color-surface)',
				borderRight: '1px solid var(--color-border)',
				...style,
			}}
			{...rest}
		>
			{header && <div style={{ padding: 'var(--space-2) 0 var(--space-3)' }}>{header}</div>}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', alignItems: 'center' }}>
				{items.map((it) => (
					<NavItem
						key={it.key}
						icon={it.icon}
						label={it.label}
						badge={it.badge}
						collapsed
						active={active === it.key}
						onClick={() => onSelect && onSelect(it.key)}
						style={{ position: 'relative', width: 44, height: 44 }}
					/>
				))}
			</div>
			{footer && <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', width: '100%', display: 'flex', justifyContent: 'center' }}>{footer}</div>}
		</nav>
	);
}
