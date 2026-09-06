import { useEffect, useState } from 'react';
import {
	exportUvttJson,
	type MapPoiView,
	type MapTokenView,
	type SceneVisibility,
} from '@dndtools/core';
import { Button, Field, Input, Select, Slider, Textarea, VisibilityChip } from '../../../ds';
import { T, eb } from '../../screen-kit';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { exportFile, FileExportError } from '../../../platform/download';
import type { MapEditorApi } from '../useMapEditor';
import { VIS_TEXT, bulkResultMessage } from '../mapVocab';
import { useI18n } from '../../../i18n';
import type { MessageKey } from '../../../i18n';
import { POI_CATEGORIES, VIS_CHIP, VIS_OPTION_KEYS } from './inspectorVocab';

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
function CommitSlider({
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

/**
 * MAP-021 — the Inspector: parameters of the NOUN. It is selection-driven and mutates existing content.
 * EMPTY selection ⇒ the map/scene properties (name, description, scale, projection, grid/overlay), a
 * UVTT export, and a derive-features action. One POI / token ⇒ that object's editable fields. Multiple
 * ⇒ bulk visibility + delete.
 */
export function InspectorPanel({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (message: string) => void;
}) {
	const selected = editor.selection;
	const pois = editor.map?.pois ?? [];
	const tokens = editor.map?.tokens ?? [];

	if (selected.length === 1) {
		const poi = pois.find((p) => p.id === selected[0]);
		if (poi) return <PoiInspector editor={editor} poi={poi} announce={announce} />;
		const token = tokens.find((t) => t.id === selected[0]);
		if (token) return <TokenInspector editor={editor} token={token} announce={announce} />;
	}
	if (selected.length > 1) {
		return <MultiInspector editor={editor} announce={announce} />;
	}
	return <MapInspector editor={editor} announce={announce} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={eb}>{title}</div>
			{children}
		</div>
	);
}

// ── Map / scene properties (empty selection) ────────────────────────────────────────────────────
function MapInspector({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (m: string) => void;
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
				title: `Export ${map?.name ?? 'map'}`,
			});
			announce(result.status === 'cancelled' ? 'Map export cancelled.' : 'UVTT scene exported.');
		} catch (error) {
			editor.setNotice(
				error instanceof FileExportError
					? error.message
					: 'The map could not be exported. Check available storage and try again.',
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
			editor.setNotice('No floor geometry to derive from. Paint rooms or generate a map first.');
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
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
							gap: 10,
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
						gap: 10,
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
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
					<div style={{ display: 'flex', gap: 8 }}>
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
							gap: 10,
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
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
							gap: 10,
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

			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 5,
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

// ── POI inspector ───────────────────────────────────────────────────────────────────────────────
function PoiInspector({
	editor,
	poi,
	announce,
}: {
	editor: MapEditorApi;
	poi: MapPoiView;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const [label, setLabel] = useState(poi.label);
	const [notes, setNotes] = useState(poi.notes);
	const [linkType, setLinkType] = useState(poi.linkedEntityType ?? '');
	const [linkId, setLinkId] = useState(poi.linkedEntityId ?? '');
	useEffect(() => {
		setLabel(poi.label);
		setNotes(poi.notes);
		setLinkType(poi.linkedEntityType ?? '');
		setLinkId(poi.linkedEntityId ?? '');
	}, [poi.id, poi.label, poi.notes, poi.linkedEntityType, poi.linkedEntityId]);
	const { run, actorId, mapId } = editor;
	const patch = (payload: Record<string, unknown>) =>
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId, poiId: poi.id, ...payload },
		} as never);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Section title={t('mapInspector.poi')}>
				<Field label={t('mapInspector.label')}>
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== poi.label && patch({ label: label.trim() })}
					/>
				</Field>
				<Field label={t('mapInspector.category')}>
					<Select
						value={poi.category}
						options={POI_CATEGORIES.map((c) => ({
							value: c,
							label: t(`mapInspector.poiCategory.${c}` as MessageKey),
						}))}
						onChange={(e: { target: { value: string } }) => patch({ category: e.target.value })}
					/>
				</Field>
				<Field label={t('common.visibility.label')}>
					<Select
						value={poi.visibility}
						options={VIS_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.label) }))}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<Field label={t('mapInspector.notes')} help={t('mapInspector.notesHelp')}>
					<Textarea
						rows={3}
						value={notes}
						onChange={(e: { target: { value: string } }) => setNotes(e.target.value)}
						onBlur={() => notes !== poi.notes && patch({ notes })}
					/>
				</Field>
			</Section>

			<Section title={t('mapInspector.link')}>
				<div style={{ display: 'flex', gap: 8 }}>
					<Field label={t('mapInspector.entityType')} style={{ flex: 1 }}>
						<Input
							value={linkType}
							placeholder={t('mapInspector.entityTypePlaceholder')}
							onChange={(e: { target: { value: string } }) => setLinkType(e.target.value)}
						/>
					</Field>
					<Field label={t('mapInspector.entityId')} style={{ flex: 1 }}>
						<Input
							value={linkId}
							placeholder={t('mapInspector.entityIdPlaceholder')}
							onChange={(e: { target: { value: string } }) => setLinkId(e.target.value)}
						/>
					</Field>
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="link"
					disabled={editor.busy}
					onClick={() =>
						patch({
							linkedEntityType: linkType.trim() || null,
							linkedEntityId: linkType.trim() && linkId.trim() ? linkId.trim() : null,
						})
					}
				>
					{t('mapInspector.saveLink')}
				</Button>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				// Await the command before clearing + announcing: fire-and-forget claimed success and
				// dropped the selection even when the dispatch was rejected, hiding the failure.
				onClick={async () => {
					const ok = await run({
						type: 'map.delete-poi',
						actorId,
						payload: { mapId, poiId: poi.id },
					} as never);
					if (!ok) return;
					editor.clearSelection();
					announce(t('mapInspector.poiDeleted', { label: poi.label }));
				}}
			>
				{t('mapInspector.deletePoi')}
			</Button>
		</div>
	);
}

