import { type AudioSourceClassification } from '@dndtools/core';
import { Badge, Button, EmptyState, Field, Icon, Select, StatusDot } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { CommitSlider, SUPPORTS_SINK_SELECTION } from '../shared';
import {
	type AmbienceLayerEntry,
	type AudioAssociationView,
	type AudioPlaybackSnapshot,
	type SceneListRow,
} from '../types';

/** The Playback tab's right column — the ambience mixer, the output-device routing and the scene
 * bindings. Extracted from Audio.tsx unchanged (RC-STB-2.6). */
export function PlaybackRight({
	nativeDesktop,
	canEdit,
	playbackState,
	sources,
	scenes,
	webStreamSource,
	sceneAssociationsFor,
	bindScene,
	unbindScene,
	ambienceLayers,
	ambienceSourceId,
	setAmbienceSourceId,
	ambienceError,
	layerSources,
	setLayer,
	addAmbienceLayer,
	removeLayer,
	outputsNote,
	selectedOutputId,
	outputOptions,
	chooseOutput,
}: {
	nativeDesktop: boolean;
	canEdit: boolean;
	playbackState: AudioPlaybackSnapshot;
	sources: AudioSourceClassification[];
	scenes: SceneListRow[];
	webStreamSource: AudioSourceClassification | undefined;
	sceneAssociationsFor: (sceneId: string) => AudioAssociationView[];
	bindScene: (sceneId: string, sceneName: string) => void;
	unbindScene: (bound: Array<{ id: string }>, sceneName: string) => Promise<void>;
	ambienceLayers: AmbienceLayerEntry[];
	ambienceSourceId: string;
	setAmbienceSourceId: (next: string) => void;
	ambienceError: string | null;
	layerSources: AudioSourceClassification[];
	setLayer: (layerId: string, sourceId: string, volume: number, muted: boolean) => Promise<void>;
	addAmbienceLayer: () => Promise<void>;
	removeLayer: (
		layerId: string,
		previous: { sourceId: string; volume: number; muted: boolean },
		sourceName: string,
	) => Promise<void>;
	outputsNote: string | null;
	selectedOutputId: string;
	outputOptions: { value: string; label: string }[];
	chooseOutput: (deviceId: string) => void;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			{/* ambience mixer — REAL session state (set-ambience-layer / remove-ambience-layer) */}
			<Panel
				title="Ambience mixer"
				action={
					<Badge status="neutral">{ambienceLayers.filter(([, l]) => !l.muted).length} live</Badge>
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
							sources.find((s) => s.sourceId === layer.sourceId)?.displayName ?? layer.sourceId;
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
										{device && !device.sounding && device.detail && device.detail !== 'Muted.' && (
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
									<CommitSlider
										value={Math.round(layer.volume * 100)}
										disabled={!canEdit}
										onCommit={(v: number) =>
											void setLayer(layerId, layer.sourceId, v / 100, layer.muted)
										}
										format={(v: number) => `${v}%`}
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
								onChange={(e: { target: { value: string } }) => setAmbienceSourceId(e.target.value)}
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
						role="alert"
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
						This browser cannot route audio to a specific output device (no <code>setSinkId</code> —
						e.g. Firefox). Session audio uses the platform default output.
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
							<StatusDot status={playbackState.routing === 'unavailable' ? 'warning' : 'idle'} />
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
									// Every other per-item control in this file is named for its item; these two
									// were a list of identical "Bind"/"Unbind" to a screen reader (WCAG 2.4.6).
									aria-label={`Unbind audio from ${s.name}`}
									onClick={() => void unbindScene(bound, s.name)}
								>
									Unbind
								</Button>
							) : (
								<Button
									variant="ghost"
									size="sm"
									icon="link"
									disabled={!webStreamSource}
									aria-label={`Bind audio to ${s.name}`}
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
	);
}
