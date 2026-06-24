import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Breadcrumb — the nested-map wayfinding bar (UX-MAP-002). Names every nesting level
 * (World › Northern Region › Silverdale › Inn) so a participant always knows where they are and
 * can return to any ancestor in one click. The current level is non-interactive and gold; an
 * `unavailable` crumb shows a generic placeholder and never leaks a hidden child's name (MAP-017).
 *
 * Renders as <nav aria-label="Map nesting"> with the trailing crumb carrying aria-current="page".
 */
export function Breadcrumb({ items = [], onNavigate, ariaLabel = 'Map nesting', maxVisible, style, ...rest }) {
	let list = items;
	let collapsed = false;
	if (maxVisible && items.length > maxVisible) {
		collapsed = true;
		list = [items[0], { ellipsis: true }, ...items.slice(items.length - (maxVisible - 1))];
	}
	return (
		<nav aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'center', minWidth: 0, ...style }} {...rest}>
			<ol style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', listStyle: 'none', margin: 0, padding: 0, minWidth: 0, flexWrap: 'nowrap' }}>
				{list.map((it, i) => {
					const last = i === list.length - 1;
					if (it.ellipsis) {
						return (
							<li key="e" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
								<span style={{ color: 'var(--color-text-tertiary)', padding: '0 2px' }}>…</span>
								<Sep />
							</li>
						);
					}
					return (
						<li key={it.id ?? i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0 }}>
							{it.unavailable ? (
								<span title="Area unavailable" style={{ ...crumbBase, color: 'var(--color-text-tertiary)', fontStyle: 'italic', cursor: 'default' }}>
									<Icon name="lock" size={13} /> Unavailable
								</span>
							) : last ? (
								<span aria-current="page" style={{ ...crumbBase, color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)' }}>{it.label}</span>
							) : (
								<button type="button" onClick={() => onNavigate && onNavigate(it, i)} style={{ ...crumbBase, background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
									onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
									onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
								>{it.label}</button>
							)}
							{!last && <Sep />}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

const crumbBase = {
	display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
	fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
	padding: '2px var(--space-1)', borderRadius: 'var(--radius-sm)',
	whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180,
};

function Sep() {
	return <span aria-hidden="true" style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>›</span>;
}
