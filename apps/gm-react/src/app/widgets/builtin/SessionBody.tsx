import { getSessionStatusStrip } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap } from '../../widget-body-kit';

/**
 * The `session` Command Center widget (RC-WID-4.1). Before this it had no body at all and the GM
 * Screen drew "Nothing here knows how to draw this widget" over the tile the DM operates the table
 * from.
 *
 * Every cell comes from ONE actor-filtered read model, `getSessionStatusStrip` (UX-CMD-003): the
 * core decides what this viewer may see, so the roster cell is simply ABSENT for a player rather
 * than blanked out here, and a hidden active combatant never reaches the turn label.
 */
export function SessionBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const strip = getSessionStatusStrip(runtime.state, runtime.defaultActorId);
	if (strip.kind !== 'status-strip') return <Muted>{t('widgetBody.session.unavailable')}</Muted>;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.session.phase')} value={strip.phase.label} />
				<StatPill label={t('widgetBody.session.turn')} value={strip.turn.label} />
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{/* DM-only cell: `players` is null for a player or observer, so the roster count cannot
				    leak through a widget a DM shared onto a player view. */}
				{strip.players && <Chip>{strip.players.label}</Chip>}
				<Chip tone={strip.audio.playing ? 'accent' : 'neutral'}>{strip.audio.label}</Chip>
			</div>
			{strip.observerMode && <Muted>{t('widgetBody.session.observer')}</Muted>}
		</div>
	);
}
