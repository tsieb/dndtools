import { useMemo, useState } from 'react';
import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	queryMapLayers,
	MAP_POI_CATEGORIES,
	type MapLayerCategory,
	type MapPoiCategory,
	type SceneVisibility,
} from '@dndtools/core';
import { Badge, Button, Icon, IconButton, Input, Select, StatusDot, Switch } from '../ds';
import { Page, Panel, T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Atlas — the map library, now wired to the live Processing Core (was static `mockCampaign`). The map
 * switcher reads the actor-filtered `listMapsForActor`; opening a map reads the single MAP-018 keystone
 * `getMapViewForActor` (so a player/observer device only ever sees player-safe maps, layers, POIs, fog,
 * and tokens). Every mutation — create map, add/reorder/toggle layers, create/reveal POIs & fog —
 * dispatches a durable Processing-Core command through `runtime.dispatch`; the GUI never writes state
 * or re-derives visibility (Architecture Contract 1). The map CANVAS is a stylized placeholder: the
 * pixel renderer (and a pixel "builder") is deferred per ADR-014, so this wires the DATA/CONTROL layer.
 */

const ghostBtn = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const;

// The layer-type → `--layer-*` hue map (mirrors apps/gm MapLayerPanel.svelte CATEGORY tones).
const CATEGORY_VAR: Record<MapLayerCategory, string> = {
	base: '--layer-base',
	terrain: '--layer-height',
	roads: '--layer-roads',
	poi: '--layer-poi',
	fog: '--layer-fog',
	'dm-annotations': '--layer-dm',
	'player-overlay': '--layer-player',
};
const CATEGORY_LABEL: Record<MapLayerCategory, string> = {
	base: 'Base',
	terrain: 'Terrain',
	roads: 'Roads',
	poi: 'POI',
	fog: 'Fog',
	'dm-annotations': 'DM notes',
	'player-overlay': 'Player overlay',
};
const VIS_LABEL: Record<string, string> = {
	'dm-only': 'DM only',
	'player-visible': 'Player visible',
	shared: 'Shared',
};
const VIS_STATUS: Record<string, 'neutral' | 'info' | 'success'> = {
	'dm-only': 'neutral',
	'player-visible': 'info',
	shared: 'success',
};
const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Player visible' },
	{ value: 'shared', label: 'Shared' },
];

