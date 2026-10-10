import { getSessionAudioView } from '@dndtools/core';
import { Badge, Button, Icon, Slider } from '../../ds';
import { useI18n } from '../../i18n';
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
	const { t } = useI18n();
	const track = audio.track;
	return (
		<Panel title={t('session.audio.title')}>
			{!track ? (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: T.space.three,
						font: `var(--text-sm) ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="audio" size="sm" color={T.ter} />
					{t('session.audio.empty')}
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}>
						<Icon name="audio" size="sm" color={track.status === 'playing' ? T.acc : T.sub} />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									font: `600 var(--text-sm) ${T.sans}`,
									color: T.ink,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{trackLabel ?? track.assetId ?? track.sourceId}
							</div>
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('session.audio.source')}
							</div>
						</div>
						<Badge status={track.status === 'playing' ? 'success' : 'neutral'}>
							{t(track.status === 'playing' ? 'session.audio.playing' : 'session.audio.paused')}
						</Badge>
					</div>
					{isDm && (
						<>
							<div style={{ display: 'flex', gap: T.space.two }}>
								{track.status === 'playing' ? (
									<Button
										variant="secondary"
										size="sm"
										icon="pause"
										disabled={previewing}
										onClick={onPause}
									>
										{t('session.audio.pause')}
									</Button>
								) : (
									<Button
										variant="secondary"
										size="sm"
										icon="play"
										disabled={previewing}
										onClick={onResume}
									>
										{t('session.audio.resume')}
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									disabled={previewing}
									onClick={onStop}
								>
									{t('session.audio.stop')}
								</Button>
							</div>
							<Slider
								label={t('session.audio.volume')}
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
