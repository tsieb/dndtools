import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
	AUDIO_AUTOMATION_ACTIONS,
	AUDIO_AUTOMATION_TRIGGER_KINDS,
	AUDIO_PRESET_CATEGORIES,
	AUDIO_PRESET_CATEGORY_LABELS,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioAssociationsForActor,
	listAudioAutomationRulesForActor,
	listAudioSourceClassificationsForActor,
	listBuiltinAudioPresetsByCategory,
	listScenesForActor,
	listUserAudioPresets,
	resolveAudioAutomationForActor,
	type AudioAssetView,
	type AudioAutomationAction,
	type AudioAutomationOutcome,
	type AudioAutomationRule,
	type AudioAutomationTriggerKind,
	type AudioPreset,
	type AudioPresetCategory,
	type AudioSourceClassification,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Field,
	Icon,
	Input,
	Select,
	Slider,
	StatusDot,
	Switch,
	Tabs,
	Toaster,
} from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { ensureAudioPlayback } from '../runtime/audio-playback';
import { AUDIO_IMPORT_ACCEPT, importAudioFile } from '../runtime/audio-import';
import { pickBinaryFile } from '../platform/filePick';
import { hasAssetBytes } from '../platform/storage/assetStore';
import { useViewport } from '../app/useViewport';
import { isNativeDesktopRuntime } from '../platform/windowChrome';

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

/** Byte-presence of one library asset in THIS device's asset-byte store. `unknown` until the async
 *  check settles — callers must render a NEUTRAL state for it (never the missing-bytes copy, never
 *  a blocked flag), because "we haven't looked yet" is not "it isn't there". */
type BytesPresence = 'unknown' | 'present' | 'missing';

/** Live tri-state map of which library assets actually have BYTES in the device asset-byte store
 *  (honest, async). An id absent from the map is `unknown` (still resolving); recomputed whenever
 *  the asset id set changes (an import adds both metadata and bytes). */
