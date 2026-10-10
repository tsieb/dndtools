import type { MutableRefObject } from 'react';
import { Avatar, Badge, Button, ConditionBadge, HPBar, IconButton, VisibilityChip } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../../app/screen-kit';
import type { CombatantRow, HpIntent } from '../../app/combat/HpKeypadSheet';
import * as Initiative from '../../net/InitiativeCallParts';

/**
 * One row of the initiative order (split out of `CombatTracker.tsx` for size, RC-POL-1.4).
 *
 * The DS InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold 3px active left
 * rail · HPBar · quick HP steps), hand-hosted so the row can also carry selection, state badges, and
 * per-condition ConditionBadge chips with the distinct-icon grayscale contract (the plain component
 * renders generic chips only).
 *
 * The row itself is NOT a control. It used to be `role="button"` with `aria-label={`Select ${name}`}`,
 * and an aria-label on a role=button REPLACES the whole descendant subtree — so a screen-reader DM
 * heard "Select Goblin, toggle button" and lost the HP, the AC, the conditions and whose turn it was.
 * It also nested the condition-remove and Heal/Damage buttons inside a button, which is an axe
 * `nested-interactive` violation (serious). The name is now the control; the row keeps its pointer
 * target as a mouse-only convenience.
 *
 * RC-POL-1.4 — every row sits on the panel's raised surface. The active row used to fill with
 * `--color-accent-subtle`, and on that tint the parchment and scholar themes drop the initiative
 * number, the avatar initials and the HP bar's numbers below 4.5:1. The turn still reads four ways
 * without the fill: the gold rail, the gold border, the avatar's turn ring and the "Active" badge.
 */
