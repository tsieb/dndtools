import React from 'react';
import { Icon } from '../core/Icon.jsx';

// See the note in `Input.jsx`: no `outline: 'none'` below, and the ring uses the real focus-ring
// tokens rather than the ~1.4:1 `--color-interactive-selected` wash.
function focusOn(e) { e.currentTarget.style.borderColor = 'var(--color-border-focus)'; e.currentTarget.style.boxShadow = '0 0 0 var(--focus-ring-width) var(--focus-ring-color)'; }
function focusOff(e, invalid) { e.currentTarget.style.borderColor = invalid ? 'var(--color-status-error)' : 'var(--color-border-strong)'; e.currentTarget.style.boxShadow = 'none'; }

/**
 * Select — crafted dropdown replacing the native control. A real chevron, token styling, and a
 * focus ring. Pass `options` as [{value,label}] or plain strings.
 */
export function Select({ options = [], invalid = false, style, onFocus, onBlur, ...rest }) {
	// `{...rest}` is spread AFTER these handlers, so a caller that passes its own onFocus/onBlur
	// (commit-on-blur is the house pattern) used to REPLACE the ring handlers outright — the field
	// then kept its focus border and glow forever, so several fields looked focused at once.
	const handleFocus = (e) => { focusOn(e); onFocus?.(e); };
	const handleBlur = (e) => { focusOff(e, invalid); onBlur?.(e); };
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
					cursor: 'pointer',
					transition: 'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
					...style,
				}}
				{...rest}
				onFocus={handleFocus}
				onBlur={handleBlur}
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
