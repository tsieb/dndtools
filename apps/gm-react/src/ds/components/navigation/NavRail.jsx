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
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--component-list-gap)', flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', alignItems: 'center' }}>
				{items.map((it) => (
					<NavItem
						key={it.key}
						icon={it.icon}
						label={it.label}
						badge={it.badge}
						collapsed
						active={active === it.key}
						onClick={() => onSelect && onSelect(it.key)}
						/* RC-DSN-1.4 — the audited nav item box is the density one (48/36/28), not a fixed
						   44px square. A hard `height: 44` sat ABOVE compact/standard's min-height and
						   BELOW comfortable's, so the rail rendered 48/44/44 and the density control
						   moved nothing below Comfortable. `padding: 0` lets the 20px glyph centre
						   inside the 28px compact box, and `flex: '0 0 auto'` makes a tall list scroll
						   rather than shrink its items under the 24px WCAG 2.5.8 floor. */
						style={{
							position: 'relative',
							width: 'var(--density-nav-item-height)',
							height: 'var(--density-nav-item-height)',
							padding: 0,
							flex: '0 0 auto',
						}}
					/>
				))}
			</div>
			{footer && <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', width: '100%', display: 'flex', justifyContent: 'center' }}>{footer}</div>}
		</nav>
	);
}
