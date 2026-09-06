import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	queryMapLayers,
	type SceneVisibility,
} from '@dndtools/core';
import { MapCreationForm, Toaster } from '../../ds';
import { Page, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { pickRasterAssetId } from '../../app/mapGeometry';
import { dsToVis, type MapTool } from '../../app/map/mapVisibility';
import { MapEditor } from '../../app/map/MapEditor';
import { useRuntime } from '../../runtime/RuntimeContext';
import { MapChips } from './MapChips';
import { NoticeBar } from './NoticeBar';
import { AtlasCanvas } from './AtlasCanvas';
import { LayersPanel } from './LayersPanel';
import { PoiPanel } from './PoiPanel';
import { FogPanel } from './FogPanel';

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

export function Atlas() {
	const runtime = useRuntime();
	const isPhone = useViewport() === 'phone';
	// One actor id for EVERY query AND every dispatch payload — this is what makes "view as player"
	// render player-safe rather than just visually filtered (Contract 3). `defaultActorId` tracks the
	// active "view as" actor in this runtime.
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	// Async-load sentinel: the runtime hydrates from IndexedDB after first paint, so an empty `maps`
	// while `!loaded` means "still loading", never "you have no maps".
	const loading = !runtime.loaded;

	const [mapId, setMapId] = useState<string | null>(null);
	const [mapZoom, setMapZoom] = useState(1);
	// Normalized pan centre for the Atlas preview. The map surface has always accepted a `center`
	// prop; the Atlas never passed one, which is why its "Focus on map" button could not focus
	// anything and just re-opened the builder exactly like "Edit in builder" beside it.
	const [mapCenter, setMapCenter] = useState({ x: 0.5, y: 0.5 });
	const [busy, setBusy] = useState(false);
	// The banner is a genuinely mixed channel — "Link copied" and "Projected to N players" share it
	// with every command rejection — so the tone has to travel with the text. It used to be a bare
	// string rendered with a polite `role="status"` and a blue info glyph, which meant a hard refusal
	// ("There is no live session.") was indistinguishable from a success.
	const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
	const say = (text: string) => setNotice({ tone: 'info', text });
	const fail = (text: string) => setNotice({ tone: 'error', text });
	// The full-screen authoring overlay. Opening with a tool (fog/poi) drops the DM straight into
	// that gesture; non-DM actors get the same surface as a pan/zoom viewer (writes are disabled).
	const [builder, setBuilder] = useState<{ tool: MapTool; fogMode?: 'reveal' | 'conceal' } | null>(
		null,
	);
	// Preview-canvas marker selection (popover for POIs, highlight ring for tokens).
	const [selPoiId, setSelPoiId] = useState<string | null>(null);
	const [selTokenId, setSelTokenId] = useState<string | null>(null);

	// New-map create form (DM authoring) — the DS MapCreationForm (name, scale/unit, projection,
	// default visibility) dispatching a real `map.create`.
	const [creating, setCreating] = useState(false);

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

	// `deliveredMapIdsForActor` answers "what is on THIS actor's screen", and `activeMapProjections`
	// is keyed by player/observer id only — `session.project-active-map` rejects any DM-authority
	// target outright. So for the DM, the one actor who ever sees this chip row with its authoring
	// controls, the set was permanently EMPTY and the live indicator was dead code: after "Project to
	// players" the only feedback was a dismissible notice bar, and once that was dismissed nothing on
	// screen said which map was on the table. The DM's question is "what is on the PLAYERS' screens",
	// which is the union over every projection and player-view map region.
	const delivered = useMemo(() => {
		if (!isDm) return deliveredMapIdsForActor(runtime.state.session, actorId);
		const all = new Set<string>();
		for (const projection of Object.values(runtime.state.session.activeMapProjections)) {
			if (projection) all.add(projection.mapId);
		}
		for (const assignment of Object.values(runtime.state.session.playerViewAssignments)) {
			const region = assignment?.target.mapRegion;
			if (region) all.add(region.mapId);
		}
		return all;
	}, [runtime.state.session, actorId, isDm]);
	const maps = useMemo(
		() =>
			// Same delivery gap as `queryMapLayers` below: without `delivered`, `isDelivered()` said
			// false for every map, so a `shared` map that is visible ONLY because "Project to players"
			// delivered it never even appeared in a player's map switcher.
			listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId, {
				deliveredMapIds: delivered,
			}),
		[runtime.state.maps, runtime.state.permissions, actorId, delivered],
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
				setMapCenter({ x: 0.5, y: 0.5 });
				setSelTokenId(null);
				setSelPoiId(linkPoi);
			} else {
				fail('This link points at a map that isn’t available to you.');
			}
		} else if (linkPoi !== null) {
			setSelPoiId(linkPoi);
		}
		setSearchParams({}, { replace: true });
	}, [searchParams, maps, setSearchParams]);

	// Async load → `maps` is empty on the first paint, so never index `maps[0]` in a state initializer.
	// Selection falls back to the first visible map and clears if the selected map is no longer visible.
	const selectedId = mapId && maps.some((mp) => mp.id === mapId) ? mapId : (maps[0]?.id ?? null);
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
				? queryMapLayers(
						runtime.state.maps,
						runtime.state.permissions,
						actorId,
						{ mapId: selectedId },
						// The view above already passes `delivered`; this call did not, so
						// `isDelivered()` said false for every map and a non-DM lost every layer
						// that is visible ONLY because "Project to players" delivered it. The map
						// resolved `available` while its layer list came back empty — a player (or
						// the DM under "view as player") saw a blank grid with floating POIs and
						// "No layers are visible to you" the instant the DM projected the map.
						{ deliveredMapIds: delivered },
					)
				: { layers: [], hiddenMatchCount: 0 },
		[runtime.state.maps, runtime.state.permissions, actorId, selectedId, delivered],
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
			const result = await runtime.dispatch(command);
			// Clear on success. Without this a rejection outlived every later action — project with no
			// live session, start the session, toggle a layer, create a map, and the banner still read
			// "There is no live session." The map editor's `run` (app/map/useMapEditor.ts) already did
			// this; Atlas is its untreated twin. Callers that report their OWN success message set it
			// after this returns, so the ordering is safe.
			if (result.status === 'accepted') setNotice(null);
			// A REJECTION was never read either: six call sites do `void run(...)`, so a refused write
			// (the reachable one is a locked layer — map-layer.ts:73) moved nothing and said nothing.
			else if (result.status === 'rejected') fail(result.rejection.message);
			return result;
		} catch (error) {
			// Six call sites did `void run(...)`, so a throw here was an unhandled rejection with no UI.
			fail(error instanceof Error ? error.message : 'The action could not be completed.');
			return undefined;
		} finally {
			setBusy(false);
		}
	};

	const zoom = (delta?: number, fit?: boolean) => {
		// "Fit" has to undo the pan too, or a focused POI leaves the map stuck off-centre with no
		// visible way back to the whole map.
		if (fit) setMapCenter({ x: 0.5, y: 0.5 });
		setMapZoom((z) => (fit ? 1 : Math.min(2.4, Math.max(0.4, +(z + (delta ?? 0)).toFixed(2)))));
	};

	const openBuilder = (tool: MapTool, fogMode?: 'reveal' | 'conceal') => {
		if (!selectedId) return;
		setSelPoiId(null);
		setBuilder({ tool, fogMode });
	};

	// The DS form's draft → the real `map.create` payload: scale becomes the core's
	// {unitsPerMap, unit} (or null when unset), the form's `mercator` value maps to the core's
	// `web-mercator` projection kind, and DS visibility values go through `dsToVis`.
	async function createMap(draft: {
		name: string;
		scale: number | null;
		unit: string;
		projection: string;
		visibility: string;
	}) {
		const visibility = dsToVis(draft.visibility);
		const res = await run({
			type: 'map.create',
			actorId,
			payload: {
				name: draft.name,
				visibility,
				scale:
					draft.scale && draft.scale > 0
						? { unitsPerMap: draft.scale, unit: draft.unit.trim() || 'miles' }
						: null,
				projection: {
					kind: draft.projection === 'mercator' ? 'web-mercator' : draft.projection,
					rotationDegrees: 0,
				},
				initialLayers: [{ name: 'Base', category: 'base', visibility }],
			},
		});
		if (res?.status === 'accepted') {
			const created = (res.events as Array<{ kind: string; mapId?: string }> | undefined)?.find(
				(e) => e.kind === 'map.created',
			);
			if (created?.mapId) setMapId(created.mapId);
			setCreating(false);
		} else if (res) {
			fail(res.rejection.message);
		}
	}

	function addLayer() {
		if (!selectedId) return;
		void run({
			type: 'map.create-layer',
			actorId,
			payload: {
				mapId: selectedId,
				name: `Layer ${layers.length + 1}`,
				category: 'dm-annotations',
				visibility: 'dm-only',
			},
		});
	}
	function toggleLayerVisibility(layerId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.set-layer-visibility',
			actorId,
			payload: {
				mapId: selectedId,
				layerId,
				visibility: visibility === 'dm-only' ? 'player-visible' : 'dm-only',
			},
		});
	}
	function toggleLayerEnabled(layerId: string, enabled: boolean) {
		if (!selectedId) return;
		void run({
			type: 'map.set-layer-enabled',
			actorId,
			payload: { mapId: selectedId, layerId, enabled: !enabled },
		});
	}
	function reorderLayer(layerId: string, toOrder: number) {
		if (!selectedId) return;
		void run({
			type: 'map.reorder-layer',
			actorId,
			payload: { mapId: selectedId, layerId, toOrder },
		});
	}

	function togglePoiVisibility(poiId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.update-poi',
			actorId,
			payload: {
				mapId: selectedId,
				poiId,
				visibility: visibility === 'dm-only' ? 'player-visible' : 'dm-only',
			},
		});
	}
	function setPoiVisibility(poiId: string, visibility: SceneVisibility) {
		if (!selectedId) return;
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId: selectedId, poiId, visibility },
		});
	}
	// Delete is a durable core op with no inverse-op log — capture the POI's prior payload BEFORE
	// dispatching and raise an Undo toast that re-creates it via the real `map.create-poi` (the
	// re-created POI gets a fresh id; visibility/notes/links are preserved).
	async function deletePoi(poiId: string) {
		const mid = selectedId;
		if (!mid) return;
		const prior = mapView?.pois.find((p) => p.id === poiId) ?? null;
		const res = await run({ type: 'map.delete-poi', actorId, payload: { mapId: mid, poiId } });
		// Deselect only AFTER the write lands. Clearing it first closed the popover and dropped the
		// marker highlight even when the core REFUSED the delete, so a refusal was visually
		// indistinguishable from a success (the notice renders at the top of the page, far from here).
		if (res?.status === 'accepted' && selPoiId === poiId) setSelPoiId(null);
		if (res?.status !== 'accepted' || !prior) return;
		Toaster.success(`Point of interest “${prior.label}” deleted`, {
			action: 'Undo',
			onAction: () => {
				void runtime
					.dispatch({
						type: 'map.create-poi',
						actorId,
						payload: {
							mapId: mid,
							layerId: prior.layerId,
							label: prior.label,
							category: prior.category,
							position: prior.position,
							visibility: prior.visibility,
							notes: prior.notes,
							linkedEntityType: prior.linkedEntityType,
							linkedEntityId: prior.linkedEntityId,
						},
					})
					.then((restored) => {
						if (restored.status === 'accepted') Toaster.success(`“${prior.label}” restored`);
						else
							Toaster.error(
								restored.rejection.message ??
									'The point of interest couldn’t be restored — try again.',
							);
					});
			},
		});
	}

	// POI deep link — the SAME shareable hash URL MapBuilder's copy-link writes (`#/atlas?map=…&poi=…`);
	// opening it selects this map and highlights the POI. Clipboard denial degrades to showing the link.
	async function copyPoiLink(poiId: string) {
		if (!selectedId) return;
		// `window.location` explicitly — the react-router `location` above shadows the global here.
		const url = `${window.location.origin}${window.location.pathname}${window.location.search}#/atlas?map=${encodeURIComponent(selectedId)}&poi=${encodeURIComponent(poiId)}`;
		try {
			await navigator.clipboard.writeText(url);
			say('Link copied — opening it highlights this point of interest on the map.');
		} catch {
			fail(`The link couldn’t be copied — copy it manually: ${url}`);
		}
	}

	// Projection to players — the same two durable commands the Session console's Stage panel
	// dispatches: `session.set-active-map` stages this map on the session, then
	// `session.project-active-map` delivers it to every player actor. Core-side validation (live
	// session, DM role, map visibility) rejects with a message surfaced honestly in the notice bar;
	// the chip row's live dot then marks the delivered map.
	async function projectToPlayers() {
		if (!selectedId) return;
		const players = Object.values(runtime.state.permissions.actors).filter(
			(a) => a.role === 'player',
		);
		if (players.length === 0) {
			fail('No players yet — add players in Settings → Players before projecting a map.');
			return;
		}
		const staged = await run({
			type: 'session.set-active-map',
			actorId,
			payload: { mapId: selectedId },
		});
		if (!staged) return;
		if (staged.status !== 'accepted') {
			fail(staged.rejection.message);
			return;
		}
		const projected = await run({
			type: 'session.project-active-map',
			actorId,
			payload: { playerActorIds: players.map((p) => p.id) },
		});
		if (!projected) return;
		if (projected.status === 'accepted') {
			say(
				`Projected “${selectedEntry?.name ?? 'map'}” to ${players.length} player${players.length === 1 ? '' : 's'}.`,
			);
		} else {
			fail(projected.rejection.message);
		}
	}

	// The map-switcher chip's click: select the map and reset every per-map view state. `run()` only
	// clears the notice on an ACCEPTED dispatch, but the two loudest notices here are set outside any
	// dispatch (the unavailable-map deep link and a clipboard failure), so clear it here too —
	// otherwise they outlived the map they described.
	const selectMap = (id: string) => {
		setMapId(id);
		setMapZoom(1);
		setMapCenter({ x: 0.5, y: 0.5 });
		setSelPoiId(null);
		setSelTokenId(null);
		setNotice(null);
	};

	// Actually focus: pan the preview onto the marker and zoom in enough for it to read, keeping the
	// popover's selection so the DM can see what they hit.
	const focusPoi = (position: { x: number; y: number }) => {
		setMapCenter({ x: position.x, y: position.y });
		setMapZoom((z) => (z < 1.6 ? 1.6 : z));
	};

	return (
		<Page max={1320}>
			<MapChips
				maps={maps}
				mapsState={runtime.state.maps}
				selectedId={selectedId}
				delivered={delivered}
				loading={loading}
				isDm={isDm}
				creating={creating}
				onSelect={selectMap}
				onOpenEditor={() => openBuilder('select')}
				onToggleCreate={() => setCreating((c) => !c)}
			/>

			{notice && <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />}

			{creating && isDm && (
				<div
					style={{
						marginBottom: 16,
						padding: 16,
						borderRadius: 10,
						background: T.raised,
						border: `1px solid ${T.accBd}`,
						maxWidth: 520,
					}}
				>
					<MapCreationForm
						submitting={busy}
						onCancel={() => setCreating(false)}
						onCreate={(draft: {
							name: string;
							scale: number | null;
							unit: string;
							projection: string;
							visibility: string;
						}) => void createMap(draft)}
					/>
				</div>
			)}

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? '1fr' : 'minmax(0,1fr) 320px',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<AtlasCanvas
					view={view}
					mapView={mapView}
					layers={layers}
					isDm={isDm}
					busy={busy}
					mapZoom={mapZoom}
					mapCenter={mapCenter}
					rasterAssetId={rasterAssetId}
					selPoiId={selPoiId}
					selTokenId={selTokenId}
					selectedEntry={selectedEntry}
					onSelectPoi={setSelPoiId}
					onSelectToken={setSelTokenId}
					onFocusPoi={focusPoi}
					onSetPoiVisibility={setPoiVisibility}
					onCopyPoiLink={(poiId) => void copyPoiLink(poiId)}
					onDeletePoi={(poiId) => void deletePoi(poiId)}
					onZoom={zoom}
					onOpenEditor={() => openBuilder('select')}
					onOpenFog={(mode) => openBuilder('fog', mode)}
					onProjectToPlayers={() => void projectToPlayers()}
				/>

				{/* side rails — all real, actor-filtered Core data */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<LayersPanel
						layers={layers}
						hiddenMatchCount={layerResult.hiddenMatchCount}
						isDm={isDm}
						loading={loading}
						busy={busy}
						selectedId={selectedId}
						onAddLayer={addLayer}
						onReorderLayer={reorderLayer}
						onToggleLayerVisibility={toggleLayerVisibility}
						onToggleLayerEnabled={toggleLayerEnabled}
					/>

					<PoiPanel
						mapView={mapView}
						isDm={isDm}
						loading={loading}
						busy={busy}
						selPoiId={selPoiId}
						onSelectPoi={setSelPoiId}
						onAddPoi={() => openBuilder('poi')}
						onTogglePoiVisibility={togglePoiVisibility}
						onDeletePoi={(poiId) => void deletePoi(poiId)}
					/>

					<FogPanel
						mapView={mapView}
						isDm={isDm}
						selectedId={selectedId}
						onOpenFog={(mode) => openBuilder('fog', mode)}
					/>
				</div>
			</div>

			{builder && selectedId && (
				<MapEditor
					mapId={selectedId}
					initialTool={builder.tool}
					initialFogMode={builder.fogMode ?? 'reveal'}
					onClose={() => setBuilder(null)}
				/>
			)}
		</Page>
	);
}
