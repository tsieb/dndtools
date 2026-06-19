import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * LayerTypeBadge — the at-a-glance type chip on every layer row (UX-MAP-005). Thirteen map layer
 * types each get a distinct icon + label + hue, all re-harmonised to the warm brand in OKLCH (see
 * --layer-* tokens). One token drives the chip: the fg/border is the hue, the fill is mixed from
 * it against the surface, so a theme swap needs no per-type background token.
 *
 * The DM-annotations type adds a 45° hatch on its left edge so it stays distinguishable even in
 * grayscale (UX-MAP-005 AC2) — the safety-critical "this is DM-only" cue, never color alone.
 */
export const LAYER_TYPES = {
	base: { label: 'BASE', token: '--layer-base', icon: 'layer-base' },
	height: { label: 'HEIGHT', token: '--layer-height', icon: 'layer-height' },
	political: { label: 'POLI', token: '--layer-political', icon: 'layer-political' },
	climate: { label: 'CLIMATE', token: '--layer-climate', icon: 'layer-climate' },
	roads: { label: 'ROADS', token: '--layer-roads', icon: 'layer-roads' },
	water: { label: 'WATER', token: '--layer-water', icon: 'layer-water' },
	wshed: { label: 'WSHED', token: '--layer-wshed', icon: 'layer-wshed' },
	fog: { label: 'FOG', token: '--layer-fog', icon: 'layer-fog' },
	poi: { label: 'POI', token: '--layer-poi', icon: 'layer-poi' },
	dm: { label: 'DM ONLY', token: '--layer-dm', icon: 'layer-dm', hatch: true },
	player: { label: 'PLAYER', token: '--layer-player', icon: 'layer-player' },
	combat: { label: 'COMBAT', token: '--layer-combat', icon: 'layer-combat' },
	custom: { label: 'TAG', token: '--layer-custom', icon: 'layer-custom' },
};

export function LayerTypeBadge({ type = 'custom', label, showIcon = true, compact = false, style, ...rest }) {
	const t = LAYER_TYPES[type] || LAYER_TYPES.custom;
	const hue = `var(${t.token})`;
	const text = label || t.label;
	return (
		<span
			title={text}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: compact ? 0 : 'var(--space-1)',
				padding: compact ? '2px 5px' : '2px var(--space-1-5)',
				borderRadius: 'var(--radius-full)',
				background: `color-mix(in oklab, ${hue} 16%, var(--color-surface))`,
				color: hue,
				border: `1px solid color-mix(in oklab, ${hue} 55%, transparent)`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-2xs)',
				fontWeight: 'var(--font-weight-bold)',
				letterSpacing: 'var(--tracking-wide)',
				lineHeight: 1.4,
				whiteSpace: 'nowrap',
				...(t.hatch ? { backgroundImage: `repeating-linear-gradient(45deg, color-mix(in oklab, ${hue} 24%, transparent) 0 2px, transparent 2px 5px)` } : null),
				...style,
			}}
			{...rest}
		>
			{showIcon && <Icon name={t.icon} size={12} />}
			{!compact && text}
		</span>
	);
}
