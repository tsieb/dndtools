import { exportUvttJson } from '@dndtools/core';
import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Slider, Textarea, VisibilityChip } from '../../../ds';
import type { MessageKey } from '../../../i18n';
import { useI18n } from '../../../i18n';
import { exportFile, FileExportError } from '../../../platform/download';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { T } from '../../screen-kit';
import { type CombatRosterEntry } from '../canvas/useCombatTokens';
import type { MapEditorApi } from '../useMapEditor';
import { CombatRosterSection, Section } from './InspectorSections';
import { VIS_CHIP } from './inspectorVocab';

/**
 * A Slider whose DURABLE write happens once per gesture instead of once per step.
 *
 * The editor's `run()` is single-flight (`useMapEditor.ts`: `if (busyRef.current) return false`) and
 * drops silently, while a range input fires `onChange` on every step of a drag. So a fast drag
 * landed one value and discarded the rest — including, when a command was still in flight on
 * release, the FINAL one, leaving the thumb snapped back to a value the DM never chose. It also
 * pushed one undo entry per step. The draft tracks the pointer for live feedback; the command goes
 * out on pointer-up / key-up / blur.
 */
export function CommitSlider({
	value,
	onCommit,
	format,
	readoutStyle,
	...rest
}: {
	min: number;
	max: number;
	step: number;
	value: number;
	onCommit: (v: number) => void;
	format: (v: number) => string;
	readoutStyle?: React.CSSProperties;
	'aria-label': string;
	style?: React.CSSProperties;
}) {
	// `null` means "follow the durable value" — so an external change still moves the thumb.
	const [draft, setDraft] = useState<number | null>(null);
	const shown = draft ?? value;
	const commit = () => {
		if (draft === null) return;
		const next = draft;
		setDraft(null);
		if (next !== value) onCommit(next);
	};
	return (
		<>
			<Slider
				{...rest}
				value={shown}
				valueLabel={format(shown)}
				onChange={(v: number) => setDraft(v)}
				onPointerUp={commit}
				onKeyUp={commit}
				onBlur={commit}
			/>
			<span style={readoutStyle}>{format(shown)}</span>
		</>
	);
}

