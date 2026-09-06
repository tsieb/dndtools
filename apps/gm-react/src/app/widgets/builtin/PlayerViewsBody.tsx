import { getPlayerViewController } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap } from '../../widget-body-kit';

/**
 * The `player-views` Command Center widget (RC-WID-4.1) — who is at the table and what each of them
 * is currently being shown.
 *
 * `getPlayerViewController` is DM-only and returns `denied` for anyone else, so the tile says the
 * controls are DM only rather than rendering an empty roster that reads like "nobody is here".
 * A participant whose assignment points at a scene that no longer exists reports `missing-scene`
 * from the core; that is shown as such, not quietly as "not assigned".
 */
export function PlayerViewsBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const controller = getPlayerViewController(runtime.state, runtime.defaultActorId);
	if (controller.kind !== 'available') return <Muted>{t('widgetBody.playerViews.dmOnly')}</Muted>;
	const { participants } = controller;
	if (participants.length === 0) return <Muted>{t('widgetBody.playerViews.empty')}</Muted>;
	const assigned = participants.filter((p) => p.assignment?.kind === 'assigned').length;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.playerViews.players')} value={String(participants.length)} />
				<StatPill label={t('widgetBody.playerViews.assigned')} value={String(assigned)} />
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{participants.slice(0, 5).map((participant) => {
					const assignment = participant.assignment;
					const where =
						assignment === null
							? t('widgetBody.playerViews.notAssigned')
							: assignment.kind === 'missing-scene'
								? t('widgetBody.playerViews.missingScene')
								: (assignment.sceneName ?? t('widgetBody.playerViews.missingScene'));
					return (
						<Chip
							key={participant.actorId}
							tone={assignment?.kind === 'assigned' ? 'accent' : 'neutral'}
						>
							{participant.displayName} · {where}
						</Chip>
					);
				})}
			</div>
		</div>
	);
}
