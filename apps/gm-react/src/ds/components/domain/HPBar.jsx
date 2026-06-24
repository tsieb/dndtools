import React from 'react';

/**
 * HPBar — hit-point meter for the combat hot path. The fill color crosses thresholds (healthy →
 * bloodied → critical) so a DM reads danger at a glance; the numeric value uses the mono face.
 * Color is reinforced by the explicit number, never the sole signal.
 */
export function HPBar({ current, max, label, size = 'md', showText = true, style, ...rest }) {
	const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
	const ratio = current / (max || 1);
	const color = ratio <= 0.25 ? 'var(--color-status-error)' : ratio <= 0.5 ? 'var(--color-status-warning)' : 'var(--color-status-success)';
	const h = size === 'sm' ? 6 : size === 'lg' ? 14 : 9;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, ...style }} {...rest}>
			{(label || showText) && (
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)' }}>
					{label && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
					{showText && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', color: ratio <= 0.25 ? 'var(--color-status-error-text)' : 'var(--color-text-primary)' }}>{current}<span style={{ color: 'var(--color-text-tertiary)' }}>/{max}</span></span>}
				</div>
			)}
			<div style={{ height: h, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
				<div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 'var(--radius-full)', transition: 'width var(--duration-standard) var(--easing-standard), background var(--duration-standard) var(--easing-standard)' }} />
			</div>
		</div>
	);
}
