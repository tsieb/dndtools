import { AudioPanel as Panel } from '../AudioPanel';
import { type AudioSourceClassification } from '@dndtools/core';
import { Badge, Button, EmptyState, Field, Icon, Select, StatusDot } from '../../../ds';
import { T } from '../../../app/screen-kit';
import { CommitSlider, SUPPORTS_SINK_SELECTION } from '../shared';
import {
	type AmbienceLayerEntry,
	type AudioAssociationView,
	type AudioPlaybackSnapshot,
	type SceneListRow,
} from '../types';
import { useI18n } from '../../../i18n';

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
	unbindScene: (bound: AudioAssociationView[], sceneName: string) => Promise<void>;
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
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			{/* ambience mixer — REAL session state (set-ambience-layer / remove-ambience-layer) */}
			<Panel
				title={t('audio.ambience.title')}
				action={
					<Badge status="neutral">
						{t('audio.ambience.live', {
							count: ambienceLayers.filter(([, l]) => !l.muted).length,
						})}
					</Badge>
				}
			>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.ter,
						marginBottom: 'var(--space-2)',
					}}
				>
					{t('audio.ambience.intro')}
				</div>
				{ambienceLayers.length === 0 && (
					<EmptyState
						illustration="audio-empty"
						inset
						icon="audio"
						title={t('audio.ambience.emptyTitle')}
						description={t('audio.ambience.emptyBody')}
					/>
				)}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					{ambienceLayers.map(([layerId, layer]) => {
						const sourceName =
							sources.find((s) => s.sourceId === layer.sourceId)?.displayName ?? layer.sourceId;
						const device = playbackState.ambience.find((l) => l.layerId === layerId);
						const on = !layer.muted;
						return (
							<div
								key={layerId}
								style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
							>
								<Button
									variant="ghost"
									type="button"
									disabled={!canEdit}
									onClick={() => void setLayer(layerId, layer.sourceId, layer.volume, !layer.muted)}
									aria-label={t(on ? 'audio.ambience.mute' : 'audio.ambience.unmute', {
										name: sourceName,
									})}
									style={{
										minWidth: 'var(--touch-target-min)',
										minHeight: 'var(--touch-target-min)',
										borderRadius: 'var(--radius-md)',
										flex: '0 0 auto',
										cursor: canEdit ? 'pointer' : 'default',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										border: `calc(var(--space-0-5) / 2) solid ${on ? T.accBd : T.bd}`,
										background: on ? T.accSub : T.alt,
										color: on ? T.acc : T.ter,
									}}
								>
									<Icon name="audio" size="sm" />
								</Button>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
										<span
											style={{
												font: `600 var(--text-sm) ${T.sans}`,
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
													font: `var(--text-xs) ${T.sans}`,
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
										aria-label={t('audio.ambience.volume', { name: sourceName })}
									/>
								</div>
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									disabled={!canEdit}
									aria-label={t('audio.ambience.removeLayer', { name: sourceName })}
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
							gap: 'var(--space-2)',
							marginTop: 'var(--space-1)',
							flexWrap: 'wrap',
						}}
					>
						<div style={{ flex: '1 1 40%', minWidth: 0 }}>
							<Select
								aria-label={t('audio.ambience.layerSource')}
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
							{t('audio.ambience.addLayer')}
						</Button>
					</div>
				)}
				{canEdit && layerSources.length === 0 && (
					<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
						{t(nativeDesktop ? 'audio.ambience.noSourcesDesktop' : 'audio.ambience.noSources')}
					</div>
				)}
				{ambienceError && (
					<div
						role="alert"
						style={{
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: 'var(--color-status-error-text)',
						}}
					>
						{ambienceError}
					</div>
				)}
			</Panel>

			{/* output device — session.audio.set-output-device; the driver applies setSinkId */}
			<Panel title={t('audio.output.title')}>
				{!SUPPORTS_SINK_SELECTION ? (
					<div style={{ font: `var(--text-xs)/1.55 ${T.sans}`, color: T.ter }}>
						{t('audio.output.noRoutingA')} <code>setSinkId</code> {t('audio.output.noRoutingB')}
					</div>
				) : (
					<>
						<Field
							label={t('audio.output.hostOutput')}
							htmlFor="audio-output-device"
							help={t('audio.output.hostOutputHelp')}
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
							<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.ter }}>
								{outputsNote}
							</div>
						)}
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								font: `var(--text-xs) ${T.sans}`,
								color: T.sub,
							}}
						>
							<StatusDot status={playbackState.routing === 'unavailable' ? 'warning' : 'idle'} />
							{playbackState.routing === 'routed'
								? t('audio.output.routed')
								: playbackState.routing === 'unavailable'
									? (playbackState.routingDetail ?? t('audio.output.routingUnavailable'))
									: t('audio.output.platformDefaultStatus')}
						</div>
					</>
				)}
			</Panel>

			{/* scene bindings — real AUDIO-001 associations */}
			<Panel title={t('audio.bindings.title')}>
				{scenes.length === 0 && (
					<EmptyState
						illustration="audio-empty"
						inset
						icon="scene"
						title={t('audio.bindings.emptyTitle')}
						description={t('audio.bindings.emptyBody')}
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
								gap: 'var(--space-3)',
								padding: 'var(--space-2) var(--space-0-5)',
								borderTop: i ? `calc(var(--space-0-5) / 2) solid ${T.bd}` : 'none',
							}}
						>
							<Icon name="scene" size={16} color={bound.length ? T.acc : T.ter} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{s.name}</div>
								<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
									{t('audio.bindings.cues', { count: bound.length })}
								</div>
							</div>
							{bound.length ? (
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									// Every other per-item control in this file is named for its item; these two
									// were a list of identical "Bind"/"Unbind" to a screen reader (WCAG 2.4.6).
									aria-label={t('audio.bindings.unbindFrom', { name: s.name })}
									onClick={() => void unbindScene(bound, s.name)}
								>
									{t('audio.bindings.unbind')}
								</Button>
							) : (
								<Button
									variant="ghost"
									size="sm"
									icon="link"
									disabled={!webStreamSource}
									aria-label={t('audio.bindings.bindTo', { name: s.name })}
									onClick={() => bindScene(s.id, s.name)}
								>
									{t('audio.bindings.bind')}
								</Button>
							)}
						</div>
					);
				})}
				{!webStreamSource && scenes.length > 0 && (
					<div
						style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter, marginTop: 'var(--space-2)' }}
					>
						{t(
							nativeDesktop
								? 'audio.bindings.desktopUnavailable'
								: 'audio.bindings.needsStreamTrack',
						)}
					</div>
				)}
			</Panel>
		</div>
	);
}