function useAssetBytesPresence(assetIds: string[]): Record<string, BytesPresence> {
	const [presence, setPresence] = useState<Record<string, BytesPresence>>({});
	const key = [...assetIds].sort().join('\n');
	useEffect(() => {
		const ids = key ? key.split('\n') : [];
		if (ids.length === 0) {
			setPresence({});
			return;
		}
		let cancelled = false;
		void Promise.all(
			ids.map(
				async (id) =>
					[id, (await hasAssetBytes(id).catch(() => false)) ? 'present' : 'missing'] as const,
			),
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
function useAudioOutputDevices(enabled: boolean): {
	outputs: OutputDeviceOption[];
	note: string | null;
} {
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
					// Pre-permission, browsers report outputs with an EMPTY deviceId — several of them,
					// indistinguishable from (and unroutable except as) the platform default. Drop them
					// and dedupe by id so the picker never offers colliding options.
					const outs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== '');
					const seen = new Set<string>();
					const unique = outs.filter((d) =>
						seen.has(d.deviceId) ? false : (seen.add(d.deviceId), true),
					);
					setOutputs(
						unique.map((d, i) => ({
							deviceId: d.deviceId,
							label: d.label || `Output device ${i + 1}`,
						})),
					);
					setNote(
						unique.length === 0 || unique.some((d) => !d.label)
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
	const viewport = useViewport();
	const isPhone = viewport === 'phone';
	const isDesktop = viewport === 'desktop';
	const nativeDesktop = isNativeDesktopRuntime();
	const dmId = runtime.defaultActorId;
	const state = runtime.state;
	const previewing = !!runtime.preview;
	const isDm = state.permissions.actors[dmId]?.role === 'dm';
	const canEdit = isDm && !previewing;

	// Start (idempotently) the app-lifetime device-output driver and follow its honest status. The driver
	// is keyed per runtime, so StrictMode double-render / remount reuses the same element and subscription.
	const playback = useMemo(() => ensureAudioPlayback(runtime), [runtime]);
	const playbackState = useSyncExternalStore(
		playback.subscribe,
		playback.getSnapshot,
		playback.getSnapshot,
	);

	const audioView = useMemo(
		() => getSessionAudioView(state.audio, state.session.audioPlayback, state.permissions, dmId),
		[state.audio, state.session.audioPlayback, state.permissions, dmId],
	);
	const dmView = audioView.role === 'dm' ? audioView : null;
	const assets = useMemo(
		() => listAudioAssetsForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);
	const sources = useMemo(
		() => listAudioSourceClassificationsForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);
	const associations = useMemo(
		() => listAudioAssociationsForActor(state.audio, state.permissions, dmId),
		[state.audio, state.permissions, dmId],
	);
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
		? ((track.assetId ? assets.find((a) => a.id === track.assetId)?.title : undefined) ??
			sources.find((s) => s.sourceId === track.sourceId)?.displayName ??
			track.assetId ??
			track.sourceId)
		: 'Nothing playing';
	const usableSources = nativeDesktop ? sources.filter((s) => s.type !== 'web-stream') : sources;
	const webStreamSource = nativeDesktop ? undefined : sources.find((s) => s.type === 'web-stream');

	const [tab, setTab] = useState<'playback' | 'presets' | 'automation'>('playback');
	const [pulse, setPulse] = useState<string | null>(null);
	const [playError, setPlayError] = useState<string | null>(null);

	// Add-track form (audio.configure-source — the same declared-cache path the demo seed uses).
	const [trackName, setTrackName] = useState('');
	const [trackUrl, setTrackUrl] = useState('');
	const [trackKind, setTrackKind] = useState<SourceKind>(() =>
		isNativeDesktopRuntime() ? 'bundled-preset' : 'web-stream',
	);
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
			const outcome = await importAudioFile(runtime, dmId, {
				name: picked.name,
				mime: picked.mime,
				bytes: picked.bytes,
			});
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
				Toaster.warning(
					`“${outcome.title}” has no declared license — review it before sharing or export.`,
				);
			}
		} finally {
			setImportBusy(false);
		}
	};

	const playAsset = async (asset: AudioAssetView) => {
		setPulse(asset.id);
		setTimeout(() => setPulse((p) => (p === asset.id ? null : p)), 360);
		setPlayError(null);
		// While the presence check is still resolving ('unknown'), do NOT gate on missing bytes — only
		// a RESOLVED 'missing' is reported to the AUDIO-010 gate. The playback driver stays honest
		// either way: a truly-missing file lands in its `no-stream` state, never a fake rejection.
		const bytesReady = (bytesPresence[asset.id] ?? 'unknown') !== 'missing';
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
		if (nativeDesktop && trackKind === 'web-stream') {
			setAddError('The desktop app blocks remote streams. Import the audio file instead.');
			return;
		}
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
		if (nativeDesktop || s.type !== 'web-stream' || !s.playbackEnabled) return;
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
	const layerSources = usableSources.filter((s) => s.playbackEnabled);

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

	// Remove is immediate with a Toaster UNDO — undo re-dispatches set-ambience-layer with the
	// layer's previous payload under its ORIGINAL layer id.
	const removeLayer = async (
		layerId: string,
		previous: { sourceId: string; volume: number; muted: boolean },
		sourceName: string,
	) => {
		setAmbienceError(null);
		const result = await runtime.dispatch({
			type: 'session.audio.remove-ambience-layer',
			actorId: dmId,
			payload: { layerId },
		});
		if (result.status !== 'accepted') {
			setAmbienceError(result.rejection.message);
			return;
		}
		Toaster.show({
			message: `“${sourceName}” ambience layer removed.`,
			action: 'Undo',
			onAction: () => void setLayer(layerId, previous.sourceId, previous.volume, previous.muted),
		});
	};

	// ── Output device routing (session.audio.set-output-device + driver setSinkId) ───────────────
	const { outputs, note: outputsNote } = useAudioOutputDevices(SUPPORTS_SINK_SELECTION);
	const selectedOutputId = dmView?.outputDevice?.deviceId ?? '';
	const outputOptions = useMemo(() => {
		const options = [
			{ value: '', label: 'Platform default' },
			...outputs.map((o) => ({ value: o.deviceId, label: o.label })),
		];
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

	// ── Presets & scene packages (AUDIO-014: apply-preset / save-preset / delete-preset) ─────────
	// User scene packages are captured from the LIVE session audio; the built-in library is a browsable
	// catalog of atmosphere recipes. Applying drives the real session track + ambience through the core
	// gates — a preset whose layers aren't bound to a ready source reports honestly, never a guessed track.
	const userPresets = useMemo(() => listUserAudioPresets(state.audio), [state.audio]);
	const [presetName, setPresetName] = useState('');
	const [presetCategory, setPresetCategory] = useState<AudioPresetCategory>('dungeon');
	const [presetBusy, setPresetBusy] = useState(false);
	const [presetError, setPresetError] = useState<string | null>(null);
	const canSavePreset = canEdit && (!!track || ambienceLayers.length > 0);

	const applyPreset = async (preset: AudioPreset) => {
		if (!canEdit) return;
		const result = await runtime.dispatch({
			type: 'session.audio.apply-preset',
			actorId: dmId,
			payload: {
				presetId: preset.id,
				online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
			},
		});
		if (result.status === 'accepted') Toaster.success(`Applied “${preset.name}”.`);
		else Toaster.error(result.rejection.message);
	};

	const saveCurrentPreset = async (e: FormEvent) => {
		e.preventDefault();
		if (presetBusy || !presetName.trim() || !canSavePreset) return;
		setPresetBusy(true);
		setPresetError(null);
		try {
			const result = await runtime.dispatch({
				type: 'audio.save-preset',
				actorId: dmId,
				payload: { name: presetName.trim(), category: presetCategory },
			});
			if (result.status === 'accepted') {
				Toaster.success(`Saved “${presetName.trim()}” as a scene package.`);
				setPresetName('');
			} else {
				setPresetError(result.rejection.message);
			}
		} finally {
			setPresetBusy(false);
		}
	};

	const deletePreset = async (preset: AudioPreset) => {
		const result = await runtime.dispatch({
			type: 'audio.delete-preset',
			actorId: dmId,
			payload: { presetId: preset.id },
		});
		if (result.status === 'accepted') Toaster.success(`Deleted “${preset.name}”.`);
		else Toaster.error(result.rejection.message);
	};

	// ── Automation (AUDIO-005: audio.configure-automation / delete-automation + the resolver) ────
	// Each ENABLED rule's deterministic resolution against the CURRENT library + this device's real
	// byte presence — exactly what the core resolver would compute if the trigger fired now.
	const ruleOutcomes = useMemo(() => {
		const map = new Map<string, AudioAutomationOutcome | 'checking'>();
		for (const rule of automationRules) {
			if (!rule.enabled) continue;
			const assetPresence = rule.assetId ? (bytesPresence[rule.assetId] ?? 'unknown') : 'present';
			if (assetPresence === 'unknown') {
				// The byte check hasn't settled on this device yet — resolving now would flash an
				// untrue "Blocked". Report 'checking' and resolve once presence is known.
				map.set(rule.id, 'checking');
				continue;
			}
			const bytesReady = assetPresence === 'present';
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

	const selectedRuleSource = usableSources.some((source) => source.sourceId === ruleSourceId)
		? ruleSourceId
		: '';
	const ruleFormSourceId = selectedRuleSource || usableSources[0]?.sourceId || '';
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

	// Delete is immediate with a Toaster UNDO (no confirm step) — undo re-dispatches the rule's
	// previous definition under its ORIGINAL id (configure-automation recreates a deleted ruleId).
	const deleteRule = async (rule: AudioAutomationRule) => {
		const result = await runtime.dispatch({
			type: 'audio.delete-automation',
			actorId: dmId,
			payload: { ruleId: rule.id },
		});
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message);
			return;
		}
		Toaster.show({
			message: `Automation “${rule.label}” deleted.`,
			action: 'Undo',
			onAction: () => {
				void runtime
					.dispatch({
						type: 'audio.configure-automation',
						actorId: dmId,
						payload: {
							ruleId: rule.id,
							label: rule.label,
							enabled: rule.enabled,
							trigger: rule.trigger,
							triggerScopeId: rule.triggerScopeId,
							action: rule.action,
							sourceId: rule.sourceId,
							assetId: rule.assetId,
						},
					})
					.then((restored) => {
						if (restored.status !== 'accepted')
							Toaster.error(`Undo failed: ${restored.rejection.message}`);
					});
			},
		});
	};

	/** Dispatch a rule's RESOLVED command request through the core (AUDIO-005 AC1) — DM-initiated. */
	const runRuleNow = async (rule: AudioAutomationRule) => {
		const outcome = ruleOutcomes.get(rule.id);
		if (!outcome || outcome === 'checking' || outcome.status !== 'requested') return;
		const bytesReady = rule.assetId ? bytesPresence[rule.assetId] === 'present' : true;
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
					<Slider
						value={masterPct}
						disabled={!track || !canEdit}
						onChange={(v: number) =>
							dispatch({
								type: 'session.audio.set-volume',
								actorId: dmId,
								payload: { volume: v / 100 },
							})
						}
						valueLabel={`${masterPct}%`}
						steppers
						aria-label="Master volume"
						style={{ flex: 1 }}
					/>
				</div>
				{/* The device-output driver's honest silent states — the durable track says "playing", this
				    line says why THIS device is (or isn't) actually sounding. Nothing fancy by design. */}
				{track &&
					(playbackState.status === 'blocked' ||
						playbackState.status === 'no-stream' ||
						playbackState.status === 'error') && (
						<div
							role="status"
							style={{
								flexBasis: '100%',
								font: `11.5px/1.5 ${T.sans}`,
								color: T.ter,
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}
						>
							<Icon name="audio" size={13} color={T.ter} /> {playbackState.detail}
						</div>
					)}
			</div>

			<Tabs
				tabs={[
					{ id: 'playback', label: 'Playback', icon: 'audio' },
					{ id: 'presets', label: 'Presets', icon: 'sparkle' },
					{ id: 'automation', label: 'Automation', icon: 'wand' },
				]}
				value={tab}
				onChange={(id: string) => setTab(id as 'playback' | 'presets' | 'automation')}
				style={{ marginBottom: 18 }}
			/>

			{tab === 'playback' && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isDesktop ? '1.3fr 1fr' : 'minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
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
									role="status"
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
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
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
													<span
														style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}
													>
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
									role="status"
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
								<form
									onSubmit={addTrack}
									style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
								>
									<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
										<Field label="Track name" htmlFor="audio-track-name" required>
											<Input
												id="audio-track-name"
												value={trackName}
												onChange={(e: { target: { value: string } }) =>
													setTrackName(e.target.value)
												}
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
									)}
									{nativeDesktop && (
										<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
											The desktop app blocks remote audio links. Import audio above to keep playback
											local and available offline.
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
												role="status"
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
										const streamPlayable =
											!desktopBlocked && s.type === 'web-stream' && s.playbackEnabled;
										const isActive = track?.sourceId === s.sourceId;
										return (
											<div
												key={s.sourceId}
												style={{
													display: 'flex',
													alignItems: 'center',
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
													color={s.playbackEnabled && !desktopBlocked ? T.acc : T.ter}
												/>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div style={{ font: `600 12.5px ${T.sans}` }}>{s.displayName}</div>
													<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
														{s.type} · {s.cacheBehavior} · {s.offlineAvailability}
													</div>
												</div>
												<Badge
													status={s.playbackEnabled && !desktopBlocked ? 'success' : 'neutral'}
												>
													{desktopBlocked
														? 'Blocked on desktop'
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
															desktopBlocked
																? 'Remote streams are blocked by the desktop security policy.'
																: "Play this source's imported files from the soundboard above."
														}
													>
														{desktopBlocked ? 'Import instead' : 'Via soundboard'}
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
							action={
								<Badge status="neutral">
									{ambienceLayers.filter(([, l]) => !l.muted).length} live
								</Badge>
							}
						>
							<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
								Looping beds mixed under the main track and saved with this campaign.
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
									const sourceName =
										sources.find((s) => s.sourceId === layer.sourceId)?.displayName ??
										layer.sourceId;
									const device = playbackState.ambience.find((l) => l.layerId === layerId);
									const on = !layer.muted;
									return (
										<div key={layerId} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
											<button
												type="button"
												disabled={!canEdit}
												onClick={() =>
													void setLayer(layerId, layer.sourceId, layer.volume, !layer.muted)
												}
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
													<span
														style={{
															font: `600 12.5px ${T.sans}`,
															color: on ? T.ink : T.ter,
															whiteSpace: 'nowrap',
															overflow: 'hidden',
															textOverflow: 'ellipsis',
														}}
													>
														{sourceName}
													</span>
													{device &&
														!device.sounding &&
														device.detail &&
														device.detail !== 'Muted.' && (
															<span
																style={{
																	font: `10.5px ${T.sans}`,
																	color: T.ter,
																	whiteSpace: 'nowrap',
																	overflow: 'hidden',
																	textOverflow: 'ellipsis',
																}}
																title={device.detail}
															>
																{device.detail}
															</span>
														)}
												</div>
												<Slider
													value={Math.round(layer.volume * 100)}
													disabled={!canEdit}
													onChange={(v: number) =>
														void setLayer(layerId, layer.sourceId, v / 100, layer.muted)
													}
													valueLabel={`${Math.round(layer.volume * 100)}%`}
													steppers
													aria-label={`${sourceName} volume`}
												/>
											</div>
											<Button
												variant="ghost"
												size="sm"
												icon="close"
												disabled={!canEdit}
												aria-label={`Remove ${sourceName} layer`}
												onClick={() => void removeLayer(layerId, layer, sourceName)}
											/>
										</div>
									);
								})}
							</div>
							{canEdit && (
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										marginTop: 4,
										flexWrap: 'wrap',
									}}
								>
									<div style={{ flex: '1 1 220px', minWidth: 0 }}>
										<Select
											aria-label="Ambience layer source"
											value={ambienceSourceId || layerSources[0]?.sourceId || ''}
											onChange={(e: { target: { value: string } }) =>
												setAmbienceSourceId(e.target.value)
											}
											options={layerSources.map((s) => ({
												value: s.sourceId,
												label: s.displayName,
											}))}
											disabled={layerSources.length === 0}
										/>
									</div>
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										disabled={layerSources.length === 0}
										onClick={() => void addAmbienceLayer()}
									>
										Add layer
									</Button>
								</div>
							)}
							{canEdit && layerSources.length === 0 && (
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									No playback-ready sources yet — import an audio file
									{nativeDesktop ? '.' : ' or add a stream track first.'}
								</div>
							)}
							{ambienceError && (
								<div
									role="status"
									style={{ font: `11.5px/1.5 ${T.sans}`, color: 'var(--color-status-error-text)' }}
								>
									{ambienceError}
								</div>
							)}
						</Panel>

						{/* output device — session.audio.set-output-device; the driver applies setSinkId */}
						<Panel title="Output device">
							{!SUPPORTS_SINK_SELECTION ? (
								<div style={{ font: `12px/1.55 ${T.sans}`, color: T.ter }}>
									This browser cannot route audio to a specific output device (no{' '}
									<code>setSinkId</code> — e.g. Firefox). Session audio uses the platform default
									output.
								</div>
							) : (
								<>
									<Field
										label="Session host output"
										htmlFor="audio-output-device"
										help="Where THIS device plays session audio. Player devices route locally — this never changes theirs."
									>
										<Select
											id="audio-output-device"
											value={selectedOutputId}
											disabled={!canEdit}
											onChange={(e: { target: { value: string } }) => chooseOutput(e.target.value)}
											options={outputOptions}
										/>
									</Field>
									{outputsNote && (
										<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>{outputsNote}</div>
									)}
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											font: `11.5px ${T.sans}`,
											color: T.sub,
										}}
									>
										<StatusDot status={playbackState.routing === 'unavailable' ? 'warn' : 'idle'} />
										{playbackState.routing === 'routed'
											? 'Routed to the selected device.'
											: playbackState.routing === 'unavailable'
												? (playbackState.routingDetail ??
													'Routing unavailable — using the platform default output.')
												: 'Platform default output.'}
									</div>
								</>
							)}
						</Panel>

						{/* scene bindings — real AUDIO-001 associations */}
						<Panel title="Scene bindings">
							{scenes.length === 0 && (
								<EmptyState
									inset
									icon="scene"
									title="No scenes yet."
									description="Create a scene in the Scenes section — each one can carry its own ambience cue."
								/>
							)}
							{scenes.map((s, i) => {
								const bound = sceneAssociationsFor(s.id);
								return (
									<div
										key={s.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 11,
											padding: '9px 0',
											borderTop: i ? `1px solid ${T.bd}` : 'none',
										}}
									>
										<Icon name="scene" size={16} color={bound.length ? T.acc : T.ter} />
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ font: `600 12.5px ${T.sans}` }}>{s.name}</div>
											<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
												{bound.length} {bound.length === 1 ? 'cue' : 'cues'}
											</div>
										</div>
										{bound.length ? (
											<Button
												variant="ghost"
												size="sm"
												icon="close"
												onClick={() => unbindScene(bound[0].id)}
											>
												Unbind
											</Button>
										) : (
											<Button
												variant="ghost"
												size="sm"
												icon="link"
												disabled={!webStreamSource}
												onClick={() => bindScene(s.id, s.name)}
											>
												Bind
											</Button>
										)}
									</div>
								);
							})}
							{!webStreamSource && scenes.length > 0 && (
								<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
									{nativeDesktop
										? 'Remote stream scene bindings are unavailable in the desktop app.'
										: 'Add a web-stream track (in Tracks & sources) to bind scenes.'}
								</div>
							)}
						</Panel>
					</div>
				</div>
			)}

			{tab === 'presets' && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isDesktop ? '1fr 1fr' : 'minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
					{/* your scene packages — captured from the LIVE session audio; apply/delete are real commands */}
					<Panel
						title="Your scene packages"
						action={
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{userPresets.length} {userPresets.length === 1 ? 'package' : 'packages'}
							</span>
						}
					>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
							Save the current track and ambience as a reusable atmosphere, then apply it again in
							one action.
						</div>
						{canEdit ? (
							<form
								onSubmit={saveCurrentPreset}
								style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}
							>
								<div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
									<Field label="Package name" htmlFor="preset-name" required>
										<Input
											id="preset-name"
											value={presetName}
											onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
											placeholder="Tavern night"
										/>
									</Field>
									<Field label="Category" htmlFor="preset-category">
										<Select
											id="preset-category"
											value={presetCategory}
											onChange={(e: { target: { value: string } }) =>
												setPresetCategory(e.target.value as AudioPresetCategory)
											}
											options={AUDIO_PRESET_CATEGORIES.map((c) => ({
												value: c,
												label: AUDIO_PRESET_CATEGORY_LABELS[c],
											}))}
										/>
									</Field>
								</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
									<Button
										type="submit"
										variant="secondary"
										size="sm"
										icon="add"
										disabled={!canSavePreset || presetBusy || !presetName.trim()}
									>
										{presetBusy ? 'Saving…' : 'Save current audio'}
									</Button>
									{!canSavePreset && (
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
											Play a track or add an ambience layer to capture.
										</span>
									)}
									{presetError && (
										<span
											role="status"
											style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}
										>
											{presetError}
										</span>
									)}
								</div>
							</form>
						) : (
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
								Presets are DM-only{previewing ? ' — exit preview to save or apply.' : '.'}
							</div>
						)}
						{userPresets.length === 0 ? (
							<EmptyState
								inset
								icon="sparkle"
								title="No scene packages yet."
								description="Set up a track and some ambience, then save it here to re-apply the whole atmosphere later."
							/>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								{userPresets.map((preset) => (
									<div
										key={preset.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 10,
											padding: '9px 11px',
											border: `1px solid ${T.bd}`,
											borderRadius: 9,
											background: T.surf,
										}}
									>
										<Icon name="sparkle" size={15} color={T.acc} />
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ font: `600 12.5px ${T.sans}` }}>{preset.name}</div>
											<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
												{AUDIO_PRESET_CATEGORY_LABELS[preset.category]} · {preset.layers.length}{' '}
												{preset.layers.length === 1 ? 'layer' : 'layers'}
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											icon="play"
											disabled={!canEdit}
											aria-label={`Apply ${preset.name}`}
											onClick={() => void applyPreset(preset)}
										>
											Apply
										</Button>
										<Button
											variant="ghost"
											size="sm"
											icon="delete"
											disabled={!canEdit}
											aria-label={`Delete ${preset.name}`}
											onClick={() => void deletePreset(preset)}
										/>
									</div>
								))}
							</div>
						)}
					</Panel>

					{/* built-in atmosphere library — a browsable catalog of recipes, grouped by category */}
					<Panel title="Atmosphere library">
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
							Shipped atmosphere recipes, grouped by scene type. Apply one once its layers are bound
							to your own sources — otherwise the app tells you what to bind, never guesses a track.
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
							{AUDIO_PRESET_CATEGORIES.map((category) => {
								const presets = listBuiltinAudioPresetsByCategory(category);
								if (presets.length === 0) return null;
								return (
									<div key={category}>
										<div style={{ ...eb, marginBottom: 8 }}>
											{AUDIO_PRESET_CATEGORY_LABELS[category]}
										</div>
										<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
											{presets.map((preset) => (
												<div
													key={preset.id}
													style={{
														display: 'flex',
														alignItems: 'center',
														gap: 8,
														padding: '8px 10px',
														border: `1px solid ${T.bd}`,
														borderRadius: 9,
														background: T.surf,
													}}
												>
													<div style={{ flex: 1, minWidth: 0 }}>
														<div
															style={{
																font: `600 12px ${T.sans}`,
																whiteSpace: 'nowrap',
																overflow: 'hidden',
																textOverflow: 'ellipsis',
															}}
														>
															{preset.name}
														</div>
														<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
															{preset.layers.length}{' '}
															{preset.layers.length === 1 ? 'layer' : 'layers'}
														</div>
													</div>
													<Button
														variant="ghost"
														size="sm"
														icon="play"
														disabled={!canEdit}
														aria-label={`Apply ${preset.name}`}
														onClick={() => void applyPreset(preset)}
													/>
												</div>
											))}
										</div>
									</div>
								);
							})}
						</div>
					</Panel>
				</div>
			)}

			{tab === 'automation' && (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isDesktop ? '1.3fr 1fr' : 'minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
					<Panel
						title="Automation rules"
						action={
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{automationRules.length} {automationRules.length === 1 ? 'rule' : 'rules'}
							</span>
						}
					>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							Each rule maps a session event to a declared audio command. The status below is the
							core resolver&rsquo;s deterministic verdict against the current library and this
							device&rsquo;s real file availability — a blocked rule is flagged, never silently
							bypassed.
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
								const sourceName =
									sources.find((s) => s.sourceId === rule.sourceId)?.displayName ?? rule.sourceId;
								const assetName = rule.assetId
									? (assets.find((a) => a.id === rule.assetId)?.title ?? rule.assetId)
									: null;
								const scopeName =
									rule.trigger === 'scene-activation'
										? sceneNameById(rule.triggerScopeId)
										: rule.triggerScopeId;
								return (
									<div
										key={rule.id}
										style={{
											display: 'flex',
											flexDirection: 'column',
											gap: 6,
											padding: '10px 12px',
											border: `1px solid ${T.bd}`,
											borderRadius: 9,
											background: T.surf,
										}}
									>
										<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
											<Icon name="wand" size={15} color={rule.enabled ? T.acc : T.ter} />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														font: `600 12.5px ${T.sans}`,
														color: rule.enabled ? T.ink : T.ter,
													}}
												>
													{rule.label}
												</div>
												<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
													{TRIGGER_LABELS[rule.trigger]}
													{scopeName ? ` (${scopeName})` : ' (any)'} → {ACTION_LABELS[rule.action]}{' '}
													· {sourceName}
													{assetName ? ` · ${assetName}` : ''}
												</div>
											</div>
											{!rule.enabled ? (
												<Badge status="neutral">Disabled</Badge>
											) : outcome === 'checking' ? (
												<Badge status="neutral">Checking…</Badge>
											) : outcome?.status === 'requested' ? (
												<Badge status="success">Ready</Badge>
											) : outcome?.status === 'blocked' ? (
												<Badge status="warning">Blocked</Badge>
											) : null}
											<Switch
												checked={rule.enabled}
												disabled={!canEdit}
												onChange={(v: boolean) => toggleRuleEnabled(rule, v)}
												aria-label={`Enable ${rule.label}`}
											/>
											{outcome !== 'checking' && outcome?.status === 'requested' && (
												<Button
													variant="ghost"
													size="sm"
													icon="play"
													disabled={!canEdit}
													aria-label={`Run ${rule.label} now`}
													onClick={() => void runRuleNow(rule)}
												>
													Run now
												</Button>
											)}
											<Button
												variant="ghost"
												size="sm"
												icon="delete"
												disabled={!canEdit}
												aria-label={`Delete ${rule.label}`}
												onClick={() => void deleteRule(rule)}
											/>
										</div>
										{rule.enabled && outcome !== 'checking' && outcome?.status === 'blocked' && (
											<div
												role="status"
												style={{
													font: `11px/1.5 ${T.sans}`,
													color: 'var(--color-status-warning-text)',
												}}
											>
												{outcome.message}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</Panel>

					<Panel title="New rule">
						{canEdit ? (
							<form
								onSubmit={createRule}
								style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
							>
								<Field
									label="Label"
									htmlFor="automation-label"
									help="Optional — defaults to “action on trigger”."
								>
									<Input
										id="automation-label"
										value={ruleLabel}
										onChange={(e: { target: { value: string } }) => setRuleLabel(e.target.value)}
										placeholder="Battle drums on combat"
									/>
								</Field>
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
										gap: 10,
									}}
								>
									<Field label="When" htmlFor="automation-trigger">
										<Select
											id="automation-trigger"
											value={ruleTrigger}
											onChange={(e: { target: { value: string } }) => {
												setRuleTrigger(e.target.value as AudioAutomationTriggerKind);
												setRuleScopeId('');
											}}
											options={AUDIO_AUTOMATION_TRIGGER_KINDS.map((t) => ({
												value: t,
												label: TRIGGER_LABELS[t],
											}))}
										/>
									</Field>
									<Field label="Do" htmlFor="automation-action">
										<Select
											id="automation-action"
											value={ruleAction}
											onChange={(e: { target: { value: string } }) =>
												setRuleAction(e.target.value as AudioAutomationAction)
											}
											options={AUDIO_AUTOMATION_ACTIONS.map((a) => ({
												value: a,
												label: ACTION_LABELS[a],
											}))}
										/>
									</Field>
								</div>
								{ruleTrigger === 'scene-activation' && (
									<Field
										label="Scene"
										htmlFor="automation-scope"
										help="Fire for one scene, or any."
									>
										<Select
											id="automation-scope"
											value={ruleScopeId}
											onChange={(e: { target: { value: string } }) =>
												setRuleScopeId(e.target.value)
											}
											options={[
												{ value: '', label: 'Any scene' },
												...scenes.map((s) => ({ value: s.id, label: s.name })),
											]}
										/>
									</Field>
								)}
								<Field label="Source" htmlFor="automation-source">
									<Select
										id="automation-source"
										value={ruleFormSourceId}
										disabled={usableSources.length === 0}
										onChange={(e: { target: { value: string } }) => {
											setRuleSourceId(e.target.value);
											setRuleAssetId('');
										}}
										options={usableSources.map((s) => ({
											value: s.sourceId,
											label: s.displayName,
										}))}
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
											onChange={(e: { target: { value: string } }) =>
												setRuleAssetId(e.target.value)
											}
											options={[
												{ value: '', label: '— none (stream is the track) —' },
												...ruleSourceAssets.map((a) => ({
													value: a.id,
													label: a.title || a.fileName,
												})),
											]}
										/>
									</Field>
								)}
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
									<Button
										type="submit"
										variant="secondary"
										size="sm"
										icon="add"
										disabled={ruleBusy || usableSources.length === 0}
									>
										{ruleBusy ? 'Saving…' : 'Add rule'}
									</Button>
									{usableSources.length === 0 && (
										<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
											Add a track or import audio first — a rule needs a source.
										</span>
									)}
									{ruleError && (
										<span
											role="status"
											style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}
										>
											{ruleError}
										</span>
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
