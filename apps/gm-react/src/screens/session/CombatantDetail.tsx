import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Button, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { T, eb } from '../../app/screen-kit';
import type { CombatantRow } from '../../app/combat/HpKeypadSheet';
import * as Initiative from '../../net/InitiativeCallParts';

/**
 * The selected combatant's detail panel (split out of `CombatTracker.tsx` for size, RC-POL-1.4):
 * the quick reference, conditions, reorder, hide and remove. RC-SES-3.4 — `Enter` on a selected row
 * moves focus INTO this panel, so `detailRef` marks it.
 *
 * RC-POL-1.4 — the reorder pair wraps as one group. On a phone a hairline separator used to end one
 * line and the two chevrons start the next, which read as two unrelated buttons; the separator is
 * gone and the pair keeps together. Removing a combatant asks first (`RemoveCombatant`).
 */
export function CombatantDetail({
	selected,
	call,
	isDm,
	previewing,
	atFirst,
	atLast,
	hasConditions,
	detailRef,
	onQuickRef,
	onPickCondition,
	onReorder,
	onVisibility,
	onRemove,
}: {
	selected: CombatantRow;
	call: Initiative.InitiativeCall;
	isDm: boolean;
	previewing: boolean;
	atFirst: boolean;
	atLast: boolean;
	/** RC-SYS-2.3 — whether the active system package declares any conditions. */
	hasConditions: boolean;
	detailRef: MutableRefObject<HTMLDivElement | null>;
	onQuickRef: (id: string) => void;
	onPickCondition: (id: string) => void;
	onReorder: (id: string, direction: 'earlier' | 'later') => void;
	onVisibility: (id: string, hidden: boolean) => void;
	onRemove: (id: string, name: string) => void;
}) {
	const { t } = useI18n();
	// The reorder buttons' tooltip: why the move is unavailable, else the move itself.
	const reorderTitle = (
		bound: boolean,
		why: 'alreadyFirst' | 'alreadyLast',
		move: 'moveEarlier' | 'moveLater',
	) =>
		t(previewing ? 'player.blockedPreview' : `session.combat.${bound ? why : move}`, {
			name: selected.name,
		});
	return (
		<div
			ref={detailRef}
			style={{
				borderTop: `1px solid ${T.bd}`,
				paddingTop: T.space.three,
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.three,
			}}
		>
			<div style={eb}>{t('session.combat.selected', { name: selected.name })}</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.two, alignItems: 'center' }}>
				{/* RC-SES-3.3 — first control in the panel on purpose: RC-SES-3.4's `Enter` moves focus to
				    whatever leads this row of actions, and the quick reference is what a DM wants from a
				    selected combatant far more often than a condition. */}
				<Button
					variant="secondary"
					size="sm"
					icon="knowledge-book"
					onClick={() => onQuickRef(selected.id)}
				>
					{t('session.combat.quickRef.action')}
				</Button>
				{/* RC-SYS-2.3 — no conditions in the active system means no picker to open. Say so rather
				    than leaving a control that can only ever show an empty dialog. */}
				{selected.resources &&
					(hasConditions ? (
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							disabled={previewing}
							onClick={() => onPickCondition(selected.id)}
						>
							{t('session.combat.addCondition')}
						</Button>
					) : (
						<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
							{t('session.combat.noSystemConditions')}
						</span>
					))}
				{isDm && (
					<>
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: T.space.one,
								flex: '0 0 auto',
							}}
						>
							{/* Reaching either END of the order is the normal way to use these: press "earlier"
							    until the combatant is first and a hard-disabled button would drop focus to
							    <body> under the finger that pressed it. The BOUND is soft (focusable, named,
							    swallows the press); `previewing` stays hard. */}
							<IconButton
								icon="chevron-up"
								label={t('session.combat.moveEarlier', { name: selected.name })}
								title={reorderTitle(atFirst, 'alreadyFirst', 'moveEarlier')}
								variant="ghost"
								size="sm"
								disabled={previewing}
								aria-disabled={atFirst || undefined}
								onClick={() => {
									if (atFirst) return;
									onReorder(selected.id, 'earlier');
								}}
							/>
							<IconButton
								icon="chevron-down"
								label={t('session.combat.moveLater', { name: selected.name })}
								title={reorderTitle(atLast, 'alreadyLast', 'moveLater')}
								variant="ghost"
								size="sm"
								disabled={previewing}
								aria-disabled={atLast || undefined}
								onClick={() => {
									if (atLast) return;
									onReorder(selected.id, 'later');
								}}
							/>
						</span>
						<Button
							variant="secondary"
							size="sm"
							icon={selected.hidden ? 'visibility-players' : 'visibility-hidden'}
							disabled={previewing}
							onClick={() => onVisibility(selected.id, !selected.hidden)}
						>
							{t(selected.hidden ? 'session.combat.reveal' : 'session.combat.hide')}
						</Button>
						<RemoveCombatant
							key={selected.id}
							name={selected.name}
							disabled={previewing}
							onConfirm={() => onRemove(selected.id, selected.name)}
						/>
					</>
				)}
			</div>
			<Initiative.Adjust call={call} row={selected} />
			{isDm && selected.hidden && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
					{t('session.combat.hiddenNote')}
				</div>
			)}
		</div>
	);
}

/**
 * RC-POL-1.4 — `combat.remove-combatant` takes the creature's hit points and conditions with it and
 * the core has no restore, so Remove asks first, inline, naming the creature. Focus lands on Keep
 * (the safe choice) and returns to Remove when the question is dismissed; Escape dismisses it. The
 * DS Button forwards no ref, so focus goes through wrapper spans.
 */
function RemoveCombatant({
	name,
	disabled,
	onConfirm,
}: {
	name: string;
	disabled: boolean;
	onConfirm: () => void;
}) {
	const { t } = useI18n();
	const [asking, setAsking] = useState(false);
	const keep = useRef<HTMLSpanElement | null>(null);
	const trigger = useRef<HTMLSpanElement | null>(null);
	const asked = useRef(false);
	useEffect(() => {
		if (asking) keep.current?.querySelector('button')?.focus();
		else if (asked.current) trigger.current?.querySelector('button')?.focus();
		asked.current = asking;
	}, [asking]);
	if (!asking)
		return (
			<span ref={trigger}>
				<Button
					variant="ghost"
					size="sm"
					icon="close"
					disabled={disabled}
					onClick={() => setAsking(true)}
				>
					{t('common.action.remove')}
				</Button>
			</span>
		);
	const question = t('session.combat.removeConfirm', { name });
	return (
		<span
			role="group"
			aria-label={question}
			onKeyDown={(e) => {
				if (e.key !== 'Escape') return;
				e.stopPropagation();
				setAsking(false);
			}}
			style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: T.space.two }}
		>
			<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ink }}>{question}</span>
			<Button variant="danger" size="sm" icon="close" onClick={onConfirm}>
				{t('session.combat.removeConfirmAction', { name })}
			</Button>
			<span ref={keep}>
				<Button variant="secondary" size="sm" onClick={() => setAsking(false)}>
					{t('session.combat.removeKeep', { name })}
				</Button>
			</span>
		</span>
	);
}
