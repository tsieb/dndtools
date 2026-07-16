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
import { VIS_TEXT } from '../mapVocab';

const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
const POI_CATEGORIES = [
	'settlement',
	'landmark',
	'dungeon',
	'quest',
	'hazard',
	'shop',
	'npc',
	'note',
	'other',
] as const;

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

	if (!map) return <div style={{ font: `13px ${T.sans}`, color: T.sub }}>No map open.</div>;
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
		} as never);
		announce('Derived walls, doors, and lights.');
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<Section title="Map">
				{isDm ? (
					<>
						<Field label="Name">
							<Input
								value={name}
								onChange={(e: { target: { value: string } }) => setName(e.target.value)}
							/>
						</Field>
						<Field label="Description">
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
							Save name & description
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
						<span>Name</span>
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
					<span>Visibility</span>
					<VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} />
				</div>
			</Section>

			{isDm && (
				<Section title="Scale">
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
						<Field label="Distance across" style={{ flex: 1 }}>
							<Input
								type="number"
								value={scaleUnits}
								placeholder="e.g. 120"
								aria-label="Distance across the map"
								onChange={(e: { target: { value: string } }) => setScaleUnits(e.target.value)}
							/>
						</Field>
						<Field label="Unit" style={{ flex: 1 }}>
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
							Set scale
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
								Clear
							</Button>
						)}
					</div>
				</Section>
			)}

			{isDm && (
				<Section title="Projection">
					<Select
						value={runtime.state.maps.maps[mapId]?.projection.kind ?? 'flat'}
						aria-label="Projection"
						options={[
							{ value: 'flat', label: 'Flat' },
							{ value: 'equirectangular', label: 'Equirectangular' },
							{ value: 'web-mercator', label: 'Web Mercator' },
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
				<Section title="Grid & overlay">
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 10,
						}}
					>
						<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>Grid mode</span>
						<Select
							value={overlay.mode}
							aria-label="Overlay mode"
							options={[
								{ value: 'none', label: 'None' },
								{ value: 'grid-align', label: 'Grid align' },
								{ value: 'token', label: 'Token' },
								{ value: 'range', label: 'Range' },
								{ value: 'area-of-effect', label: 'Area of effect' },
								{ value: 'combat', label: 'Combat' },
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
							Cells across
						</span>
						<Slider
							min={2}
							max={40}
							step={1}
							value={overlay.gridSize}
							aria-label="Grid cells across"
							valueLabel={String(overlay.gridSize)}
							onChange={(v: number) =>
								void run({
									type: 'map.configure-overlay',
									actorId,
									payload: { mapId, gridSize: v },
								} as never)
							}
							style={{ flex: 1 }}
						/>
						<span style={{ font: `12px ${T.mono}`, color: T.ink, width: 28, textAlign: 'right' }}>
							{overlay.gridSize}
						</span>
					</div>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 10,
						}}
					>
						<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>Show grid</span>
						<input
							type="checkbox"
							checked={overlay.gridVisible}
							aria-label="Show grid"
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
				<Section title="Export & derive">
					<Button variant="secondary" size="sm" icon="download" onClick={() => void exportUvtt()}>
						Export UVTT (.dd2vtt)
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="tool-wall"
						disabled={editor.busy}
						onClick={deriveAll}
					>
						Derive walls / doors / lights
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
						['Layers', editor.layers.length],
						['Points of interest', map.pois.length],
						['Tokens', map.tokens.length],
						['Fog edits', map.fog.length],
						['Routes', map.routes.length],
					] as const
				).map(([k, v]) => (
					<div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
						<span>{k}</span>
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
			<Section title="Point of interest">
				<Field label="Label">
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== poi.label && patch({ label: label.trim() })}
					/>
				</Field>
				<Field label="Category">
					<Select
						value={poi.category}
						options={POI_CATEGORIES.map((c) => ({ value: c, label: c }))}
						onChange={(e: { target: { value: string } }) => patch({ category: e.target.value })}
					/>
				</Field>
				<Field label="Visibility">
					<Select
						value={poi.visibility}
						options={[
							{ value: 'dm-only', label: VIS_TEXT['dm-only'] },
							{ value: 'player-visible', label: VIS_TEXT['player-visible'] },
							{ value: 'shared', label: VIS_TEXT.shared },
						]}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<Field label="Notes" help="A player only ever sees a player-visible POI's notes.">
					<Textarea
						rows={3}
						value={notes}
						onChange={(e: { target: { value: string } }) => setNotes(e.target.value)}
						onBlur={() => notes !== poi.notes && patch({ notes })}
					/>
				</Field>
			</Section>

			<Section title="Link">
				<div style={{ display: 'flex', gap: 8 }}>
					<Field label="Entity type" style={{ flex: 1 }}>
						<Input
							value={linkType}
							placeholder="e.g. note, character"
							onChange={(e: { target: { value: string } }) => setLinkType(e.target.value)}
						/>
					</Field>
					<Field label="Entity id" style={{ flex: 1 }}>
						<Input
							value={linkId}
							placeholder="id"
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
					Save link
				</Button>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				onClick={() => {
					void run({ type: 'map.delete-poi', actorId, payload: { mapId, poiId: poi.id } } as never);
					editor.clearSelection();
					announce(`POI “${poi.label}” deleted.`);
				}}
			>
				Delete POI
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
			<Section title="Token">
				<Field label="Label">
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== token.label && patch({ label: label.trim() })}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, minWidth: 40 }}>Size</span>
					<Slider
						min={0.5}
						max={4}
						step={0.5}
						value={token.size}
						aria-label="Token size"
						valueLabel={`${token.size}×`}
						onChange={(v: number) => patch({ size: v })}
						style={{ flex: 1 }}
					/>
					<span style={{ font: `12px ${T.mono}`, color: T.ink }}>{token.size}×</span>
				</div>
				<Field label="Visibility">
					<Select
						value={token.visibility}
						options={[
							{ value: 'dm-only', label: VIS_TEXT['dm-only'] },
							{ value: 'player-visible', label: VIS_TEXT['player-visible'] },
							{ value: 'shared', label: VIS_TEXT.shared },
						]}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{token.linkedActorId ? 'Linked to an actor.' : 'Not linked to an actor.'}
				</div>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				onClick={() => {
					void run({
						type: 'map.delete-token',
						actorId,
						payload: { mapId, tokenId: token.id },
					} as never);
					editor.clearSelection();
					announce(`Token “${token.label}” deleted.`);
				}}
			>
				Delete token
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
	const { run, actorId, mapId } = editor;
	const pois = editor.map?.pois ?? [];
	const tokens = editor.map?.tokens ?? [];
	const selectedPois = pois.filter((p) => editor.selection.includes(p.id));
	const selectedTokens = tokens.filter((t) => editor.selection.includes(t.id));

	const setVisibility = (visibility: SceneVisibility) => {
		for (const p of selectedPois)
			void run({
				type: 'map.update-poi',
				actorId,
				payload: { mapId, poiId: p.id, visibility },
			} as never);
		for (const t of selectedTokens)
			void run({
				type: 'map.update-token',
				actorId,
				payload: { mapId, tokenId: t.id, visibility },
			} as never);
		announce(`${editor.selection.length} objects set to ${VIS_TEXT[visibility]}.`);
	};
	const deleteAll = () => {
		for (const p of selectedPois)
			void run({ type: 'map.delete-poi', actorId, payload: { mapId, poiId: p.id } } as never);
		for (const t of selectedTokens)
			void run({ type: 'map.delete-token', actorId, payload: { mapId, tokenId: t.id } } as never);
		editor.clearSelection();
		announce('Deleted selection.');
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			<Section title={`${editor.selection.length} selected`}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{selectedPois.length} POI{selectedPois.length === 1 ? '' : 's'} · {selectedTokens.length}{' '}
					token
					{selectedTokens.length === 1 ? '' : 's'}
				</div>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					<Button
						variant="secondary"
						size="sm"
						icon="dm-only"
						onClick={() => setVisibility('dm-only')}
					>
						DM only
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						onClick={() => setVisibility('player-visible')}
					>
						Player visible
					</Button>
				</div>
				<Button variant="danger" size="sm" icon="delete" onClick={deleteAll}>
					Delete selection
				</Button>
			</Section>
		</div>
	);
}
