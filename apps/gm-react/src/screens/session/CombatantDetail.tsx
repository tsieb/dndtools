import type { MutableRefObject } from 'react';
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
 * RC-POL-1.4 — the reorder pair and its separator wrap as one group. On a phone the separator used
 * to end one line and the two chevrons start the next, which read as two unrelated buttons.
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
							<span
								aria-hidden="true"
								style={{
									width: 1,
									height: 20,
									background: T.bd,
									marginRight: T.space.one,
								}}
							/>
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
						<Button
							variant="ghost"
							size="sm"
							icon="close"
							disabled={previewing}
							onClick={() => onRemove(selected.id, selected.name)}
						>
							{t('common.action.remove')}
						</Button>
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
