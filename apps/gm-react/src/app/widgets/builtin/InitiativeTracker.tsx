import { useEffect, useRef, useState } from 'react';
import { getCombatTrackerForActor } from '@dndtools/core';
import { Badge, HPBar, Icon, IconButton, VisibilityChip } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { T } from '../../screen-kit';
import { SR_ONLY, bodyWrap } from '../../widget-body-kit';
import { HpKeypadSheet, type CombatantRow, type HpIntent } from '../../combat/HpKeypadSheet';
import { NextTurnControl } from './NextTurnControl';

/**
 * RC-CAN-5.3 — the touch-first combat tile: what the `initiative-tracker` widget draws on a phone.
 *
 * The desk variant (`InitiativeBody`) is a readout — three stat pills and the first few names — and
 * on a phone that is the whole tracker, so the only way to record a hit was to leave the board,
 * open /session and find the creature there. This variant is the order itself: one 56px row per
 * combatant (the platform's minimum comfortable touch target with room for a name and a bar),
 * the HP figure as a real button that opens the SAME keypad sheet the /session tracker uses
 * (`app/combat/HpKeypadSheet.tsx`, RC-SES-3.2), and a swipe-left quick-action tray per row.
 *
 * Every gesture has a keyboard equivalent that dispatches the same command: the HP button takes
 * Enter, and the tray that a swipe reveals is also the "More actions" button sitting in the row's
 * tab order — swiping is a shortcut to it, never the only way in.
 *
 * Writes go straight to `combat.apply-resource` / `combat.set-combatant-visibility` through the
 * runtime, the same commands /session dispatches; the core decides whether this actor may. The tile
 * is inert while the board is in edit mode (no `onCommand`), where every body is a picture.
 */

/** How far left a drag must travel before it counts as "reveal the actions", in CSS pixels. */
const SWIPE_PX = 44;
/** Past this much horizontal travel the gesture is a swipe, and the row must not also click. */
const SWIPE_SLOP = 12;

