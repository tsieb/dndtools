import { type AudioSourceClassification } from '@dndtools/core';
import { Badge, Button, Icon } from '../../../ds';
import { T } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import { SOURCE_KINDS } from '../shared';
import { type AudioTrackView } from '../types';

export function TrackSources({
	sources,
	nativeDesktop,
	android,
	streamIsAllowed,
	track,
	playing,
	isPhone,
	canEdit,
	playSource,
}: {
	sources: AudioSourceClassification[];
	nativeDesktop: boolean;
	android: boolean;
	streamIsAllowed: (source: AudioSourceClassification) => boolean;
	track: AudioTrackView | null;
	playing: boolean;
	isPhone: boolean;
	canEdit: boolean;
	playSource: (source: AudioSourceClassification) => void;
}) {
	const { t } = useI18n();
	return (
		<>
			{sources.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					{sources.map((s) => {
						const desktopBlocked = nativeDesktop && s.type === 'web-stream';
						const androidBlocked = android && !streamIsAllowed(s);
						const platformBlocked = desktopBlocked || androidBlocked;
						const streamPlayable = !platformBlocked && s.type === 'web-stream' && s.playbackEnabled;
						const isActive = track?.sourceId === s.sourceId;
						return (
							<div
								key={s.sourceId}
								style={{
									display: 'flex',
									alignItems: 'center',
									// The fixed children — badge, Play/"Via soundboard" control and the
									// gaps — take ~233px of a ~327px phone content box, leaving the
									// source name and its type/cache/offline meta line under 100px.
									// Same shape and same fix as the automation row below.
									flexWrap: isPhone ? 'wrap' : 'nowrap',
									gap: 'var(--space-2)',
									padding: 'var(--space-2) var(--space-3)',
									border: `calc(var(--space-0-5) / 2) solid ${isActive ? T.accBd : T.bd}`,
									borderRadius: 'var(--radius-md)',
									background: T.surf,
								}}
							>
								<Icon
									name="audio"
									size={15}
									color={s.playbackEnabled && !platformBlocked ? T.acc : T.ter}
								/>
								{/* `flex: 1` is `1 1 0%`; a 0 basis makes flex-wrap a no-op for this
												    item, so the basis must be `auto` for the controls to break line. */}
								<div style={{ flex: isPhone ? '1 1 auto' : 1, minWidth: 0 }}>
									<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{s.displayName}</div>
									<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
										{t(SOURCE_KINDS.find((kind) => kind.value === s.type)!.label)}
									</div>
								</div>
								<Badge status={s.playbackEnabled && !platformBlocked ? 'success' : 'neutral'}>
									{t(
										desktopBlocked
											? 'audio.tracks.blockedDesktop'
											: androidBlocked
												? 'audio.tracks.httpsRequired'
												: s.playbackEnabled
													? 'audio.tracks.playbackReady'
													: 'audio.automation.disabled',
									)}
								</Badge>
								{streamPlayable ? (
									<Button
										variant="ghost"
										size="sm"
										icon="play"
										disabled={!canEdit || (isActive && playing)}
										aria-label={t('audio.tracks.play', { name: s.displayName })}
										onClick={() => playSource(s)}
									>
										{t(isActive && playing ? 'audio.playing' : 'audio.tracks.playAction')}
									</Button>
								) : (
									<span
										style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}
										title={t(
											platformBlocked
												? 'audio.tracks.remoteBlockedTitle'
												: 'audio.tracks.viaSoundboardTitle',
										)}
									>
										{t(
											platformBlocked ? 'audio.tracks.importInstead' : 'audio.tracks.viaSoundboard',
										)}
									</span>
								)}
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
