import { getSavedSearchesForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap } from '../../widget-body-kit';

/**
 * The `search` Command Center widget (RC-WID-4.1) — the DM's saved searches, pinned ones first.
 *
 * The tile is a READOUT, not a launcher: a widget body has no navigation of its own (`nav.ts` owns
 * that), and a control that looked like a search box but could not run one would be exactly the dead
 * affordance the canvas is not allowed to have. Saved searches are actor-filtered by the core, so a
 * DM-only saved search is absent from a player's list rather than blanked.
 */
export function SearchBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const saved = getSavedSearchesForActor(
		runtime.state.content,
		runtime.state.maps,
		runtime.state.permissions,
		runtime.state.session,
		runtime.defaultActorId,
	);
	if (saved.length === 0) return <Muted>{t('widgetBody.search.empty')}</Muted>;
	const pinned = saved.filter((entry) => entry.pinned);
	const ordered = [...pinned, ...saved.filter((entry) => !entry.pinned)];
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.search.saved')} value={String(saved.length)} />
				<StatPill label={t('widgetBody.search.pinned')} value={String(pinned.length)} />
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{ordered.slice(0, 4).map((entry) => (
					<Chip key={entry.id} tone={entry.pinned ? 'accent' : 'neutral'}>
						{entry.name}
					</Chip>
				))}
			</div>
		</div>
	);
}