// ── Map / scene properties (empty selection) ────────────────────────────────────────────────────
export function MapInspector({
	editor,
	announce,
	combatRoster,
	selectedCombatantId,
	onSelectCombatant,
}: {
	editor: MapEditorApi;
	announce: (m: string) => void;
	/** RC-MAP-2.1 — the running combat, or null when none is running. */
	combatRoster: { round: number; turn: number; roster: readonly CombatRosterEntry[] } | null;
	selectedCombatantId: string | null;
	onSelectCombatant: (combatantId: string | null) => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const map = editor.map;
	const [name, setName] = useState(map?.name ?? '');
	const [desc, setDesc] = useState(map?.description ?? '');
	const [scaleUnits, setScaleUnits] = useState(map?.scale ? String(map.scale.unitsPerMap) : '');
	const [scaleUnit, setScaleUnit] = useState(map?.scale?.unit ?? 'miles');

	useEffect(() => {
		setName(map?.name ?? '');
		setDesc(map?.description ?? '');
		setScaleUnits(map?.scale ? String(map.scale.unitsPerMap) : '');
		setScaleUnit(map?.scale?.unit ?? 'miles');
	}, [map?.name, map?.description, map?.scale]);

	if (!map)
		return <div style={{ font: `13px ${T.sans}`, color: T.sub }}>{t('mapInspector.noMap')}</div>;
	const { run, actorId, mapId, isDm } = editor;
	const overlay = map.overlay;

	async function exportUvtt() {
		const entity = runtime.state.maps.maps[mapId];
		if (!entity) return;
		const filename = `${(map?.name ?? 'map').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'map'}.dd2vtt`;
		try {
			const result = await exportFile({
				filename,
				blob: new Blob([exportUvttJson(entity)], { type: 'application/json' }),
				title: t('mapEditor.exportTitle', { name: map?.name ?? '' }),
			});
			announce(
				result.status === 'cancelled' ? t('mapEditor.exportCancelled') : t('mapEdit.exported'),
			);
		} catch (error) {
			editor.setNotice(
				error instanceof FileExportError ? error.message : t('mapEditor.exportFailed'),
			);
		}
	}

	function deriveAll() {
		const sourceLayerIds = editor.layers
			.filter((l) =>
				l.content.some(
					(f) =>
						f.kind === 'room' || f.kind === 'fill' || f.kind === 'polygon' || f.kind === 'stroke',
				),
			)
			.map((l) => l.layerId);
		if (sourceLayerIds.length === 0) {
			editor.setNotice(t('mapEdit.noFloor'));
			return;
		}
		void run({
			type: 'map.derive-features',
			actorId,
			payload: {
				mapId,
				sourceLayerIds,
				walls: true,
				doors: true,
				lights: true,
				seed: `derive-${Date.now().toString(36)}`,
				idPrefix: `drv-${Date.now().toString(36)}`,
				visibility: 'dm-only',
			},
		} as never).then((accepted) => {
			// `run` is single-flight and also returns false on a core refusal, so announcing on the
			// next line claimed a whole wall/door/light pass had landed when nothing had.
			if (accepted) announce(t('mapInspector.derived'));
		});
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<Section title={t('mapInspector.map')}>
				{isDm ? (
					<>
						<Field label={t('mapInspector.name')}>
							<Input
								value={name}
								onChange={(e: { target: { value: string } }) => setName(e.target.value)}
							/>
						</Field>
						<Field label={t('mapInspector.description')}>
							<Textarea
								rows={2}
								value={desc}
								onChange={(e: { target: { value: string } }) => setDesc(e.target.value)}
							/>
						</Field>
						<Button
							variant="secondary"
							size="sm"
							icon="check"
							disabled={
								editor.busy ||
								!name.trim() ||
								(name.trim() === map.name && desc === map.description)
							}
							onClick={() =>
								void run({
									type: 'map.update-metadata',
									actorId,
									payload: { mapId, name: name.trim(), description: desc },
								} as never)
							}
						>
							{t('mapInspector.saveMeta')}
						</Button>
					</>
				) : (
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							gap: 'var(--space-2)',
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<span>{t('mapInspector.name')}</span>
						<span style={{ color: T.ink }}>{map.name}</span>
					</div>
				)}
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						gap: 'var(--space-2)',
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<span>{t('common.visibility.label')}</span>
					<VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} />
				</div>
			</Section>

			{isDm && (
				<Section title={t('mapInspector.scale')}>
					<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
						<Field label={t('mapInspector.distanceAcross')} style={{ flex: 1 }}>
							<Input
								type="number"
								value={scaleUnits}
								placeholder={t('mapInspector.distancePlaceholder')}
								aria-label={t('mapInspector.distanceLabel')}
								onChange={(e: { target: { value: string } }) => setScaleUnits(e.target.value)}
							/>
						</Field>
						<Field label={t('mapInspector.unit')} style={{ flex: 1 }}>
							<Input
								value={scaleUnit}
								onChange={(e: { target: { value: string } }) => setScaleUnit(e.target.value)}
							/>
						</Field>
					</div>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="check"
							disabled={editor.busy || !(Number(scaleUnits) > 0) || !scaleUnit.trim()}
							onClick={() =>
								void run({
									type: 'map.set-scale',
									actorId,
									payload: {
										mapId,
										scale: { unitsPerMap: Number(scaleUnits), unit: scaleUnit.trim() },
									},
								} as never)
							}
						>
							{t('mapInspector.setScale')}
						</Button>
						{map.scale && (
							<Button
								variant="ghost"
								size="sm"
								disabled={editor.busy}
								onClick={() =>
									void run({
										type: 'map.set-scale',
										actorId,
										payload: { mapId, scale: null },
									} as never)
								}
							>
								{t('mapInspector.clear')}
							</Button>
						)}
					</div>
				</Section>
			)}

			{isDm && (
				<Section title={t('mapInspector.projection')}>
					<Select
						value={runtime.state.maps.maps[mapId]?.projection.kind ?? 'flat'}
						aria-label={t('mapInspector.projection')}
						options={[
							{ value: 'flat', label: t('mapInspector.projection.flat') },
							{ value: 'equirectangular', label: t('mapInspector.projection.equirectangular') },
							{ value: 'web-mercator', label: t('mapInspector.projection.webMercator') },
						]}
						onChange={(e: { target: { value: string } }) =>
							void run({
								type: 'map.set-projection',
								actorId,
								payload: { mapId, projection: { kind: e.target.value, rotationDegrees: 0 } },
							} as never)
						}
					/>
				</Section>
			)}

			{isDm && overlay && (
				<Section title={t('mapInspector.gridOverlay')}>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 'var(--space-2)',
						}}
					>
						<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>
							{t('mapInspector.gridMode')}
						</span>
						<Select
							value={overlay.mode}
							aria-label={t('mapInspector.overlayMode')}
							options={[
								{ value: 'none', label: t('mapInspector.overlay.none') },
								{ value: 'grid-align', label: t('mapInspector.overlay.gridAlign') },
								{ value: 'token', label: t('mapInspector.overlay.token') },
								{ value: 'range', label: t('mapInspector.overlay.range') },
								{ value: 'area-of-effect', label: t('mapInspector.overlay.areaOfEffect') },
								{ value: 'combat', label: t('mapInspector.overlay.combat') },
							]}
							onChange={(e: { target: { value: string } }) =>
								void run({
									type: 'map.set-overlay-mode',
									actorId,
									payload: { mapId, mode: e.target.value, autoSatisfyPrerequisites: true },
								} as never)
							}
							style={{ minWidth: 150 }}
						/>
					</label>
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
						<span style={{ font: `12.5px ${T.sans}`, color: T.sub, minWidth: 66 }}>
							{t('mapInspector.cellsAcross')}
						</span>
						<CommitSlider
							min={2}
							max={40}
							step={1}
							value={overlay.gridSize}
							aria-label={t('mapInspector.gridCellsAcross')}
							format={String}
							onCommit={(v: number) =>
								void run({
									type: 'map.configure-overlay',
									actorId,
									payload: { mapId, gridSize: v },
								} as never)
							}
							style={{ flex: 1 }}
							readoutStyle={{
								font: `12px ${T.mono}`,
								color: T.ink,
								width: 28,
								textAlign: 'right',
							}}
						/>
					</div>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 'var(--space-2)',
						}}
					>
						<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>
							{t('mapInspector.showGrid')}
						</span>
						<input
							type="checkbox"
							checked={overlay.gridVisible}
							aria-label={t('mapInspector.showGrid')}
							onChange={() =>
								void run({
									type: 'map.configure-overlay',
									actorId,
									payload: { mapId, gridVisible: !overlay.gridVisible },
								} as never)
							}
							style={{ accentColor: 'var(--color-accent)', width: 16, height: 16 }}
						/>
					</label>
				</Section>
			)}

			{isDm && (
				<Section title={t('mapInspector.exportDerive')}>
					<Button variant="secondary" size="sm" icon="download" onClick={() => void exportUvtt()}>
						{t('mapInspector.exportUvtt')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="tool-wall"
						disabled={editor.busy}
						onClick={deriveAll}
					>
						{t('mapInspector.derive')}
					</Button>
				</Section>
			)}

			{combatRoster && (
				<CombatRosterSection
					combat={combatRoster}
					selectedCombatantId={selectedCombatantId}
					onSelect={onSelectCombatant}
				/>
			)}

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-1)',
					font: `12px ${T.sans}`,
					color: T.sub,
				}}
			>
				{(
					[
						['mapInspector.count.layers', editor.layers.length],
						['mapInspector.count.pois', map.pois.length],
						['mapInspector.count.tokens', map.tokens.length],
						['mapInspector.count.fog', map.fog.length],
						['mapInspector.count.routes', map.routes.length],
					] as const satisfies readonly (readonly [MessageKey, number])[]
				).map(([k, v]) => (
					<div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
						<span>{t(k)}</span>
						<span style={{ font: `12px ${T.mono}`, color: T.ink }}>{v}</span>
					</div>
				))}
			</div>
		</div>
	);
}
