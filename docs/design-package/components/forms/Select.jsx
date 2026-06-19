import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Select — crafted dropdown replacing the native control. A real chevron, token styling, and a
 * focus ring. Pass `options` as [{value,label}] or plain strings.
 */
export function Select({ options = [], invalid = false, style, ...rest }) {
	return (
		<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
			<select
				style={{
					width: '100%',
					appearance: 'none',
					WebkitAppearance: 'none',
					fontFamily: 'var(--font-sans)',
					fontSize: 'var(--text-base)',
					color: 'var(--color-text-primary)',
					background: 'var(--color-surface-sunken)',
					border: `1px solid ${invalid ? 'var(--color-status-error)' : 'var(--color-border-strong)'}`,
					borderRadius: 'var(--radius-sm)',
					padding: 'var(--component-input-py) var(--component-input-px)',
					paddingRight: 'calc(var(--space-6) + var(--space-2))',
					minHeight: 'var(--density-input-height, 2.25rem)',
					outline: 'none',
					cursor: 'pointer',
					transition: 'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
					...style,
				}}
				onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-focus)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-interactive-selected)'; }}
				onBlur={(e) => { e.currentTarget.style.borderColor = invalid ? 'var(--color-status-error)' : 'var(--color-border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
				{...rest}
			>
				{options.map((o) => {
					const value = typeof o === 'string' ? o : o.value;
					const label = typeof o === 'string' ? o : o.label;
					return <option key={value} value={value}>{label}</option>;
				})}
			</select>
			<span style={{ position: 'absolute', right: 'var(--space-2-5, 10px)', display: 'inline-flex', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
				<Icon name="chevron-down" size="sm" />
			</span>
		</div>
	);
}
