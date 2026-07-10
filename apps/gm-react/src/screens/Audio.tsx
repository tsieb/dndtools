import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
	AUDIO_AUTOMATION_ACTIONS,
	AUDIO_AUTOMATION_TRIGGER_KINDS,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioAssociationsForActor,
	listAudioAutomationRulesForActor,
	listAudioSourceClassificationsForActor,
	listScenesForActor,
	resolveAudioAutomationForActor,
	type AudioAssetView,
	type AudioAutomationAction,
	type AudioAutomationOutcome,
	type AudioAutomationRule,
	type AudioAutomationTriggerKind,
	type AudioSourceClassification,
} from '@dndtools/core';
import { Badge, Button, EmptyState, Field, Icon, Input, Select, StatusDot, Switch, Tabs, Toaster, VisibilityChip } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { ensureAudioPlayback } from '../runtime/audio-playback';
import { AUDIO_IMPORT_ACCEPT, importAudioFile } from '../runtime/audio-import';
import { pickBinaryFile } from '../platform/filePick';
import { hasAssetBytes } from '../platform/storage/assetStore';

/**
 * Audio — soundboard + session-audio transport, wired to the live Processing Core. The now-playing
 * strip reflects the durable SESSION-OWNED track (`getSessionAudioView`), the soundboard plays real
 * library assets (`session.audio.play`), the master fader sets the AUTHORITATIVE session volume, and
 * scene bindings are real AUDIO-001 associations. All audio config is DM-only — a non-DM device
 * receives empty lists (fail closed), and every write is disabled while previewing.
 *
 * AUDIBLE playback: mounting this screen starts the app-lifetime device-output driver
 * (`runtime/audio-playback.ts`), which follows the authoritative session state and drives real
 * `<audio>` elements — the primary track plus one looped element per ambience layer. Local-file
 * tracks resolve their content-addressed bytes from the device asset-byte store; missing bytes are an
 * honest `no-stream` state, never a crash or a substituted track.
 *
 * IMPORT is real (AUDIO-004): "Import audio…" picks a local file, stores its bytes in the asset-byte
 * store, and dispatches `audio.import-asset` (content-addressed — identical bytes dedupe). The
 * AMBIENCE MIXER is real session state (`session.audioPlayback.ambienceLayers` via
 * `session.audio.set-ambience-layer` / `remove-ambience-layer`). OUTPUT ROUTING records the DM's
 * device pick via `session.audio.set-output-device`; the driver applies `setSinkId`, feature-detected
 * with honest degradation (AUDIO-012). The AUTOMATION tab surfaces the AUDIO-005 rules
 * (`audio.configure-automation` / `delete-automation`) with each rule's deterministic resolution from
 * the core resolver — a blocked rule is flagged, never silently bypassed.
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

const SOURCE_KIND_OPTIONS = [
	{ value: 'web-stream', label: 'Web stream (URL)' },
	{ value: 'bundled-preset', label: 'Bundled preset' },
	{ value: 'local-file', label: 'Local file library' },
] as const;
type SourceKind = (typeof SOURCE_KIND_OPTIONS)[number]['value'];

const TRIGGER_LABELS: Record<AudioAutomationTriggerKind, string> = {
	'combat-start': 'Combat starts',
	'map-reveal': 'Map reveal',
	'scene-activation': 'Scene activation',
	'handout-delivery': 'Handout delivery',
};
const ACTION_LABELS: Record<AudioAutomationAction, string> = {
	play: 'Play',
	crossfade: 'Crossfade',
	stop: 'Stop',
};

/** Whether this browser can switch `<audio>` output devices at all (Firefox can't, e.g.). */
const SUPPORTS_SINK_SELECTION =
	typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Live map of which library assets actually have BYTES in the device asset-byte store (honest,
 *  async). Recomputed whenever the asset id set changes (an import adds both metadata and bytes). */
