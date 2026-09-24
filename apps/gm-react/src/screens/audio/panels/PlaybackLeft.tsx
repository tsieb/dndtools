import { AudioPanel as Panel } from '../AudioPanel';
import { TrackSources } from './TrackSources';
import { type FormEvent } from 'react';
import { type AudioAssetView, type AudioSourceClassification } from '@dndtools/core';
import { Badge, Button, EmptyState, Field, Icon, Input, Select } from '../../../ds';
import { T } from '../../../app/screen-kit';
import { SOURCE_KINDS, formatAudioDuration, type BytesPresence, type SourceKind } from '../shared';
import { useI18n } from '../../../i18n';
import { AUDIO_EMBED_PROVIDER_LABEL, detectAudioEmbedProvider } from '../../../runtime/audio-embed';
import { type AudioTrackView } from '../types';

/** The Playback tab's left column — the soundboard of real library assets and the tracks & sources
 * panel (add a declared source, import a local file, play a stream). Extracted from Audio.tsx
 * unchanged (RC-STB-2.6). */
export function PlaybackLeft({
	isPhone,
	nativeDesktop,
	android,
	previewing,
	canEdit,
	assets,
	sources,
	bytesPresence,
	track,
	playing,
	streamIsAllowed,
	pulse,
	playError,
	trackName,
	setTrackName,
	trackUrl,
	setTrackUrl,
	trackKind,
	setTrackKind,
	addBusy,
	addError,
	addedName,
	setAddedName,
	importBusy,
	importError,
	importAudio,
	starterBusy,
	starterError,
	installStarter,
	playAsset,
	addTrack,
	playSource,
}: {
	isPhone: boolean;
	nativeDesktop: boolean;
	android: boolean;
	previewing: boolean;
	canEdit: boolean;
	assets: AudioAssetView[];
	sources: AudioSourceClassification[];
	bytesPresence: Record<string, BytesPresence>;
	track: AudioTrackView | null;
	playing: boolean;
	streamIsAllowed: (source: AudioSourceClassification) => boolean;
	pulse: string | null;
	playError: string | null;
	trackName: string;
	setTrackName: (next: string) => void;
	trackUrl: string;
	setTrackUrl: (next: string) => void;
	trackKind: SourceKind;
	setTrackKind: (next: SourceKind) => void;
	addBusy: boolean;
	addError: string | null;
	addedName: string | null;
	setAddedName: (next: string | null) => void;
	importBusy: boolean;
	importError: string | null;
	importAudio: () => Promise<void>;
	starterBusy: boolean;
	starterError: string | null;
	installStarter: () => Promise<void>;
	playAsset: (asset: AudioAssetView) => Promise<void>;
	addTrack: (event: FormEvent) => Promise<void>;
	playSource: (source: AudioSourceClassification) => void;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			{/* soundboard — real library assets; each tile dispatches session.audio.play */}
			<Panel
				title={t('audio.soundboard.title')}
				action={
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 'var(--space-2)',
						}}
					>
						<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t('audio.soundboard.assets', { count: assets.length })}
						</span>
						<Button
							variant="ghost"
							size="sm"
							icon="audio"
							disabled={!canEdit || starterBusy}
							onClick={() => void installStarter()}
							title={t('audio.starter.hint')}
						>
							{starterBusy ? t('audio.starter.installing') : t('audio.starter.install')}
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="import"
							disabled={!canEdit || importBusy}
							onClick={() => void importAudio()}
						>
							{importBusy ? t('audio.soundboard.importing') : t('audio.soundboard.import')}
						</Button>
					</div>
				}
			>
				<div role="status" aria-atomic="true">
					{importBusy
						? t('audio.soundboard.importing')
						: starterBusy
							? t('audio.starter.installing')
							: null}
				</div>
				{importError && (
					<div
						role="alert"
						style={{
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: 'var(--color-status-error-text)',
						}}
					>
						<Icon name="error" size="sm" /> {importError}
					</div>
				)}
				{starterError && (
					<div
						role="alert"
						style={{
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: 'var(--color-status-error-text)',
						}}
					>
						<Icon name="error" size="sm" /> {starterError}
					</div>
				)}
				{assets.length === 0 ? (
					<EmptyState
						illustration="audio-empty"
						inset
						icon="audio"
						title={t('audio.soundboard.emptyTitle')}
						description={t('audio.soundboard.emptyBody')}
					/>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'repeat(2,1fr)',
							gap: 'var(--space-2)',
						}}
					>
						{assets.map((a) => {
							const lit = pulse === a.id;
							const bytes = bytesPresence[a.id] ?? 'unknown';
							return (
								<Button
									variant="ghost"
									disabled={!canEdit}
									key={a.id}
									type="button"
									onClick={() => void playAsset(a)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-3)',
										padding: 'var(--space-3) var(--space-3)',
										borderRadius: 'var(--radius-lg)',
										cursor: 'pointer',
										textAlign: 'left',
										border: `calc(var(--space-0-5) / 2) solid ${lit ? T.acc : T.bd}`,
										background: lit ? `color-mix(in srgb, ${T.acc} 18%, ${T.surf})` : T.surf,
										transition:
											'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
									}}
								>
									<span
										style={{
											width: 'var(--space-8)',
											height: 'var(--space-8)',
											borderRadius: 'var(--radius-md)',
											flex: '0 0 auto',
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											background: `color-mix(in srgb, ${T.acc} 16%, transparent)`,
											color: bytes === 'missing' ? T.ter : T.acc,
										}}
									>
										<Icon name="play" size="md" />
									</span>
									<span style={{ flex: 1, minWidth: 0 }}>
										<span
											style={{
												display: 'block',
												font: `600 var(--text-sm) ${T.sans}`,
												whiteSpace: 'nowrap',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
											}}
										>
											{a.title || a.fileName}
										</span>
										<span
											style={{ display: 'block', font: `var(--text-xs) ${T.sans}`, color: T.ter }}
										>
											{(() => {
												const duration = formatAudioDuration(a.durationSeconds);
												const detail =
													bytes === 'unknown'
														? t('audio.soundboard.checkingDevice')
														: bytes === 'present'
															? a.tags.length
																? a.tags.join(' · ')
																: a.mimeType
															: t('audio.soundboard.bytesMissing');
												return duration ? `${duration} · ${detail}` : detail;
											})()}
										</span>
									</span>
									{a.needsLicenseReview && (
										<Badge status="warning">{t('audio.soundboard.reviewLicense')}</Badge>
									)}
								</Button>
							);
						})}
					</div>
				)}
				{playError && (
					<div
						role="alert"
						style={{
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: 'var(--color-status-error-text)',
						}}
					>
						<Icon name="error" size="sm" /> {playError}
					</div>
				)}
			</Panel>

			{/* tracks & sources — ADD a source in-app (audio.configure-source) + play a stream directly */}
			<Panel
				title={t('audio.tracks.title')}
				action={
					<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
						{t('audio.tracks.count', { count: sources.length })}
					</span>
				}
			>
				{canEdit ? (
					<form
						onSubmit={addTrack}
						style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
					>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.2fr 1fr',
								gap: 'var(--space-2)',
							}}
						>
							<Field label={t('audio.tracks.name')} htmlFor="audio-track-name" required>
								<Input
									id="audio-track-name"
									value={trackName}
									onChange={(e: { target: { value: string } }) => {
										// Typing the next track's name retires the previous one's confirmation.
										setAddedName(null);
										setTrackName(e.target.value);
									}}
									placeholder={t('audio.tracks.namePlaceholder')}
								/>
							</Field>
							<Field label={t('audio.tracks.kind')} htmlFor="audio-track-kind">
								<Select
									id="audio-track-kind"
									value={trackKind}
									onChange={(e: { target: { value: string } }) =>
										setTrackKind(e.target.value as SourceKind)
									}
									options={SOURCE_KINDS.filter(
										(option) => !nativeDesktop || option.value !== 'web-stream',
									).map((option) => ({ value: option.value, label: t(option.label) }))}
								/>
							</Field>
						</div>
						{!nativeDesktop && (
							<Field
								label={t('audio.tracks.streamUrl')}
								htmlFor="audio-track-url"
								required={trackKind === 'web-stream'}
								help={t(
									trackKind === 'web-stream'
										? android
											? 'audio.tracks.urlHelpAndroid'
											: 'audio.tracks.urlHelp'
										: 'audio.tracks.urlHelpLocal',
								)}
							>
								<Input
									id="audio-track-url"
									value={trackUrl}
									disabled={trackKind !== 'web-stream'}
									onChange={(e: { target: { value: string } }) => setTrackUrl(e.target.value)}
									placeholder={t('audio.tracks.urlPlaceholder')}
								/>
							</Field>
						)}
						{/* RC-AUD-3.3 — a recognized YouTube/SoundCloud URL plays as a sandboxed embed, never
						    cached, instead of the local audio element. Detected from the URL alone; no extra
						    form field, so a plain audio file URL still works exactly as before. */}
						{trackKind === 'web-stream' &&
							!nativeDesktop &&
							(() => {
								const provider = detectAudioEmbedProvider(trackUrl.trim());
								if (!provider) return null;
								return (
									<div
										data-testid="audio-embed-add-hint"
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 'var(--space-1-5)',
											font: `var(--text-xs)/1.5 ${T.sans}`,
											color: T.ter,
										}}
									>
										<Icon name="globe" size={12} color={T.ter} />
										{t('audio.embed.addHint', { provider: AUDIO_EMBED_PROVIDER_LABEL[provider] })}
									</div>
								);
							})()}
						{nativeDesktop && (
							<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
								{t('audio.tracks.desktopBlocksRemote')}
							</div>
						)}
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								flexWrap: 'wrap',
							}}
						>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								icon="add"
								disabled={addBusy || !trackName.trim()}
							>
								{addBusy ? t('audio.tracks.adding') : t('audio.tracks.add')}
							</Button>
							{addError && (
								<span
									role="alert"
									style={{
										font: `var(--text-xs) ${T.sans}`,
										color: 'var(--color-status-error-text)',
									}}
								>
									<Icon name="error" size="sm" /> {addError}
								</span>
							)}
							{!addError && addedName && (
								<span
									role="status"
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 'var(--space-1)',
										font: `var(--text-xs) ${T.sans}`,
										color: 'var(--color-status-success-text)',
									}}
								>
									<Icon name="success" size="sm" /> {t('audio.tracks.added', { name: addedName })}
								</span>
							)}
						</div>
					</form>
				) : (
					<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
						{t(previewing ? 'audio.tracks.dmOnlyPreviewing' : 'audio.tracks.dmOnly')}
					</div>
				)}
				<TrackSources
					sources={sources}
					nativeDesktop={nativeDesktop}
					android={android}
					streamIsAllowed={streamIsAllowed}
					track={track}
					playing={playing}
					isPhone={isPhone}
					canEdit={canEdit}
					playSource={playSource}
				/>
			</Panel>
		</div>
	);
}
