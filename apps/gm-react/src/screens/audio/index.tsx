import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioAssociationsForActor,
	listAudioAutomationRulesForActor,
	listAudioSourceClassificationsForActor,
	listScenesForActor,
	type AudioAssetView,
	type AudioSourceClassification,
} from '@dndtools/core';
import { Tabs, tabPanelProps, Toaster } from '../../ds';
import { Page } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ensureAudioPlayback } from '../../runtime/audio-playback';
import { AUDIO_IMPORT_ACCEPT, importAudioFile } from '../../runtime/audio-import';
import { pickBinaryFile } from '../../platform/filePick';
import { useViewport } from '../../app/useViewport';
import { isNativeDesktopRuntime } from '../../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../../platform/capabilities';
import {
	SUPPORTS_SINK_SELECTION,
	useAssetBytesPresence,
	useAudioOutputDevices,
	type SourceKind,
} from './shared';
import { usePresetEditor } from './usePresetEditor';
import { useAutomationEditor } from './useAutomationEditor';
import { NowPlaying } from './NowPlaying';
import { PlaybackLeft } from './panels/PlaybackLeft';
import { PlaybackRight } from './panels/PlaybackRight';
import { PresetsTab } from './PresetsTab';
import { AutomationTab } from './AutomationTab';
import { useI18n } from '../../i18n';

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

