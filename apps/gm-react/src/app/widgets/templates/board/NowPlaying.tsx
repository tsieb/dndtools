import { Icon } from '../../../../ds';
import { useI18n } from '../../../../i18n';
import { Muted } from '../../../widget-body-kit';
import { LiveReadout } from '../../builtin/live';
import type { WidgetTemplateProps } from '../shared';
import { detailOf } from './boardData';

/**
 * `now-playing` — what the table hears (RC-WID-5.7; the `audio` builtin body until then, unchanged on
 * screen). Read from the definition's `session-audio` query: AUDIO-002/003's actor-filtered read, so
 * the DM sees the track's title and the ambience mix and a participant only the player-safe track.
 */
export function NowPlayingTemplate({ data }: WidgetTemplateProps) {
	const { t } = useI18n();
	const track = detailOf(data, 'audio')?.track ?? null;
	// RC-WID-4.4 — BOTH branches return the same live region at the root, so React keeps it mounted
	// and a track starting in an empty tile is announced. Returning a bare `Muted` here inserted the
	// region together with its text the moment a track began, which is the insert that goes unheard.
	if (!track) {
		return (
			<LiveReadout>
				<Muted>{t('widgetBody.audio.empty')}</Muted>
			</LiveReadout>
		);
	}
	// A title is the DM's only; anyone else hears "session audio".
	const title = track.title ?? t('widgetBody.audio.sessionAudio');
	const ambienceCount = track.ambienceCount;
	const playing = track.playing;
	return (
		<LiveReadout
			style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 34,
					height: 34,
					borderRadius: 'var(--radius-full)',
					background: 'var(--color-accent-subtle)',
					color: 'var(--color-accent)',
					flex: '0 0 auto',
				}}
			>
				<Icon name={playing ? 'play' : 'pause'} size="sm" />
			</span>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						font: '600 var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-primary)',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{title}
				</div>
				<Muted>
					{playing
						? t('widgetBody.audio.playing', { percent: Math.round(track.volume * 100) })
						: t('widgetBody.audio.paused', { percent: Math.round(track.volume * 100) })}
					{ambienceCount > 0 ? t('widgetBody.audio.ambience', { count: ambienceCount }) : ''}
				</Muted>
			</div>
		</LiveReadout>
	);
}
