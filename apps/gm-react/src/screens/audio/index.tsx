import { useMemo, useState, useSyncExternalStore } from 'react';
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
import { useViewport } from '../../app/useViewport';
import { isNativeDesktopRuntime } from '../../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../../platform/capabilities';
import { SUPPORTS_SINK_SELECTION, useAssetBytesPresence, useAudioOutputDevices } from './shared';
import { useTrackEditor } from './useTrackEditor';
import { usePresetEditor } from './usePresetEditor';
import { useStarterPack } from './useStarterPack';
import { useAutomationEditor } from './useAutomationEditor';
import { NowPlaying } from './NowPlaying';
import { audioEmbedSrc, detectAudioEmbedProvider } from '../../runtime/audio-embed';
import { PlaybackLeft } from './panels/PlaybackLeft';
import { PlaybackRight } from './panels/PlaybackRight';
import { PresetsTab } from './PresetsTab';
import { AutomationTab } from './AutomationTab';
import { useI18n } from '../../i18n';
import { isOnline } from '../../platform/preferences';

/** Actor-filtered audio controls; durable changes use runtime.dispatch. */
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
	// RC-AUD-3.3 — the current track's source URL, classified for a YouTube/SoundCloud embed. Derived
	// straight from durable state (no extra flag to store): any `web-stream` whose URL resolves to a
	// recognized provider IS an embed, on every device that reads the same session state.
	const trackSourceUrl = track ? (state.audio.sources[track.sourceId]?.url ?? null) : null;
	const trackEmbedProvider = trackSourceUrl ? detectAudioEmbedProvider(trackSourceUrl) : null;
	const trackEmbed = trackEmbedProvider
		? { provider: trackEmbedProvider, src: audioEmbedSrc(trackSourceUrl!, trackEmbedProvider) }
		: null;
	const online = isOnline();
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

	// RC-AUD-1.3 — the bundled CC0 starter pack, installed on demand into the same asset store.
	const { starterBusy, starterError, installStarter } = useStarterPack(runtime, dmId, canEdit);

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

	const trackEditor = useTrackEditor(canEdit, failure);

	const playAsset = async (asset: AudioAssetView) => {
		if (!canEdit) return;
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
					online: isOnline(),
				},
			}),
		);
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

	const unbindScene = async (bound: typeof associations, sceneName: string) => {
		if (!canEdit) return;
		const removed: typeof associations = [];
		for (const association of bound) {
			const problem = await failure({
				type: 'audio.disassociate-scene',
				actorId: dmId,
				payload: { associationId: association.id },
			});
			if (problem) {
				Toaster.error(problem);
				break;
			}
			removed.push(association);
		}
		if (removed.length)
			Toaster.show({
				message: t('audio.unbound', { name: sceneName }),
				action: t('common.action.undo'),
				onAction: () => {
					void (async () => {
						for (const association of removed) {
							const { id, ...definition } = association;
							const problem = await failure({
								type: 'audio.associate-scene',
								actorId: dmId,
								payload: { ...definition, associationId: id },
							});
							if (problem) {
								Toaster.error(t('audio.undoFailed', { reason: problem }));
								return;
							}
						}
					})();
				},
			});
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
				embed={trackEmbed}
				online={online}
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
				style={{ marginBottom: 'var(--space-4)' }}
			/>

			{tab === 'playback' && (
				<div
					{...tabPanelProps('audio', 'playback')}
					style={{
						display: 'grid',
						gridTemplateColumns: isDesktop ? '1.3fr 1fr' : 'minmax(0,1fr)',
						gap: 'var(--space-4)',
						alignItems: 'start',
					}}
				>
					<PlaybackLeft
						{...trackEditor}
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
						starterBusy={starterBusy}
						starterError={starterError}
						installStarter={installStarter}
						playAsset={playAsset}
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
