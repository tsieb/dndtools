import React from 'react';

/**
 * Field — the label/help/error wrapper for any form control. Gives every input a consistent
 * label treatment, optional required mark, help text, and an error state.
 */
export function Field({ label, htmlFor, required = false, help, error, children, style, ...rest }) {
	// Accessibility: a visible <label> must point at its control (axe `label` / `select-name`).
	// When the caller supplies no explicit `htmlFor`, auto-associate the label with a single child
	// control by generating a stable id and injecting it — so every Field-wrapped Input/Select gets
	// an accessible name without each call site wiring ids by hand.
	const autoId = React.useId();
	const onlyChild = React.isValidElement(children) ? children : null;
	const controlId = htmlFor ?? onlyChild?.props?.id ?? (onlyChild ? autoId : undefined);
	const control =
		onlyChild && !htmlFor && !onlyChild.props?.id && controlId
			? React.cloneElement(onlyChild, { id: controlId })
			: children;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }} {...rest}>
			{label && (
				<label htmlFor={controlId} style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
					{label}
					{required && <span style={{ color: 'var(--color-status-error)', marginLeft: 4 }}>*</span>}
				</label>
			)}
			{control}
			{error ? (
				<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-error-text)' }}>{error}</span>
			) : help ? (
				<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{help}</span>
			) : null}
		</div>
	);
}
