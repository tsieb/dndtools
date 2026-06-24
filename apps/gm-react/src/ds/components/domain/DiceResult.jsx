import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * DiceResult — a die roll readout: the die type, the big mono total, and the breakdown. The
 * --easing-spring curve is reserved for exactly this kind of celebratory surface. A natural 20 /
 * natural 1 gets a state color.
 */
export function DiceResult({ notation = '1d20', total, rolls = [], modifier = 0, crit, style, ...rest }) {
	const color = crit === 'success' ? 'var(--color-status-success-text)' : crit === 'fail' ? 'var(--color-status-error-text)' : 'var(--color-accent)';
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-3) var(--space-4)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-raised)',
				border: `1px solid ${crit ? color : 'var(--color-border)'}`,
				...style,
			}}
			{...rest}
		>
			<Icon name="dice" size="lg" color={color} />
			<div style={{ display: 'flex', flexDirection: 'column' }}>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{notation}{crit === 'success' ? ' • Natural 20' : crit === 'fail' ? ' • Natural 1' : ''}</span>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1, color }}>{total}</span>
			</div>
			{rolls.length > 0 && (
				<span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
					[{rolls.join(', ')}]{modifier ? (modifier > 0 ? ` +${modifier}` : ` ${modifier}`) : ''}
				</span>
			)}
		</div>
	);
}