export function Audio() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const capabilities = usePlatformCapabilities();
	const isPhone = viewport === 'phone';
	const isDesktop = viewport === 'desktop';
	const nativeDesktop = isNativeDesktopRuntime();
	const android = capabilities.runtimeKind === 'android';
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
		: t('audio.nothingPlaying');
	const streamIsAllowed = (source: AudioSourceClassification): boolean => {
		if (source.type !== 'web-stream') return true;
		if (nativeDesktop) return false;
		if (!android) return true;
		const sourceUrl = state.audio.sources[source.sourceId]?.url;
		return (
			typeof sourceUrl === 'string' &&
			isNetworkDestinationAllowed(sourceUrl, capabilities.runtimeKind)
		);
	};
	const usableSources = sources.filter(streamIsAllowed);
	const webStreamSource = sources.find((s) => s.type === 'web-stream' && streamIsAllowed(s));

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

	// Six write paths (play/pause/resume/stop, scene binding, automation enable, output choice) went
	// through here, and it threw the CommandResult away: on a rejection the Switch visibly snapped
	// back and the Select reverted with no toast and no inline text. The file's other writers all
	// surface the message.
	const dispatch = (command: Parameters<typeof runtime.dispatch>[0]) => {
		void runtime
			.dispatch(command)
			.then((result) => {
				if (result.status !== 'accepted') Toaster.error(result.rejection.message);
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : t('audio.changeFailed')),
			);
	};

	/**
	 * `runtime.dispatch` fails two different ways: it RETURNS a rejection when a command is refused,
	 * and it THROWS when the durable write itself fails (`SceneRuntime.dispatchNow` rethrows after a
	 * failed `persistFullState`). Every awaited dispatch below used to handle only the first, so a
	 * persist failure was a complete no-op — the button un-froze and nothing was said anywhere.
	 * `failure()` collapses both into one nullable message; `null` means accepted.
	 */
	const failure = async (
		command: Parameters<typeof runtime.dispatch>[0],
	): Promise<string | null> => {
		try {
			const result = await runtime.dispatch(command);
			return result.status === 'accepted' ? null : result.rejection.message;
		} catch (error) {
			return error instanceof Error ? error.message : t('audio.changeFailed');
		}
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
				t(outcome.deduped ? 'audio.importDeduped' : 'audio.imported', {
					title: outcome.title,
				}),
			);
			if (outcome.needsLicenseReview) {
				Toaster.warning(t('audio.importNoLicense', { title: outcome.title }));
			}
		} catch (error) {
			// The picked file's BYTES are written to the device asset store BEFORE the dispatch, so an
			// unwinding throw orphans them. Without this the whole import looked like it had never
			// registered: no message, no new asset, and storage silently consumed.
			setImportError(error instanceof Error ? error.message : t('audio.importFailed'));
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
		setPlayError(
			await failure({
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
			}),
		);
	};

	// ADD TRACK — configure a declared source, exactly as the demo seed does for the now-playing stream.
	const addTrack = async (e: FormEvent) => {
		e.preventDefault();
		if (addBusy || !trackName.trim()) return;
		if (nativeDesktop && trackKind === 'web-stream') {
			setAddError(t('audio.addError.desktopBlocksStreams'));
			return;
		}
		if (trackKind === 'web-stream' && !trackUrl.trim()) {
			setAddError(t('audio.addError.needsUrl'));
			return;
		}
		if (
			trackKind === 'web-stream' &&
			android &&
			!isNetworkDestinationAllowed(trackUrl.trim(), capabilities.runtimeKind)
		) {
			setAddError(t('audio.addError.androidHttps'));
			return;
		}
		setAddBusy(true);
		setAddError(null);
		// The green "'X' added" was cleared only in the FAILURE branch, so it stayed pinned beside the
		// submit button while the next track was being typed, and survived a tab switch and back.
		setAddedName(null);
		try {
			const problem = await failure({
				type: 'audio.configure-source',
				actorId: dmId,
				payload: {
					type: trackKind,
					displayName: trackName.trim(),
					url: trackKind === 'web-stream' ? trackUrl.trim() : null,
					cacheBehavior: trackKind === 'web-stream' ? 'cache-required' : 'local',
				},
			});
			if (!problem) {
				setAddedName(trackName.trim());
				setTrackName('');
				setTrackUrl('');
			} else {
				setAddedName(null);
				setAddError(problem);
			}
		} finally {
			setAddBusy(false);
		}
	};

	// Play a configured STREAM source as the session track (the stream IS the track).
	const playSource = (s: AudioSourceClassification) => {
		if (!streamIsAllowed(s) || s.type !== 'web-stream' || !s.playbackEnabled) return;
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
				// A stored association label: it is written into the campaign, so like every other
				// durable label it stays in the source language rather than the reader's.
				label: `${sceneName} ambience`,
				sourceId: webStreamSource.sourceId,
			},
		});
	};

	// "Unbind" sits on a row that reads "3 cues" and is replaced by "Bind" once the scene has none, but
	// it only ever removed `bound[0]` — so the DM pressed an unchanging button once per cue with no
	// indication of which one had gone. It now clears the scene's whole binding, which is what the row
	// has always advertised, and stops at the first refusal rather than continuing blind.
	const unbindScene = async (bound: Array<{ id: string }>, sceneName: string) => {
		for (const association of bound) {
			const problem = await failure({
				type: 'audio.disassociate-scene',
				actorId: dmId,
				payload: { associationId: association.id },
			});
			if (problem) {
				Toaster.error(problem);
				return;
			}
		}
		Toaster.success(t('audio.unbound', { name: sceneName }));
	};

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
		setAmbienceError(
			await failure({
				type: 'session.audio.set-ambience-layer',
				actorId: dmId,
				payload: { layerId, sourceId, volume, muted },
			}),
		);
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
		const problem = await failure({
			type: 'session.audio.remove-ambience-layer',
			actorId: dmId,
			payload: { layerId },
		});
		if (problem) {
			setAmbienceError(problem);
			return;
		}
		Toaster.show({
			message: t('audio.layerRemoved', { name: sourceName }),
			action: t('common.action.undo'),
			onAction: () => void setLayer(layerId, previous.sourceId, previous.volume, previous.muted),
		});
	};

	// ── Output device routing (session.audio.set-output-device + driver setSinkId) ───────────────
	const { outputs, note: outputsNote } = useAudioOutputDevices(SUPPORTS_SINK_SELECTION);
	const selectedOutputId = dmView?.outputDevice?.deviceId ?? '';
	const outputOptions = useMemo(() => {
		const options = [
			{ value: '', label: t('audio.output.platformDefault') },
			...outputs.map((o) => ({ value: o.deviceId, label: o.label })),
		];
		// A stored selection whose device is currently unplugged still shows honestly (and can be cleared).
		if (selectedOutputId && !outputs.some((o) => o.deviceId === selectedOutputId)) {
			options.push({
				value: selectedOutputId,
				label: t('audio.output.notConnected', {
					name: dmView?.outputDevice?.label ?? t('audio.output.savedDevice'),
				}),
			});
		}
		return options;
	}, [outputs, selectedOutputId, dmView?.outputDevice?.label, t]);

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

	// AUDIO-014 (presets) and AUDIO-005 (automation) keep their own local form state and dispatches
	// in ./usePresetEditor and ./useAutomationEditor.
	const presets = usePresetEditor({
		audioState: state.audio,
		dmId,
		canEdit,
		track,
		ambienceLayers,
		failure,
	});
	const automation = useAutomationEditor({
		automationRules,
		audioState: state.audio,
		permissions: state.permissions,
		dmId,
		canEdit,
		assets,
		usableSources,
		bytesPresence,
		dispatch,
		failure,
		runtime,
	});

	const sceneNameById = (id: string | null): string | null =>
		id === null ? null : (scenes.find((s) => s.id === id)?.name ?? id);

	return (
		<Page max={1200}>
			<NowPlaying
				dmId={dmId}
				canEdit={canEdit}
				playbackState={playbackState}
				track={track}
				playing={playing}
				trackLabel={trackLabel}
				masterPct={masterPct}
				dispatch={dispatch}
			/>

			<Tabs
				aria-label={t('audio.sections')}
				tabs={[
					{ id: 'playback', label: t('audio.tab.playback'), icon: 'audio' },
					{ id: 'presets', label: t('audio.tab.presets'), icon: 'sparkle' },
					{ id: 'automation', label: t('audio.tab.automation'), icon: 'wand' },
				]}
				value={tab}
				onChange={(id: string) => setTab(id as 'playback' | 'presets' | 'automation')}
				idBase="audio"
				style={{ marginBottom: 18 }}
			/>

			{tab === 'playback' && (
				<div
					{...tabPanelProps('audio', 'playback')}
					style={{
						display: 'grid',
						gridTemplateColumns: isDesktop ? '1.3fr 1fr' : 'minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
					<PlaybackLeft
						isPhone={isPhone}
						nativeDesktop={nativeDesktop}
						android={android}
						previewing={previewing}
						canEdit={canEdit}
						assets={assets}
						sources={sources}
						bytesPresence={bytesPresence}
						track={track}
						playing={playing}
						streamIsAllowed={streamIsAllowed}
						pulse={pulse}
						playError={playError}
						trackName={trackName}
						setTrackName={setTrackName}
						trackUrl={trackUrl}
						setTrackUrl={setTrackUrl}
						trackKind={trackKind}
						setTrackKind={setTrackKind}
						addBusy={addBusy}
						addError={addError}
						addedName={addedName}
						setAddedName={setAddedName}
						importBusy={importBusy}
						importError={importError}
						importAudio={importAudio}
						playAsset={playAsset}
						addTrack={addTrack}
						playSource={playSource}
					/>

					<PlaybackRight
						nativeDesktop={nativeDesktop}
						canEdit={canEdit}
						playbackState={playbackState}
						sources={sources}
						scenes={scenes}
						webStreamSource={webStreamSource}
						sceneAssociationsFor={sceneAssociationsFor}
						bindScene={bindScene}
						unbindScene={unbindScene}
						ambienceLayers={ambienceLayers}
						ambienceSourceId={ambienceSourceId}
						setAmbienceSourceId={setAmbienceSourceId}
						ambienceError={ambienceError}
						layerSources={layerSources}
						setLayer={setLayer}
						addAmbienceLayer={addAmbienceLayer}
						removeLayer={removeLayer}
						outputsNote={outputsNote}
						selectedOutputId={selectedOutputId}
						outputOptions={outputOptions}
						chooseOutput={chooseOutput}
					/>
				</div>
			)}

			{tab === 'presets' && (
				<PresetsTab
					{...presets}
					isPhone={isPhone}
					isDesktop={isDesktop}
					previewing={previewing}
					canEdit={canEdit}
				/>
			)}

			{tab === 'automation' && (
				<AutomationTab
					{...automation}
					isPhone={isPhone}
					isDesktop={isDesktop}
					previewing={previewing}
					canEdit={canEdit}
					assets={assets}
					sources={sources}
					usableSources={usableSources}
					automationRules={automationRules}
					scenes={scenes}
					sceneNameById={sceneNameById}
				/>
			)}
		</Page>
	);
}
