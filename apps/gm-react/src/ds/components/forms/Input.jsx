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
	transition:
		'border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
	boxSizing: 'border-box',
});

// NO `outline: 'none'` here. An inline style beats any stylesheet, so suppressing the outline killed
// the app's global `:focus-visible` ring (`styles/tokens/base.css`) on EVERY text field — and the
// replacement below used to be `--color-interactive-selected`, a ~1.4:1 wash that WCAG 2.4.11 does
// not accept as a focus indicator (and that forced-colors does not paint at all, since box-shadow is
// suppressed there). Same defect the Slider had. The ring now uses the real focus-ring tokens so a
// pointer focus is indicated too; the global outline stacks with it into one ring.
function focusOn(e) {
	e.currentTarget.style.borderColor = 'var(--color-border-focus)';
	e.currentTarget.style.boxShadow = '0 0 0 var(--focus-ring-width) var(--focus-ring-color)';
}
function focusOff(e, invalid) {
	e.currentTarget.style.borderColor = invalid
		? 'var(--color-status-error)'
		: 'var(--color-border-strong)';
	e.currentTarget.style.boxShadow = 'none';
}

// `{...rest}` is spread AFTER the ring handlers, so a caller passing its own onFocus/onBlur — and
// commit-on-blur is the house pattern for these fields — used to REPLACE them outright. The field
// then kept its focus border and 3px glow after focus had moved on, so several fields could look
// focused simultaneously. Compose instead of letting the caller clobber the ring.
function composeFocus(own, caller) {
	return (e) => {
		own(e);
		caller?.(e);
	};
}

/** Input — single-line text/number/search field. Pass `icon` for a leading glyph (e.g. search). */
export function Input({ invalid = false, icon, style, onFocus, onBlur, ...rest }) {
	const handleFocus = composeFocus(focusOn, onFocus);
	const handleBlur = composeFocus((e) => focusOff(e, invalid), onBlur);
	if (icon) {
		return (
			<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
				<span
					style={{
						position: 'absolute',
						left: 'var(--space-2-5, 10px)',
						display: 'inline-flex',
						color: 'var(--color-text-tertiary)',
						pointerEvents: 'none',
					}}
				>
					<Icon name={icon} size="sm" />
				</span>
				<input
					aria-invalid={invalid || undefined}
					style={{
						...baseField(invalid),
						paddingLeft: 'calc(var(--space-4) + var(--icon-size-sm))',
						...style,
					}}
					{...rest}
					onFocus={handleFocus}
					onBlur={handleBlur}
				/>
			</div>
		);
	}
	return (
		<input
			aria-invalid={invalid || undefined}
			style={{ ...baseField(invalid), ...style }}
			{...rest}
			onFocus={handleFocus}
			onBlur={handleBlur}
		/>
	);
}

/** Textarea — multi-line text (notes, terrain descriptions). */
export function Textarea({ invalid = false, rows = 4, style, onFocus, onBlur, ...rest }) {
	return (
		<textarea
			rows={rows}
			aria-invalid={invalid || undefined}
			style={{
				...baseField(invalid),
				minHeight: 'auto',
				resize: 'vertical',
				lineHeight: 'var(--leading-body)',
				...style,
			}}
			{...rest}
			onFocus={composeFocus(focusOn, onFocus)}
			onBlur={composeFocus((e) => focusOff(e, invalid), onBlur)}
		/>
	);
}
