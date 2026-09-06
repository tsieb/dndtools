import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * DiceResult — a die roll readout: the die type, the big mono total, and the breakdown. The
 * --easing-spring curve is reserved for exactly this kind of celebratory surface. A crit gets a
 * state color.
 *
 * RC-SYS-2.4 — what a roll MEANS comes from the active system package, so this component renders a
 * `model` rather than assuming every system sums a d20:
 *
 *   - `d20-plus-modifier` / `custom` lead with the TOTAL (unchanged from what shipped before).
 *   - `dice-pool` leads with the number of SUCCESSES and marks each die that met the threshold with
 *     a check, so the successes survive grayscale and a screen reader (A11Y-011) instead of being a
 *     colour on a number.
 *   - `2d6-pbta` leads with the total and names the outcome `tier`.
 *
 * The design system stays framework-pure and knows nothing about the core: the screen passes the
 * package's model and the already-derived readout (`@dndtools/core`'s `readRollUnderSystem`). Every
 * new prop has a default that reproduces the previous render exactly, so a caller that has not been
 * moved onto the package yet is unaffected.
 */

const TIER_LABEL = { strong: 'Strong hit', partial: 'Partial hit', miss: 'Miss' };

export function DiceResult({
	notation = '1d20',
	total,
	rolls = [],
	modifier = 0,
	crit,
	model = 'd20-plus-modifier',
	dice = null,
	successes = null,
	successThreshold = null,
	tier = null,
	critNatural = null,
	style,
	...rest
}) {
	const color =
		crit === 'success'
			? 'var(--color-status-success-text)'
			: crit === 'fail'
				? 'var(--color-status-error-text)'
				: 'var(--color-accent)';
	const pool = model === 'dice-pool';
	// A pool package counts successes; every other model sums. The count is taken from the readout
	// when the screen supplies one, and otherwise derived from the dice actually rolled — never
	// invented, so a pool with no threshold declared shows the honest zero rather than a total.
	const marked = Array.isArray(dice) ? dice : rolls.map((value) => ({ value, success: null }));
	const successCount =
		typeof successes === 'number'
			? successes
			: marked.reduce((count, die) => count + (die.success === true ? 1 : 0), 0);
	const headline = pool ? successCount : total;
	const critNote =
		crit === 'success'
			? critNatural !== null
				? ` • Natural ${critNatural}`
				: ' • Critical'
			: crit === 'fail'
				? critNatural !== null
					? ` • Natural ${critNatural}`
					: ' • Fumble'
				: '';
	const tierNote = tier && TIER_LABEL[tier] ? ` • ${TIER_LABEL[tier]}` : '';
	const poolNote = pool && successThreshold !== null ? ` • successes at ${successThreshold}+` : '';
	const readout = pool
		? `${notation}: ${successCount === 1 ? '1 success' : `${successCount} successes`}`
		: `${notation}: ${total}`;

	return (
		<div
			role="group"
			aria-label={readout}
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
				<span
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-xs)',
						letterSpacing: 'var(--tracking-wide)',
						textTransform: 'uppercase',
						color: 'var(--color-text-tertiary)',
					}}
				>
					{notation}
					{critNote}
					{tierNote}
					{poolNote}
				</span>
				<span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
					<span
						style={{
							fontFamily: 'var(--font-mono)',
							fontSize: 'var(--text-2xl)',
							fontWeight: 'var(--font-weight-bold)',
							lineHeight: 1,
							color,
						}}
					>
						{headline}
					</span>
					{pool && (
						<span
							style={{
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-xs)',
								color: 'var(--color-text-secondary)',
							}}
						>
							{successCount === 1 ? 'success' : 'successes'}
						</span>
					)}
				</span>
			</div>
			{marked.length > 0 && (
				<span
					style={{
						marginLeft: 'auto',
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-1)',
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-sm)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{pool
						? marked.map((die, index) => <PoolDie key={index} die={die} />)
						: `[${marked.map((die) => die.value).join(', ')}]`}
					{modifier ? (modifier > 0 ? ` +${modifier}` : ` ${modifier}`) : ''}
				</span>
			)}
		</div>
	);
}

/**
 * One die in a pool. A success is marked with a CHECK, not just a colour, so the count can be
 * verified in grayscale and read aloud (A11Y-011 / WCAG 1.4.1).
 */
function PoolDie({ die }) {
	const success = die.success === true;
	return (
		<span
			title={success ? `${die.value} — success` : String(die.value)}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 2,
				padding: '0 var(--space-1)',
				borderRadius: 'var(--radius-sm)',
				border: `1px solid ${success ? 'var(--color-status-success-text)' : 'var(--color-border)'}`,
				color: success ? 'var(--color-status-success-text)' : 'var(--color-text-tertiary)',
			}}
		>
			{die.value}
			{success && <Icon name="check" size="micro" />}
		</span>
	);
}