export function CombatantItem({
	c,
	call,
	active,
	selected,
	previewing,
	press,
	onSelect,
	onPressStart,
	onPressEnd,
	onOpenHpSheet,
	onQuickRef,
	onHp,
	onCondition,
	onDeathSave,
	onConcentrationCheck,
}: {
	c: CombatantRow;
	call: Initiative.InitiativeCall;
	active: boolean;
	selected: boolean;
	previewing: boolean;
	/** The tap-and-hold state the tracker keeps for the whole list (one pointer at a time). */
	press: MutableRefObject<{ timer: number | null; fired: boolean }>;
	onSelect: (id: string) => void;
	onPressStart: (id: string) => void;
	onPressEnd: () => void;
	onOpenHpSheet: (id: string, intent: HpIntent) => void;
	onQuickRef: (id: string) => void;
	onHp: (id: string, delta: number) => void;
	onCondition: (id: string, condition: string, present: boolean) => void;
	onDeathSave: (id: string, outcome: 'success' | 'failure') => void;
	onConcentrationCheck: (id: string, name: string, outcome: 'kept' | 'lost') => void;
}) {
	const { t } = useI18n();
	const res = c.resources;
	const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
	const edge = active ? T.accBd : selected ? T.bdS : T.bd;
	return (
		<li
			aria-current={active ? 'true' : undefined}
			onClick={() => onSelect(c.id)}
			style={{
				cursor: 'pointer',
				display: 'flex',
				alignItems: 'center',
				gap: T.space.three,
				padding: `${T.space.two} ${T.space.three}`,
				borderRadius: T.radius.md,
				// A hidden foe's row is dashed rather than dimmed: dimming took its hit points below 4.5:1.
				// Longhands only: React warns when a `border` shorthand changes beside a `borderLeft`.
				borderWidth: '1px 1px 1px 3px',
				borderStyle: c.hidden ? 'dashed dashed dashed solid' : 'solid',
				borderColor: `${edge} ${edge} ${edge} ${active ? T.acc : 'transparent'}`,
				background: T.raised,
			}}
		>
			<span
				style={{
					minWidth: 28,
					textAlign: 'center',
					font: `700 var(--text-base) ${T.mono}`,
					color: active ? T.ink : T.sub,
				}}
			>
				{call.initiativeText(c)}
			</span>
			{/* Ink initials: the DS avatar's accent-on-tint pair is 4.43:1 in parchment (DEBT-2026-008). */}
			<Avatar name={c.name} size="sm" ring={active ? 'turn' : undefined} style={{ color: T.ink }} />
			<div style={{ flex: 1, minWidth: 0 }}>
				{/* Wraps on purpose. On a 391px phone this row is left ~183px after the initiative span,
				    avatar, row actions and paddings, and "Active" + "Bloodied" alone exceed that. Every child
				    here is shrinkable, so the COMBATANT NAME was what collapsed to an ellipsis while the
				    badge text stacked one character per line. Let the badges drop to their own line. */}
				<div
					style={{ display: 'flex', alignItems: 'center', gap: T.space.oneHalf, flexWrap: 'wrap' }}
				>
					{/* The row's one real control. `aria-pressed` carries the selection state that used to
					    sit on the row, so the toggle semantics survive the restructure. */}
					<button
						type="button"
						aria-pressed={selected}
						// The row also selects (mouse-only convenience), so stop the bubble rather than letting
						// one click run the same selection twice.
						onClick={(e) => {
							e.stopPropagation();
							onSelect(c.id);
						}}
						style={{
							font: `600 var(--text-sm) ${T.sans}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							background: 'none',
							border: 'none',
							padding: T.space.zero,
							textAlign: 'left',
							cursor: 'pointer',
							minWidth: 0,
						}}
					>
						{c.name}
					</button>
					{c.hidden && <VisibilityChip level="dm-only" compact />}
					{active && <Badge status="success">{t('session.combat.active')}</Badge>}
					<Initiative.Badges call={call} row={c} />
					{c.isBloodied && <Badge status="warning">{t('session.combat.bloodied')}</Badge>}
					{c.isDefeated && <Badge status="error">{t('session.combat.down')}</Badge>}
					{/* RC-CHR-1.3 — a concentrating caster and a dying creature carry TEXT badges, not just
					    a tint (A11Y-011 AC2). */}
					{c.isConcentrating && (
						<Badge status="info">
							{res?.concentration.effect
								? t('session.combat.concentratingOn', { effect: res.concentration.effect })
								: t('session.combat.concentrating')}
						</Badge>
					)}
					{c.isDying && <Badge status="warning">{t('session.combat.dying')}</Badge>}
				</div>
				{res && (
					<div
						style={{
							marginTop: T.space.oneHalf,
							display: 'flex',
							alignItems: 'center',
							gap: T.space.two,
						}}
					>
						{/* RC-SES-3.2 — the HP bar IS the affordance: tap-and-hold (or click, or Enter) opens
						    the keypad sheet. A hold fires early and the release still produces a click, so the
						    press is marked and that trailing click is swallowed. The press bubbles to the row
						    so the combatant is selected as well, which is what makes the following `d`/`h`
						    land on the creature just touched. */}
						<button
							type="button"
							aria-label={t('session.combat.hp.adjust', { name: c.name })}
							title={t('session.combat.hp.adjust', { name: c.name })}
							disabled={previewing}
							onPointerDown={() => onPressStart(c.id)}
							onPointerUp={onPressEnd}
							onPointerLeave={onPressEnd}
							onPointerCancel={onPressEnd}
							onClick={() => {
								if (press.current.fired) {
									press.current.fired = false;
									return;
								}
								onOpenHpSheet(c.id, 'damage');
							}}
							style={{
								flex: 1,
								minWidth: 0,
								display: 'block',
								textAlign: 'left',
								background: 'none',
								border: 'none',
								padding: T.space.zero,
								cursor: previewing ? 'default' : 'pointer',
								touchAction: 'manipulation',
								userSelect: 'none',
							}}
						>
							<HPBar current={res.hp} max={res.maxHp} size="sm" />
						</button>
						<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.sub }}>
							{t('session.combat.armorClass', { value: c.statBlock.ac ?? '—' })}
						</span>
					</div>
				)}
				{res && res.conditions.length > 0 && (
					<div
						style={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: T.space.oneHalf,
							marginTop: T.space.oneHalf,
						}}
						onClick={stop}
					>
						{/* RC-SES-3.1 — a timed condition wears its countdown; one with no timer shows no
						    number: it lasts until someone clears it. */}
						{res.conditions.map((cond) => {
							const roundsLeft = res.conditionRounds?.[cond];
							return (
								<ConditionBadge
									key={cond}
									condition={cond}
									compact
									duration={roundsLeft}
									durationLabel={
										roundsLeft === undefined
											? undefined
											: t('session.combat.conditionRounds', { count: roundsLeft })
									}
									onRemove={previewing ? undefined : () => onCondition(c.id, cond, false)}
								/>
							);
						})}
					</div>
				)}
				{/* RC-CHR-1.3 / UX-SES-007 AC3 — at 0 HP and explicitly not defeated, the death saves ARE
				    the row: the tally reads as text and the two buttons record one. */}
				{res && c.isDying && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: T.space.two,
							marginTop: T.space.oneHalf,
						}}
						onClick={stop}
					>
						<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.sub }}>
							{t('session.combat.deathSaves', {
								successes: res.deathSaves.successes,
								failures: res.deathSaves.failures,
							})}
						</span>
						<IconButton
							icon="check"
							label={t('session.combat.deathSaveSuccess', { name: c.name })}
							variant="ghost"
							size="sm"
							disabled={previewing}
							onClick={() => onDeathSave(c.id, 'success')}
						/>
						<IconButton
							icon="close"
							label={t('session.combat.deathSaveFailure', { name: c.name })}
							variant="ghost"
							size="sm"
							disabled={previewing}
							onClick={() => onDeathSave(c.id, 'failure')}
						/>
					</div>
				)}
				{/* RC-CHR-1.3 — the check damage raised. The core states the DC and stops there: the table
				    rolls, and one of these two buttons says what happened. */}
				{res && res.concentration.checkDc !== null && (
					<div
						style={{
							marginTop: T.space.two,
							padding: `${T.space.two} ${T.space.three}`,
							borderRadius: T.radius.md,
							background: T.sunken,
							border: `1px solid ${T.accBd}`,
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: T.space.two,
						}}
						onClick={stop}
					>
						<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.ink, flex: 1 }}>
							{t('session.combat.concCheck', { dc: res.concentration.checkDc })}
						</span>
						<Button
							variant="secondary"
							size="sm"
							disabled={previewing}
							aria-label={t('session.combat.concKeptFor', { name: c.name })}
							onClick={() => onConcentrationCheck(c.id, c.name, 'kept')}
						>
							{t('session.combat.concKept')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={previewing}
							aria-label={t('session.combat.concLostFor', { name: c.name })}
							onClick={() => onConcentrationCheck(c.id, c.name, 'lost')}
						>
							{t('session.combat.concLost')}
						</Button>
					</div>
				)}
			</div>
			{res && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.half }} onClick={stop}>
					{/* The combatant's name is IN each name: six identical "Heal 1" buttons would each
					    write durable HP to a different creature. "Heal 1"/"Damage 1" stay the PREFIX so
					    combat.spec's substring match still hits. RC-SES-3.3 — reading a creature's numbers
					    changes nothing, so the quick reference is offered while previewing too. */}
					<IconButton
						icon="knowledge-book"
						label={t('session.combat.quickRef.open', { name: c.name })}
						variant="ghost"
						size="sm"
						onClick={() => onQuickRef(c.id)}
					/>
					<IconButton
						icon="add"
						label={t('session.combat.heal', { name: c.name })}
						variant="ghost"
						size="sm"
						disabled={previewing}
						onClick={() => onHp(c.id, 1)}
					/>
					<IconButton
						icon="remove"
						label={t('session.combat.damage', { name: c.name })}
						variant="ghost"
						size="sm"
						disabled={previewing}
						onClick={() => onHp(c.id, -1)}
					/>
				</div>
			)}
		</li>
	);
}
