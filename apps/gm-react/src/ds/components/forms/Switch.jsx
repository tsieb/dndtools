import React from 'react';

/** Switch — on/off toggle. Gold track when on. Pass `label` for an inline label. */
export function Switch({ checked = false, onChange, label, disabled = false, style, ...rest }) {
	const labelId = React.useId();
	const labelledBy = rest['aria-label'] == null && label ? labelId : undefined;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
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
				onClick={() => onChange && onChange(!checked)}
				style={{
					position: 'relative',
					width: 38,
					height: 22,
					flex: '0 0 auto',
					borderRadius: 'var(--radius-full)',
					border: '1px solid ' + (checked ? 'var(--color-accent)' : 'var(--color-border-strong)'),
					background: checked ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
					cursor: disabled ? 'not-allowed' : 'pointer',
					transition:
						'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
					padding: 0,
				}}
				{...rest}
			>
				<span
					style={{
						position: 'absolute',
						top: 2,
						left: checked ? 18 : 2,
						width: 16,
						height: 16,
						borderRadius: 'var(--radius-full)',
						background: checked ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
						transition:
							'left var(--duration-fast) var(--easing-standard), background var(--duration-fast) var(--easing-standard)',
					}}
				/>
			</button>
			{label ? (
				<span id={labelId} onClick={() => !disabled && onChange && onChange(!checked)}>
					{label}
				</span>
			) : null}
		</span>
	);
}
