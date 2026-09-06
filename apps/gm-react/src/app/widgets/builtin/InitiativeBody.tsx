import { useMemo } from 'react';
import {
	getActiveSystemForActor,
	getCombatTrackerForActor,
	resolveTurnModel,
} from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import { Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function InitiativeBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
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
