import { useMemo, useState } from 'react';
import {
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioAssociationsForActor,
	listAudioSourceClassificationsForActor,
	listScenesForActor,
	type AudioAssetView,
} from '@dndtools/core';
import { Badge, Button, Icon, StatusDot, VisibilityChip } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Audio — soundboard + session-audio transport, now wired to the live Processing Core (was static
 * `mockCampaign`). The now-playing strip reflects the durable SESSION-OWNED track (`getSessionAudioView`),
 * the soundboard plays real library assets (`listAudioAssetsForActor` → `session.audio.play`), the master
 * fader sets the AUTHORITATIVE session volume (`session.audio.set-volume`), and scene bindings are real
 * AUDIO-001 associations (`audio.associate-scene` / `disassociate-scene`). All audio config is DM-only —
 * a non-DM device receives empty lists (fail closed). A fresh vault seeds no audio, so empty states are
 * honest, and a one-click `audio.configure-source` gives the screen a real, dispatchable source.
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

export function Audio() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const state = runtime.state;

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

	const configureSource = () =>
		dispatch({
			type: 'audio.configure-source',
			actorId: dmId,
			payload: {
				type: 'web-stream',
				displayName: 'Ambience Stream',
				url: 'https://stream.dndtools.local/ambience',
				cacheBehavior: 'cache-required',
			},
		});

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
							<Button variant="ghost" size="sm" icon="pause" onClick={() => dispatch({ type: 'session.audio.pause', actorId: dmId, payload: {} })}>
								Pause
							</Button>
						) : (
							<Button variant="ghost" size="sm" icon="play" onClick={() => dispatch({ type: 'session.audio.resume', actorId: dmId, payload: {} })}>
								Resume
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" onClick={() => dispatch({ type: 'session.audio.stop', actorId: dmId, payload: {} })}>
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
						disabled={!track}
						onChange={(v) => dispatch({ type: 'session.audio.set-volume', actorId: dmId, payload: { volume: v / 100 } })}
					/>
					<span style={{ font: `12px ${T.mono}`, color: T.sub, width: 30, textAlign: 'right' }}>{masterPct}</span>
				</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
				{/* soundboard — real library assets; each tile dispatches session.audio.play */}
				<Panel
					title="Soundboard"
					action={<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{assets.length} {assets.length === 1 ? 'asset' : 'assets'}</span>}
				>
					{assets.length === 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 2px' }}>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
								The audio library is empty. Configure a source, then import assets to it. Importing assets requires
								file bytes (a real file picker), so it is not wired on this prototype surface — but a source is.
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
								<Button variant="secondary" size="sm" icon="add" onClick={configureSource}>
									Configure web-stream source
								</Button>
								{sources.length > 0 && (
									<span style={{ font: `11.5px ${T.sans}`, color: T.sub }}>
										{sources.length} {sources.length === 1 ? 'source' : 'sources'} configured
									</span>
								)}
							</div>
							{sources.length > 0 && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
									{sources.map((s) => (
										<div key={s.sourceId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: `1px solid ${T.bd}`, borderRadius: 9, background: T.surf }}>
											<Icon name="audio" size={15} color={s.playbackEnabled ? T.acc : T.ter} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ font: `600 12.5px ${T.sans}` }}>{s.displayName}</div>
												<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{s.type} · {s.cacheBehavior} · {s.offlineAvailability}</div>
											</div>
											<Badge status={s.playbackEnabled ? 'success' : 'neutral'}>{s.playbackEnabled ? 'Playback ready' : 'Disabled'}</Badge>
										</div>
									))}
								</div>
							)}
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
								Configure a web-stream source (in the soundboard) to bind scenes.
							</div>
						)}
					</Panel>
				</div>
			</div>
		</Page>
	);
}
