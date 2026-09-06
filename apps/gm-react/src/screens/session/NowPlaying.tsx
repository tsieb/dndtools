import { getSessionAudioView } from '@dndtools/core';
import { Badge, Button, Icon, Slider } from '../../ds';
import { Panel, T } from '../../app/screen-kit';

type SessionAudioView = ReturnType<typeof getSessionAudioView>;

export function AudioPanel({
	audio,
	trackLabel,
	isDm,
	previewing,
	onPause,
	onResume,
	onStop,
	onVolume,
}: {
	audio: SessionAudioView;
	trackLabel: string | null;
	isDm: boolean;
	previewing: boolean;
	onPause: () => void;
	onResume: () => void;
	onStop: () => void;
	onVolume: (volume: number) => void;
}) {
	const track = audio.track;
	return (
		<Panel title="Now playing">
			{!track ? (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						font: `12.5px ${T.sans}`,
						color: T.ter,
					}}
				>
					<Icon name="audio" size="sm" color={T.ter} />
					Nothing playing. Start ambience from the Audio library.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<Icon name="audio" size="sm" color={track.status === 'playing' ? T.acc : T.sub} />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									font: `600 13px ${T.sans}`,
									color: T.ink,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{trackLabel ?? track.assetId ?? track.sourceId}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>session audio</div>
						</div>
						<Badge status={track.status === 'playing' ? 'success' : 'neutral'}>
							{track.status === 'playing' ? 'Playing' : 'Paused'}
						</Badge>
					</div>
					{isDm && (
						<>
							<div style={{ display: 'flex', gap: 7 }}>
								{track.status === 'playing' ? (
									<Button
										variant="secondary"
										size="sm"
										icon="pause"
										disabled={previewing}
										onClick={onPause}
									>
										Pause
									</Button>
								) : (
									<Button
										variant="secondary"
										size="sm"
										icon="play"
										disabled={previewing}
										onClick={onResume}
									>
										Resume
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									disabled={previewing}
									onClick={onStop}
								>
									Stop
								</Button>
							</div>
							<Slider
								label="Volume"
								min={0}
								max={1}
								step={0.05}
								value={track.volume}
								valueLabel={`${Math.round(track.volume * 100)}%`}
								disabled={previewing}
								onChange={(v: number) => onVolume(v)}
							/>
						</>
					)}
				</div>
			)}
		</Panel>
	);
}