export function InitiativeTrackerCompact({
	showHp,
	interactive,
}: {
	showHp: boolean;
	/** VIEW mode. False on the editing board, where the tile is a picture of itself. */
	interactive: boolean;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	// SES-002 — the ONE actor-filtered combat read model; hidden combatants are already redacted.
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		actorId,
	);
	const running = tracker.status === 'running';

	const [openTray, setOpenTray] = useState<string | null>(null);
	const [hpSheet, setHpSheet] = useState<{ id: string; intent: HpIntent } | null>(null);
	const [announcement, setAnnouncement] = useState('');
	// One finger at a time, so one drag record serves the whole list. `swiped` outlives the drag by
	// one event: a pointerup that ended a swipe is still followed by a click on whatever was under
	// the finger, and that click must not also open a sheet.
	const drag = useRef<{ id: string; x: number; swiped: boolean } | null>(null);
	const swipedLast = useRef(false);

	const target = hpSheet ? (tracker.combatants.find((c) => c.id === hpSheet.id) ?? null) : null;

	// A combatant can leave the order mid-fight (removed, or newly hidden from this actor); a tray or
	// sheet still pointing at them would be a control with nothing behind it.
	useEffect(() => {
		const ids = new Set(tracker.combatants.map((c) => c.id));
		if (openTray && !ids.has(openTray)) setOpenTray(null);
		if (hpSheet && !ids.has(hpSheet.id)) setHpSheet(null);
	}, [tracker, openTray, hpSheet]);

	// The announcement is made from the RESULT, not from the intent: the core is the one that decides
	// whether this actor may write, and a live region that says "Damage 14" over a rejected command
	// would be the tile lying about what happened.
	async function applyHp(id: string, intent: HpIntent, amount: number) {
		const row = tracker.combatants.find((c) => c.id === id);
		if (!row?.resources || amount <= 0) return;
		setHpSheet(null);
		setOpenTray(null);
		const result = await runtime.dispatch({
			type: 'combat.apply-resource',
			actorId,
			payload:
				intent === 'temp'
					? { combatantId: id, kind: 'temp-hp', value: amount }
					: { combatantId: id, kind: 'hp', delta: intent === 'damage' ? -amount : amount },
		});
		if (result.status !== 'accepted') {
			setAnnouncement(result.rejection?.message ?? '');
			return;
		}
		// The HP commands carry no toast text, so without this the write is silent to a screen reader.
		setAnnouncement(
			t(
				intent === 'damage'
					? 'session.combat.hp.appliedDamage'
					: intent === 'heal'
						? 'session.combat.hp.appliedHeal'
						: 'session.combat.hp.appliedTemp',
				{ amount, name: row.name },
			),
		);
	}

	async function toggleHidden(row: CombatantRow) {
		setOpenTray(null);
		const result = await runtime.dispatch({
			type: 'combat.set-combatant-visibility',
			actorId,
			payload: { combatantId: row.id, hidden: !row.hidden },
		});
		if (result.status !== 'accepted') setAnnouncement(result.rejection?.message ?? '');
	}

	function onPointerDown(id: string, e: React.PointerEvent) {
		if (e.pointerType === 'mouse') return;
		drag.current = { id, x: e.clientX, swiped: false };
	}

	function onPointerMove(e: React.PointerEvent) {
		const d = drag.current;
		if (!d) return;
		const dx = e.clientX - d.x;
		if (dx < -SWIPE_PX) {
			d.swiped = true;
			setOpenTray(d.id);
		} else if (dx > SWIPE_PX) {
			d.swiped = true;
			setOpenTray((prev) => (prev === d.id ? null : prev));
		} else if (Math.abs(dx) > SWIPE_SLOP) {
			d.swiped = true;
		}
	}

	function endDrag() {
		swipedLast.current = drag.current?.swiped === true;
		drag.current = null;
	}

	/** True when the click that follows this pointer sequence is the tail of a swipe, not a tap. */
	function swallowed(): boolean {
		const was = swipedLast.current;
		swipedLast.current = false;
		return was;
	}

	if (!running || tracker.combatants.length === 0) {
		return (
			<div style={bodyWrap}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{showHp
						? t('widgetBody.initiative.noneHpShown')
						: t('widgetBody.initiative.noneHpHidden')}
				</div>
			</div>
		);
	}

	return (
		<div style={{ ...bodyWrap, overflowY: 'auto' }} data-testid="initiative-tile-compact">
			<div
				style={{
					display: 'flex',
					// CENTRE, not baseline. The Next-turn chip is a touch target sized against the
					// board's scale, so it is several times the height of this 11px caption; aligning
					// the two on a shared baseline hung most of the chip BELOW the header, on top of the
					// first combatant rows, where it intercepted the presses meant for their hit points.
					alignItems: 'center',
					gap: 8,
					font: `600 11px ${T.sans}`,
					color: T.sub,
					textTransform: 'uppercase',
					letterSpacing: '0.06em',
				}}
			>
				<span>{t('widgetBody.initiative.compactHeading', { round: tracker.round })}</span>
				{/* RC-WID-4.2 — advancing the order is the phone tile's most-wanted action, so it sits in
				    the header rather than behind a trip to /session. */}
				{/* `dense`: the chip's board-scale touch-target compensation is deliberately off here. On
				    a phone this tile's body is ~43px tall, and a control sized to PAINT at 48dp asks for
				    roughly twice that in layout — it filled the body on its own and clipped every
				    combatant row out of the tile, so the widget drew a Next-turn button and no combat.
				    It now matches the row controls beside it. */}
				<span style={{ marginLeft: 'auto' }}>
					<NextTurnControl dense running interactive={interactive} />
				</span>
			</div>
			<ul
				style={{
					listStyle: 'none',
					margin: 0,
					padding: 0,
					// Scroll the whole compact tile: a tall header otherwise collapses this list to zero.
					flex: '0 0 auto',
				}}
			>
				{tracker.combatants.map((c) => {
					const res = c.resources;
					const trayOpen = openTray === c.id;
					const active = c.id === tracker.activeCombatantId;
					return (
						<li
							key={c.id}
							data-testid={`initiative-tile-row-${c.id}`}
							onPointerDown={(e) => interactive && onPointerDown(c.id, e)}
							onPointerMove={(e) => interactive && onPointerMove(e)}
							onPointerUp={endDrag}
							onPointerCancel={endDrag}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								minHeight: 56,
								padding: '4px 6px',
								borderBottom: `1px solid ${T.bd}`,
								borderLeft: `3px solid ${active ? T.acc : 'transparent'}`,
								background: active ? T.accSub : 'transparent',
								// Vertical scrolling still belongs to the board; horizontal travel is ours.
								touchAction: 'pan-y',
							}}
						>
							<span
								aria-hidden="true"
								style={{
									font: `700 13px ${T.mono}`,
									color: T.sub,
									width: 22,
									textAlign: 'right',
									flexShrink: 0,
								}}
							>
								{c.statBlock.initiative ?? '—'}
							</span>
							<div style={{ minWidth: 0, flex: 1 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
									<span
										style={{
											font: `600 13.5px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{c.name}
									</span>
									{c.hidden && <VisibilityChip level="dm-only" compact />}
									{active && <Badge status="success">{t('session.combat.active')}</Badge>}
									{c.isDefeated && <Badge status="error">{t('session.combat.down')}</Badge>}
								</div>
								{showHp && res && (
									<div style={{ marginTop: 3 }}>
										<HPBar current={res.hp} max={res.maxHp} size="sm" showText={false} />
									</div>
								)}
							</div>
							{trayOpen ? (
								<div
									role="group"
									aria-label={t('widgetBody.initiative.compactActions', { name: c.name })}
									style={{ display: 'flex', gap: 4, flexShrink: 0 }}
								>
									<IconButton
										icon="sword"
										size="md"
										label={t('session.combat.hp.damage')}
										onClick={() => !swallowed() && setHpSheet({ id: c.id, intent: 'damage' })}
									/>
									<IconButton
										icon="heart"
										size="md"
										label={t('session.combat.hp.heal')}
										onClick={() => !swallowed() && setHpSheet({ id: c.id, intent: 'heal' })}
									/>
									{isDm && (
										<IconButton
											icon={c.hidden ? 'reveal' : 'conceal'}
											size="md"
											label={t(
												c.hidden
													? 'widgetBody.initiative.compactReveal'
													: 'widgetBody.initiative.compactHide',
												{ name: c.name },
											)}
											onClick={() => !swallowed() && void toggleHidden(c)}
										/>
									)}
									<IconButton
										icon="close"
										size="md"
										label={t('widgetBody.initiative.compactCloseActions', { name: c.name })}
										onClick={() => setOpenTray(null)}
									/>
								</div>
							) : (
								<div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
									{showHp && res && (
										<button
											type="button"
											disabled={!interactive}
											aria-label={t('session.combat.hp.adjust', { name: c.name })}
											title={t('session.combat.hp.adjust', { name: c.name })}
											onClick={() => !swallowed() && setHpSheet({ id: c.id, intent: 'damage' })}
											style={{
												minHeight: 44,
												minWidth: 60,
												padding: '0 8px',
												borderRadius: 'var(--radius-sm)',
												border: `1px solid ${T.bd}`,
												background: T.surf,
												color: T.ink,
												font: `700 13px ${T.mono}`,
												cursor: interactive ? 'pointer' : 'default',
											}}
										>
											{res.hp}
											<span style={{ color: T.ter }}>/{res.maxHp}</span>
										</button>
									)}
									<IconButton
										icon="more"
										size="md"
										disabled={!interactive}
										label={t('widgetBody.initiative.compactMore', { name: c.name })}
										onClick={() => !swallowed() && setOpenTray(c.id)}
									/>
								</div>
							)}
						</li>
					);
				})}
			</ul>
			{/* The swipe is a shortcut, not a secret: say so once, under the order. */}
			<p style={{ margin: 0, font: `11.5px ${T.sans}`, color: T.ter }}>
				<Icon name="chevron-left" size="micro" aria-hidden="true" />{' '}
				{t('widgetBody.initiative.compactSwipeHint')}
			</p>
			<div role="status" aria-live="polite" style={SR_ONLY}>
				{announcement}
			</div>
			{target && (
				<HpKeypadSheet
					key={`${target.id}:${hpSheet?.intent}`}
					target={target}
					intent={hpSheet?.intent ?? 'damage'}
					side="bottom"
					onClose={() => setHpSheet(null)}
					onApply={applyHp}
				/>
			)}
		</div>
	);
}
