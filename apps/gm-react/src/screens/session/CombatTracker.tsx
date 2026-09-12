import type { CombatTrackerView } from '@dndtools/core';
import { useId, useRef, useState } from 'react';
import {
	Avatar,
	Badge,
	Button,
	Chip,
	ConditionBadge,
	EmptyState,
	HPBar,
	IconButton,
	Input,
	StatPill,
	Toaster,
	VisibilityChip,
	useConditionCatalog,
} from '../../ds';
import { useI18n } from '../../i18n';
import { useViewport } from '../../app/useViewport';
import { Panel, T, eb } from '../../app/screen-kit';
// RC-CAN-5.3 lifted the keypad into `app/combat/` so the board's touch-first combat tile uses the
// same sheet as this tracker; `CombatantRow` and `HpIntent` moved with it.
import { HpKeypadSheet, type CombatantRow, type HpIntent } from '../../app/combat/HpKeypadSheet';
// RC-SES-3.3 — the stat-block quick reference behind the row's "Quick reference" action.
import { StatBlockSheet } from '../../app/combat/StatBlockSheet';
import { useCombatKeyboard } from './useCombatKeyboard';
import { useHpUndo, type HpUndo } from './useHpUndo';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSession } from '../../net/SessionContext';

// ── Combat tracker ────────────────────────────────────────────────────────────────────────────────

