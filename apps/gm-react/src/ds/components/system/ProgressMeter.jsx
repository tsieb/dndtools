import React from 'react';

const TONES = {
	accent: 'var(--color-accent)',
	success: 'var(--color-status-success)',
	warning: 'var(--color-status-warning)',
	error: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
	neutral: 'var(--color-text-tertiary)',
};

/**
 * ProgressMeter — a labeled determinate meter for non-combat quantities: encounter XP budget,
 * upload/sync progress, prep completion, attunement slots. (HP uses HPBar — this is everything
 * else.) An optional eyebrow label sits left of a mono value readout; `tone` colors the fill;
 * `markers` drops threshold ticks (e.g. difficulty bands). Indeterminate omits the value and
 * sweeps the shimmer.
 *
 * RC-DSN-3.4 — `eta` is the time-left copy for long work (import, backup, sync, generation), shown
 * under the bar and folded into `aria-valuetext`. The visible readouts are `aria-hidden` whenever the
 * bar itself carries the same words: a meter inside a `role="status"` region otherwise re-announced
 * "41%", "42%", … and every changed ETA, on each tick.
 */
export function ProgressMeter({
	value = 0,
	max = 100,
	label,
	valueLabel,
	eta,
	tone = 'accent',
	size = 'md',
	markers = [],
	indeterminate = false,
	style,
	...rest
}) {
	const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
	const h = size === 'sm' ? 6 : size === 'lg' ? 12 : 8;
	const fill = TONES[tone] || TONES.accent;
	const readout = valueLabel != null ? String(valueLabel) : `${Math.round(pct * 100)}%`;
	const etaText = typeof eta === 'string' && eta !== '' ? eta : null;
	const valueText = indeterminate
		? etaText || undefined
		: valueLabel != null || etaText
			? [readout, etaText].filter(Boolean).join(', ')
			: undefined;
	// A node `valueLabel` has no faithful string form, so it stays readable in place.
	const readoutMirrored =
		valueLabel == null || typeof valueLabel === 'string' || typeof valueLabel === 'number';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-1)',
				minWidth: 0,
				...style,
			}}
			{...rest}
		>
			{(label || valueLabel || !indeterminate) && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'baseline',
						gap: 'var(--space-2)',
					}}
				>
					{label && (
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-2xs)',
								fontWeight: 'var(--font-weight-semibold)',
								letterSpacing: 'var(--tracking-wider)',
								textTransform: 'uppercase',
								color: 'var(--color-text-tertiary)',
							}}
						>
							{label}
						</span>
					)}
					{!indeterminate && (
						<span
							aria-hidden={readoutMirrored ? 'true' : undefined}
							style={{
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-xs)',
								fontWeight: 'var(--font-weight-medium)',
								color: 'var(--color-text-secondary)',
							}}
						>
							{valueLabel != null ? valueLabel : `${Math.round(pct * 100)}%`}
						</span>
					)}
				</div>
			)}
			<div
				role="progressbar"
				// Clamped, exactly as the painted fill already is. An over-budget encounter (the live
				// example) announced "150" against aria-valuemax=100, which is out of range and reads
				// as broken rather than as "over budget".
				aria-valuenow={indeterminate ? undefined : Math.max(0, Math.min(max, value))}
				// Without this the bar announces a bare percentage while the readout beside it says
				// "12 / 40 pts" — the encounter builder's difficulty meter is the live example.
				aria-valuetext={valueText}
				aria-valuemin={0}
				aria-valuemax={max}
				aria-label={typeof label === 'string' ? label : undefined}
				style={{
					position: 'relative',
					height: h,
					borderRadius: 'var(--radius-full)',
					background: 'var(--color-surface-sunken)',
					border: '1px solid var(--color-border)',
					overflow: 'hidden',
				}}
			>
				{indeterminate ? (
					<div
						className="dnd-skeleton"
						style={{
							position: 'absolute',
							inset: 0,
							background: `linear-gradient(90deg, transparent 25%, ${fill} 50%, transparent 75%)`,
							backgroundSize: '400% 100%',
							animation: 'dnd-shimmer 1.2s ease-in-out infinite',
							opacity: 0.7,
						}}
					/>
				) : (
					<div
						style={{
							width: `${pct * 100}%`,
							height: '100%',
							background: fill,
							borderRadius: 'var(--radius-full)',
							transition:
								'width var(--duration-standard) var(--easing-standard), background var(--duration-standard) var(--easing-standard)',
						}}
					/>
				)}
				{markers.map((m, i) => (
					<span
						key={i}
						aria-hidden="true"
						title={m.label}
						style={{
							position: 'absolute',
							top: -1,
							bottom: -1,
							left: `${Math.max(0, Math.min(1, m.at / max)) * 100}%`,
							width: 2,
							background: 'var(--color-border-strong)',
							transform: 'translateX(-1px)',
						}}
					/>
				))}
			</div>
			{eta != null && eta !== '' && (
				<span
					data-progress-eta=""
					aria-hidden={etaText ? 'true' : undefined}
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-xs)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{eta}
				</span>
			)}
		</div>
	);
}
