import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * DiceResult — a die roll readout: the die type, the big mono total, and the breakdown. A crit gets a
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
 *
 * RC-SES-2.4 — DICE DRAMA, opt-in through `drama` so a roll LOG keeps its quiet chips and only the
 * surface showing the roll that just landed celebrates it:
 *
 *   - a natural high (`crit="success"`) turns GOLD — gold border, headline and tinted fill — pops on
 *     --easing-spring (the curve reserved for exactly this) and sweeps a gold sheen across the face;
 *   - a natural low (`crit="fail"`) turns red and pulses a red ring;
 *   - anything else is the clean chip.
 *
 * `drama="play"` animates; `drama="static"` is the resting frame alone, for a roll that was already
 * on screen before the surface mounted (replaying it on every route change would be noise). Every
 * animation starts and ends on that resting frame, so under `data-motion="reduced|none"` — where
 * index.css collapses each run to ~0ms — the chip shows the static gold or red border and nothing
 * moves. The crit note (" • Natural 20") still says it in words, so the state never rests on colour
 * or motion. Timings are the `--motion-dice-*` tokens in tokens/spacing.css.
 */

const TIER_LABEL = { strong: 'Strong hit', partial: 'Partial hit', miss: 'Miss' };

/**
 * The resting frames are the chip's own: the pop ends unscaled, the sheen ends past the right edge
 * (where it rests, painted off the chip), and the pulse has no ring at 0% or 100%.
 */
const DRAMA_KEYFRAMES =
	'@keyframes dndDicePop{from{transform:scale(0.94)}to{transform:none}}' +
	'@keyframes dndDiceSheen{from{background-position:-150% 0}to{background-position:250% 0}}' +
	'@keyframes dndDicePulse{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 4px color-mix(in srgb, var(--color-status-error) 40%, transparent)}}';

/**
 * The gold sweep is a background image layered over the fill, so the readout always paints above it.
 * At 60% of the chip's width, `-150%` and `250%` sit fully off either edge.
 */
const SHEEN = {
	backgroundImage:
		'linear-gradient(105deg, transparent, color-mix(in srgb, var(--color-accent) 35%, transparent), transparent)',
	backgroundSize: '60% 100%',
	backgroundRepeat: 'no-repeat',
	backgroundPosition: '250% 0',
};

const DRAMA_MOTION = {
	crit:
		'dndDicePop var(--motion-dice-pop) var(--easing-spring) both, ' +
		'dndDiceSheen var(--motion-dice-sheen) var(--motion-dice-sheen-count) both',
	fumble: 'dndDicePulse var(--motion-dice-pulse) var(--motion-dice-pulse-count) both',
};

const DRAMA_FILL = {
	crit: 'var(--color-accent-subtle)',
	fumble: 'var(--color-status-error-subtle)',
	plain: 'var(--color-surface-raised)',
};

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
	drama = null,
	style,
	...rest
}) {
	const tone = drama ? (crit === 'success' ? 'crit' : crit === 'fail' ? 'fumble' : 'plain') : null;
	const playing = drama === 'play' && tone !== 'plain';
	// Under drama a natural high is the brand's celebratory gold rather than the status green a quiet
	// log uses.
	const color =
		crit === 'success'
			? tone === 'crit'
				? 'var(--color-accent)'
				: 'var(--color-status-success-text)'
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
			data-drama={tone ?? undefined}
			data-drama-mode={tone ? (drama === 'play' ? 'play' : 'static') : undefined}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-3) var(--space-4)',
				borderRadius: 'var(--radius-md)',
				backgroundColor: tone ? DRAMA_FILL[tone] : 'var(--color-surface-raised)',
				border: `1px solid ${crit ? color : 'var(--color-border)'}`,
				...(playing && tone === 'crit' ? SHEEN : null),
				...(playing ? { animation: DRAMA_MOTION[tone] } : null),
				...style,
			}}
			{...rest}
		>
			{playing && <style>{DRAMA_KEYFRAMES}</style>}
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