export function Atlas() {
	const runtime = useRuntime();
	// One actor id for EVERY query AND every dispatch payload — this is what makes "view as player"
	// render player-safe rather than just visually filtered (Contract 3). `defaultActorId` tracks the
	// active "view as" actor in this runtime.
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [mapId, setMapId] = useState<string | null>(null);
	const [mapZoom, setMapZoom] = useState(1);
	// Presentation-only canvas veil — the real pixel fog renderer is deferred (ADR-014). Toggling it is
	// a DM preview; the durable reveal/conceal still dispatches a `map.append-fog` op below.
	const [showVeil, setShowVeil] = useState(true);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	// New-map inline create form (DM authoring) — dispatches a real `map.create`.
	const [creating, setCreating] = useState(false);
	const [newMapName, setNewMapName] = useState('');
	const [newMapVis, setNewMapVis] = useState<SceneVisibility>('dm-only');

	// POI authoring form state.
	const [poiLabel, setPoiLabel] = useState('');
	const [poiCategory, setPoiCategory] = useState<MapPoiCategory>('landmark');
	const [poiVis, setPoiVis] = useState<SceneVisibility>('dm-only');

	const delivered = useMemo(
		() => deliveredMapIdsForActor(runtime.state.session, actorId),
		[runtime.state.session, actorId],
	);
	const maps = useMemo(
		() => listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId),
		[runtime.state.maps, runtime.state.permissions, actorId],
	);

	// Async load → `maps` is empty on the first paint, so never index `maps[0]` in a state initializer.
	// Selection falls back to the first visible map and clears if the selected map is no longer visible.
	const selectedId = mapId && maps.some((mp) => mp.id === mapId) ? mapId : maps[0]?.id ?? null;
	const selectedEntry = maps.find((mp) => mp.id === selectedId) ?? null;

	const view = useMemo(
		() =>
			selectedId
				? getMapViewForActor(runtime.state.maps, runtime.state.permissions, actorId, selectedId, {
						deliveredMapIds: delivered,
					})
				: null,
		[runtime.state.maps, runtime.state.permissions, actorId, selectedId, delivered],
	);
	const mapView = view && view.kind === 'available' ? view : null;

	const layerResult = useMemo(
		() =>
			selectedId
				? queryMapLayers(runtime.state.maps, runtime.state.permissions, actorId, { mapId: selectedId })
				: { layers: [], hiddenMatchCount: 0 },
		[runtime.state.maps, runtime.state.permissions, actorId, selectedId],
	);
	const layers = layerResult.layers;
	const firstLayerId = mapView?.layers[0]?.id ?? null;

	// The single durable write path with a re-entrancy guard (mirrors the Svelte panels' `busy`).
	const run = async (command: Parameters<typeof runtime.dispatch>[0]) => {
		if (busy) return undefined;
		setBusy(true);
		try {
			return await runtime.dispatch(command);
		} finally {
			setBusy(false);
		}
	};

	const zoom = (delta?: number, fit?: boolean) =>
		setMapZoom((z) => (fit ? 1 : Math.min(2.4, Math.max(0.4, +(z + (delta ?? 0)).toFixed(2)))));

	async function createMap() {
		const name = newMapName.trim();
		if (!name) return;
		const res = await run({
			type: 'map.create',
			actorId,
			payload: {
				name,
				visibility: newMapVis,
				scale: null,
				projection: { kind: 'flat', rotationDegrees: 0 },
				initialLayers: [{ name: 'Base', category: 'base', visibility: newMapVis }],
			},
		});
		if (res?.status === 'accepted') {
			const created = (res.events as Array<{ kind: string; mapId?: string }> | undefined)?.find(
				(e) => e.kind === 'map.created',
			);
			if (created?.mapId) setMapId(created.mapId);
			setNewMapName('');
			setCreating(false);
		}
	}

	function addLayer() {
		if (!selectedId) return;
		void run({
			type: 'map.create-layer',
			actorId,
			payload: { mapId: selectedId, name: `Layer ${layers.length + 1}`, category: 'dm-annotations', visibility: 'dm-only' },
		});
	}
	function toggleLayerVisibility(layerId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.set-layer-visibility',
			actorId,
			payload: { mapId: selectedId, layerId, visibility: visibility === 'dm-only' ? 'player-visible' : 'dm-only' },
		});
	}
	function toggleLayerEnabled(layerId: string, enabled: boolean) {
		if (!selectedId) return;
		void run({ type: 'map.set-layer-enabled', actorId, payload: { mapId: selectedId, layerId, enabled: !enabled } });
	}
	function reorderLayer(layerId: string, toOrder: number) {
		if (!selectedId) return;
		void run({ type: 'map.reorder-layer', actorId, payload: { mapId: selectedId, layerId, toOrder } });
	}

	async function createPoi() {
		const label = poiLabel.trim();
		if (!selectedId || !firstLayerId || !label) return;
		const res = await run({
			type: 'map.create-poi',
			actorId,
			payload: { mapId: selectedId, layerId: firstLayerId, label, category: poiCategory, position: { x: 0.5, y: 0.5 }, visibility: poiVis },
		});
		if (res?.status === 'accepted') setPoiLabel('');
	}
	function togglePoiVisibility(poiId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId: selectedId, poiId, visibility: visibility === 'dm-only' ? 'player-visible' : 'dm-only' },
		});
	}
	function deletePoi(poiId: string) {
		if (!selectedId) return;
		void run({ type: 'map.delete-poi', actorId, payload: { mapId: selectedId, poiId } });
	}

	function appendFog(kind: 'reveal' | 'conceal') {
		if (!selectedId || !firstLayerId) return;
		setShowVeil(kind === 'conceal');
		void run({
			type: 'map.append-fog',
			actorId,
			payload: { mapId: selectedId, layerId: firstLayerId, kind, region: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, visibility: 'shared', connectionState: 'connected' },
		});
	}

	return (
		<Page max={1320}>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
				{maps.map((mp) => {
					const on = mp.id === selectedId;
					return (
						<button
							key={mp.id}
							type="button"
							onClick={() => {
								setMapId(mp.id);
								setMapZoom(1);
								setShowVeil(true);
							}}
							style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : T.surf, color: on ? T.acc : T.sub, font: `600 12.5px ${T.sans}` }}
						>
							<Icon name="atlas-map" size={14} color={on ? T.acc : T.ter} />
							{mp.name}
							{delivered.has(mp.id) && <StatusDot status="live" pulse />}
						</button>
					);
				})}
				{maps.length === 0 && (
					<span style={{ font: `13px ${T.sans}`, color: T.ter, padding: '7px 4px' }}>No maps are visible to you.</span>
				)}
				<div style={{ flex: 1 }} />
				<Button
					variant="ghost"
					size="sm"
					icon="edit"
					onClick={() => setNotice('Pixel map builder is deferred in this prototype (ADR-014) — author maps via the layer, POI, and fog controls.')}
				>
					Open in builder
				</Button>
				{isDm && (
					<Button variant="secondary" size="sm" icon="new-map" onClick={() => setCreating((c) => !c)}>
						New map
					</Button>
				)}
			</div>

			{notice && (
				<div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 9, background: T.alt, border: `1px solid ${T.bd}`, font: `12.5px ${T.sans}`, color: T.sub, display: 'flex', alignItems: 'center', gap: 10 }}>
					<Icon name="info" size={15} color={T.info} />
					<span style={{ flex: 1 }}>{notice}</span>
					<button type="button" onClick={() => setNotice(null)} style={ghostBtn} title="Dismiss">
						<Icon name="close" size={14} color={T.ter} />
					</button>
				</div>
			)}

			{creating && isDm && (
				<div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: T.raised, border: `1px solid ${T.accBd}`, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
					<label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
						<span style={{ font: `600 11px ${T.sans}`, color: T.sub }}>Map name</span>
						<Input value={newMapName} placeholder="e.g. Sunless Citadel" onChange={(e: { target: { value: string } }) => setNewMapName(e.target.value)} />
					</label>
					<label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 170px' }}>
						<span style={{ font: `600 11px ${T.sans}`, color: T.sub }}>Default visibility</span>
						<Select value={newMapVis} options={VIS_OPTIONS} onChange={(e: { target: { value: string } }) => setNewMapVis(e.target.value as SceneVisibility)} />
					</label>
					<Button variant="primary" size="sm" icon="new-map" disabled={busy || !newMapName.trim()} onClick={createMap}>
						Create map
					</Button>
					<Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
						Cancel
					</Button>
				</div>
			)}

			<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18, alignItems: 'start' }}>
				{/* canvas — stylized placeholder; the pixel renderer is deferred (ADR-014). Tokens, name, and
				    visibility are REAL (actor-filtered map view); grid + fog veil are presentation only. */}
				<div style={{ position: 'relative', height: 560, borderRadius: 12, overflow: 'hidden', background: 'radial-gradient(700px 400px at 40% 30%, #2a2016, #14100b 75%)', border: `1px solid ${T.bd}` }}>
					<div style={{ position: 'absolute', inset: 0, transform: `scale(${mapZoom})`, transformOrigin: 'center center', transition: 'transform var(--duration-fast) var(--easing-standard)' }}>
						<div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
						{mapView?.tokens.map((t) => (
							<div key={t.id} style={{ position: 'absolute', left: `${t.position.x * 100}%`, top: `${t.position.y * 100}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
								<span style={{ width: 30, height: 30, borderRadius: '50%', border: `2.5px solid ${t.linkedActorId ? T.ok : T.err}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 11px ${T.mono}`, color: T.ink, boxShadow: T.ssm }}>
									{t.label[0]}
								</span>
								<span style={{ font: `10px ${T.sans}`, color: T.sub, background: 'rgba(0,0,0,.4)', padding: '1px 5px', borderRadius: 4 }}>{t.label}</span>
							</div>
						))}
					</div>
					{/* presentation-only fog veil (pixel fog deferred — ADR-014) */}
					{showVeil && (
						<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(20,16,11,.92) 0%, rgba(20,16,11,.5) 38%, rgba(20,16,11,0) 60%)', pointerEvents: 'none' }} />
					)}
					<div style={{ position: 'absolute', top: 12, left: 14, maxWidth: 'calc(100% - 190px)', display: 'flex', flexDirection: 'column', gap: 2, padding: '5px 11px', borderRadius: 8, background: 'rgba(13,10,7,.55)', backdropFilter: 'blur(2px)', border: `1px solid ${T.bd}` }}>
						<span style={{ font: `700 16px ${T.disp}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
							{mapView?.name ?? selectedEntry?.name ?? 'No map selected'}
						</span>
						{selectedEntry && (
							<span style={{ display: 'flex', alignItems: 'center', gap: 7, font: `11px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
								<Badge status={VIS_STATUS[selectedEntry.visibility] ?? 'neutral'}>{VIS_LABEL[selectedEntry.visibility] ?? selectedEntry.visibility}</Badge>
								{selectedEntry.description || 'No description'}
							</span>
						)}
					</div>
					<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
						<IconButton icon="zoom-in" label="Zoom in" variant="outline" size="sm" onClick={() => zoom(0.2)} />
						<IconButton icon="zoom-out" label="Zoom out" variant="outline" size="sm" onClick={() => zoom(-0.2)} />
						<IconButton icon="zoom-fit" label="Fit" variant="outline" size="sm" onClick={() => zoom(undefined, true)} />
						<span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 7, background: 'rgba(0,0,0,.45)', font: `11px ${T.mono}`, color: T.ink }}>{Math.round(mapZoom * 100)}%</span>
					</div>
					{view?.kind === 'unavailable' && (
						<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `13px ${T.sans}`, color: T.sub }}>
							This map is unavailable to you.
						</div>
					)}
					<div style={{ position: 'absolute', bottom: 12, left: 14, display: 'flex', gap: 8 }}>
						{isDm && mapView && (
							<Button variant={showVeil ? 'primary' : 'secondary'} size="sm" icon={showVeil ? 'reveal' : 'conceal'} disabled={busy || !firstLayerId} onClick={() => appendFog(showVeil ? 'reveal' : 'conceal')}>
								{showVeil ? 'Reveal area' : 'Conceal'}
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							icon="visibility-players"
							onClick={() => setNotice('Projection to players runs from the Session console (session.project-active-map requires an active session). The live dot marks maps already delivered to this device.')}
						>
							Project to players
						</Button>
					</div>
				</div>

				{/* side rails — all real, actor-filtered Core data */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel
						title={
							<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								Layers
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{layers.length}
									{isDm && layerResult.hiddenMatchCount > 0 ? ` · ${layerResult.hiddenMatchCount} hidden` : ''}
								</span>
							</span>
						}
						action={isDm && selectedId ? <IconButton icon="add" label="Add layer" variant="ghost" size="sm" disabled={busy} onClick={addLayer} /> : undefined}
					>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
							{layers.map((l, i) => (
								<div key={l.layerId} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px', borderRadius: 8, background: l.enabled ? 'transparent' : T.alt }}>
									{isDm ? (
										<span style={{ display: 'flex', flexDirection: 'column' }}>
											<button type="button" title="Move up" disabled={busy || i === 0} onClick={() => reorderLayer(l.layerId, i - 1)} style={{ ...ghostBtn, opacity: i === 0 ? 0.3 : 1 }}>
												<Icon name="chevron-up" size={12} color={T.ter} />
											</button>
											<button type="button" title="Move down" disabled={busy || i === layers.length - 1} onClick={() => reorderLayer(l.layerId, i + 1)} style={{ ...ghostBtn, opacity: i === layers.length - 1 ? 0.3 : 1 }}>
												<Icon name="chevron-down" size={12} color={T.ter} />
											</button>
										</span>
									) : (
										<Icon name="drag-handle" size={14} color={T.ter} />
									)}
									<span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${CATEGORY_VAR[l.category] ?? '--layer-base'})`, flex: '0 0 auto' }} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `12.5px ${T.sans}`, color: l.enabled ? T.ink : T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
										<div style={{ font: `10.5px ${T.mono}`, color: T.ter }}>
											{CATEGORY_LABEL[l.category] ?? l.category} · {Math.round(l.opacity * 100)}% · {l.content.length} marks
										</div>
									</div>
									{isDm ? (
										<>
											<button type="button" title="Toggle player visibility" disabled={busy} onClick={() => toggleLayerVisibility(l.layerId, l.visibility)} style={ghostBtn}>
												<Icon name={l.visibility === 'dm-only' ? 'dm-only' : 'visibility-players'} size={15} color={l.visibility === 'dm-only' ? T.dm : T.ok} />
											</button>
											<Switch checked={l.enabled} onChange={() => toggleLayerEnabled(l.layerId, l.enabled)} />
										</>
									) : (
										<Badge status={VIS_STATUS[l.visibility] ?? 'neutral'}>{VIS_LABEL[l.visibility] ?? l.visibility}</Badge>
									)}
								</div>
							))}
							{layers.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '4px 6px' }}>No layers are visible to you.</div>}
						</div>
					</Panel>

					<Panel
						title={
							<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								Points of interest
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{mapView?.pois.length ?? 0}
									{isDm && mapView && mapView.hidden.pois > 0 ? ` · ${mapView.hidden.pois} hidden` : ''}
								</span>
							</span>
						}
					>
						{isDm && mapView && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${T.bd}` }}>
								<Input value={poiLabel} placeholder="POI label" onChange={(e: { target: { value: string } }) => setPoiLabel(e.target.value)} />
								<div style={{ display: 'flex', gap: 8 }}>
									<Select value={poiCategory} options={MAP_POI_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(e: { target: { value: string } }) => setPoiCategory(e.target.value as MapPoiCategory)} style={{ flex: 1 }} />
									<Select value={poiVis} options={VIS_OPTIONS} onChange={(e: { target: { value: string } }) => setPoiVis(e.target.value as SceneVisibility)} style={{ flex: 1 }} />
								</div>
								<Button variant="secondary" size="sm" icon="add" disabled={busy || !firstLayerId || !poiLabel.trim()} onClick={createPoi}>
									Add POI
								</Button>
								{!firstLayerId && <div style={{ font: `11px ${T.sans}`, color: T.ter }}>Add a visible layer first to place a POI.</div>}
							</div>
						)}
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{mapView?.pois.map((poi) => (
								<div key={poi.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `12.5px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{poi.label}</div>
										<div style={{ font: `10.5px ${T.mono}`, color: T.ter }}>{poi.category}</div>
									</div>
									{isDm ? (
										<>
											<button type="button" title="Toggle player visibility" disabled={busy} onClick={() => togglePoiVisibility(poi.id, poi.visibility)} style={ghostBtn}>
												<Icon name={poi.visibility === 'dm-only' ? 'dm-only' : 'visibility-players'} size={15} color={poi.visibility === 'dm-only' ? T.dm : T.ok} />
											</button>
											<button type="button" title="Delete POI" disabled={busy} onClick={() => deletePoi(poi.id)} style={ghostBtn}>
												<Icon name="delete" size={14} color={T.ter} />
											</button>
										</>
									) : (
										<Badge status={VIS_STATUS[poi.visibility] ?? 'neutral'}>{VIS_LABEL[poi.visibility] ?? poi.visibility}</Badge>
									)}
								</div>
							))}
							{mapView && mapView.pois.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No points of interest{isDm ? ' yet.' : ' are visible to you.'}</div>}
							{!mapView && <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Open a map to see its points of interest.</div>}
						</div>
					</Panel>

					<Panel
						title={
							<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								Fog of war
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>{mapView?.fog.length ?? 0} ops</span>
							</span>
						}
					>
						<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
							The DM authors reveal/conceal regions as durable fog ops; players see only the resulting fog. The canvas veil above is a presentation preview (pixel fog deferred, ADR-014).
						</div>
						{isDm && mapView && (
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="secondary" size="sm" icon="reveal" disabled={busy || !firstLayerId} onClick={() => appendFog('reveal')}>
									Reveal area
								</Button>
								<Button variant="secondary" size="sm" icon="conceal" disabled={busy || !firstLayerId} onClick={() => appendFog('conceal')}>
									Conceal area
								</Button>
							</div>
						)}
						{mapView && mapView.fog.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								{mapView.fog.slice(-4).map((op) => (
									<div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `11px ${T.mono}`, color: T.ter }}>
										<Badge status={op.kind === 'reveal' ? 'success' : 'neutral'}>{op.kind}</Badge>
										seq {op.sequence}
									</div>
								))}
							</div>
						)}
					</Panel>
				</div>
			</div>
		</Page>
	);
}