export function CombatPanel({
	tracker,
	isLive,
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
	isLive: boolean;
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
	// RC-SES-5.1 — an initiative call is a running fight whose round 1 has not begun: rolls are still
	// arriving and nobody is active, so nothing below may mark a turn.
	const calling = running && tracker.round === 0;
	const activeCombatant = calling
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

	// RC-SES-5.1 — `index.tsx` wires every other tracker callback; the initiative call, the DM's
	// adjustment and the readiness roster dispatch and read from here, beside the rows they paint.
	const runtime = useRuntime();
	const session = useSession();
	const owedRows = calling ? tracker.combatants.filter((c) => c.kind === 'character') : [];
	const rolledCount = owedRows.filter(
		(c) => initiativeSource(tracker, c, true) !== 'awaiting',
	).length;
	// Readiness is the presence beat a joined player's "I'm ready" toggle already sends (a side
	// channel by design, never a command). Only a hosting DM has a roster to show.
	const readiness =
		!running && session.role === 'host'
			? session.peers.filter((p) => p.connected && p.role === 'player')
			: [];

	/** Open the fight with every player character in it, owing a roll, before round 1. */
	async function callInitiative(): Promise<void> {
		if (previewing || !isDm || !isLive) return;
		const party = Object.values(runtime.state.characters.characters).filter((c) => c.kind === 'pc');
		if (party.length === 0) {
			Toaster.warning(t('session.combat.initiative.needsParty'));
			return;
		}
		const result = await runtime.dispatch({
			type: 'combat.start',
			actorId: runtime.defaultActorId,
			payload: {
				rollForInitiative: true,
				combatants: party.map((c) => ({
					kind: 'character',
					name: c.name,
					characterId: c.id,
					ac: c.combat.ac,
					maxHp: c.combat.maxHp,
				})),
			},
		});
		if (result.status === 'accepted') Toaster.success(t('session.combat.initiative.called'));
		else Toaster.error(result.rejection.message);
	}

	/** The DM's adjustment: an explicit initiative, which moves the row to where the value puts it. */
	async function setInitiative(id: string, name: string, value: number): Promise<void> {
		const result = await runtime.dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.defaultActorId,
			payload: { combatantId: id, kind: 'initiative', value },
		});
		if (result.status === 'accepted') {
			Toaster.success(t('session.combat.initiative.setToast', { name, value }));
		} else {
			Toaster.error(result.rejection.message);
		}
	}

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
					<div style={{ display: 'flex', gap: 7 }}>
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
					<div
						style={{
							display: 'flex',
							gap: T.space.two,
							flexWrap: 'wrap',
							justifyContent: 'flex-end',
						}}
					>
						{/* RC-SES-5.1 — offered only when it can work. The EmptyState below already says why
						    combat is closed (not live / previewing), and a second refusing control beside
						    "Build encounter" would only repeat it. */}
						{isDm && isLive && !previewing && (
							<Button
								variant="secondary"
								size="sm"
								icon="dice"
								title={t('session.combat.initiative.callTitle')}
								onClick={() => void callInitiative()}
							>
								{t('session.combat.initiative.call')}
							</Button>
						)}
						<Button
							variant="primary"
							size="sm"
							icon="sword"
							// aria-disabled, not disabled: this is where ⌘K's "Build encounter" lands, and a
							// natively disabled button leaves the tab order — so the DM arrived at a mute dead
							// control. The EmptyState below explains it, but only to sighted users who scroll;
							// the reason belongs on the control that refuses.
							aria-disabled={!isLive || previewing || !isDm || undefined}
							title={
								previewing
									? t('session.combat.buildBlockedPreview')
									: !isDm
										? t('session.combat.buildBlockedNotDm')
										: !isLive
											? t('session.combat.buildBlockedNotLive')
											: t('session.combat.build')
							}
							aria-label={
								previewing
									? t('session.combat.buildLabelPreview')
									: !isDm
										? t('session.combat.buildLabelNotDm')
										: !isLive
											? t('session.combat.buildLabelNotLive')
											: t('session.combat.build')
							}
							onClick={onStart}
						>
							{t('session.combat.build')}
						</Button>
					</div>
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
				<>
					<EmptyState
						icon="sword"
						title={t(isLive ? 'session.combat.noneRunning' : 'session.combat.goLiveTitle')}
						description={t(isLive ? 'session.combat.noneRunningHelp' : 'session.combat.goLiveHelp')}
					/>
					{/* RC-SES-5.1 — outside combat, the per-player "ready" chip: who at the table has said
					    they are ready, from the same companion the initiative roll comes from. */}
					{readiness.length > 0 && (
						<div data-testid="table-readiness" style={{ marginTop: T.space.three }}>
							<div style={{ ...eb, marginBottom: T.space.oneHalf }}>
								{t('session.combat.ready.title')}
							</div>
							<ul
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: T.space.oneHalf,
									listStyle: 'none',
									margin: T.space.zero,
									padding: T.space.zero,
								}}
							>
								{readiness.map((p) => (
									<li key={p.peerId}>
										<Chip
											icon={p.ready ? 'check' : undefined}
											tone={p.ready ? 'accent' : 'neutral'}
										>
											{t(p.ready ? 'session.combat.ready.ready' : 'session.combat.ready.notReady', {
												name: p.displayName,
											})}
										</Chip>
									</li>
								))}
							</ul>
						</div>
					)}
				</>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{calling ? (
						// RC-SES-5.1 — the call replaces the round/turn strip: there is no round yet, and the
						// one thing to do is start it once the rolls are in.
						<div
							data-testid="initiative-call-banner"
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.two,
								flexWrap: 'wrap',
								padding: `${T.space.two} ${T.space.three}`,
								borderRadius: T.radius.lg,
								background: T.accSub,
								border: `1px solid ${T.accBd}`,
							}}
						>
							<div style={{ flex: 1, minWidth: 200 }}>
								<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
									{t('session.combat.initiative.banner')}
								</div>
								<div style={{ marginTop: T.space.half, font: `12px ${T.sans}`, color: T.sub }}>
									{t('session.combat.initiative.help')}
								</div>
								{/* Mounted with the banner and only its text changes, so each arriving roll is
								    announced to a screen-reader DM. */}
								<div
									role="status"
									aria-live="polite"
									aria-atomic="true"
									style={{ marginTop: T.space.one, font: `600 12px ${T.sans}`, color: T.acc }}
								>
									{t('session.combat.initiative.progress', {
										rolled: rolledCount,
										total: owedRows.length,
									})}
								</div>
							</div>
							<Button
								variant="primary"
								size="sm"
								icon="sword"
								disabled={previewing}
								onClick={onAdvance}
							>
								{t('session.combat.initiative.start')}
							</Button>
						</div>
					) : (
						<div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
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
							<div style={{ flex: 1 }} />
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
					)}

					{/* RC-SES-3.2 — the five-second undo. It sits above the order rather than floating over
					    it, so it never covers the row the DM is about to touch, and it is a live region so
					    the write is announced (the HP commands pass no toast text). */}
					{undo && (
						<div
							role="status"
							aria-live="polite"
							style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
						>
							<Chip icon="heart" tone={undo.intent === 'damage' ? 'danger' : 'accent'}>
								{undoLabel(undo)}
							</Chip>
							{undo.intent === 'temp' ? (
								<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
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
							gap: 8,
							listStyle: 'none',
							margin: 0,
							padding: 0,
						}}
					>
						{tracker.combatants.map((c) => {
							const active = !calling && c.id === tracker.activeCombatantId;
							const source = initiativeSource(tracker, c, calling);
							const sel = c.id === selectedId;
							const res = c.resources;
							return (
								// The DS InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold
								// 3px active left rail · HPBar · quick HP steps), hand-hosted so the row can also
								// carry selection, state badges, and per-condition ConditionBadge chips with the
								// distinct-icon grayscale contract (the plain component renders generic chips only).
								//
								// The row itself is NOT a control. It used to be `role="button"` with
								// `aria-label={`Select ${name}`}`, and an aria-label on a role=button REPLACES the
								// whole descendant subtree — so a screen-reader DM heard "Select Goblin, toggle
								// button" and lost the HP, the AC, the conditions and whose turn it was. It also
								// nested the condition-remove and Heal/Damage buttons inside a button, which is an
								// axe `nested-interactive` violation (serious). The name is now the control; the
								// row keeps its pointer target as a mouse-only convenience.
								<li
									key={c.id}
									aria-current={active ? 'true' : undefined}
									onClick={() => onSelect(c.id)}
									style={{
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '9px 12px',
										borderRadius: 9,
										border: `1px solid ${active ? T.accBd : sel ? T.bdS : T.bd}`,
										borderLeft: `3px solid ${active ? T.acc : 'transparent'}`,
										background: active ? T.accSub : T.surf,
										opacity: c.hidden ? 0.75 : 1,
									}}
								>
									<span
										style={{
											minWidth: 28,
											textAlign: 'center',
											font: `700 14px ${T.mono}`,
											color: active ? T.acc : T.sub,
										}}
									>
										{/* A row still owed a roll holds a placeholder 0, not an initiative. */}
										{source === 'awaiting' ? '—' : (c.statBlock.initiative ?? '—')}
									</span>
									<Avatar name={c.name} size="sm" ring={active ? 'turn' : undefined} />
									<div style={{ flex: 1, minWidth: 0 }}>
										{/* Wraps on purpose. On a 391px phone this row is left ~183px after the initiative
										    span, avatar, row actions and paddings, and "Active" + "Bloodied" alone exceed
										    that. Every child here is shrinkable, so the COMBATANT NAME was what collapsed to
										    an ellipsis while the badge text stacked one character per line. Let the badges
										    drop to their own line instead. */}
										<div
											style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}
										>
											{/* The row's one real control. `aria-pressed` carries the selection state that
											    used to sit on the row, so the toggle semantics survive the restructure. */}
											<button
												type="button"
												aria-pressed={sel}
												// The row also selects (mouse-only convenience), so stop the bubble
												// rather than letting one click run the same selection twice.
												onClick={(e) => {
													e.stopPropagation();
													onSelect(c.id);
												}}
												style={{
													font: `600 13.5px ${T.sans}`,
													color: T.ink,
													whiteSpace: 'nowrap',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													background: 'none',
													border: 'none',
													padding: 0,
													textAlign: 'left',
													cursor: 'pointer',
													minWidth: 0,
												}}
											>
												{c.name}
											</button>
											{c.hidden && <VisibilityChip level="dm-only" compact />}
											{active && <Badge status="success">{t('session.combat.active')}</Badge>}
											{/* RC-SES-5.1 — during the call each character row says where its number
											    stands, in text: owed, rolled by the player, or adjusted by the DM. */}
											{source === 'awaiting' && (
												<Badge status="neutral">{t('session.combat.initiative.awaiting')}</Badge>
											)}
											{calling && source === 'rolled' && (
												<Badge status="info">
													{t('session.combat.initiative.rolled', {
														value: c.statBlock.initiative ?? 0,
													})}
												</Badge>
											)}
											{calling && source === 'adjusted' && (
												<Badge status="neutral">{t('session.combat.initiative.adjusted')}</Badge>
											)}
											{c.isBloodied && (
												<Badge status="warning">{t('session.combat.bloodied')}</Badge>
											)}
											{c.isDefeated && <Badge status="error">{t('session.combat.down')}</Badge>}
											{/* RC-CHR-1.3 — the tracker view already derived these two; nothing painted
											    them, so a concentrating caster and a dying creature looked like any
											    other row. Both badges carry TEXT, not just a tint (A11Y-011 AC2). */}
											{c.isConcentrating && (
												<Badge status="info">
													{res?.concentration.effect
														? t('session.combat.concentratingOn', {
																effect: res.concentration.effect,
															})
														: t('session.combat.concentrating')}
												</Badge>
											)}
											{c.isDying && <Badge status="warning">{t('session.combat.dying')}</Badge>}
										</div>
										{res && (
											<div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
												{/* RC-SES-3.2 — the HP bar IS the affordance: tap-and-hold (or click, or Enter)
												    opens the keypad sheet. A hold fires early and the release still produces a
												    click, so the press is marked and that trailing click is swallowed. The press
												    is allowed to bubble to the row so the combatant is selected as well, which
												    is what makes the following `d`/`h` land on the creature just touched. */}
												<button
													type="button"
													aria-label={t('session.combat.hp.adjust', { name: c.name })}
													title={t('session.combat.hp.adjust', { name: c.name })}
													disabled={previewing}
													onPointerDown={() => startPress(c.id)}
													onPointerUp={endPress}
													onPointerLeave={endPress}
													onPointerCancel={endPress}
													onClick={() => {
														if (press.current.fired) {
															press.current.fired = false;
															return;
														}
														openHpSheet(c.id, 'damage');
													}}
													style={{
														flex: 1,
														minWidth: 0,
														display: 'block',
														textAlign: 'left',
														background: 'none',
														border: 'none',
														padding: 0,
														cursor: previewing ? 'default' : 'pointer',
														touchAction: 'manipulation',
														userSelect: 'none',
													}}
												>
													<HPBar current={res.hp} max={res.maxHp} size="sm" />
												</button>
												<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
													{t('session.combat.armorClass', { value: c.statBlock.ac ?? '—' })}
												</span>
											</div>
										)}
										{res && res.conditions.length > 0 && (
											<div
												style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}
												onClick={(e) => e.stopPropagation()}
											>
												{/* RC-SES-3.1 — a timed condition wears its countdown, so the DM can see that
												    Poisoned has two rounds left without opening anything. A condition with no
												    timer shows no number: it lasts until someone clears it. */}
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
															onRemove={
																previewing ? undefined : () => onCondition(c.id, cond, false)
															}
														/>
													);
												})}
											</div>
										)}
										{/* RC-CHR-1.3 / UX-SES-007 AC3 — at 0 HP and explicitly not defeated, the death
										    saves ARE the row: the tally reads as text and the two buttons record one.
										    Both are ordinary buttons, so the keyboard reaches them the same way. */}
										{res && c.isDying && (
											<div
												style={{
													display: 'flex',
													alignItems: 'center',
													flexWrap: 'wrap',
													gap: 7,
													marginTop: 6,
												}}
												onClick={(e) => e.stopPropagation()}
											>
												<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
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
										{/* RC-CHR-1.3 — the check damage raised. The core states the DC and stops there:
										    the table rolls, and one of these two buttons says what happened. Nothing
										    here decides the effect dropped on its own. */}
										{res && res.concentration.checkDc !== null && (
											<div
												style={{
													marginTop: 7,
													padding: '8px 10px',
													borderRadius: 10,
													background: T.accSub,
													border: `1px solid ${T.accBd}`,
													display: 'flex',
													alignItems: 'center',
													flexWrap: 'wrap',
													gap: 8,
												}}
												onClick={(e) => e.stopPropagation()}
											>
												<span style={{ font: `600 12px ${T.sans}`, color: T.ink, flex: 1 }}>
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
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
											onClick={(e) => e.stopPropagation()}
										>
											{/* The combatant's name has to be IN the name: with six rows a screen
											    reader otherwise hears six identical "Heal 1" buttons that each
											    write durable HP to a different creature. "Heal 1"/"Damage 1"
											    stay as the PREFIX so combat.spec's substring match still hits. */}
											{/* RC-SES-3.3 — the quick reference. Reading a creature's numbers changes
											    nothing, so this is offered while previewing too, unlike the HP steps. */}
											<IconButton
												icon="knowledge-book"
												label={t('session.combat.quickRef.open', { name: c.name })}
												variant="ghost"
												size="sm"
												onClick={() => setQuickRefId(c.id)}
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
						})}
					</ul>

					{selected && (
						<div
							ref={detailRef}
							style={{
								borderTop: `1px solid ${T.bd}`,
								paddingTop: 12,
								display: 'flex',
								flexDirection: 'column',
								gap: 10,
							}}
						>
							<div style={{ ...eb }}>{t('session.combat.selected', { name: selected.name })}</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
								{/* RC-SES-3.3 — first control in the panel on purpose: RC-SES-3.4's `Enter` moves
								    focus to whatever leads this row of actions, and the quick reference is what a
								    DM wants from a selected combatant far more often than a condition. */}
								<Button
									variant="secondary"
									size="sm"
									icon="knowledge-book"
									onClick={() => setQuickRefId(selected.id)}
								>
									{t('session.combat.quickRef.action')}
								</Button>
								{/* RC-SYS-2.3 — no conditions in the active system means no picker to open. Say so
								    rather than leaving a control that can only ever show an empty dialog. */}
								{selected.resources &&
									(systemConditions.length > 0 ? (
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
										<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
											{t('session.combat.noSystemConditions')}
										</span>
									))}
								{isDm && (
									<>
										<span
											aria-hidden="true"
											style={{ width: 1, height: 20, background: T.bd, margin: '0 4px' }}
										/>
										{/* Reaching either END of the order is the normal way to use these: press
										    "earlier" until the combatant is first and the button hard-disabled itself
										    under the finger that pressed it, dropping focus to <body>. The BOUND is now
										    soft (focusable, named, swallows the press); `previewing` stays hard. */}
										<IconButton
											icon="chevron-up"
											label={t('session.combat.moveEarlier', { name: selected.name })}
											variant="ghost"
											size="sm"
											disabled={previewing}
											aria-disabled={selectedIndex <= 0 || undefined}
											onClick={() => {
												if (selectedIndex <= 0) return;
												onReorder(selected.id, 'earlier');
											}}
										/>
										<IconButton
											icon="chevron-down"
											label={t('session.combat.moveLater', { name: selected.name })}
											variant="ghost"
											size="sm"
											disabled={previewing}
											aria-disabled={
												selectedIndex < 0 ||
												selectedIndex >= tracker.combatants.length - 1 ||
												undefined
											}
											onClick={() => {
												if (selectedIndex < 0 || selectedIndex >= tracker.combatants.length - 1)
													return;
												onReorder(selected.id, 'later');
											}}
										/>
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
							{/* RC-SES-5.1 — the DM's "adjust": accept a roll as it landed, or type the number
							    the table agreed on. Keyed by the current value so an arriving roll resets the
							    draft instead of leaving a stale number in the field. */}
							{isDm && (
								<InitiativeAdjust
									key={`${selected.id}:${selected.statBlock.initiative ?? ''}`}
									row={selected}
									disabled={previewing}
									onSet={(value) => void setInitiative(selected.id, selected.name, value)}
								/>
							)}
							{isDm && selected.hidden && (
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									{t('session.combat.hiddenNote')}
								</div>
							)}
						</div>
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

/**
 * RC-SES-5.1 — where a row's initiative came from, read off the encounter log: a player's (or the
 * DM's) roll is a `roll` entry, a DM adjustment a reorder that carries the value (an earlier/later
 * nudge carries none). During a call, a character row with neither is still owed a roll.
 */
type InitiativeSource = 'awaiting' | 'rolled' | 'adjusted' | null;

function initiativeSource(
	tracker: CombatTrackerView,
	row: CombatantRow,
	calling: boolean,
): InitiativeSource {
	let source: InitiativeSource = null;
	for (const entry of tracker.log) {
		if (entry.combatantId !== row.id) continue;
		if (entry.kind === 'roll') source = 'rolled';
		else if (entry.kind === 'combatant-reordered' && entry.delta !== null) source = 'adjusted';
	}
	if (source) return source;
	return calling && row.kind === 'character' ? 'awaiting' : null;
}

/** The DM's initiative field for the selected combatant. Enter or "Set" applies it. */
function InitiativeAdjust({
	row,
	disabled,
	onSet,
}: {
	row: CombatantRow;
	disabled: boolean;
	onSet: (value: number) => void;
}) {
	const { t } = useI18n();
	const id = useId();
	const [draft, setDraft] = useState(String(row.statBlock.initiative ?? 0));
	const value = Number(draft);
	const valid = draft.trim() !== '' && Number.isInteger(value) && value >= -99 && value <= 999;
	const apply = () => {
		if (valid && !disabled) onSet(value);
	};
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}>
			<label htmlFor={id} style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
				{t('session.combat.initiative.label')}
			</label>
			<Input
				id={id}
				type="number"
				inputMode="numeric"
				value={draft}
				disabled={disabled}
				aria-label={t('session.combat.initiative.adjustFor', { name: row.name })}
				aria-invalid={!valid || undefined}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onKeyDown={(e: { key: string; preventDefault: () => void }) => {
					if (e.key !== 'Enter') return;
					e.preventDefault();
					apply();
				}}
				style={{ width: 84 }}
			/>
			<Button variant="secondary" size="sm" disabled={disabled || !valid} onClick={apply}>
				{t('session.combat.initiative.set')}
			</Button>
		</div>
	);
}
