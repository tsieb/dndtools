import type { CombatTrackerView } from '@dndtools/core';
import { useRef, useState } from 'react';
import { Button, Chip, EmptyState, IconButton, StatPill, useConditionCatalog } from '../../ds';
import { useI18n } from '../../i18n';
import { useViewport } from '../../app/useViewport';
import { Panel, T } from '../../app/screen-kit';
// RC-CAN-5.3 lifted the keypad into `app/combat/` so the board's touch-first combat tile uses the
// same sheet as this tracker; `CombatantRow` and `HpIntent` moved with it.
import { HpKeypadSheet, type CombatantRow, type HpIntent } from '../../app/combat/HpKeypadSheet';
// RC-SES-3.3 — the stat-block quick reference behind the row's "Quick reference" action.
import { StatBlockSheet } from '../../app/combat/StatBlockSheet';
import { useCombatKeyboard } from './useCombatKeyboard';
import { useHpUndo, type HpUndo } from './useHpUndo';
import { CombatantItem } from './CombatantItem';
import { CombatantDetail } from './CombatantDetail';
// RC-SES-5.1 — the initiative call the player companion answers (call, badges, adjust, readiness).
import * as Initiative from '../../net/InitiativeCallParts';

// ── Combat tracker ────────────────────────────────────────────────────────────────────────────────

