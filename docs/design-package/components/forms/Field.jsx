import React from 'react';

/**
 * Field — the label/help/error wrapper for any form control. Gives every input a consistent
 * label treatment, optional required mark, help text, and an error state.
 */
export function Field({ label, htmlFor, required = false, help, error, children, style, ...rest }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }} {...rest}>
			{label && (
				<label htmlFor={htmlFor} style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
					{label}
					{required && <span style={{ color: 'var(--color-status-error)', marginLeft: 4 }}>*</span>}
				</label>
			)}
			{children}
			{error ? (
				<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-error-text)' }}>{error}</span>
			) : help ? (
				<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{help}</span>
			) : null}
		</div>
	);
}
