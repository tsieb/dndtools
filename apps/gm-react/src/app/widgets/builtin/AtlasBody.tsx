import { getActiveMapProjectionSummary, listMapsForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * The `atlas` Command Center widget (RC-WID-4.1) — the active-map projection state plus the most
 * recent maps, `thumbnails` deciding how many are named.
 *
 * The projection line is the DM-only one (`getActiveMapProjectionSummary` returns null for anyone
 * else, UX-CMD-007), so a player never learns from this tile what the DM is holding back. "Sharing"
 * means players currently HOLD the same map and region the DM is looking at, not that the DM has a
 * map open.
 */
export function AtlasBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId);
	const shown = Math.max(1, Number(cfg<string>(widget, 'thumbnails') ?? 3) || 3);
	const projection = getActiveMapProjectionSummary(runtime.state, actorId);
	if (maps.length === 0) return <Muted>{t('widgetBody.atlas.empty')}</Muted>;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.atlas.maps')} value={String(maps.length)} />
				{projection && (
					<StatPill
						label={t('widgetBody.atlas.sharing')}
						value={
							projection.projecting
								? String(projection.deliveredCount)
								: t('widgetBody.atlas.noOne')
						}
					/>
				)}
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{maps.slice(0, shown).map((map) => (
					<Chip key={map.id}>{map.name}</Chip>
				))}
			</div>
			{projection && projection.queuedCount > 0 && (
				<Muted>{t('widgetBody.atlas.queued', { count: projection.queuedCount })}</Muted>
			)}
		</div>
	);
}
