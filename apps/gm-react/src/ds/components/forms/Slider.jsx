import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Slider — the single range-input primitive the map surface leans on: brush size (in map units),
 * layer opacity, and every generation parameter reuse it for an identical step/label/keyboard
 * contract (UX-MAP-004/007/008). A gold fill marks progress; an optional value readout shows the
 * human label ("2 ft", "75%"); optional −/+ steppers give the WCAG-2.5.7 non-drag alternative.
 *
 * `stops` renders a labelled discrete scale (Small · Medium · Large · Huge) instead of a % track.
 */

let _injected = false;
function ensureStyles() {
	if (_injected || typeof document === 'undefined') return;
	_injected = true;
	const css = `
.dnds-range{ -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:var(--radius-full);
  background:var(--color-surface-sunken); cursor:pointer; }
.dnds-range:focus-visible{ outline:var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset:var(--focus-ring-offset); }
.dnds-range::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:24px; height:24px; border-radius:50%;
  background:var(--color-accent); border:4px solid transparent; background-clip:content-box;
  box-shadow:var(--shadow-sm); cursor:grab; }
.dnds-range::-moz-range-thumb{ width:24px; height:24px; border-radius:50%; background:var(--color-accent);
  border:4px solid transparent; background-clip:content-box; box-shadow:var(--shadow-sm); cursor:grab; }
.dnds-range:disabled{ opacity:.5; cursor:not-allowed; }
.dnds-range:disabled::-webkit-slider-thumb{ cursor:not-allowed; }`;
	const el = document.createElement('style');
	el.setAttribute('data-dnds', 'slider');
	el.textContent = css;
	document.head.appendChild(el);
}

export function Slider({
	min = 0,
	max = 100,
	step = 1,
	value = 0,
	onChange,
	label,
	valueLabel,
	steppers = false,
	stops,
	disabled = false,
	'aria-label': ariaLabel,
	style,
	...rest
}) {
	ensureStyles();
	const isStops = Array.isArray(stops) && stops.length > 1;
	const lo = isStops ? 0 : min;
	const hi = isStops ? stops.length - 1 : max;
	const st = isStops ? 1 : step;
	const pct = hi === lo ? 0 : ((value - lo) / (hi - lo)) * 100;
	const readout = valueLabel != null ? valueLabel : isStops ? stops[value] : value;

	const fire = (v) => {
		if (!disabled && onChange) onChange(isStops ? Math.round(v) : v);
	};
	// Several sliders can sit in one panel (master volume + one per ambience layer). Literal
	// "Decrease"/"Increase" names make them indistinguishable to a screen reader (WCAG 2.4.6).
	const stepperFor = (verb) => (ariaLabel || label ? `${verb} ${ariaLabel || label}` : verb);
	const atMin = disabled || value <= lo;
	const atMax = disabled || value >= hi;
	const trackBg = `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${pct}%, var(--color-surface-sunken) ${pct}%, var(--color-surface-sunken) 100%)`;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', ...style }}>
			{(label || readout != null) && (
				<div
					style={{
						display: 'flex',
						alignItems: 'baseline',
						justifyContent: 'space-between',
						gap: 'var(--space-2)',
					}}
				>
					{label && (
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-sm)',
								fontWeight: 'var(--font-weight-medium)',
								color: 'var(--color-text-secondary)',
							}}
						>
							{label}
						</span>
					)}
					{readout != null && (
						<span
							style={{
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-xs)',
								color: 'var(--color-text-primary)',
								fontWeight: 'var(--font-weight-medium)',
							}}
						>
							{readout}
						</span>
					)}
				</div>
			)}
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				{steppers && (
					<button
						type="button"
						aria-label={stepperFor('Decrease')}
						// Soft-disable at the bound. These used to hard-disable themselves: stepping a
						// volume fader down to 0 (the common case) natively disabled the button under
						// the user's own finger, dropping focus to <body> so the next Tab restarted at
						// the top of the document. `disabled` stays hard only for the whole-control case.
						disabled={disabled}
						aria-disabled={atMin || undefined}
						title={atMin && !disabled ? `Already at the minimum (${lo})` : undefined}
						onClick={() => {
							if (atMin) return;
							fire(Math.max(lo, value - st));
						}}
						{...stepHover(atMin)}
						style={stepBtn(atMin)}
					>
						<Icon name="chevron-left" size={16} />
					</button>
				)}
				<input
					type="range"
					className="dnds-range"
					min={lo}
					max={hi}
					step={st}
					value={value}
					disabled={disabled}
					onChange={(e) => fire(Number(e.target.value))}
					aria-label={ariaLabel || label}
					aria-valuetext={readout != null ? String(readout) : undefined}
					style={{ background: trackBg }}
					{...rest}
				/>
				{steppers && (
					<button
						type="button"
						aria-label={stepperFor('Increase')}
						disabled={disabled}
						aria-disabled={atMax || undefined}
						title={atMax && !disabled ? `Already at the maximum (${hi})` : undefined}
						onClick={() => {
							if (atMax) return;
							fire(Math.min(hi, value + st));
						}}
						{...stepHover(atMax)}
						style={stepBtn(atMax)}
					>
						<Icon name="chevron-right" size={16} />
					</button>
				)}
			</div>
			{isStops && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-2xs)',
						color: 'var(--color-text-tertiary)',
						letterSpacing: 'var(--tracking-wide)',
					}}
				>
					{stops.map((s, i) => (
						<span key={i} style={{ color: i === value ? 'var(--color-accent)' : undefined }}>
							{s}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

function stepBtn(disabled) {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		// The non-drag alternative to the track must itself be hittable: follow the density token
		// (44px under the touch profile) rather than a fixed 28px square.
		width: 'var(--density-touch-target, 1.75rem)',
		height: 'var(--density-touch-target, 1.75rem)',
		flex: '0 0 auto',
		borderRadius: 'var(--radius-sm)',
		border: '1px solid var(--color-border-strong)',
		background: 'var(--color-surface-raised)',
		color: 'var(--color-text-secondary)',
		cursor: disabled ? 'not-allowed' : 'pointer',
		opacity: disabled ? 0.4 : 1,
		padding: 0,
	};
}

// There is no global `button:hover` rule in this app and an inline style cannot express one, so the
// WCAG-2.5.7 non-drag alternative to dragging the track had zero pointer feedback. Mirrors the
// treatment IconButton's `outline` variant already carries.
function stepHover(disabled) {
	if (disabled) return {};
	return {
		onMouseEnter: (e) => {
			e.currentTarget.style.background = 'var(--color-surface-overlay)';
		},
		onMouseLeave: (e) => {
			e.currentTarget.style.background = 'var(--color-surface-raised)';
		},
	};
}