function useAssetBytesPresence(assetIds: string[]): Record<string, boolean> {
	const [presence, setPresence] = useState<Record<string, boolean>>({});
	const key = [...assetIds].sort().join('\n');
	useEffect(() => {
		const ids = key ? key.split('\n') : [];
		if (ids.length === 0) {
			setPresence({});
			return;
		}
		let cancelled = false;
		void Promise.all(
			ids.map(async (id) => [id, await hasAssetBytes(id).catch(() => false)] as const),
		).then((pairs) => {
			if (!cancelled) setPresence(Object.fromEntries(pairs));
		});
		return () => {
			cancelled = true;
		};
	}, [key]);
	return presence;
}

interface OutputDeviceOption {
	deviceId: string;
	label: string;
}

/** Enumerate the device's audio OUTPUTS (feature-detected; refreshed on devicechange). */
function useAudioOutputDevices(enabled: boolean): { outputs: OutputDeviceOption[]; note: string | null } {
	const [outputs, setOutputs] = useState<OutputDeviceOption[]>([]);
	const [note, setNote] = useState<string | null>(null);
	useEffect(() => {
		if (!enabled) return;
		const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
		if (!media?.enumerateDevices) {
			setNote('This browser does not expose audio output devices.');
			return;
		}
		let cancelled = false;
		const refresh = () => {
			media.enumerateDevices().then(
				(devices) => {
					if (cancelled) return;
					const outs = devices.filter((d) => d.kind === 'audiooutput');
					setOutputs(outs.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output device ${i + 1}` })));
					setNote(
						outs.some((d) => !d.label)
							? 'Device names appear once the browser has granted media permission; unnamed outputs still work.'
							: null,
					);
				},
				() => {
					if (!cancelled) setNote('Output devices could not be enumerated on this browser.');
				},
			);
		};
		refresh();
		media.addEventListener?.('devicechange', refresh);
		return () => {
			cancelled = true;
			media.removeEventListener?.('devicechange', refresh);
		};
	}, [enabled]);
	return { outputs, note };
}

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
	const dmView = audioView.role === 'dm' ? audioView : null;
	const assets = useMemo(() => listAudioAssetsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const sources = useMemo(() => listAudioSourceClassificationsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const associations = useMemo(() => listAudioAssociationsForActor(state.audio, state.permissions, dmId), [state.audio, state.permissions, dmId]);
	const automationRules = useMemo(
		() => listAudioAutomationRulesForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);
	const scenes = useMemo(
		() => listScenesForActor(state.scenes, state.permissions, dmId).filter((s) => !s.isTemplate),
		[state.scenes, state.permissions, dmId],
	);

	// Honest per-asset BYTE presence on this device — drives the soundboard availability inputs and
	// the automation resolution, so a track whose bytes were never imported (or were evicted) is
	// reported instead of pretended.
	const bytesPresence = useAssetBytesPresence(useMemo(() => assets.map((a) => a.id), [assets]));

	const track = audioView.track;
	const playing = track?.status === 'playing';
	const trackLabel = track
		? (track.assetId ? assets.find((a) => a.id === track.assetId)?.title : undefined) ??
			sources.find((s) => s.sourceId === track.sourceId)?.displayName ??
			track.assetId ??
			track.sourceId
		: 'Nothing playing';
	const webStreamSource = sources.find((s) => s.type === 'web-stream');

	const [tab, setTab] = useState<'playback' | 'automation'>('playback');
	const [pulse, setPulse] = useState<string | null>(null);
	const [playError, setPlayError] = useState<string | null>(null);

	// Add-track form (audio.configure-source — the same declared-cache path the demo seed uses).
	const [trackName, setTrackName] = useState('');
	const [trackUrl, setTrackUrl] = useState('');
	const [trackKind, setTrackKind] = useState<SourceKind>('web-stream');
	const [addBusy, setAddBusy] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [addedName, setAddedName] = useState<string | null>(null);

	// Local file import (audio.import-asset + the device asset-byte store).
	const [importBusy, setImportBusy] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);

	const dispatch = (command: Parameters<typeof runtime.dispatch>[0]) => {
		void runtime.dispatch(command);
	};

	const importAudio = async () => {
		if (importBusy || !canEdit) return;
		setImportError(null);
		const picked = await pickBinaryFile(AUDIO_IMPORT_ACCEPT);
		if (!picked) return;
		setImportBusy(true);
		try {
			const outcome = await importAudioFile(runtime, dmId, { name: picked.name, mime: picked.mime, bytes: picked.bytes });
			if (!outcome.ok) {
				setImportError(outcome.message);
				return;
			}
			Toaster.success(
				outcome.deduped
					? `“${outcome.title}” was already in the library — metadata refreshed, bytes deduped.`
					: `“${outcome.title}” imported to the soundboard.`,
			);
			if (outcome.needsLicenseReview) {
				Toaster.warning(`“${outcome.title}” has no declared license — review it before sharing or export.`);
			}
		} finally {
			setImportBusy(false);
		}
	};

	const playAsset = async (asset: AudioAssetView) => {
		setPulse(asset.id);
		setTimeout(() => setPulse((p) => (p === asset.id ? null : p)), 360);
		setPlayError(null);
		const bytesReady = bytesPresence[asset.id] === true;
		const result = await runtime.dispatch({
			type: 'session.audio.play',
			actorId: dmId,
			payload: {
				sourceId: asset.sourceId,
				assetId: asset.id,
				// Honest device inputs: the AUDIO-010 gate sees the REAL byte presence, so a track whose
				// file is not on this device is rejected with a reason instead of "playing" silently.
				assetLocallyAvailable: bytesReady,
				assetCached: bytesReady,
				online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
			},
		});
		if (result.status !== 'accepted') setPlayError(result.rejection.message);
	};

	// ADD TRACK — configure a declared source, exactly as the demo seed does for the now-playing stream.
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

	// Play a configured STREAM source as the session track (the stream IS the track).
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

	// ── Ambience mixer (REAL session state: session.audioPlayback.ambienceLayers) ────────────────
	const ambienceLayers = useMemo(
		() => Object.entries(audioView.ambienceLayers).sort(([a], [b]) => a.localeCompare(b)),
		[audioView.ambienceLayers],
	);
	const [ambienceSourceId, setAmbienceSourceId] = useState('');
	const [ambienceError, setAmbienceError] = useState<string | null>(null);
	const layerSources = sources.filter((s) => s.playbackEnabled);

	const setLayer = async (layerId: string, sourceId: string, volume: number, muted: boolean) => {
		setAmbienceError(null);
		const result = await runtime.dispatch({
			type: 'session.audio.set-ambience-layer',
			actorId: dmId,
			payload: { layerId, sourceId, volume, muted },
		});
		if (result.status !== 'accepted') setAmbienceError(result.rejection.message);
	};

	const addAmbienceLayer = async () => {
		const sourceId = ambienceSourceId || layerSources[0]?.sourceId;
		if (!sourceId || !canEdit) return;
		await setLayer(runtime.newId(), sourceId, 0.5, false);
	};

	const removeLayer = async (layerId: string) => {
		setAmbienceError(null);
		const result = await runtime.dispatch({
			type: 'session.audio.remove-ambience-layer',
			actorId: dmId,
			payload: { layerId },
		});
		if (result.status !== 'accepted') setAmbienceError(result.rejection.message);
	};

	// ── Output device routing (session.audio.set-output-device + driver setSinkId) ───────────────
	const { outputs, note: outputsNote } = useAudioOutputDevices(SUPPORTS_SINK_SELECTION);
	const selectedOutputId = dmView?.outputDevice?.deviceId ?? '';
	const outputOptions = useMemo(() => {
		const options = [{ value: '', label: 'Platform default' }, ...outputs.map((o) => ({ value: o.deviceId, label: o.label }))];
		// A stored selection whose device is currently unplugged still shows honestly (and can be cleared).
		if (selectedOutputId && !outputs.some((o) => o.deviceId === selectedOutputId)) {
			options.push({
				value: selectedOutputId,
				label: `${dmView?.outputDevice?.label ?? 'Saved device'} (not connected)`,
			});
		}
		return options;
	}, [outputs, selectedOutputId, dmView?.outputDevice?.label]);

	const chooseOutput = (deviceId: string) => {
		const device = outputs.find((o) => o.deviceId === deviceId);
		dispatch({
			type: 'session.audio.set-output-device',
			actorId: dmId,
			payload: {
				deviceId: deviceId || null,
				...(deviceId && device?.label ? { label: device.label } : {}),
			},
		});
	};

	// ── Automation (AUDIO-005: audio.configure-automation / delete-automation + the resolver) ────
	// Each ENABLED rule's deterministic resolution against the CURRENT library + this device's real
	// byte presence — exactly what the core resolver would compute if the trigger fired now.
	const ruleOutcomes = useMemo(() => {
		const map = new Map<string, AudioAutomationOutcome>();
		for (const rule of automationRules) {
			if (!rule.enabled) continue;
			const bytesReady = rule.assetId ? bytesPresence[rule.assetId] === true : true;
			const resolution = resolveAudioAutomationForActor(state.audio, state.permissions, dmId, {
				kind: rule.trigger,
				scopeId: rule.triggerScopeId,
				online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
				assetLocallyAvailable: bytesReady,
				assetCached: bytesReady,
				cacheEvicted: false,
			});
			const outcome = resolution?.outcomes.find((o) => o.ruleId === rule.id);
			if (outcome) map.set(rule.id, outcome);
		}
		return map;
	}, [automationRules, state.audio, state.permissions, dmId, bytesPresence]);

	const [ruleLabel, setRuleLabel] = useState('');
	const [ruleTrigger, setRuleTrigger] = useState<AudioAutomationTriggerKind>('combat-start');
	const [ruleScopeId, setRuleScopeId] = useState('');
	const [ruleAction, setRuleAction] = useState<AudioAutomationAction>('play');
	const [ruleSourceId, setRuleSourceId] = useState('');
	const [ruleAssetId, setRuleAssetId] = useState('');
	const [ruleBusy, setRuleBusy] = useState(false);
	const [ruleError, setRuleError] = useState<string | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

	const ruleFormSourceId = ruleSourceId || sources[0]?.sourceId || '';
	const ruleSourceAssets = assets.filter((a) => a.sourceId === ruleFormSourceId);

	const createRule = async (e: FormEvent) => {
		e.preventDefault();
		if (ruleBusy || !canEdit || !ruleFormSourceId) return;
		setRuleBusy(true);
		setRuleError(null);
		try {
			const result = await runtime.dispatch({
				type: 'audio.configure-automation',
				actorId: dmId,
				payload: {
					...(ruleLabel.trim() ? { label: ruleLabel.trim() } : {}),
					trigger: ruleTrigger,
					triggerScopeId: ruleTrigger === 'scene-activation' && ruleScopeId ? ruleScopeId : null,
					action: ruleAction,
					sourceId: ruleFormSourceId,
					assetId: ruleAction !== 'stop' && ruleAssetId ? ruleAssetId : null,
				},
			});
			if (result.status === 'accepted') {
				Toaster.success('Automation rule saved.');
				setRuleLabel('');
				setRuleScopeId('');
				setRuleAssetId('');
			} else {
				setRuleError(result.rejection.message);
			}
		} finally {
			setRuleBusy(false);
		}
	};

	const toggleRuleEnabled = (rule: AudioAutomationRule, enabled: boolean) =>
		dispatch({
			type: 'audio.configure-automation',
			actorId: dmId,
			payload: {
				ruleId: rule.id,
				label: rule.label,
				enabled,
				trigger: rule.trigger,
				triggerScopeId: rule.triggerScopeId,
				action: rule.action,
				sourceId: rule.sourceId,
				assetId: rule.assetId,
			},
		});

	const deleteRule = async (rule: AudioAutomationRule) => {
		setConfirmingDeleteId(null);
		const result = await runtime.dispatch({
			type: 'audio.delete-automation',
			actorId: dmId,
			payload: { ruleId: rule.id },
		});
		if (result.status === 'accepted') Toaster.success(`Automation “${rule.label}” deleted.`);
		else Toaster.error(result.rejection.message);
	};

	/** Dispatch a rule's RESOLVED command request through the core (AUDIO-005 AC1) — DM-initiated. */
	const runRuleNow = async (rule: AudioAutomationRule) => {
		const outcome = ruleOutcomes.get(rule.id);
		if (!outcome || outcome.status !== 'requested') return;
		const bytesReady = rule.assetId ? bytesPresence[rule.assetId] === true : true;
		const result = await runtime.dispatch(
			outcome.request.action === 'stop'
				? { type: 'session.audio.stop', actorId: dmId, payload: {} }
				: {
						type: 'session.audio.play',
						actorId: dmId,
						payload: {
							sourceId: outcome.request.sourceId,
							assetId: outcome.request.assetId,
							crossfadeSeconds: outcome.request.action === 'crossfade' ? 2 : 0,
							assetLocallyAvailable: bytesReady,
							assetCached: bytesReady,
							online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
						},
					},
		);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
	};

	const sceneNameById = (id: string | null): string | null =>
		id === null ? null : (scenes.find((s) => s.id === id)?.name ?? id);

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

			<Tabs
				tabs={[
					{ id: 'playback', label: 'Playback', icon: 'audio' },
					{ id: 'automation', label: 'Automation', icon: 'wand' },
				]}
				value={tab}
				onChange={(id: string) => setTab(id as 'playback' | 'automation')}
				style={{ marginBottom: 18 }}
			/>

			{tab === 'playback' && (
				<div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
						{/* soundboard — real library assets; each tile dispatches session.audio.play */}
						<Panel
							title="Soundboard"
							action={
								<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
									<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{assets.length} {assets.length === 1 ? 'asset' : 'assets'}
									</span>
									<Button variant="secondary" size="sm" icon="import" disabled={!canEdit || importBusy} onClick={() => void importAudio()}>
										{importBusy ? 'Importing…' : 'Import audio…'}
									</Button>
								</div>
							}
						>
							{importError && (
								<div role="status" style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}>{importError}</div>
							)}
							{assets.length === 0 ? (
								<EmptyState
									inset
									icon="audio"
									title="The audio library is empty."
									description="Import a local audio file to build your soundboard, or add a stream track below — either becomes real session audio."
									action={
										canEdit ? (
											<Button variant="secondary" size="sm" icon="import" disabled={importBusy} onClick={() => void importAudio()}>
												{importBusy ? 'Importing…' : 'Import audio…'}
											</Button>
										) : undefined
									}
								/>
							) : (
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
									{assets.map((a) => {
										const lit = pulse === a.id;
										const bytesReady = bytesPresence[a.id] === true;
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
														color: bytesReady ? T.acc : T.ter,
													}}
												>
													<Icon name="play" size="md" />
												</span>
												<span style={{ flex: 1, minWidth: 0 }}>
													<span style={{ display: 'block', font: `600 13px ${T.sans}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title || a.fileName}</span>
													<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>
														{bytesReady ? (a.tags.length ? a.tags.join(' · ') : a.mimeType) : 'File bytes missing on this device — re-import to restore'}
													</span>
												</span>
												{a.needsLicenseReview && <VisibilityChip level="dm-only" compact />}
											</button>
										);
									})}
								</div>
							)}
							{playError && (
								<div role="status" style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}>{playError}</div>
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
													<span style={{ font: `10.5px ${T.sans}`, color: T.ter }} title="Play this source's imported files from the soundboard above.">
														Via soundboard
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
						{/* ambience mixer — REAL session state (set-ambience-layer / remove-ambience-layer) */}
						<Panel
							title="Ambience mixer"
							action={<Badge status="neutral">{ambienceLayers.filter(([, l]) => !l.muted).length} live</Badge>}
						>
							<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
								Looping beds mixed under the main track — session-authoritative, synced like the track itself.
							</div>
							{ambienceLayers.length === 0 && (
								<EmptyState
									inset
									icon="audio"
									title="No ambience layers."
									description="Add a looping bed (rain, tavern murmur) under the main track from any playback-ready source."
								/>
							)}
							<div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
								{ambienceLayers.map(([layerId, layer]) => {
									const sourceName = sources.find((s) => s.sourceId === layer.sourceId)?.displayName ?? layer.sourceId;
									const device = playbackState.ambience.find((l) => l.layerId === layerId);
									const on = !layer.muted;
									return (
										<div key={layerId} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
											<button
												type="button"
												disabled={!canEdit}
												onClick={() => void setLayer(layerId, layer.sourceId, layer.volume, !layer.muted)}
												aria-label={on ? `Mute ${sourceName}` : `Unmute ${sourceName}`}
												style={{
													width: 32,
													height: 32,
													borderRadius: 8,
													flex: '0 0 auto',
													cursor: canEdit ? 'pointer' : 'default',
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center',
													border: `1px solid ${on ? T.accBd : T.bd}`,
													background: on ? T.accSub : T.alt,
													color: on ? T.acc : T.ter,
												}}
											>
												<Icon name="audio" size="sm" />
											</button>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
													<span style={{ font: `600 12.5px ${T.sans}`, color: on ? T.ink : T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sourceName}</span>
													{device && !device.sounding && device.detail && device.detail !== 'Muted.' && (
														<span style={{ font: `10.5px ${T.sans}`, color: T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={device.detail}>
															{device.detail}
														</span>
													)}
												</div>
												<Fader
													value={Math.round(layer.volume * 100)}
													disabled={!canEdit}
													onChange={(v) => void setLayer(layerId, layer.sourceId, v / 100, layer.muted)}
													accent={on ? T.acc : T.ter}
												/>
											</div>
											<span style={{ font: `11.5px ${T.mono}`, color: T.ter, width: 26, textAlign: 'right' }}>{Math.round(layer.volume * 100)}</span>
											<Button variant="ghost" size="sm" icon="close" disabled={!canEdit} aria-label={`Remove ${sourceName} layer`} onClick={() => void removeLayer(layerId)} />
										</div>
									);
								})}
							</div>
							{canEdit && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
									<div style={{ flex: 1 }}>
										<Select
											aria-label="Ambience layer source"
											value={ambienceSourceId || layerSources[0]?.sourceId || ''}
											onChange={(e: { target: { value: string } }) => setAmbienceSourceId(e.target.value)}
											options={layerSources.map((s) => ({ value: s.sourceId, label: s.displayName }))}
											disabled={layerSources.length === 0}
										/>
									</div>
									<Button variant="secondary" size="sm" icon="add" disabled={layerSources.length === 0} onClick={() => void addAmbienceLayer()}>
										Add layer
									</Button>
								</div>
							)}
							{canEdit && layerSources.length === 0 && (
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									No playback-ready sources yet — import an audio file or add a stream track first.
								</div>
							)}
							{ambienceError && (
								<div role="status" style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}>{ambienceError}</div>
							)}
						</Panel>

						{/* output device — session.audio.set-output-device; the driver applies setSinkId */}
						<Panel title="Output device">
							{!SUPPORTS_SINK_SELECTION ? (
								<div style={{ font: `12px/1.55 ${T.sans}`, color: T.ter }}>
									This browser cannot route audio to a specific output device (no <code>setSinkId</code> — e.g.
									Firefox). Session audio uses the platform default output.
								</div>
							) : (
								<>
									<Field label="Session host output" htmlFor="audio-output-device" help="Where THIS device plays session audio. Player devices route locally — this never changes theirs.">
										<Select
											id="audio-output-device"
											value={selectedOutputId}
											disabled={!canEdit}
											onChange={(e: { target: { value: string } }) => chooseOutput(e.target.value)}
											options={outputOptions}
										/>
									</Field>
									{outputsNote && <div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>{outputsNote}</div>}
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `11.5px ${T.sans}`, color: T.sub }}>
										<StatusDot status={playbackState.routing === 'unavailable' ? 'warn' : 'idle'} />
										{playbackState.routing === 'routed'
											? 'Routed to the selected device.'
											: playbackState.routing === 'unavailable'
												? (playbackState.routingDetail ?? 'Routing unavailable — using the platform default output.')
												: 'Platform default output.'}
									</div>
								</>
							)}
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
			)}

			{tab === 'automation' && (
				<div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'start' }}>
					<Panel
						title="Automation rules"
						action={<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{automationRules.length} {automationRules.length === 1 ? 'rule' : 'rules'}</span>}
					>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							Each rule maps a session event to a declared audio command. The status below is the core
							resolver&rsquo;s deterministic verdict against the current library and this device&rsquo;s real file
							availability — a blocked rule is flagged, never silently bypassed.
						</div>
						{automationRules.length === 0 && (
							<EmptyState
								inset
								icon="wand"
								title="No automation rules."
								description="Map a session event — combat starting, a scene activating — to an audio cue with the form beside."
							/>
						)}
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							{automationRules.map((rule) => {
								const outcome = ruleOutcomes.get(rule.id);
								const sourceName = sources.find((s) => s.sourceId === rule.sourceId)?.displayName ?? rule.sourceId;
								const assetName = rule.assetId ? (assets.find((a) => a.id === rule.assetId)?.title ?? rule.assetId) : null;
								const scopeName = rule.trigger === 'scene-activation' ? sceneNameById(rule.triggerScopeId) : rule.triggerScopeId;
								const confirming = confirmingDeleteId === rule.id;
								return (
									<div key={rule.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 9, background: T.surf }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
											<Icon name="wand" size={15} color={rule.enabled ? T.acc : T.ter} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ font: `600 12.5px ${T.sans}`, color: rule.enabled ? T.ink : T.ter }}>{rule.label}</div>
												<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
													{TRIGGER_LABELS[rule.trigger]}
													{scopeName ? ` (${scopeName})` : ' (any)'} → {ACTION_LABELS[rule.action]} · {sourceName}
													{assetName ? ` · ${assetName}` : ''}
												</div>
											</div>
											{!rule.enabled ? (
												<Badge status="neutral">Disabled</Badge>
											) : outcome?.status === 'requested' ? (
												<Badge status="success">Ready</Badge>
											) : outcome?.status === 'blocked' ? (
												<Badge status="warning">Blocked</Badge>
											) : null}
											<Switch checked={rule.enabled} disabled={!canEdit} onChange={(v: boolean) => toggleRuleEnabled(rule, v)} aria-label={`Enable ${rule.label}`} />
											{outcome?.status === 'requested' && (
												<Button variant="ghost" size="sm" icon="play" disabled={!canEdit} aria-label={`Run ${rule.label} now`} onClick={() => void runRuleNow(rule)}>
													Run now
												</Button>
											)}
											{confirming ? (
												<span style={{ display: 'inline-flex', gap: 4 }}>
													<Button variant="danger" size="sm" onClick={() => void deleteRule(rule)}>
														Delete
													</Button>
													<Button variant="ghost" size="sm" onClick={() => setConfirmingDeleteId(null)}>
														Keep
													</Button>
												</span>
											) : (
												<Button variant="ghost" size="sm" icon="delete" disabled={!canEdit} aria-label={`Delete ${rule.label}`} onClick={() => setConfirmingDeleteId(rule.id)} />
											)}
										</div>
										{rule.enabled && outcome?.status === 'blocked' && (
											<div role="status" style={{ font: `11px/1.5 ${T.sans}`, color: 'var(--color-status-warning-text)' }}>{outcome.message}</div>
										)}
									</div>
								);
							})}
						</div>
					</Panel>

					<Panel title="New rule">
						{canEdit ? (
							<form onSubmit={createRule} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
								<Field label="Label" htmlFor="automation-label" help="Optional — defaults to “action on trigger”.">
									<Input
										id="automation-label"
										value={ruleLabel}
										onChange={(e: { target: { value: string } }) => setRuleLabel(e.target.value)}
										placeholder="Battle drums on combat"
									/>
								</Field>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
									<Field label="When" htmlFor="automation-trigger">
										<Select
											id="automation-trigger"
											value={ruleTrigger}
											onChange={(e: { target: { value: string } }) => {
												setRuleTrigger(e.target.value as AudioAutomationTriggerKind);
												setRuleScopeId('');
											}}
											options={AUDIO_AUTOMATION_TRIGGER_KINDS.map((t) => ({ value: t, label: TRIGGER_LABELS[t] }))}
										/>
									</Field>
									<Field label="Do" htmlFor="automation-action">
										<Select
											id="automation-action"
											value={ruleAction}
											onChange={(e: { target: { value: string } }) => setRuleAction(e.target.value as AudioAutomationAction)}
											options={AUDIO_AUTOMATION_ACTIONS.map((a) => ({ value: a, label: ACTION_LABELS[a] }))}
										/>
									</Field>
								</div>
								{ruleTrigger === 'scene-activation' && (
									<Field label="Scene" htmlFor="automation-scope" help="Fire for one scene, or any.">
										<Select
											id="automation-scope"
											value={ruleScopeId}
											onChange={(e: { target: { value: string } }) => setRuleScopeId(e.target.value)}
											options={[{ value: '', label: 'Any scene' }, ...scenes.map((s) => ({ value: s.id, label: s.name }))]}
										/>
									</Field>
								)}
								<Field label="Source" htmlFor="automation-source">
									<Select
										id="automation-source"
										value={ruleFormSourceId}
										disabled={sources.length === 0}
										onChange={(e: { target: { value: string } }) => {
											setRuleSourceId(e.target.value);
											setRuleAssetId('');
										}}
										options={sources.map((s) => ({ value: s.sourceId, label: s.displayName }))}
									/>
								</Field>
								{ruleAction !== 'stop' && (
									<Field
										label="Asset"
										htmlFor="automation-asset"
										help="Required for a local/bundled source; a web stream plays the stream itself."
									>
										<Select
											id="automation-asset"
											value={ruleAssetId}
											onChange={(e: { target: { value: string } }) => setRuleAssetId(e.target.value)}
											options={[
												{ value: '', label: '— none (stream is the track) —' },
												...ruleSourceAssets.map((a) => ({ value: a.id, label: a.title || a.fileName })),
											]}
										/>
									</Field>
								)}
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
									<Button type="submit" variant="secondary" size="sm" icon="add" disabled={ruleBusy || sources.length === 0}>
										{ruleBusy ? 'Saving…' : 'Add rule'}
									</Button>
									{sources.length === 0 && (
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>Add a track or import audio first — a rule needs a source.</span>
									)}
									{ruleError && (
										<span role="status" style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}>{ruleError}</span>
									)}
								</div>
							</form>
						) : (
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
								Automation is DM-only{previewing ? ' — exit preview to edit rules.' : '.'}
							</div>
						)}
					</Panel>
				</div>
			)}
		</Page>
	);
}
