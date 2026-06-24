import React from 'react';

/** The signed ability modifier for a raw score (5e rule: floor((score-10)/2)). */
export function abilityModifier(score) {
	const m = Math.floor((Number(score) - 10) / 2);
	return m >= 0 ? `+${m}` : `${m}`;
}

/**
 * AbilityScore — one of the six ability cells (STR/DEX/CON/INT/WIS/CHA) shared by statblocks and
 * character sheets: an uppercase tracked label, the raw score in the mono face, and the derived
 * modifier in a pill below. The modifier is computed unless an explicit `modifier` is passed.
 * `tone="accent"` highlights a relevant save/check; numbers are always mono for tabular alignment.
 */
export function AbilityScore({ label, score, modifier, tone = 'default', size = 'md', style, ...rest }) {
	const mod = modifier !== undefined ? modifier : abilityModifier(score);
	const accent = tone === 'accent';
	const scoreSize = size === 'sm' ? 'var(--text-md)' : size === 'lg' ? 'var(--text-2xl)' : 'var(--text-xl)';
	const pad = size === 'sm' ? 'var(--space-1) var(--space-2)' : 'var(--space-2)';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: pad,
				minWidth: 0,
				borderRadius: 'var(--radius-md)',
				background: accent ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)',
				border: `1px solid ${accent ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				...style,
			}}
			{...rest}
		>
			<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: accent ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{label}</span>
			<span style={{ fontFamily: 'var(--font-mono)', fontSize: scoreSize, fontWeight: 'var(--font-weight-bold)', lineHeight: 1, color: 'var(--color-text-primary)' }}>{score}</span>
			<span
				style={{
					fontFamily: 'var(--font-mono)',
					fontSize: 'var(--text-xs)',
					fontWeight: 'var(--font-weight-semibold)',
					lineHeight: 1,
					padding: '2px var(--space-2)',
					borderRadius: 'var(--radius-full)',
					background: accent ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
					color: accent ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
				}}
			>
				{mod}
			</span>
		</div>
	);
}
