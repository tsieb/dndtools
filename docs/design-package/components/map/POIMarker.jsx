import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * POIMarker — the anchored pin a POI renders as on the canvas (UX-MAP-010). Coordinates are
 * normalized map-space, so the marker stays pinned across zoom/resize. The category drives the
 * color + glyph; a DM-only marker carries the safety purple ring so the DM reads its audience at
 * a glance. ≥44px hit area (the visible pin is smaller) for touch (WCAG 2.5.8).
 */
const CAT = {
	location: { icon: 'poi', color: 'var(--layer-poi)' },
	quest: { icon: 'flag', color: 'var(--layer-political)' },
	danger: { icon: 'warning', color: 'var(--color-status-error)' },
	npc: { icon: 'characters-person', color: 'var(--layer-player)' },
	treasure: { icon: 'sparkle', color: 'var(--color-accent)' },
	note: { icon: 'note-edit', color: 'var(--layer-custom)' },
};

export function POIMarker({ category = 'location', label, dmOnly = false, active = false, size = 28, onClick, style, ...rest }) {
	const c = CAT[category] || CAT.location;
	return (
		<button
			type="button"
			aria-label={label ? `POI: ${label}` : 'Point of interest'}
			title={label}
			onClick={onClick}
			style={{
				position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
				width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', ...style,
			}}
			{...rest}
		>
			<span style={{
				display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
				width: size, height: size, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)',
				background: c.color, color: '#fff',
				border: dmOnly ? '2px solid var(--color-dm-only-badge)' : '2px solid rgba(255,255,255,0.7)',
				boxShadow: active ? '0 0 0 3px var(--color-interactive-selected), var(--shadow-md)' : 'var(--shadow-md)',
			}}>
				<span style={{ transform: 'rotate(45deg)', display: 'inline-flex' }}>
					<Icon name={c.icon} size={Math.round(size * 0.5)} />
				</span>
			</span>
		</button>
	);
}