// ── Token inspector ─────────────────────────────────────────────────────────────────────────────
function TokenInspector({
	editor,
	token,
	announce,
}: {
	editor: MapEditorApi;
	token: MapTokenView;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const [label, setLabel] = useState(token.label);
	useEffect(() => setLabel(token.label), [token.id, token.label]);
	const { run, actorId, mapId } = editor;
	const patch = (payload: Record<string, unknown>) =>
		void run({
			type: 'map.update-token',
			actorId,
			payload: { mapId, tokenId: token.id, ...payload },
		} as never);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Section title={t('mapInspector.token')}>
				<Field label={t('mapInspector.label')}>
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== token.label && patch({ label: label.trim() })}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, minWidth: 40 }}>
						{t('mapInspector.size')}
					</span>
					<CommitSlider
						min={0.5}
						max={4}
						step={0.5}
						value={token.size}
						aria-label={t('mapInspector.tokenSize')}
						format={(v: number) => `${v}×`}
						onCommit={(v: number) => patch({ size: v })}
						style={{ flex: 1 }}
						readoutStyle={{ font: `12px ${T.mono}`, color: T.ink }}
					/>
				</div>
				<Field label={t('common.visibility.label')}>
					<Select
						value={token.visibility}
						options={VIS_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.label) }))}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{token.linkedActorId ? t('mapInspector.linkedActor') : t('mapInspector.notLinkedActor')}
				</div>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				onClick={async () => {
					const ok = await run({
						type: 'map.delete-token',
						actorId,
						payload: { mapId, tokenId: token.id },
					} as never);
					if (!ok) return;
					editor.clearSelection();
					announce(t('mapInspector.tokenDeleted', { label: token.label }));
				}}
			>
				{t('mapInspector.deleteToken')}
			</Button>
		</div>
	);
}

// ── Multi-select ────────────────────────────────────────────────────────────────────────────────
function MultiInspector({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const { run, actorId, mapId } = editor;
	const pois = editor.map?.pois ?? [];
	const tokens = editor.map?.tokens ?? [];
	const selectedPois = pois.filter((p) => editor.selection.includes(p.id));
	const selectedTokens = tokens.filter((t) => editor.selection.includes(t.id));

	// `run` executes one command at a time and rejects re-entrant calls, so these loops MUST await.
	// Firing them synchronously applied only the first object while announcing the whole selection
	// had changed — and then cleared the selection, hiding the failure entirely.
	const setVisibility = async (visibility: SceneVisibility) => {
		let changed = 0;
		for (const p of selectedPois) {
			if (
				await run({
					type: 'map.update-poi',
					actorId,
					payload: { mapId, poiId: p.id, visibility },
				} as never)
			)
				changed += 1;
			else break;
		}
		for (const t of selectedTokens) {
			if (
				await run({
					type: 'map.update-token',
					actorId,
					payload: { mapId, tokenId: t.id, visibility },
				} as never)
			)
				changed += 1;
			else break;
		}
		announce(
			bulkResultMessage({
				done: changed,
				attempted: selectedPois.length + selectedTokens.length,
				template: `Set {objects} to ${VIS_TEXT[visibility]}.`,
				refusedVerb: 'changed',
			}),
		);
	};
	const deleteAll = async () => {
		const attempted = selectedPois.length + selectedTokens.length;
		const removed = new Set<string>();
		let deleted = 0;
		for (const p of selectedPois) {
			if (
				await run({ type: 'map.delete-poi', actorId, payload: { mapId, poiId: p.id } } as never)
			) {
				deleted += 1;
				removed.add(p.id);
			} else break;
		}
		for (const t of selectedTokens) {
			if (
				await run({ type: 'map.delete-token', actorId, payload: { mapId, tokenId: t.id } } as never)
			) {
				deleted += 1;
				removed.add(t.id);
			} else break;
		}
		// Clearing the selection on a REFUSAL destroyed the only state the DM could retry from after
		// unlocking the layer — and "Deleted 0 objects." claimed the work had happened. Same defect
		// run #21 fixed in `keyboard.ts`'s `deleteSelection`; this is its sibling call site.
		//
		// A PARTIAL refusal has the same shape and `deleted > 0` did not cover it: the loops stop on
		// the first refusal, so the survivors stayed on the map with their selection wiped, under a
		// message that (correctly) said the rest were refused but left nothing to retry with. Retire
		// only the ids that really went.
		if (deleted > 0) editor.setSelection(editor.selection.filter((id) => !removed.has(id)));
		announce(
			bulkResultMessage({
				done: deleted,
				attempted,
				template: 'Deleted {objects}.',
				refusedVerb: 'deleted',
			}),
		);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<Section title={t('mapInspector.selectedCount', { count: editor.selection.length })}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{t('mapInspector.selectionBreakdown', {
						pois: selectedPois.length,
						tokens: selectedTokens.length,
					})}
				</div>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					<Button
						variant="secondary"
						size="sm"
						icon="dm-only"
						onClick={() => setVisibility('dm-only')}
					>
						{t('common.visibility.dmOnly')}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						onClick={() => setVisibility('player-visible')}
					>
						{t('common.visibility.playerVisible')}
					</Button>
				</div>
				<Button variant="danger" size="sm" icon="delete" onClick={deleteAll}>
					{t('mapInspector.deleteSelection')}
				</Button>
			</Section>
		</div>
	);
}
