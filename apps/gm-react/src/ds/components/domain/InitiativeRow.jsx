import React from 'react';
import { Avatar } from '../core/Avatar.jsx';
import { Icon } from '../core/Icon.jsx';
import { HPBar } from './HPBar.jsx';
import { Chip } from '../feedback/Chip.jsx';
import { VisibilityChip } from '../feedback/VisibilityChip.jsx';

/**
 * InitiativeRow — one combatant in the tracker (the Session/Combat hot path). The ACTIVE row is
 * emphasized with the gold accent rail + raised tone; DM-only combatants get the visibility cue.
 * Designed for fast HP edits.
 *
 * RC-SYS-2.4 — the tracker's shape comes from the active system package's TURN MODEL, so this row
 * renders a `turnModel` rather than assuming every system rolls initiative:
 *
 *   - `initiative` shows the initiative number and marks whose turn it is (unchanged).
 *   - `actions-per-turn` marks whose turn it is and shows the action budget as PIPS, filled as they
 *     are spent, so the row says how much of a turn is left without a number to decode.
 *   - `popcorn` runs turns but rolls no initiative, so the number is omitted rather than shown as a
 *     meaningless zero.
 *   - `none` makes the tracker an unordered ROSTER: no initiative, no turn, and the marked row is
 *     the SPOTLIGHT — who the table's attention is on right now.
 *
 * Defaults reproduce the previous render exactly, so a screen not yet moved onto the package is
 * unaffected. The design system stays framework-pure: the screen resolves the model against the core
 * (`resolveTurnModel`) and passes plain values.
 */
export function InitiativeRow({
	name,
	initiative,
	current,
	max,
	conditions = [],
	active = false,
	dmOnly = false,
	turnModel = 'initiative',
	actionsPerTurn = null,
	actionsUsed = 0,
	onHpUp,
	onHpDown,
	style,
	...rest
}) {
	const spotlight = turnModel === 'none';
	const showInitiative = turnModel === 'initiative';
	const marked = active;
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-2) var(--space-3)',
				borderRadius: 'var(--radius-md)',
				background: marked ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
				borderLeft: `3px solid ${marked ? 'var(--color-accent)' : 'transparent'}`,
				border: `1px solid ${marked ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				borderLeftWidth: 3,
				boxShadow: marked ? 'var(--shadow-sm)' : 'none',
				...style,
			}}
			{...rest}
		>
			{showInitiative ? (
				<span
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-lg)',
						fontWeight: 'var(--font-weight-bold)',
						color: marked ? 'var(--color-accent)' : 'var(--color-text-secondary)',
						minWidth: 28,
						textAlign: 'center',
					}}
				>
					{initiative}
				</span>
			) : (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						minWidth: 28,
					}}
				>
					{marked && (
						<Icon
							name={spotlight ? 'sparkle' : 'play'}
							size="sm"
							color="var(--color-accent)"
							label={spotlight ? 'In the spotlight' : 'Their turn'}
						/>
					)}
				</span>
			)}
			<Avatar name={name} size="sm" ring={marked ? 'turn' : undefined} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<strong
						style={{
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-base)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{name}
					</strong>
					{dmOnly && <VisibilityChip level="dm-only" compact />}
				</div>
				{actionsPerTurn ? <ActionPips total={actionsPerTurn} used={actionsUsed} /> : null}
				{conditions.length > 0 && (
					<div
						style={{
							display: 'flex',
							gap: 'var(--space-1)',
							marginTop: 'var(--space-1)',
							flexWrap: 'wrap',
						}}
					>
						{conditions.map((c) => (
							<Chip key={c} tone="danger">
								{c}
							</Chip>
						))}
					</div>
				)}
			</div>
			<div style={{ width: 120, flex: '0 0 auto' }}>
				<HPBar current={current} max={max} size="sm" />
			</div>
			<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
				<HpStep label="−" onClick={onHpDown} />
				<HpStep label="+" onClick={onHpUp} />
			</div>
		</div>
	);
}

/**
 * The action budget an `actions-per-turn` package gives a combatant, drawn as pips: spent ones are
 * filled, remaining ones are outlines. The group carries the count in text for screen readers, so
 * the meaning does not depend on seeing the shapes.
 */
function ActionPips({ total, used }) {
	const spent = Math.max(0, Math.min(total, used));
	const left = total - spent;
	return (
		<div
			role="img"
			aria-label={`${left} of ${total} actions left`}
			style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}
		>
			{Array.from({ length: total }, (_unused, index) => (
				<span
					key={index}
					style={{
						width: 8,
						height: 8,
						borderRadius: 'var(--radius-full)',
						border: '1px solid var(--color-accent)',
						background: index < left ? 'var(--color-accent)' : 'transparent',
					}}
				/>
			))}
		</div>
	);
}

function HpStep({ label, onClick }) {
	return (
		<button
			type="button"
			aria-label={label === '+' ? 'Heal 1' : 'Damage 1'}
			onClick={onClick}
			style={{
				width: 28,
				height: 28,
				borderRadius: 'var(--radius-sm)',
				border: '1px solid var(--color-border-strong)',
				background: 'var(--color-surface-raised)',
				color: 'var(--color-text-primary)',
				fontFamily: 'var(--font-mono)',
				fontSize: 'var(--text-md)',
				fontWeight: 'var(--font-weight-bold)',
				cursor: 'pointer',
				lineHeight: 1,
			}}
		>
			{label}
		</button>
	);
}
