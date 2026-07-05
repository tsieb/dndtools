import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioAssociationsForActor,
	listAudioSourceClassificationsForActor,
	listScenesForActor,
	type AudioAssetView,
	type AudioSourceClassification,
} from '@dndtools/core';
import { Badge, Button, Field, Icon, Input, Select, StatusDot, VisibilityChip } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { ensureAudioPlayback } from '../runtime/audio-playback';

/**
 * Audio — soundboard + session-audio transport, now wired to the live Processing Core (was static
 * `mockCampaign`). The now-playing strip reflects the durable SESSION-OWNED track (`getSessionAudioView`),
 * the soundboard plays real library assets (`listAudioAssetsForActor` → `session.audio.play`), the master
 * fader sets the AUTHORITATIVE session volume (`session.audio.set-volume`), and scene bindings are real
 * AUDIO-001 associations (`audio.associate-scene` / `disassociate-scene`). All audio config is DM-only —
 * a non-DM device receives empty lists (fail closed), and every write is disabled while previewing.
 *
 * AUDIBLE playback: mounting this screen starts the app-lifetime device-output driver
 * (`runtime/audio-playback.ts`), which follows the authoritative session track and drives a single
 * HTMLAudioElement for web-stream sources — so the transport buttons below actually make sound. The
 * driver's snapshot surfaces the honest silent states (autoplay blocked / no stream URL / stream error)
 * as a small line in the now-playing strip.
 *
 * ADD TRACK: the "Tracks & sources" panel dispatches `audio.configure-source` (the same declared-cache
 * web-stream path the demo seed uses — no asset bytes needed) and can `session.audio.play` a stream
 * source directly. Importing LOCAL FILES stays an honest stub: `audio.import-asset` requires the asset
 * BYTES, and this prototype has no asset-byte storage beside the core store yet.
 *
 * Honest-local (no core command): the per-layer AMBIENCE MIXER. Session audio is a SINGLE authoritative
 * track (Architecture Contract 4), not a per-loop layered mix — so the layer volumes/mute live in local
 * UI state only, with no Core command to drive them.
 */

