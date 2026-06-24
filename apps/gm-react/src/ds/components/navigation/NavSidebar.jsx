import React from 'react';
import { NavItem } from './NavItem.jsx';

/**
 * NavSidebar — the desktop expression of the seven-section IA: a labeled vertical nav with an
 * optional brand header at top and a footer slot (settings, account). One information architecture,
 * one active region. `items` are `{ key, icon, label, badge }`; `active` is the current key. Collapse
 * to NavRail on tablet, BottomTabBar on mobile — same items, different presentation.
 */
export function NavSidebar({ items = [], active, onSelect, header, footer, width = 240, style, ...rest }) {
	return (
		<nav
			aria-label="Primary"
			style={{
				display: 'flex',
				flexDirection: 'column',
				width,
				flex: '0 0 auto',
				height: '100%',
				boxSizing: 'border-box',
				padding: 'var(--space-3)',
				gap: 'var(--space-1)',
				background: 'var(--color-surface)',
				borderRight: '1px solid var(--color-border)',
				...style,
			}}
			{...rest}
		>
			{header && <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>{header}</div>}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
				{items.map((it) => (
					<NavItem
						key={it.key}
						icon={it.icon}
						label={it.label}
						badge={it.badge}
						active={active === it.key}
						onClick={() => onSelect && onSelect(it.key)}
					/>
				))}
			</div>
			{footer && <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>{footer}</div>}
		</nav>
	);
}
