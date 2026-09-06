import { type FormEvent } from 'react';
import { type AudioAssetView, type AudioSourceClassification } from '@dndtools/core';
import { Badge, Button, EmptyState, Field, Icon, Input, Select } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { SOURCE_KIND_OPTIONS, type BytesPresence, type SourceKind } from '../shared';
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
	playAsset: (asset: AudioAssetView) => Promise<void>;
	addTrack: (event: FormEvent) => Promise<void>;
	playSource: (source: AudioSourceClassification) => void;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			{/* soundboard — real library assets; each tile dispatches session.audio.play */}
			<Panel
				title="Soundboard"
				action={
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{assets.length} {assets.length === 1 ? 'asset' : 'assets'}
						</span>
						<Button
							variant="secondary"
							size="sm"
							icon="import"
							disabled={!canEdit || importBusy}
							onClick={() => void importAudio()}
						>
							{importBusy ? 'Importing…' : 'Import audio…'}
						</Button>
					</div>
				}
			>
				{importError && (
					<div
						role="alert"
						style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}
					>
						{importError}
					</div>
				)}
				{assets.length === 0 ? (
					<EmptyState
						inset
						icon="audio"
						title="The audio library is empty."
						description="Import a local audio file to build your soundboard, or add a stream track below — either becomes real session audio."
						action={
							canEdit ? (
								<Button
									variant="secondary"
									size="sm"
									icon="import"
									disabled={importBusy}
									onClick={() => void importAudio()}
								>
									{importBusy ? 'Importing…' : 'Import audio…'}
								</Button>
							) : undefined
						}
					/>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'repeat(2,1fr)',
							gap: 10,
						}}
					>
						{assets.map((a) => {
							const lit = pulse === a.id;
							const bytes = bytesPresence[a.id] ?? 'unknown';
							return (
								<button
									key={a.id}
									type="button"
									onClick={() => void playAsset(a)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 11,
										padding: '13px 14px',
										borderRadius: 11,
										cursor: 'pointer',
										textAlign: 'left',
										border: `1px solid ${lit ? T.acc : T.bd}`,
										background: lit ? `color-mix(in srgb, ${T.acc} 18%, ${T.surf})` : T.surf,
										transition:
											'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
									}}
								>
									<span
										style={{
											width: 34,
											height: 34,
											borderRadius: 9,
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
												font: `600 13px ${T.sans}`,
												whiteSpace: 'nowrap',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
											}}
										>
											{a.title || a.fileName}
										</span>
										<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>
											{bytes === 'unknown'
												? 'Checking this device…'
												: bytes === 'present'
													? a.tags.length
														? a.tags.join(' · ')
														: a.mimeType
													: 'File bytes missing on this device — re-import to restore'}
										</span>
									</span>
									{a.needsLicenseReview && <Badge status="warning">Review license</Badge>}
								</button>
							);
						})}
					</div>
				)}
				{playError && (
					<div
						role="alert"
						style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}
					>
						{playError}
					</div>
				)}
			</Panel>

			{/* tracks & sources — ADD a source in-app (audio.configure-source) + play a stream directly */}
			<Panel
				title="Tracks &amp; sources"
				action={
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{sources.length} {sources.length === 1 ? 'source' : 'sources'}
					</span>
				}
			>
				{canEdit ? (
					<form onSubmit={addTrack} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.2fr 1fr',
								gap: 10,
							}}
						>
							<Field label="Track name" htmlFor="audio-track-name" required>
								<Input
									id="audio-track-name"
									value={trackName}
									onChange={(e: { target: { value: string } }) => {
										// Typing the next track's name retires the previous one's confirmation.
										setAddedName(null);
										setTrackName(e.target.value);
									}}
									placeholder="Tavern murmur"
								/>
							</Field>
							<Field label="Kind" htmlFor="audio-track-kind">
								<Select
									id="audio-track-kind"
									value={trackKind}
									onChange={(e: { target: { value: string } }) =>
										setTrackKind(e.target.value as SourceKind)
									}
									options={SOURCE_KIND_OPTIONS.filter(
										(option) => !nativeDesktop || option.value !== 'web-stream',
									)}
								/>
							</Field>
						</div>
						{!nativeDesktop && (
							<Field
								label="Stream URL"
								htmlFor="audio-track-url"
								required={trackKind === 'web-stream'}
								help={
									trackKind === 'web-stream'
										? android
											? 'A direct HTTPS audio URL. Android blocks cleartext HTTP streams.'
											: 'A direct audio URL — the stream is the track, no file import needed.'
										: 'Only web streams take a URL. For local files, use “Import audio…” above — it stores the bytes and creates the source in one step.'
								}
							>
								<Input
									id="audio-track-url"
									value={trackUrl}
									disabled={trackKind !== 'web-stream'}
									onChange={(e: { target: { value: string } }) => setTrackUrl(e.target.value)}
									placeholder="https://example.com/ambience.mp3"
								/>
							</Field>
						)}
						{nativeDesktop && (
							<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
								The desktop app blocks remote audio links. Import audio above to keep playback local
								and available offline.
							</div>
						)}
						<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
							<Button
								type="submit"
								variant="secondary"
								size="sm"
								icon="add"
								disabled={addBusy || !trackName.trim()}
							>
								{addBusy ? 'Adding…' : 'Add track'}
							</Button>
							{addError && (
								<span
									role="alert"
									style={{
										font: `11.5px ${T.sans}`,
										color: 'var(--color-status-error-text)',
									}}
								>
									{addError}
								</span>
							)}
							{!addError && addedName && (
								<span
									role="status"
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 5,
										font: `11.5px ${T.sans}`,
										color: 'var(--color-status-success-text)',
									}}
								>
									<Icon name="success" size="sm" /> “{addedName}” added
								</span>
							)}
						</div>
					</form>
				) : (
					<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						Audio configuration is DM-only
						{previewing ? ' — exit preview to add tracks.' : '.'}
					</div>
				)}
				{sources.length > 0 && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{sources.map((s) => {
							const desktopBlocked = nativeDesktop && s.type === 'web-stream';
							const androidBlocked = android && !streamIsAllowed(s);
							const platformBlocked = desktopBlocked || androidBlocked;
							const streamPlayable =
								!platformBlocked && s.type === 'web-stream' && s.playbackEnabled;
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
										gap: 10,
										padding: '9px 11px',
										border: `1px solid ${isActive ? T.accBd : T.bd}`,
										borderRadius: 9,
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
										<div style={{ font: `600 12.5px ${T.sans}` }}>{s.displayName}</div>
										<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
											{s.type} · {s.cacheBehavior} · {s.offlineAvailability}
										</div>
									</div>
									<Badge status={s.playbackEnabled && !platformBlocked ? 'success' : 'neutral'}>
										{desktopBlocked
											? 'Blocked on desktop'
											: androidBlocked
												? 'HTTPS required'
												: s.playbackEnabled
													? 'Playback ready'
													: 'Disabled'}
									</Badge>
									{streamPlayable ? (
										<Button
											variant="ghost"
											size="sm"
											icon="play"
											disabled={!canEdit || (isActive && playing)}
											aria-label={`Play ${s.displayName}`}
											onClick={() => playSource(s)}
										>
											{isActive && playing ? 'Playing' : 'Play'}
										</Button>
									) : (
										<span
											style={{ font: `10.5px ${T.sans}`, color: T.ter }}
											title={
												platformBlocked
													? 'Remote streams are blocked by the desktop security policy.'
													: "Play this source's imported files from the soundboard above."
											}
										>
											{platformBlocked ? 'Import instead' : 'Via soundboard'}
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}
			</Panel>
		</div>
	);
}