function Fader({ value, onChange, accent, disabled }: { value: number; onChange: (v: number) => void; accent?: string; disabled?: boolean }) {
	return (
		<input
			type="range"
			min="0"
			max="100"
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(Number(e.target.value))}
			aria-label="Volume"
			style={{ flex: 1, height: 4, accentColor: accent || T.acc, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
		/>
	);
}

// Honest-local ambience layers — there is NO core command for a per-layer mix (session audio is one track).
const LOCAL_AMBIENCE = [
	{ id: 'amb-rain', name: 'Rain & distant thunder', icon: 'audio', on: true, vol: 60, dm: false },
	{ id: 'amb-tavern', name: 'Tavern murmur', icon: 'audio', on: false, vol: 35, dm: false },
	{ id: 'amb-heartbeat', name: 'Dread heartbeat', icon: 'audio', on: true, vol: 22, dm: true },
];

const SOURCE_KIND_OPTIONS = [
	{ value: 'web-stream', label: 'Web stream (URL)' },
	{ value: 'bundled-preset', label: 'Bundled preset' },
	{ value: 'local-file', label: 'Local file library' },
] as const;
type SourceKind = (typeof SOURCE_KIND_OPTIONS)[number]['value'];

export function Audio() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const state = runtime.state;
	const previewing = !!runtime.preview;
	const isDm = state.permissions.actors[dmId]?.role === 'dm';
	const canEdit = isDm && !previewing;

	// Start (idempotently) the app-lifetime device-output driver and follow its honest status. The driver
	// is keyed per runtime, so StrictMode double-render / remount reuses the same element and subscription.
	const playback = useMemo(() => ensureAudioPlayback(runtime), [runtime]);
	const playbackState = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot);

	const audioView = useMemo(
		() => getSessionAudioView(state.audio, state.session.audioPlayback, state.permissions, dmId),
		[state.audio, state.session.audioPlayback, state.permissions, dmId],
	);
	const assets = useMemo(() => listAudioAssetsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const sources = useMemo(() => listAudioSourceClassificationsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const associations = useMemo(() => listAudioAssociationsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const scenes = useMemo(
		() => listScenesForActor(state.scenes, state.permissions, dmId).filter((s) => !s.isTemplate),
		[state.scenes, state.permissions, dmId],
	);

	const track = audioView.track;
	const playing = track?.status === 'playing';
	// Resolve a human label for the active track: a named asset, else its source's display name, else
	// the raw id (a web-stream track carries only a source). Keeps the now-playing strip readable.
	const trackLabel = track
		? (track.assetId ? assets.find((a) => a.id === track.assetId)?.title : undefined) ??
			sources.find((s) => s.sourceId === track.sourceId)?.displayName ??
			track.assetId ??
			track.sourceId
		: 'Nothing playing';
	// A configured web-stream source needs no per-asset license/bytes, so it is the source a scene binding
	// can use right away (a local/bundled cue would require an imported asset, which needs file bytes).
	const webStreamSource = sources.find((s) => s.type === 'web-stream');

	const [ambience, setAmbience] = useState(LOCAL_AMBIENCE.map((a) => ({ ...a })));
	const [pulse, setPulse] = useState<string | null>(null);

	// Add-track form (audio.configure-source — the same declared-cache path the demo seed proves out).
	const [trackName, setTrackName] = useState('');
	const [trackUrl, setTrackUrl] = useState('');
	const [trackKind, setTrackKind] = useState<SourceKind>('web-stream');
	const [addBusy, setAddBusy] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [addedName, setAddedName] = useState<string | null>(null);

	const dispatch = (command: Parameters<typeof runtime.dispatch>[0]) => {
		void runtime.dispatch(command);
	};

	const playAsset = (asset: AudioAssetView) => {
		setPulse(asset.id);
		setTimeout(() => setPulse((p) => (p === asset.id ? null : p)), 360);
		dispatch({
			type: 'session.audio.play',
			actorId: dmId,
			payload: {
				sourceId: asset.sourceId,
				assetId: asset.id,
				assetLocallyAvailable: true,
				assetCached: true,
				online: true,
			},
		});
	};

	// ADD TRACK — configure a declared source, exactly as the demo seed does for the now-playing stream:
	// a web-stream declares `cache-required` (⇒ playback-enabled, no asset bytes needed); local kinds only
	// allow `local`. The core rejects a missing URL / disallowed cache behavior fail-closed.
	const addTrack = async (e: FormEvent) => {
		e.preventDefault();
		if (addBusy || !trackName.trim()) return;
		if (trackKind === 'web-stream' && !trackUrl.trim()) {
			setAddError('A web stream needs a stream URL.');
			return;
		}
		setAddBusy(true);
		setAddError(null);
		try {
			const result = await runtime.dispatch({
				type: 'audio.configure-source',
				actorId: dmId,
				payload: {
					type: trackKind,
					displayName: trackName.trim(),
					url: trackKind === 'web-stream' ? trackUrl.trim() : null,
					cacheBehavior: trackKind === 'web-stream' ? 'cache-required' : 'local',
				},
			});
			if (result.status === 'accepted') {
				setAddedName(trackName.trim());
				setTrackName('');
				setTrackUrl('');
			} else {
				setAddedName(null);
				setAddError(result.rejection.message);
			}
		} finally {
			setAddBusy(false);
		}
	};

	// Play a configured STREAM source as the session track (a web-stream play needs no asset — the stream
	// IS the track). Non-stream sources need an imported asset, which the file-import stub can't provide.
	const playSource = (s: AudioSourceClassification) => {
		if (s.type !== 'web-stream' || !s.playbackEnabled) return;
		dispatch({
			type: 'session.audio.play',
			actorId: dmId,
			payload: { sourceId: s.sourceId, online: true },
		});
	};

	const sceneAssociationsFor = (sceneId: string) =>
		associations.filter((a) => a.targetKind === 'scene' && a.targetId === sceneId);

	const bindScene = (sceneId: string, sceneName: string) => {
		if (!webStreamSource) return;
		dispatch({
			type: 'audio.associate-scene',
			actorId: dmId,
			payload: {
				targetKind: 'scene',
				targetId: sceneId,
				presetKind: 'ambient',
				label: `${sceneName} ambience`,
				sourceId: webStreamSource.sourceId,
			},
		});
	};

	const unbindScene = (associationId: string) =>
		dispatch({ type: 'audio.disassociate-scene', actorId: dmId, payload: { associationId } });

	const masterPct = track ? Math.round(track.volume * 100) : 100;

	return (
		<Page max={1200}>
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
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12.5px ${T.sans}`, color: T.sub }}>
					<StatusDot status={playing ? 'live' : 'idle'} pulse={playing} /> {track ? (playing ? 'Playing' : 'Paused') : 'Idle'}
				</div>
				{track && (
					<div style={{ display: 'flex', gap: 7 }}>
						{playing ? (
							<Button variant="ghost" size="sm" icon="pause" disabled={!canEdit} onClick={() => dispatch({ type: 'session.audio.pause', actorId: dmId, payload: {} })}>
								Pause
							</Button>
						) : (
							<Button variant="ghost" size="sm" icon="play" disabled={!canEdit} onClick={() => dispatch({ type: 'session.audio.resume', actorId: dmId, payload: {} })}>
								Resume
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" disabled={!canEdit} onClick={() => dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} })}>
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
					<Fader
						value={masterPct}
						disabled={!track || !canEdit}
						onChange={(v) => dispatch({ type: 'session.audio.set-volume', actorId: dmId, payload: { volume: v / 100 } })}
					/>
					<span style={{ font: `12px ${T.mono}`, color: T.sub, width: 30, textAlign: 'right' }}>{masterPct}</span>
				</div>
				{/* The device-output driver's honest silent states — the durable track says "playing", this
				    line says why THIS device is (or isn't) actually sounding. Nothing fancy by design. */}
				{track && (playbackState.status === 'blocked' || playbackState.status === 'no-stream' || playbackState.status === 'error') && (
					<div role="status" style={{ flexBasis: '100%', font: `11.5px/1.5 ${T.sans}`, color: T.ter, display: 'flex', alignItems: 'center', gap: 6 }}>
						<Icon name="audio" size={13} color={T.ter} /> {playbackState.detail}
					</div>
				)}
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
					{/* soundboard — real library assets; each tile dispatches session.audio.play */}
					<Panel
						title="Soundboard"
						action={<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</span>}
					>
						{assets.length === 0 ? (
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter, padding: '8px 2px' }}>
								The audio asset library is empty. Add a stream track below to get audible session audio right away —
								importing local files needs asset-byte storage this prototype doesn’t have yet, so file upload is not wired.
							</div>
						) : (
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
								{assets.map((a) => {
									const lit = pulse === a.id;
									return (
										<button
											key={a.id}
											type="button"
											onClick={() => playAsset(a)}
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
												transition: 'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
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
													color: T.acc,
												}}
											>
												<Icon name="play" size="md" />
											</span>
											<span style={{ flex: 1, minWidth: 0 }}>
												<span style={{ display: 'block', font: `600 13px ${T.sans}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title || a.fileName}</span>
												<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>{a.tags.length ? a.tags.join(' · ') : a.mimeType}</span>
											</span>
											{a.needsLicenseReview && <VisibilityChip level="dm-only" compact />}
										</button>
									);
								})}
							</div>
						)}
					</Panel>

					{/* tracks & sources — ADD a source in-app (audio.configure-source) + play a stream directly */}
					<Panel
						title="Tracks &amp; sources"
						action={<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{sources.length} {sources.length === 1 ? 'source' : 'sources'}</span>}
					>
						{canEdit ? (
							<form onSubmit={addTrack} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
								<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
									<Field label="Track name" htmlFor="audio-track-name" required>
										<Input
											id="audio-track-name"
											value={trackName}
											onChange={(e: { target: { value: string } }) => setTrackName(e.target.value)}
											placeholder="Tavern murmur"
										/>
									</Field>
									<Field label="Kind" htmlFor="audio-track-kind">
										<Select
											id="audio-track-kind"
											value={trackKind}
											onChange={(e: { target: { value: string } }) => setTrackKind(e.target.value as SourceKind)}
											options={[...SOURCE_KIND_OPTIONS]}
										/>
									</Field>
								</div>
								<Field
									label="Stream URL"
									htmlFor="audio-track-url"
									required={trackKind === 'web-stream'}
									help={
										trackKind === 'web-stream'
											? 'A direct audio URL — the stream is the track, no file import needed.'
											: 'Only web streams take a URL. Local kinds need imported asset files (file upload is not wired — no asset-byte storage yet).'
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
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
									<Button type="submit" variant="secondary" size="sm" icon="add" disabled={addBusy || !trackName.trim()}>
										{addBusy ? 'Adding…' : 'Add track'}
									</Button>
									{addError && (
										<span role="status" style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}>{addError}</span>
									)}
									{!addError && addedName && (
										<span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: `11.5px ${T.sans}`, color: 'var(--color-status-success-text)' }}>
											<Icon name="success" size="sm" /> “{addedName}” added
										</span>
									)}
								</div>
							</form>
						) : (
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
								Audio configuration is DM-only{previewing ? ' — exit preview to add tracks.' : '.'}
							</div>
						)}
						{sources.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								{sources.map((s) => {
									const streamPlayable = s.type === 'web-stream' && s.playbackEnabled;
									const isActive = track?.sourceId === s.sourceId;
									return (
										<div key={s.sourceId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: `1px solid ${isActive ? T.accBd : T.bd}`, borderRadius: 9, background: T.surf }}>
											<Icon name="audio" size={15} color={s.playbackEnabled ? T.acc : T.ter} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ font: `600 12.5px ${T.sans}` }}>{s.displayName}</div>
												<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{s.type} · {s.cacheBehavior} · {s.offlineAvailability}</div>
											</div>
											<Badge status={s.playbackEnabled ? 'success' : 'neutral'}>{s.playbackEnabled ? 'Playback ready' : 'Disabled'}</Badge>
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
												<span style={{ font: `10.5px ${T.sans}`, color: T.ter }} title="Playing this kind needs an imported asset — file import is not wired (no asset-byte storage).">
													Needs asset
												</span>
											)}
										</div>
									);
								})}
							</div>
						)}
					</Panel>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
					{/* ambience mixer — honest-local (no core command for a per-layer mix) */}
					<Panel
						title="Ambience mixer"
						action={<Badge status="neutral">{ambience.filter((a) => a.on).length} layered</Badge>}
					>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
							Local preview only — session audio is a single authoritative track, so per-layer levels have no Core command.
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
							{ambience.map((a) => (
								<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
									<button
										type="button"
										onClick={() => setAmbience((list) => list.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x)))}
										aria-label={a.on ? 'Mute' : 'Unmute'}
										style={{
											width: 32,
											height: 32,
											borderRadius: 8,
											flex: '0 0 auto',
											cursor: 'pointer',
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											border: `1px solid ${a.on ? T.accBd : T.bd}`,
											background: a.on ? T.accSub : T.alt,
											color: a.on ? T.acc : T.ter,
										}}
									>
										<Icon name={a.icon} size="sm" />
									</button>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
											<span style={{ font: `600 12.5px ${T.sans}`, color: a.on ? T.ink : T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
											{a.dm && <VisibilityChip level="dm-only" compact />}
										</div>
										<Fader
											value={a.vol}
											onChange={(v) => setAmbience((list) => list.map((x) => (x.id === a.id ? { ...x, vol: v } : x)))}
											accent={a.on ? T.acc : T.ter}
										/>
									</div>
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter, width: 26, textAlign: 'right' }}>{a.vol}</span>
								</div>
							))}
						</div>
					</Panel>

					{/* scene bindings — real AUDIO-001 associations */}
					<Panel title="Scene bindings">
						{scenes.length === 0 && <div style={{ font: `12px ${T.sans}`, color: T.ter }}>No scenes yet.</div>}
						{scenes.map((s, i) => {
							const bound = sceneAssociationsFor(s.id);
							return (
								<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
									<Icon name="scene" size={16} color={bound.length ? T.acc : T.ter} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `600 12.5px ${T.sans}` }}>{s.name}</div>
										<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{bound.length} {bound.length === 1 ? 'cue' : 'cues'}</div>
									</div>
									{bound.length ? (
										<Button variant="ghost" size="sm" icon="close" onClick={() => unbindScene(bound[0].id)}>
											Unbind
										</Button>
									) : (
										<Button variant="ghost" size="sm" icon="link" disabled={!webStreamSource} onClick={() => bindScene(s.id, s.name)}>
											Bind
										</Button>
									)}
								</div>
							);
						})}
						{!webStreamSource && scenes.length > 0 && (
							<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
								Add a web-stream track (in Tracks &amp; sources) to bind scenes.
							</div>
						)}
					</Panel>
				</div>
			</div>
		</Page>
	);
}
