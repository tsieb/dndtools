import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Stepper — the horizontal progress indicator for multi-step transactions, used by the map
 * import wizard (Source → Preview → Result, UX-MAP-009). Each step shows its index (or a check
 * once complete) and label; the active step is gold. Renders as <ol aria-label> with the active
 * step carrying aria-current="step".
 */
export function Stepper({ steps = [], current = 0, style, ariaLabel = 'Steps', ...rest }) {
	return (
		<ol aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', listStyle: 'none', margin: 0, padding: 0, ...style }} {...rest}>
			{steps.map((s, i) => {
				const label = typeof s === 'string' ? s : s.label;
				const state = i < current ? 'done' : i === current ? 'active' : 'todo';
				const ring = state === 'active' ? 'var(--color-accent)' : state === 'done' ? 'var(--color-accent-border)' : 'var(--color-border-strong)';
				const fill = state === 'done' ? 'var(--color-accent)' : 'transparent';
				const num = state === 'done' ? 'var(--color-accent-foreground)' : state === 'active' ? 'var(--color-accent)' : 'var(--color-text-tertiary)';
				return (
					<li key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: i < steps.length - 1 ? 1 : '0 0 auto', minWidth: 0 }} {...(state === 'active' ? { 'aria-current': 'step' } : {})}>
						<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flex: '0 0 auto', borderRadius: 'var(--radius-full)', border: `1.5px solid ${ring}`, background: fill, color: num, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
							{state === 'done' ? <Icon name="check" size={14} /> : i + 1}
						</span>
						<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: state === 'active' ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)', color: state === 'todo' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{label}</span>
						{i < steps.length - 1 && <span aria-hidden="true" style={{ flex: 1, height: 1, minWidth: 16, background: 'var(--color-border)' }} />}
					</li>
				);
			})}
		</ol>
	);
}
