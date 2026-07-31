import React from 'react';

/**
 * Switch — on/off toggle. Gold track when on. Pass `label` for an inline label.
 *
 * `disabled` is the hard native form. A truthy `aria-disabled` is the SOFT form this repo standardised
 * on in `Button`/`IconButton`: the switch keeps its place in the tab order and still announces its
 * name, but it looks unavailable and swallows `onChange`. That is the correct form for a TRANSIENT
 * gate — several call sites wrote `disabled={busy}`, and `busy` flips synchronously inside the click
 * handler, so the switch the user had just pressed went natively disabled under its own focus and the
 * browser dropped focus to `<body>` mid-interaction.
 */
export function Switch({ checked = false, onChange, label, disabled = false, style, ...rest }) {
	const labelId = React.useId();
	const labelledBy = rest['aria-label'] == null && label ? labelId : undefined;
	const softDisabled = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
	const inert = disabled || softDisabled;
	const toggle = () => {
		if (inert) return;
		if (onChange) onChange(!checked);
	};
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
				cursor: inert ? 'not-allowed' : 'pointer',
				opacity: inert ? 0.5 : 1,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-base)',
				color: 'var(--color-text-primary)',
				...style,
			}}
		>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-labelledby={labelledBy}
				disabled={disabled}
				onClick={toggle}
				style={{
					// The button is a transparent hit box that clears the WCAG 2.5.8 24px floor; the
					// compact 38x22 pill is painted by the inner track so the visual is unchanged.
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					minWidth: 'var(--density-touch-target, 24px)',
					minHeight: 'var(--density-touch-target, 24px)',
					flex: '0 0 auto',
					background: 'transparent',
					border: 'none',
					borderRadius: 'var(--radius-full)',
					cursor: inert ? 'not-allowed' : 'pointer',
					padding: 0,
				}}
				{...rest}
			>
				<span
					style={{
						position: 'relative',
						display: 'block',
						width: 38,
						height: 22,
						flex: '0 0 auto',
						borderRadius: 'var(--radius-full)',
						border: '1px solid ' + (checked ? 'var(--color-accent)' : 'var(--color-border-strong)'),
						background: checked ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
						transition:
							'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
					}}
				>
					<span
						style={{
							position: 'absolute',
							top: 2,
							left: checked ? 18 : 2,
							width: 16,
							height: 16,
							borderRadius: 'var(--radius-full)',
							background: checked
								? 'var(--color-accent-foreground)'
								: 'var(--color-text-secondary)',
							transition:
								'left var(--duration-fast) var(--easing-standard), background var(--duration-fast) var(--easing-standard)',
						}}
					/>
				</span>
			</button>
			{label ? (
				<span id={labelId} onClick={toggle}>
					{label}
				</span>
			) : null}
		</span>
	);
}
