import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { VisibilityChip } from '../feedback/VisibilityChip.jsx';

const STATUS = {
	active: {
		label: 'Active',
		fg: 'var(--color-accent)',
		bg: 'var(--color-accent-subtle)',
		bd: 'var(--color-accent-border)',
		icon: 'flag',
	},
	completed: {
		label: 'Completed',
		fg: 'var(--color-status-success-text)',
		bg: 'var(--color-status-success-subtle)',
		bd: 'var(--color-status-success)',
		icon: 'success',
	},
	failed: {
		label: 'Failed',
		fg: 'var(--color-status-error-text)',
		bg: 'var(--color-status-error-subtle)',
		bd: 'var(--color-status-error)',
		icon: 'error',
	},
	onhold: {
		label: 'On hold',
		fg: 'var(--color-text-secondary)',
		bg: 'var(--color-surface-overlay)',
		bd: 'var(--color-border-strong)',
		icon: 'pause',
	},
};

/**
 * QuestCard — a quest / objective in the Campaign log: a status-keyed header (active quests carry
 * the gold accent), an optional hook line, and a checklist of objectives that visibly completes as
 * the party advances. `dmOnly` quests get the purple cue. The progress count is mono. Completed
 * objectives strike through; the active quest is the one the card emphasizes.
 */
export function QuestCard({
	title,
	status = 'active',
	hook,
	objectives = [],
	reward,
	dmOnly = false,
	onToggleObjective,
	style,
	...rest
}) {
	const s = STATUS[status] || STATUS.active;
	const done = objectives.filter((o) => o.done).length;
	const accent = status === 'active';
	return (
		<article
			style={{
				background: accent ? 'var(--color-surface-raised)' : 'var(--color-surface)',
				border: `1px solid ${accent ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				borderLeft: `3px solid ${s.fg}`,
				borderRadius: 'var(--radius-md)',
				boxShadow: accent ? 'var(--shadow-md)' : 'var(--shadow-sm)',
				padding: 'var(--space-4)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				color: 'var(--color-text-primary)',
				...style,
			}}
			{...rest}
		>
			<header
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					justifyContent: 'space-between',
					gap: 'var(--space-2)',
				}}
			>
				<div style={{ minWidth: 0 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							marginBottom: 2,
						}}
					>
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 4,
								padding: '2px var(--space-2)',
								borderRadius: 'var(--radius-full)',
								background: s.bg,
								color: s.fg,
								border: `1px solid ${s.bd}`,
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-2xs)',
								fontWeight: 'var(--font-weight-semibold)',
								letterSpacing: 'var(--tracking-wide)',
								textTransform: 'uppercase',
							}}
						>
							<Icon name={s.icon} size={11} /> {s.label}
						</span>
						{dmOnly && <VisibilityChip level="dm-only" compact />}
					</div>
					<h3
						style={{
							margin: 0,
							fontFamily: 'var(--font-display)',
							fontSize: 'var(--text-md)',
							fontWeight: 'var(--font-weight-bold)',
							lineHeight: 1.15,
							color: 'var(--color-text-primary)',
						}}
					>
						{title}
					</h3>
				</div>
				{objectives.length > 0 && (
					<span
						style={{
							fontFamily: 'var(--font-mono)',
							fontSize: 'var(--text-sm)',
							fontWeight: 'var(--font-weight-semibold)',
							color:
								done === objectives.length
									? 'var(--color-status-success-text)'
									: 'var(--color-text-tertiary)',
							flex: '0 0 auto',
						}}
					>
						{done}/{objectives.length}
					</span>
				)}
			</header>

			{hook && (
				<p
					style={{
						margin: 0,
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						fontStyle: 'italic',
						lineHeight: 1.5,
						color: 'var(--color-text-secondary)',
					}}
				>
					{hook}
				</p>
			)}

			{objectives.length > 0 && (
				<ul
					style={{
						margin: 0,
						padding: 0,
						listStyle: 'none',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-1-5)',
					}}
				>
					{objectives.map((o, i) => {
						const body = (
							<>
								<span
									aria-hidden="true"
									style={{
										flex: '0 0 auto',
										marginTop: 1,
										width: 16,
										height: 16,
										borderRadius: 'var(--radius-sm)',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: o.done ? 'var(--color-status-success)' : 'transparent',
										border: `1.5px solid ${o.done ? 'var(--color-status-success)' : 'var(--color-border-strong)'}`,
										color: 'var(--color-accent-foreground)',
									}}
								>
									{o.done && <Icon name="check" size={11} />}
								</span>
								<span
									style={{
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-sm)',
										lineHeight: 1.45,
										color: o.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
										textDecoration: o.done ? 'line-through' : 'none',
									}}
								>
									{o.label}
								</span>
							</>
						);
						const rowStyle = {
							display: 'flex',
							alignItems: 'flex-start',
							gap: 'var(--space-2)',
							width: '100%',
							minHeight: 24,
							padding: 0,
							border: 'none',
							background: 'transparent',
							textAlign: 'left',
						};
						// A player/observer gets `onToggleObjective === undefined`, and the old code still
						// rendered a NATIVELY DISABLED <button> for them — so the whole quest checklist left the
						// tab order and was UA-dimmed for something that was never an action. Read-only means
						// plain text, not a broken control.
						if (!onToggleObjective)
							return (
								<li key={i} style={rowStyle}>
									{body}
								</li>
							);
						return (
							<li key={i}>
								<button
									type="button"
									// `o.done` was conveyed ONLY by a line-through and a coloured tick, so a screen
									// reader heard the identical string either way (WCAG 1.3.1). `aria-pressed` adds
									// the state without changing the role that `campaign.spec.ts` matches on.
									aria-pressed={!!o.done}
									onClick={() => onToggleObjective(i)}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = 'var(--color-interactive-hover)';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = 'transparent';
									}}
									style={{ ...rowStyle, cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
								>
									{body}
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{reward && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						paddingTop: 'var(--space-2)',
						borderTop: '1px solid var(--color-border)',
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						color: 'var(--color-text-secondary)',
					}}
				>
					<Icon name="sparkle" size={14} color="var(--color-accent)" aria-hidden="true" />
					<span>
						<strong
							style={{
								color: 'var(--color-text-primary)',
								fontWeight: 'var(--font-weight-semibold)',
							}}
						>
							Reward{' '}
						</strong>
						{reward}
					</span>
				</div>
			)}
		</article>
	);
}
