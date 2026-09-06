import { getCombatTrackerForActor, listEncountersForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * The `combat` Command Center widget (RC-WID-4.1) — the live tracker at a glance plus the most
 * recently touched prepared encounter.
 *
 * `showChallenge` only ever has something to show when the ACTIVE system package declares a
 * challenge budget: `EncounterView.challenge` is `null` under a package with no challenge ratings or
 * levels (RC-SYS-2.5), and the chip goes away with it rather than quoting 5e math at a system that
 * has neither. Encounters are DM-only in the core, so a player sees the tracker line and nothing
 * about the DM's prep.
 */
export function CombatBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const showChallenge = cfg<boolean>(widget, 'showChallenge') ?? true;
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		actorId,
	);
	const running = tracker.status === 'running';
	const active =
		tracker.combatants.find((c) => c.isActive) ??
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ??
		null;
	const encounters = listEncountersForActor(
		runtime.state.encounters,
		runtime.state.permissions,
		actorId,
		runtime.state.systems,
	);
	const latest = encounters.reduce<(typeof encounters)[number] | null>(
		(newest, encounter) =>
			newest === null || encounter.updatedAt > newest.updatedAt ? encounter : newest,
		null,
	);
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill
					label={t('widgetBody.initiative.round')}
					value={running ? String(tracker.round) : '—'}
				/>
				<StatPill
					label={t('widgetBody.initiative.turn')}
					value={running ? (active?.name ?? `#${tracker.turn + 1}`) : '—'}
				/>
			</div>
			{latest ? (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					<Chip>{latest.title}</Chip>
					{showChallenge && latest.challenge && (
						<Chip tone="accent">
							{t(`widgetBody.combat.difficulty.${latest.challenge.difficulty}`)}
						</Chip>
					)}
				</div>
			) : (
				<Muted>{t('widgetBody.combat.noEncounter')}</Muted>
			)}
			{!running && <Muted>{t('widgetBody.combat.notRunning')}</Muted>}
		</div>
	);
}
