import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Stepper — the horizontal progress indicator for multi-step transactions, used by the map
 * import wizard (Source → Preview → Result, UX-MAP-009). Each step shows its index (or a check
 * once complete) and label; the active step is gold. Renders as <ol aria-label> with the active
 * step carrying aria-current="step".
 */
export function Stepper({
	steps = [],
	current = 0,
	orientation = 'horizontal',
	size = 'md',
	showLines = true,
	style,
	ariaLabel = 'Steps',
	...rest
}) {
	const normalized = Array.isArray(steps) ? steps : [];
	const total = normalized.length;
	const safeCurrent = Math.max(
		0,
		Math.min(Number.isFinite(current) ? Math.floor(current) : 0, Math.max(0, total - 1)),
	);
	const isHorizontal = orientation !== 'vertical';

	const dot = size === 'sm' ? 20 : size === 'lg' ? 28 : 24;
	const line = size === 'sm' ? 1 : 2;
	const gap = size === 'sm' ? 'var(--space-1-5)' : 'var(--space-2)';

	return (
		<ol
			aria-label={ariaLabel}
			style={{
				display: 'flex',
				flexDirection: isHorizontal ? 'row' : 'column',
				alignItems: isHorizontal ? 'center' : 'stretch',
				gap,
				listStyle: 'none',
				margin: 0,
				padding: 0,
				...style,
			}}
			{...rest}
		>
			{normalized.map((s, i) => {
				const label = typeof s === 'string' ? s : s.label;
				const state = i < safeCurrent ? 'done' : i === safeCurrent ? 'active' : 'todo';
				const ring =
					state === 'active'
						? 'var(--color-accent)'
						: state === 'done'
							? 'var(--color-accent-border)'
							: 'var(--color-border-strong)';
				const fill = state === 'done' ? 'var(--color-accent)' : 'transparent';
				const num =
					state === 'done'
						? 'var(--color-accent-foreground)'
						: state === 'active'
							? 'var(--color-accent)'
							: 'var(--color-text-tertiary)';
				return (
					<li
						key={i}
						style={{
							display: 'flex',
							flexDirection: 'row',
							alignItems: 'center',
							gap,
							flex: isHorizontal && i < total - 1 ? 1 : '0 0 auto',
							minWidth: 0,
							position: 'relative',
							paddingBottom: !isHorizontal && i < total - 1 ? 16 : 0,
						}}
						{...(state === 'active' ? { 'aria-current': 'step' } : {})}
					>
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: dot,
								height: dot,
								flex: '0 0 auto',
								borderRadius: 'var(--radius-full)',
								border: `1.5px solid ${ring}`,
								background: fill,
								color: num,
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-xs)',
								fontWeight: 'var(--font-weight-semibold)',
							}}
						>
							{state === 'done' ? <Icon name="check" size={14} /> : i + 1}
						</span>
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-sm)',
								fontWeight:
									state === 'active' ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
								color:
									state === 'todo' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
								whiteSpace: 'nowrap',
							}}
						>
							{label}
						</span>
						{showLines && i < total - 1 && (
							<span
								aria-hidden="true"
								style={{
									flex: isHorizontal ? 1 : '0 0 auto',
									height: isHorizontal ? line : `calc(16px + ${gap})`,
									position: isHorizontal ? undefined : 'absolute',
									top: isHorizontal ? undefined : dot,
									left: isHorizontal ? undefined : (dot - 1) / 2,
									minWidth: isHorizontal ? 16 : 1,
									width: isHorizontal ? undefined : 1,
									marginLeft: 0,
									background: 'var(--color-border)',
								}}
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}
