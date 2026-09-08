import { useMemo } from 'react';
import {
	getActiveSystemForActor,
	getCombatTrackerForActor,
	resolveTurnModel,
} from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import { Muted, StatPill, bodyWrap, cfg, type WidgetCommandHandler } from '../../widget-body-kit';
import { useViewport } from '../../useViewport';
import { InitiativeTrackerCompact } from './InitiativeTracker';
import { NextTurnControl } from './NextTurnControl';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function InitiativeBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	/** VIEW-mode dispatch; its absence is how a body knows the board is being edited. */
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const showHp = cfg<boolean>(widget, 'showHp') ?? true;
	// RC-SYS-2.7 — the active package's turn model decides whether the tracker counts rounds at all
	// and whether the cursor means "whose turn" or "the spotlight" (RC-SYS-2.4's ResolvedTurnModel,
	// same read `InitiativeRow` uses).
	const activePackage = useMemo(
		() =>
			getActiveSystemForActor(
				runtime.state.systems,
				runtime.state.permissions,
				runtime.defaultActorId,
			).activePackage,
		[runtime.state.systems, runtime.state.permissions, runtime.defaultActorId],
	);
	const turnModel = resolveTurnModel(activePackage);
	// RC-CAN-5.3 — on a phone this tile IS the tracker, so it draws the order itself rather than a
	// three-pill summary the DM has to leave the board to act on. Hooks above run either way.
	const compact = viewport === 'phone';
	// SES-002 — the ONE actor-filtered combat read model; hidden combatants are already redacted.
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const running = tracker.status === 'running';
	const active =
		tracker.combatants.find((c) => c.isActive) ??
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ??
		null;
	const orderNames = tracker.combatants.map((c) => c.name);
	if (compact) return <InitiativeTrackerCompact showHp={showHp} interactive={!!onCommand} />;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				{turnModel.rounds && (
					<StatPill
						label={t('widgetBody.initiative.round')}
						value={running ? String(tracker.round) : '—'}
					/>
				)}
				<StatPill
					label={
						turnModel.spotlight
							? t('widgetBody.initiative.spotlight')
							: t('widgetBody.initiative.turn')
					}
					value={running ? (active?.name ?? `#${tracker.turn + 1}`) : '—'}
				/>
				{running && showHp && active?.resources && (
					<StatPill
						label={t('widgetBody.initiative.hp')}
						value={`${active.resources.hp} / ${active.resources.maxHp}`}
					/>
				)}
			</div>
			{/* RC-WID-4.2 — the tile's own operate control; see `NextTurnControl.tsx`. */}
			<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
				<NextTurnControl running={running} interactive={!!onCommand} />
			</div>
			{running && orderNames.length > 0 ? (
				<Muted>
					{orderNames.slice(0, 3).join(' · ')}
					{orderNames.length > 3 ? ` +${orderNames.length - 3}` : ''}
				</Muted>
			) : (
				<Muted>
					{showHp
						? t('widgetBody.initiative.noneHpShown')
						: t('widgetBody.initiative.noneHpHidden')}
				</Muted>
			)}
		</div>
	);
}
