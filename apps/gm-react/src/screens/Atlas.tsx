import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	queryMapLayers,
	type SceneVisibility,
} from '@dndtools/core';
import { Badge, Button, Icon, IconButton, Input, POIPopover, Select, StatusDot, Switch } from '../ds';
import { Page, Panel, T } from '../app/screen-kit';
import { fogRegionSummary } from '../app/fogRegions';
import { pickRasterAssetId } from '../app/mapGeometry';
import {
	CATEGORY_LABEL,
	CATEGORY_VAR,
	MapBuilder,
	MapCanvas,
	POI_MARKER_CAT,
	VIS_LABEL,
	VIS_OPTIONS,
	VIS_STATUS,
	dsToVis,
	visToDs,
	type MapTool,
} from '../app/MapBuilder';
import { useAssetObjectUrl } from '../platform/assetUrl';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Atlas — the map library, wired to the live Processing Core. The map switcher reads the
 * actor-filtered `listMapsForActor`; opening a map reads the single MAP-018 keystone
 * `getMapViewForActor` (so a player/observer device only ever sees player-safe maps, layers, POIs,
 * fog, and tokens). Every mutation dispatches a durable Processing-Core command through
 * `runtime.dispatch`; the GUI never writes state or re-derives visibility (Architecture Contract 1).
 *
 * The canvas is the REAL shared geometry renderer (`MapCanvas` from MapBuilder): grid, painted layer
 * features, fog composed op-by-op from the durable MAP-012 log, DS POI markers, and tokens — all
 * actor-filtered. No raster/pixel engine (deferred per ADR-014); the core model is geometric, so an
 * engine-free SVG renderer draws it faithfully. Spatial AUTHORING (drag-drawn fog rects, click-placed
 * POIs/tokens) lives in the full-screen MapBuilder overlay, mounted from here — the old hardcoded
 * fog rect / center-POI shortcuts are gone.
 */

const ghostBtn = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'inline-flex' } as const;

/** Map-switcher chip thumbnail: the map's real raster bytes when they exist on this device
 *  (content-addressed asset store), else the atlas glyph. Missing bytes degrade to the glyph —
 *  never a broken image. */
function MapChipThumb({ assetId, active }: { assetId: string | null; active: boolean }) {
	const url = useAssetObjectUrl(assetId);
	if (!url) return <Icon name="atlas-map" size={14} color={active ? T.acc : T.ter} />;
	return <img src={url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flex: '0 0 auto' }} />;
}

