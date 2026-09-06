import { getSessionAudioView } from '@dndtools/core';
import { Icon } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Muted } from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function AudioBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	// AUDIO-002/003 — the ONE actor-filtered session-audio read model: the DM sees the authoritative
	// track + ambience mix; a participant only the player-safe track. Names resolve through the audio
	// library only on the DM view (they are DM config, not part of the player-safe projection).
	const view = getSessionAudioView(
		runtime.state.audio,
		runtime.state.session.audioPlayback,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const track = view.track;
	if (!track) {
		return <Muted>{t('widgetBody.audio.empty')}</Muted>;
	}
	const isDm = view.role === 'dm';
	const title = isDm
		? ((track.assetId ? runtime.state.audio.assets[track.assetId]?.title : undefined) ??
			runtime.state.audio.sources[track.sourceId]?.displayName ??
			track.sourceId)
		: t('widgetBody.audio.sessionAudio');
	const ambienceCount = isDm ? Object.keys(view.ambienceLayers).length : 0;
	const playing = track.status === 'playing';
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
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
		</div>
	);
}
