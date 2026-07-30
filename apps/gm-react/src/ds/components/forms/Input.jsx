import React from 'react';
import { Icon } from '../core/Icon.jsx';

const baseField = (invalid) => ({
	width: '100%',
	fontFamily: 'var(--font-sans)',
	fontSize: 'var(--text-base)',
	color: 'var(--color-text-primary)',
	background: 'var(--color-surface-sunken)',
	border: `1px solid ${invalid ? 'var(--color-status-error)' : 'var(--color-border-strong)'}`,
	borderRadius: 'var(--radius-sm)',
	padding: 'var(--component-input-py) var(--component-input-px)',
	minHeight: 'var(--density-input-height, 2.25rem)',
	outline: 'none',
	transition: 'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
	boxSizing: 'border-box',
});

function focusOn(e) { e.currentTarget.style.borderColor = 'var(--color-border-focus)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-interactive-selected)'; }
function focusOff(e, invalid) { e.currentTarget.style.borderColor = invalid ? 'var(--color-status-error)' : 'var(--color-border-strong)'; e.currentTarget.style.boxShadow = 'none'; }

/** Input — single-line text/number/search field. Pass `icon` for a leading glyph (e.g. search). */
export function Input({ invalid = false, icon, style, ...rest }) {
	if (icon) {
		return (
			<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
				<span style={{ position: 'absolute', left: 'var(--space-2-5, 10px)', display: 'inline-flex', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
					<Icon name={icon} size="sm" />
				</span>
				<input aria-invalid={invalid || undefined} style={{ ...baseField(invalid), paddingLeft: 'calc(var(--space-4) + var(--icon-size-sm))', ...style }} onFocus={focusOn} onBlur={(e) => focusOff(e, invalid)} {...rest} />
			</div>
		);
	}
	return <input aria-invalid={invalid || undefined} style={{ ...baseField(invalid), ...style }} onFocus={focusOn} onBlur={(e) => focusOff(e, invalid)} {...rest} />;
}

/** Textarea — multi-line text (notes, terrain descriptions). */
export function Textarea({ invalid = false, rows = 4, style, ...rest }) {
	return <textarea rows={rows} aria-invalid={invalid || undefined} style={{ ...baseField(invalid), minHeight: 'auto', resize: 'vertical', lineHeight: 'var(--leading-body)', ...style }} onFocus={focusOn} onBlur={(e) => focusOff(e, invalid)} {...rest} />;
}
