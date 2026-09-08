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
					gap: 16,
					padding: '14px 18px',
					borderRadius: 12,
					background: T.raised,
					border: `1px solid ${track ? T.accBd : T.bd}`,
					boxShadow: track ? T.smd : 'none',
					marginBottom: 18,
					flexWrap: 'wrap',
				}}
			>
				<span
					style={{
						width: 42,
						height: 42,
						borderRadius: 10,
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
					<div style={{ ...eb, marginBottom: 2 }}>{t('audio.nowPlaying')}</div>
					<div style={{ font: `700 17px ${T.disp}` }}>{trackLabel}</div>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<StatusDot status={playing ? 'live' : 'idle'} pulse={playing} />{' '}
					{t(track ? (playing ? 'audio.playing' : 'audio.paused') : 'audio.idle')}
				</div>
				{track && (
					<div style={{ display: 'flex', gap: 7 }}>
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
						gap: 10,
						minWidth: 200,
						padding: '7px 12px',
						borderRadius: 9,
						background: T.alt,
						border: `1px solid ${T.bd}`,
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
								font: `11.5px/1.5 ${T.sans}`,
								color: 'var(--color-status-warning-text)',
								display: 'flex',
								alignItems: 'center',
								gap: 6,
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
					<div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								font: `11.5px/1.5 ${T.sans}`,
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
									height: 80,
									border: `1px solid ${T.bd}`,
									borderRadius: 8,
								}}
							/>
						) : (
							<div role="status" style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
								{online ? t('audio.embed.badUrl') : t('audio.embed.failover')}
							</div>
						)}
					</div>
				)}
			</div>
		</>
	);
}
