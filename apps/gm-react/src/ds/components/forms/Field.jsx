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
	// Inject the id (when the caller didn't supply one) so the label associates, AND propagate the
	// `required` semantic to assistive tech via aria-required — the visible `*` is decorative only
	// (aria-hidden below), so requiredness must be carried on the control, not read off the label.
	const cloneProps = {};
	if (onlyChild && !htmlFor && !onlyChild.props?.id && controlId) cloneProps.id = controlId;
	if (onlyChild && required && onlyChild.props?.['aria-required'] === undefined) cloneProps['aria-required'] = true;
	const control =
		onlyChild && Object.keys(cloneProps).length ? React.cloneElement(onlyChild, cloneProps) : children;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }} {...rest}>
			{label && (
				// The required `*` is a SIBLING of the <label>, not a child: Chromium folds aria-hidden
				// label-subtree text into the control's accessible name, so an in-label asterisk would
				// make the name "Title*" (read "Title asterisk"). Kept visually inline; requiredness is
				// carried to AT by aria-required on the control above.
				<span style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' }}>
					<label htmlFor={controlId}>{label}</label>
					{required && <span aria-hidden="true" style={{ color: 'var(--color-status-error)', marginLeft: 4 }}>*</span>}
				</span>
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