export function CombatPanel({
	tracker,
	isDm,
	selectedId,
	selected,
	previewing,
	onStart,
	onAdd,
	onSelect,
	onAdvance,
	onPrevious,
	onEnd,
	onHp,
	onTempHp,
	onCondition,
	onPickCondition,
	onDeathSave,
	onConcentrationCheck,
	onRemove,
	onReorder,
	onVisibility,
}: {
	tracker: CombatTrackerView;
	isDm: boolean;
	selectedId: string | null;
	selected: CombatantRow | null;
	previewing: boolean;
	onStart: () => void;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onAdvance: () => void;
	onPrevious: () => void;
	onEnd: () => void;
	onHp: (id: string, delta: number) => void;
	onTempHp: (id: string, value: number) => void;
	onCondition: (id: string, condition: string, present: boolean) => void;
	onPickCondition: (id: string) => void;
	// RC-CHR-1.3 — the dying combatant's death-save track, and the concentration check damage raised.
	onDeathSave: (id: string, outcome: 'success' | 'failure') => void;
	onConcentrationCheck: (id: string, name: string, outcome: 'kept' | 'lost') => void;
	onRemove: (id: string, name: string) => void;
	onReorder: (id: string, direction: 'earlier' | 'later') => void;
	onVisibility: (id: string, hidden: boolean) => void;
}) {
	const { t } = useI18n();
	// RC-SYS-2.3 — the conditions the ACTIVE system package declares; empty means the picker is not
	// offered at all rather than opening on nothing.
	const { conditions: systemConditions } = useConditionCatalog();
	const running = tracker.status === 'running';
	// RC-SES-5.1 — during an initiative call (before round 1) nobody is active yet.
	// RC-SES-6.2 — combat works in every workflow state, so the call's live gate is held open here.
	const call = Initiative.useCall(tracker, { isDm, isLive: true, previewing });
	const activeCombatant = call.calling
		? null
		: (tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ?? null);
	const lowest = tracker.combatants
		.filter((c) => c.resources)
		.reduce<CombatantRow | null>(
			(m, c) =>
				!m ||
				c.resources!.hp / Math.max(1, c.resources!.maxHp) <
					m.resources!.hp / Math.max(1, m.resources!.maxHp)
					? c
					: m,
			null,
		);
	const selectedIndex = selected ? tracker.combatants.findIndex((c) => c.id === selected.id) : -1;
	const atFirst = selectedIndex <= 0;
	const atLast = selectedIndex < 0 || selectedIndex >= tracker.combatants.length - 1;
	const viewport = useViewport();

	// RC-SES-3.2 — the one-handed HP sheet. `±1` on the row stays (it is the fastest thing on the
	// screen for chip damage), but a real hit lands for 14, and tapping "Damage 1 HP" fourteen times
	// is not a tracker. Tap-and-hold the HP bar — or press `d`/`h` — and a keypad comes up.
	const [hpSheet, setHpSheet] = useState<{ id: string; intent: HpIntent } | null>(null);
	const { undo, remember: rememberHpUndo, undoHp } = useHpUndo({ tracker, onHp, onTempHp });
	// One pointer at a time, so one timer is enough for the whole list.
	const press = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
	// RC-SES-3.4 — the selected combatant's detail panel (conditions/reorder/hide/remove), so `Enter`
	// can move focus INTO it rather than merely selecting the row a second time.
	const detailRef = useRef<HTMLDivElement | null>(null);
	// RC-SES-3.4 — reordering has no `ok` toast (it is not a dispatch helper call site the announcer
	// hooks into) and the earlier/later buttons themselves say nothing when pressed. `n`/`p`/arrows
	// move the CURSOR silently, same as any list; a reorder actually changes durable state and needs
	// its own live announcement.
	const [reorderAnnouncement, setReorderAnnouncement] = useState('');
	// RC-SES-3.3 — which combatant's stat block is open in the quick-reference sheet. Held by id, not
	// by row, so the card follows the live tracker as HP and conditions change underneath it.
	const [quickRefId, setQuickRefId] = useState<string | null>(null);

	const hpSheetTarget = hpSheet
		? (tracker.combatants.find((c) => c.id === hpSheet.id) ?? null)
		: null;
	const quickRefTarget = quickRefId
		? (tracker.combatants.find((c) => c.id === quickRefId) ?? null)
		: null;

	useCombatKeyboard({
		running,
		previewing,
		tracker,
		selectedId,
		isDm,
		detailRef,
		onAdvance,
		onPrevious,
		onSelect,
		onReorder,
		onOpenHpSheet: (id, intent) => setHpSheet({ id, intent }),
		onReorderAnnouncement: setReorderAnnouncement,
	});

	function openHpSheet(id: string, intent: HpIntent) {
		if (previewing) return;
		setHpSheet({ id, intent });
	}

	function startPress(id: string) {
		endPress();
		press.current.fired = false;
		press.current.timer = window.setTimeout(() => {
			press.current.fired = true;
			press.current.timer = null;
			openHpSheet(id, 'damage');
		}, 450);
	}

	function endPress() {
		if (press.current.timer !== null) {
			window.clearTimeout(press.current.timer);
			press.current.timer = null;
		}
	}

	function applyHp(id: string, intent: HpIntent, amount: number) {
		const row = tracker.combatants.find((c) => c.id === id);
		const res = row?.resources;
		if (!row || !res || amount <= 0) return;
		if (intent === 'temp') onTempHp(id, amount);
		else onHp(id, intent === 'damage' ? -amount : amount);
		setHpSheet(null);
		rememberHpUndo({
			id,
			name: row.name,
			intent,
			amount,
			hpBefore: res.hp,
			tempBefore: res.tempHp,
		});
	}

	return (
		<Panel
			title={t('session.combat.title')}
			action={
				running ? (
					<div style={{ display: 'flex', gap: T.space.two }}>
						{isDm && (
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={previewing}
								onClick={onAdd}
							>
								{t('common.action.add')}
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={onEnd}>
							{t('session.combat.end')}
						</Button>
					</div>
				) : (
					<Button
						variant="primary"
						size="sm"
						icon="sword"
						// aria-disabled, not disabled: this is where ⌘K's "Build encounter" lands, and a
						// natively disabled button leaves the tab order — so the DM arrived at a mute dead
						// control. The EmptyState below explains it, but only to sighted users who scroll;
						// the reason belongs on the control that refuses.
						aria-disabled={previewing || !isDm || undefined}
						title={
							previewing
								? t('session.combat.buildBlockedPreview')
								: !isDm
									? t('session.combat.buildBlockedNotDm')
									: t('session.combat.build')
						}
						aria-label={
							previewing
								? t('session.combat.buildLabelPreview')
								: !isDm
									? t('session.combat.buildLabelNotDm')
									: t('session.combat.build')
						}
						onClick={onStart}
					>
						{t('session.combat.build')}
					</Button>
				)
			}
		>
			{/* Next turn / Previous turn / Heal / Damage / conditions are the four things a DM touches
			    every thirty seconds, and they were the ONLY durable writes on this screen that pass no
			    `ok` string to the dispatch helper — so no toast fires and nothing is announced.
			    `aria-current` moving between list items is not announced either. This region is
			    permanently mounted (a status node inserted together with its text is routinely
			    dropped) and sits OUTSIDE the `<ul>` so it cannot join the list's text. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{running && activeCombatant
					? `${t('session.combat.turnAnnouncement', {
							round: tracker.round,
							turn: tracker.turn + 1,
							name: activeCombatant.name,
						})} ${
							activeCombatant.resources
								? t('session.combat.hitPointsAnnouncement', {
										hp: activeCombatant.resources.hp,
										max: activeCombatant.resources.maxHp,
									})
								: ''
						}`
					: ''}
			</div>
			{/* RC-SES-3.4 — announces an Alt+Arrow keyboard reorder; the click path (the chevron buttons
			    below) has no announcement either, but a mouse DM sees the row move, where a keyboard/
			    screen-reader DM would otherwise have no confirmation the write landed. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{reorderAnnouncement}
			</div>
			{!running ? (
				<EmptyState
					icon="sword"
					illustration="combat-idle"
					title={t('session.combat.noneRunning')}
					description={t('session.combat.noneRunningHelp')}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
					{call.calling ? (
						<Initiative.Banner call={call} onStart={onAdvance} />
					) : (
						<div
							style={{
								display: 'flex',
								gap: T.space.five,
								alignItems: 'center',
								flexWrap: 'wrap',
							}}
						>
							<StatPill
								label={t('session.combat.round')}
								value={String(tracker.round)}
								tone="accent"
							/>
							<StatPill label={t('session.combat.turn')} value={String(tracker.turn + 1)} />
							{lowest && lowest.resources && (
								<StatPill
									label={t('session.combat.lowestHp')}
									value={`${lowest.resources.hp}/${lowest.resources.maxHp}`}
									tone="error"
								/>
							)}
							{/* RC-POL-1.4 — Previous and Next turn wrap as one group, pushed to the end of the
							    line. Apart, a phone left "Previous turn" alone at the far right of the stats and
							    "Next turn" on its own line below. */}
							<div
								style={{
									marginLeft: 'auto',
									display: 'flex',
									alignItems: 'center',
									gap: T.space.one,
									flex: '0 0 auto',
								}}
							>
								<IconButton
									icon="chevron-left"
									label={t('session.combat.previousTurn')}
									variant="ghost"
									size="sm"
									disabled={previewing}
									onClick={onPrevious}
								/>
								<Button
									variant="primary"
									size="sm"
									iconRight="skip"
									disabled={previewing}
									onClick={onAdvance}
								>
									{t('session.combat.nextTurn')}
								</Button>
							</div>
						</div>
					)}

					{/* RC-SES-3.2 — the five-second undo. It sits above the order rather than floating over
					    it, so it never covers the row the DM is about to touch, and it is a live region so
					    the write is announced (the HP commands pass no toast text). */}
					{undo && (
						<div
							role="status"
							aria-live="polite"
							style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}
						>
							<Chip icon="heart" tone={undo.intent === 'damage' ? 'danger' : 'accent'}>
								{undoLabel(undo)}
							</Chip>
							{undo.intent === 'temp' ? (
								<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
									{t('session.combat.hp.tempNoUndo')}
								</span>
							) : (
								<Button
									variant="ghost"
									size="sm"
									icon="undo"
									aria-label={t('session.combat.hp.undo', { change: undoLabel(undo) })}
									onClick={undoHp}
								>
									{t('common.action.undo')}
								</Button>
							)}
						</div>
					)}

					{/* The initiative order IS a list, and announcing "list, 4 items" is how a screen-reader
					    DM gets the shape of the turn order without walking every row. */}
					<ul
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: T.space.two,
							listStyle: 'none',
							margin: T.space.zero,
							padding: T.space.zero,
						}}
					>
						{tracker.combatants.map((c) => (
							<CombatantItem
								key={c.id}
								c={c}
								call={call}
								active={!call.calling && c.id === tracker.activeCombatantId}
								selected={c.id === selectedId}
								previewing={previewing}
								press={press}
								onSelect={onSelect}
								onPressStart={startPress}
								onPressEnd={endPress}
								onOpenHpSheet={openHpSheet}
								onQuickRef={setQuickRefId}
								onHp={onHp}
								onCondition={onCondition}
								onDeathSave={onDeathSave}
								onConcentrationCheck={onConcentrationCheck}
							/>
						))}
					</ul>

					{selected && (
						<CombatantDetail
							selected={selected}
							call={call}
							isDm={isDm}
							previewing={previewing}
							atFirst={atFirst}
							atLast={atLast}
							hasConditions={systemConditions.length > 0}
							detailRef={detailRef}
							onQuickRef={setQuickRefId}
							onPickCondition={onPickCondition}
							onReorder={onReorder}
							onVisibility={onVisibility}
							onRemove={onRemove}
						/>
					)}

					<StatBlockSheet
						key={quickRefId ? `ref:${quickRefId}` : 'ref:closed'}
						target={quickRefTarget}
						side={viewport === 'phone' ? 'bottom' : 'right'}
						onClose={() => setQuickRefId(null)}
					/>

					<HpKeypadSheet
						key={hpSheet ? `${hpSheet.id}:${hpSheet.intent}` : 'closed'}
						target={hpSheetTarget}
						intent={hpSheet?.intent ?? 'damage'}
						side={viewport === 'phone' ? 'bottom' : 'right'}
						onClose={() => setHpSheet(null)}
						onApply={applyHp}
					/>
				</div>
			)}
			{!running && <Initiative.Idle call={call} />}
		</Panel>
	);

	function undoLabel(entry: HpUndo): string {
		const key =
			entry.intent === 'damage'
				? 'session.combat.hp.appliedDamage'
				: entry.intent === 'heal'
					? 'session.combat.hp.appliedHeal'
					: 'session.combat.hp.appliedTemp';
		return t(key, { amount: entry.amount, name: entry.name });
	}
}
