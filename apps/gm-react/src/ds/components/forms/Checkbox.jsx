import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Checkbox — token-styled check with a gold fill when checked. Pass `label` for an inline label. */
export function Checkbox({ checked = false, onChange, label, disabled = false, style, ...rest }) {
	// A <label> only names labelable form elements, and role="checkbox" lives on a <span> here — so
	// without an explicit aria-labelledby the control has NO accessible name. Mirror Switch.jsx.
	const labelId = React.useId();
	const labelledBy = rest['aria-label'] == null && rest['aria-labelledby'] == null && label ? labelId : undefined;
	return (
		<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', ...style }}>
			<span
				role="checkbox"
				aria-checked={checked}
				aria-labelledby={labelledBy}
				tabIndex={disabled ? -1 : 0}
				onClick={() => !disabled && onChange && onChange(!checked)}
				onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange && onChange(!checked); } }}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 18,
					height: 18,
					borderRadius: 'var(--radius-sm)',
					border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
					background: checked ? 'var(--color-accent)' : 'var(--color-surface-sunken)',
					color: 'var(--color-accent-foreground)',
					flex: '0 0 auto',
					transition: 'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
				}}
				{...rest}
			>
				{checked && <Icon name="check" size={14} />}
			</span>
			{label ? (
				<span id={labelId} onClick={() => !disabled && onChange && onChange(!checked)}>
					{label}
				</span>
			) : null}
		</label>
	);
}