export function Atlas() {
	const runtime = useRuntime();
	// One actor id for EVERY query AND every dispatch payload — this is what makes "view as player"
	// render player-safe rather than just visually filtered (Contract 3). `defaultActorId` tracks the
	// active "view as" actor in this runtime.
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [mapId, setMapId] = useState<string | null>(null);
	const [mapZoom, setMapZoom] = useState(1);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	// The full-screen authoring overlay. Opening with a tool (fog/poi) drops the DM straight into
	// that gesture; non-DM actors get the same surface as a pan/zoom viewer (writes are disabled).
	const [builder, setBuilder] = useState<{ tool: MapTool; fogMode?: 'reveal' | 'conceal' } | null>(null);
	// Preview-canvas marker selection (popover for POIs, highlight ring for tokens).
	const [selPoiId, setSelPoiId] = useState<string | null>(null);
	const [selTokenId, setSelTokenId] = useState<string | null>(null);

	// New-map inline create form (DM authoring) — dispatches a real `map.create`.
	const [creating, setCreating] = useState(false);
	const [newMapName, setNewMapName] = useState('');
	const [newMapVis, setNewMapVis] = useState<SceneVisibility>('dm-only');

	// Create-intent handoff from "New map" launchers (home hub, ⌘K): open the create form on
	// arrival. Consumed once, then cleared.
	const navigate = useNavigate();
	const location = useLocation();
	useEffect(() => {
		const intent = (location.state ?? null) as { create?: boolean } | null;
		if (intent?.create) {
			setCreating(true);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const delivered = useMemo(
		() => deliveredMapIdsForActor(runtime.state.session, actorId),
		[runtime.state.session, actorId],
	);
	const maps = useMemo(
		() => listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId),
		[runtime.state.maps, runtime.state.permissions, actorId],
	);

	// POI deep links — `#/atlas?map=…&poi=…`, the exact URL MapBuilder's "copy link" writes and the
	// ⌘K palette's map/POI hits navigate to. A present `map` selects that map (when the actor-filtered
	// list contains it — visibility authority stays with the core read); a present `poi` highlights
	// that marker (canvas ring + popover + list tint). Params are consumed once then stripped so
	// manual navigation afterwards isn't sticky. An unavailable map degrades to an honest notice.
	const [searchParams, setSearchParams] = useSearchParams();
	useEffect(() => {
		const linkMap = searchParams.get('map');
		const linkPoi = searchParams.get('poi');
		if (linkMap === null && linkPoi === null) return;
		if (linkMap !== null) {
			if (maps.some((mp) => mp.id === linkMap)) {
				setMapId(linkMap);
				setMapZoom(1);
				setSelTokenId(null);
				setSelPoiId(linkPoi);
			} else {
				setNotice('This link points at a map that isn’t available to you.');
			}
		} else if (linkPoi !== null) {
			setSelPoiId(linkPoi);
		}
		setSearchParams({}, { replace: true });
	}, [searchParams, maps, setSearchParams]);

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

	// Raster base layer for the preview canvas — the same DM-side rule as MapBuilder: the most
	// recently imported image/SVG asset (`pickRasterAssetId`). MapCanvas only renders it once the
	// actor-filtered view is available, and shows the honest missing-bytes state when the bytes
	// aren't in this device's asset store. Player-side raster gating lives in projectedMap.ts.
	const rasterAssetId = useMemo(() => {
		const entity = selectedId ? runtime.state.maps.maps[selectedId] : undefined;
		return entity ? pickRasterAssetId(entity.assetIds, runtime.state.maps.assets) : null;
	}, [runtime.state.maps, selectedId]);

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

	const openBuilder = (tool: MapTool, fogMode?: 'reveal' | 'conceal') => {
		if (!selectedId) return;
		setSelPoiId(null);
		setBuilder({ tool, fogMode });
	};

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

	function togglePoiVisibility(poiId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId: selectedId, poiId, visibility: visibility === 'dm-only' ? 'player-visible' : 'dm-only' },
		});
	}
	function setPoiVisibility(poiId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({ type: 'map.update-poi', actorId, payload: { mapId: selectedId, poiId, visibility } });
	}
	function deletePoi(poiId: string) {
		if (!selectedId) return;
		if (selPoiId === poiId) setSelPoiId(null);
		void run({ type: 'map.delete-poi', actorId, payload: { mapId: selectedId, poiId } });
	}

	// POI deep link — the SAME shareable hash URL MapBuilder's copy-link writes (`#/atlas?map=…&poi=…`);
	// opening it selects this map and highlights the POI. Clipboard denial degrades to showing the link.
	async function copyPoiLink(poiId: string) {
		if (!selectedId) return;
		// `window.location` explicitly — the react-router `location` above shadows the global here.
		const url = `${window.location.origin}${window.location.pathname}${window.location.search}#/atlas?map=${encodeURIComponent(selectedId)}&poi=${encodeURIComponent(poiId)}`;
		try {
			await navigator.clipboard.writeText(url);
			setNotice('POI link copied — opening it selects this map and highlights the POI.');
		} catch {
			setNotice(`POI link (copy failed — copy it manually): ${url}`);
		}
	}

	// Projection to players — the same two durable commands the Session console's Stage panel
	// dispatches: `session.set-active-map` stages this map on the session, then
	// `session.project-active-map` delivers it to every player actor. Core-side validation (live
	// session, DM role, map visibility) rejects with a message surfaced honestly in the notice bar;
	// the chip row's live dot then marks the delivered map.
	async function projectToPlayers() {
		if (!selectedId) return;
		const players = Object.values(runtime.state.permissions.actors).filter((a) => a.role === 'player');
		if (players.length === 0) {
			setNotice('No player actors exist yet — projection needs at least one player.');
			return;
		}
		const staged = await run({ type: 'session.set-active-map', actorId, payload: { mapId: selectedId } });
		if (!staged) return;
		if (staged.status !== 'accepted') {
			setNotice(staged.rejection.message);
			return;
		}
		const projected = await run({
			type: 'session.project-active-map',
			actorId,
			payload: { playerActorIds: players.map((p) => p.id) },
		});
		if (!projected) return;
		if (projected.status === 'accepted') {
			setNotice(
				`Projected “${selectedEntry?.name ?? 'map'}” to ${players.length} player${players.length === 1 ? '' : 's'} — the live dot marks delivered maps.`,
			);
		} else {
			setNotice(projected.rejection.message);
		}
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
								setSelPoiId(null);
								setSelTokenId(null);
							}}
							style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : T.surf, color: on ? T.acc : T.sub, font: `600 12.5px ${T.sans}` }}
						>
							<MapChipThumb assetId={pickRasterAssetId(runtime.state.maps.maps[mp.id]?.assetIds ?? [], runtime.state.maps.assets)} active={on} />
							{mp.name}
							{delivered.has(mp.id) && <StatusDot status="live" pulse />}
						</button>
					);
				})}
				{maps.length === 0 && (
					<span style={{ font: `13px ${T.sans}`, color: T.ter, padding: '7px 4px' }}>No maps are visible to you.</span>
				)}
				<div style={{ flex: 1 }} />
				<Button variant="ghost" size="sm" icon="edit" disabled={!selectedId} onClick={() => openBuilder('select')}>
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
				{/* canvas — the REAL shared geometry renderer (grid, layer features, fog mask composed from
				    durable ops, DS POI markers, tokens), actor-filtered. Read-only here; authoring gestures
				    live in the MapBuilder overlay. */}
				<MapCanvas
					view={mapView}
					layers={layers}
					isDm={isDm}
					zoom={mapZoom}
					height={560}
					rasterAssetId={rasterAssetId}
					selectedPoiId={selPoiId}
					selectedTokenId={selTokenId}
					onSelectPoi={setSelPoiId}
					onSelectToken={setSelTokenId}
					renderPoiPopover={(poi, anchor, placement) => (
						<POIPopover
							poi={{ name: poi.label, category: POI_MARKER_CAT[poi.category] ?? 'location', categoryLabel: poi.category, visibility: visToDs(poi.visibility) }}
							anchor={anchor}
							placement={placement}
							readOnly={!isDm}
							onClose={() => setSelPoiId(null)}
							onVisibilityChange={(v: string) => setPoiVisibility(poi.id, dsToVis(v))}
							onFocus={() => openBuilder('select')}
							onEdit={() => openBuilder('select')}
							onDeepLink={() => void copyPoiLink(poi.id)}
							onDelete={() => deletePoi(poi.id)}
						/>
					)}
				>
					<div style={{ position: 'absolute', top: 12, left: 14, maxWidth: 'calc(100% - 190px)', display: 'flex', flexDirection: 'column', gap: 2, padding: '5px 11px', borderRadius: 8, background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)', backdropFilter: 'blur(2px)', border: `1px solid ${T.bd}` }}>
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
						<span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 7, background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)', font: `11px ${T.mono}`, color: T.ink }}>{Math.round(mapZoom * 100)}%</span>
					</div>
					{view?.kind === 'unavailable' && (
						<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `13px ${T.sans}`, color: T.sub }}>
							This map is unavailable to you.
						</div>
					)}
					<div style={{ position: 'absolute', bottom: 12, left: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
						{isDm && mapView && (
							<Button variant="primary" size="sm" icon="layer-fog" onClick={() => openBuilder('fog', 'reveal')}>
								Fog of war
							</Button>
						)}
						{isDm && (
							<Button
								variant="ghost"
								size="sm"
								icon="visibility-players"
								disabled={busy || !mapView}
								onClick={() => void projectToPlayers()}
							>
								Project to players
							</Button>
						)}
					</div>
				</MapCanvas>

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
											<Switch checked={l.enabled} aria-label={`Display ${l.name}`} onChange={() => toggleLayerEnabled(l.layerId, l.enabled)} />
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
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: `1px solid ${T.bd}` }}>
								<Button variant="secondary" size="sm" icon="poi" onClick={() => openBuilder('poi')}>
									Place POI in builder
								</Button>
								<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
									The builder's POI tool places at the exact clicked map position; drag a marker to move it.
								</div>
							</div>
						)}
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{mapView?.pois.map((poi) => (
								<div key={poi.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
									<button
										type="button"
										title="Show on map"
										onClick={() => setSelPoiId(poi.id === selPoiId ? null : poi.id)}
										style={{ ...ghostBtn, flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}
									>
										<span style={{ font: `12.5px ${T.sans}`, color: poi.id === selPoiId ? T.acc : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{poi.label}</span>
										<span style={{ font: `10.5px ${T.mono}`, color: T.ter }}>{poi.category}</span>
									</button>
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
							Reveal/conceal regions are durable, append-only fog ops — the canvas composes the real mask in sequence order (a later op overrides an earlier overlap). Draw regions in the builder.
						</div>
						{isDm && mapView && (
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="secondary" size="sm" icon="reveal" disabled={!selectedId} onClick={() => openBuilder('fog', 'reveal')}>
									Reveal area
								</Button>
								<Button variant="secondary" size="sm" icon="conceal" disabled={!selectedId} onClick={() => openBuilder('fog', 'conceal')}>
									Conceal area
								</Button>
							</div>
						)}
						{mapView && mapView.fog.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								{mapView.fog.slice(-4).map((op) => (
									<div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `11px ${T.mono}`, color: T.ter }}>
										<Badge status={op.kind === 'reveal' ? 'success' : 'neutral'}>{op.kind}</Badge>
										seq {op.sequence} · {fogRegionSummary(op.region)}
									</div>
								))}
							</div>
						)}
					</Panel>
				</div>
			</div>

			{builder && selectedId && (
				<MapBuilder
					mapId={selectedId}
					initialTool={builder.tool}
					initialFogMode={builder.fogMode ?? 'reveal'}
					onClose={() => setBuilder(null)}
				/>
			)}
		</Page>
	);
}
