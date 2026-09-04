import { Button, Icon, StatusDot } from '../../ds';
import { type CoreCommand } from '@dndtools/core';
import { T, eb } from '../../app/screen-kit';
import { CommitSlider } from './shared';
import { type AudioPlaybackSnapshot, type AudioTrackView } from './types';

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
}: {
	dmId: string;
	canEdit: boolean;
	playbackState: AudioPlaybackSnapshot;
	track: AudioTrackView | null;
	playing: boolean;
	trackLabel: string;
	masterPct: number;
	dispatch: (command: CoreCommand) => void;
}) {
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
					<div style={{ ...eb, marginBottom: 2 }}>Now playing</div>
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
					{track ? (playing ? 'Playing' : 'Paused') : 'Idle'}
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
								Pause
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
								Resume
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							icon="close"
							disabled={!canEdit}
							onClick={() => dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} })}
						>
							Stop
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
						aria-label="Master volume"
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
			</div>
		</>
	);
}
