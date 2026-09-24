import { Button, Icon, StatusDot } from '../../ds';
import { type CoreCommand } from '@dndtools/core';
import { T, eb } from '../../app/screen-kit';
import { CommitSlider } from './shared';
import { useI18n } from '../../i18n';
import { AUDIO_EMBED_PROVIDER_LABEL, type AudioEmbedProvider } from '../../runtime/audio-embed';
import { type AudioPlaybackSnapshot, type AudioTrackView } from './types';

/** RC-AUD-3.3 — a detected web-embed track, resolved from the source URL by the caller. */
export interface AudioEmbedInfo {
	provider: AudioEmbedProvider;
	/** The sandboxed player src, or null when the URL could not be resolved to a playable embed. */
	src: string | null;
}

/** The now-playing strip — the durable SESSION-OWNED track, its transport and the authoritative
 * master fader. Extracted from Audio.tsx unchanged (RC-STB-2.6). */
export function NowPlaying({
	dmId,
	canEdit,
	playbackState,
	track,
	playing,
	trackLabel,
	masterPct,
	dispatch,
	embed,
	online,
}: {
	dmId: string;
	canEdit: boolean;
	playbackState: AudioPlaybackSnapshot;
	track: AudioTrackView | null;
	playing: boolean;
	trackLabel: string;
	masterPct: number;
	dispatch: (command: CoreCommand) => void;
	/** RC-AUD-3.3 — set when the current track's source resolves to a YouTube/SoundCloud URL. */
	embed?: AudioEmbedInfo | null;
	/** RC-AUD-3.3 — this device's network reachability, for the embed's honest online/offline cue. */
	online?: boolean;
}) {
	const { t } = useI18n();
	return (
		<>
			{/* now-playing strip — the durable SESSION-OWNED track + real transport */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-4)',
					padding: 'var(--space-3) var(--space-4)',
					borderRadius: 'var(--radius-lg)',
					background: T.raised,
					border: `calc(var(--space-0-5) / 2) solid ${track ? T.accBd : T.bd}`,
					boxShadow: T.smd,
					marginBottom: 'var(--space-4)',
					flexWrap: 'wrap',
				}}
			>
				<span
					style={{
						width: 'var(--space-10)',
						height: 'var(--space-10)',
						borderRadius: 'var(--radius-lg)',
						background: T.accSub,
						color: T.acc,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flex: '0 0 auto',
					}}
				>
					<Icon name="audio" size="lg" />
				</span>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ ...eb, marginBottom: 'var(--space-0-5)' }}>{t('audio.nowPlaying')}</div>
					<div style={{ font: `700 var(--text-md) ${T.sans}` }}>{trackLabel}</div>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						font: `var(--text-sm) ${T.sans}`,
						color: T.sub,
					}}
				>
					<StatusDot status={playing ? 'live' : 'idle'} pulse={playing} />{' '}
					{t(track ? (playing ? 'audio.playing' : 'audio.paused') : 'audio.idle')}
				</div>
				{track && (
					<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
						{playing ? (
							<Button
								variant="ghost"
								size="sm"
								icon="pause"
								disabled={!canEdit}
								onClick={() =>
									dispatch({ type: 'session.audio.pause', actorId: dmId, payload: {} })
								}
							>
								{t('audio.pause')}
							</Button>
						) : (
							<Button
								variant="ghost"
								size="sm"
								icon="play"
								disabled={!canEdit}
								onClick={() =>
									dispatch({ type: 'session.audio.resume', actorId: dmId, payload: {} })
								}
							>
								{t('audio.resume')}
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							icon="close"
							disabled={!canEdit}
							onClick={() => dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} })}
						>
							{t('audio.stop')}
						</Button>
					</div>
				)}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						minWidth: 200,
						padding: 'var(--space-1-5) var(--space-3)',
						borderRadius: 'var(--radius-md)',
						background: T.alt,
						border: `calc(var(--space-0-5) / 2) solid ${T.bd}`,
					}}
				>
					<Icon name="audio" size={15} color={T.ter} />
					<CommitSlider
						value={masterPct}
						disabled={!track || !canEdit}
						onCommit={(v: number) =>
							dispatch({
								type: 'session.audio.set-volume',
								actorId: dmId,
								payload: { volume: v / 100 },
							})
						}
						format={(v: number) => `${v}%`}
						steppers
						aria-label={t('audio.masterVolume')}
						style={{ flex: 1, minWidth: 0 }}
					/>
				</div>
				{/* The device-output driver's honest silent states — the durable track says "playing", this
				    line says why THIS device is (or isn't) actually sounding. Nothing fancy by design. */}
				{track &&
					(playbackState.status === 'blocked' ||
						playbackState.status === 'no-stream' ||
						playbackState.status === 'error') && (
						<div
							// This block renders ONLY for blocked / no-stream / error — i.e. this device is
							// silent while the durable track above still reads "Playing". Polite tertiary
							// grey behind a neutral speaker glyph made the app's one warning that the table
							// can't hear anything look like an info note.
							role="alert"
							style={{
								flexBasis: '100%',
								font: `var(--text-xs)/1.5 ${T.sans}`,
								color: 'var(--color-status-warning-text)',
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
							}}
						>
							<Icon name="warning" size={13} color="var(--color-status-warning-text)" />{' '}
							{playbackState.detail}
						</div>
					)}
				{/* RC-AUD-3.3 — the web embed. Rendered ONLY while this device has network reachability
				    (`online`): offline, the sandboxed frame could not load anyway, so we say so plainly
				    and let the local ambience layers — already sounding independently — carry the table
				    instead of showing a dead frame. */}
				{track && embed && playbackState.status === 'embed' && (
					<div
						style={{
							flexBasis: '100%',
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-1-5)',
						}}
					>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
								font: `var(--text-xs)/1.5 ${T.sans}`,
								color: T.sub,
							}}
						>
							<Icon name="globe" size={13} color={T.sub} />
							<span>
								{t('audio.embed.detected', {
									provider: AUDIO_EMBED_PROVIDER_LABEL[embed.provider],
								})}
							</span>
							<StatusDot status={online ? 'live' : 'warning'} />
							<span>{t(online ? 'audio.embed.online' : 'audio.embed.offline')}</span>
						</div>
						{online && embed.src ? (
							<iframe
								data-testid="audio-embed-frame"
								title={t('audio.embed.frameTitle', {
									provider: AUDIO_EMBED_PROVIDER_LABEL[embed.provider],
								})}
								src={embed.src}
								// RC-AUD-3.3 — allow-scripts + allow-same-origin so the provider's own player
								// (YouTube/SoundCloud, fixed hosts we construct the src for — never a DM-authored
								// URL passed through verbatim as markup) can run; no allow-forms/allow-popups/
								// allow-top-navigation, so the frame can neither navigate nor pop this window.
								sandbox="allow-scripts allow-same-origin allow-presentation"
								allow="autoplay; encrypted-media; picture-in-picture"
								referrerPolicy="strict-origin-when-cross-origin"
								style={{
									width: '100%',
									height: 'var(--space-20)',
									border: `calc(var(--space-0-5) / 2) solid ${T.bd}`,
									borderRadius: 'var(--radius-md)',
								}}
							/>
						) : (
							<div role="status" style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
								{online ? t('audio.embed.badUrl') : t('audio.embed.failover')}
							</div>
						)}
					</div>
				)}
			</div>
		</>
	);
}
