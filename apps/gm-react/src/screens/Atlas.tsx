import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
	deliveredMapIdsForActor,
	getMapViewForActor,
	listMapsForActor,
	queryMapLayers,
	type SceneVisibility,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Icon,
	IconButton,
	MapCreationForm,
	POIPopover,
	Skeleton,
	StatusDot,
	Switch,
	Toaster,
	VisibilityChip,
} from '../ds';
import { Page, Panel, T } from '../app/screen-kit';
import { useViewport } from '../app/useViewport';
import { fogRegionSummary } from '../app/fogRegions';
import { pickRasterAssetId } from '../app/mapGeometry';
import {
	CATEGORY_LABEL,
	CATEGORY_VAR,
	MapBuilder,
	MapCanvas,
	POI_MARKER_CAT,
	VIS_CHIP,
	VIS_LABEL,
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

// `padding: 2` around a 12–14px icon made every one of these a ~16px target, under the 24px WCAG
// 2.5.8 minimum. That matters most for the vertically ADJACENT layer-reorder chevrons, where a
// mis-tap does not merely miss — it dispatches the OPPOSITE durable `map.reorder-layer` command.
const ghostBtn = {
	border: 'none',
	background: 'transparent',
	cursor: 'pointer',
	padding: 2,
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	minWidth: 24,
	minHeight: 24,
} as const;

/** Map-switcher chip thumbnail: the map's real raster bytes when they exist on this device
 *  (content-addressed asset store), else the atlas glyph. Missing bytes degrade to the glyph —
 *  never a broken image. */
function MapChipThumb({ assetId, active }: { assetId: string | null; active: boolean }) {
	const url = useAssetObjectUrl(assetId);
	if (!url) return <Icon name="atlas-map" size={14} color={active ? T.acc : T.ter} />;
	return (
		<img
			src={url}
			alt=""
			style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flex: '0 0 auto' }}
		/>
	);
}

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
				? queryMapLayers(runtime.state.maps, runtime.state.permissions, actorId, {
						mapId: selectedId,
					})
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

	return (
		<Page max={1320}>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
				{maps.map((mp) => {
					const on = mp.id === selectedId;
					return (
						<button
							key={mp.id}
							type="button"
							// The open map was signalled by border/background/text colour alone.
							aria-current={on ? 'true' : undefined}
							onClick={() => {
								setMapId(mp.id);
								setMapZoom(1);
								setMapCenter({ x: 0.5, y: 0.5 });
								setSelPoiId(null);
								setSelTokenId(null);
								// `run()` only clears the notice on an ACCEPTED dispatch, but the two loudest
								// notices here are set outside any dispatch (the unavailable-map deep link and
								// a clipboard failure). Without this they outlived the map they described,
								// leaving an assertive alert above a map it has nothing to do with.
								setNotice(null);
							}}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '7px 12px',
								borderRadius: 9,
								cursor: 'pointer',
								border: `1px solid ${on ? T.accBd : T.bd}`,
								background: on ? T.accSub : T.surf,
								color: on ? T.acc : T.sub,
								font: `600 12.5px ${T.sans}`,
							}}
						>
							<MapChipThumb
								assetId={pickRasterAssetId(
									runtime.state.maps.maps[mp.id]?.assetIds ?? [],
									runtime.state.maps.assets,
								)}
								active={on}
							/>
							{mp.name}
							{delivered.has(mp.id) && <StatusDot status="live" pulse />}
						</button>
					);
				})}
				{maps.length === 0 && loading && (
					// Hydration in flight — skeleton chips, never a premature "no maps" claim.
					<>
						<Skeleton width={128} height={33} radius={9} />
						<Skeleton width={104} height={33} radius={9} />
						<Skeleton width={118} height={33} radius={9} />
					</>
				)}
				{maps.length === 0 && !loading && (
					<span style={{ font: `13px ${T.sans}`, color: T.ter, padding: '7px 4px' }}>
						{isDm ? 'No maps yet.' : 'No maps are visible to you.'}
					</span>
				)}
				<div style={{ flex: 1 }} />
				<Button
					variant="ghost"
					size="sm"
					icon="edit"
					disabled={!selectedId}
					onClick={() => openBuilder('select')}
				>
					Open in map editor
				</Button>
				{isDm && (
					<Button
						variant="secondary"
						size="sm"
						icon="new-map"
						aria-expanded={creating}
						onClick={() => setCreating((c) => !c)}
					>
						New map
					</Button>
				)}
			</div>

			{notice && (
				<div
					// This one banner carries every async outcome on the screen — "Link copied", "Projected
					// to N players", and every command rejection — so it has to announce itself, and a
					// refusal has to look like one. The map editor's notice (app/map/MapEditor.tsx) is the
					// same shape: assertive + warning skin on error, polite + info skin otherwise.
					role={notice.tone === 'error' ? 'alert' : 'status'}
					aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
					style={{
						marginBottom: 14,
						padding: '9px 12px',
						borderRadius: 9,
						background:
							notice.tone === 'error' ? 'var(--color-status-warning-subtle)' : T.alt,
						border: `1px solid ${notice.tone === 'error' ? 'var(--color-status-warning-border)' : T.bd}`,
						font: `12.5px ${T.sans}`,
						color: notice.tone === 'error' ? 'var(--color-status-warning-text)' : T.sub,
						display: 'flex',
						alignItems: 'center',
						gap: 10,
					}}
				>
					<Icon
						name={notice.tone === 'error' ? 'warning' : 'info'}
						size={15}
						color={notice.tone === 'error' ? 'var(--color-status-warning-text)' : T.info}
					/>
					<span style={{ flex: 1 }}>{notice.text}</span>
					<button
						type="button"
						onClick={() => setNotice(null)}
						style={ghostBtn}
						title="Dismiss"
						aria-label="Dismiss notice"
					>
						<Icon name="close" size={14} color={T.ter} />
					</button>
				</div>
			)}

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
				{/* canvas — the REAL shared geometry renderer (grid, layer features, fog mask composed from
				    durable ops, DS POI markers, tokens), actor-filtered. Read-only here; authoring gestures
				    live in the MapBuilder overlay. */}
				<MapCanvas
					view={mapView}
					layers={layers}
					isDm={isDm}
					zoom={mapZoom}
					center={mapCenter}
					height={560}
					rasterAssetId={rasterAssetId}
					selectedPoiId={selPoiId}
					selectedTokenId={selTokenId}
					onSelectPoi={setSelPoiId}
					onSelectToken={setSelTokenId}
					renderPoiPopover={(poi, anchor, placement) => (
						<POIPopover
							poi={{
								name: poi.label,
								category: POI_MARKER_CAT[poi.category] ?? 'location',
								categoryLabel: poi.category,
								visibility: visToDs(poi.visibility),
							}}
							anchor={anchor}
							placement={placement}
							readOnly={!isDm}
							onClose={() => setSelPoiId(null)}
							onVisibilityChange={(v: string) => setPoiVisibility(poi.id, dsToVis(v))}
							onFocus={() => {
								// Actually focus: pan the preview onto the marker and zoom in enough for it
								// to read, keeping the popover's selection so the DM can see what they hit.
								setMapCenter({ x: poi.position.x, y: poi.position.y });
								setMapZoom((z) => (z < 1.6 ? 1.6 : z));
							}}
							onEdit={() => openBuilder('select')}
							onDeepLink={() => void copyPoiLink(poi.id)}
							onDelete={() => void deletePoi(poi.id)}
						/>
					)}
				>
					<div
						style={{
							position: 'absolute',
							top: 12,
							left: 14,
							maxWidth: 'calc(100% - 190px)',
							display: 'flex',
							flexDirection: 'column',
							gap: 2,
							padding: '5px 11px',
							borderRadius: 8,
							background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
							backdropFilter: 'blur(2px)',
							border: `1px solid ${T.bd}`,
						}}
					>
						<span
							style={{
								font: `700 16px ${T.disp}`,
								color: T.ink,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{mapView?.name ?? selectedEntry?.name ?? 'No map selected'}
						</span>
						{selectedEntry && (
							<span
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 7,
									font: `11px ${T.sans}`,
									color: T.sub,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								<VisibilityChip level={VIS_CHIP[selectedEntry.visibility] ?? 'dm-only'} />
								{selectedEntry.description || 'No description'}
							</span>
						)}
					</div>
					<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
						<IconButton
							icon="zoom-in"
							label="Zoom in"
							variant="outline"
							size="sm"
							onClick={() => zoom(0.2)}
						/>
						<IconButton
							icon="zoom-out"
							label="Zoom out"
							variant="outline"
							size="sm"
							onClick={() => zoom(-0.2)}
						/>
						<IconButton
							icon="zoom-fit"
							label="Fit"
							variant="outline"
							size="sm"
							onClick={() => zoom(undefined, true)}
						/>
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								padding: '0 8px',
								borderRadius: 7,
								background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)',
								font: `11px ${T.mono}`,
								color: T.ink,
							}}
						>
							{Math.round(mapZoom * 100)}%
						</span>
					</div>
					{view?.kind === 'unavailable' && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								font: `13px ${T.sans}`,
								color: T.sub,
								// A full-bleed `inset:0` panel that comes AFTER the zoom cluster in DOM order
								// swallows every click on Zoom in / Zoom out / Fit. It is a message, not a
								// target — let the pointer straight through it.
								pointerEvents: 'none',
							}}
						>
							This map is unavailable to you.
						</div>
					)}
					<div
						style={{
							position: 'absolute',
							bottom: 12,
							left: 14,
							display: 'flex',
							gap: 8,
							flexWrap: 'wrap',
						}}
					>
						{isDm && mapView && (
							<Button
								variant="primary"
								size="sm"
								icon="layer-fog"
								onClick={() => openBuilder('fog', 'reveal')}
							>
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
									{isDm && layerResult.hiddenMatchCount > 0
										? ` · ${layerResult.hiddenMatchCount} hidden`
										: ''}
								</span>
							</span>
						}
						action={
							isDm && selectedId ? (
								<IconButton
									icon="add"
									label="Add layer"
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={addLayer}
								/>
							) : undefined
						}
					>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
							{layers.map((l, i) => (
								<div
									key={l.layerId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 9,
										padding: '8px 6px',
										borderRadius: 8,
										background: l.enabled ? 'transparent' : T.alt,
									}}
								>
									{isDm ? (
										// A gap between the two: they are opposite, irreversible-ish writes stacked
										// directly on top of each other, so touching edges make a near-miss land on
										// the wrong one.
										<span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
											<button
												type="button"
												title="Move up"
												aria-label={`Move ${l.name} up`}
												disabled={busy || i === 0}
												onClick={() => reorderLayer(l.layerId, i - 1)}
												style={{ ...ghostBtn, opacity: i === 0 ? 0.3 : 1 }}
											>
												<Icon name="chevron-up" size={12} color={T.ter} />
											</button>
											<button
												type="button"
												title="Move down"
												aria-label={`Move ${l.name} down`}
												disabled={busy || i === layers.length - 1}
												onClick={() => reorderLayer(l.layerId, i + 1)}
												style={{ ...ghostBtn, opacity: i === layers.length - 1 ? 0.3 : 1 }}
											>
												<Icon name="chevron-down" size={12} color={T.ter} />
											</button>
										</span>
									) : (
										<Icon name="drag-handle" size={14} color={T.ter} />
									)}
									<span
										style={{
											width: 10,
											height: 10,
											borderRadius: 3,
											background: `var(${CATEGORY_VAR[l.category] ?? '--layer-base'})`,
											flex: '0 0 auto',
										}}
									/>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												font: `12.5px ${T.sans}`,
												color: l.enabled ? T.ink : T.ter,
												whiteSpace: 'nowrap',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
											}}
										>
											{l.name}
										</div>
										<div style={{ font: `10.5px ${T.mono}`, color: T.ter }}>
											{CATEGORY_LABEL[l.category] ?? l.category} · {Math.round(l.opacity * 100)}% ·{' '}
											{l.content.length} marks
											{/* `locked` was never rendered, so the only way to discover it was to
											    act and be refused ("Layer … is locked — unlock it first").
											    Text, not an icon: this line is already the row's status area. */}
											{l.locked ? ' · locked' : ''}
										</div>
									</div>
									{isDm ? (
										<>
											{/* compact chip = the grayscale-safe status display; the button stays the toggle */}
											<button
												type="button"
												title={`Visibility: ${VIS_LABEL[l.visibility] ?? l.visibility} — click to toggle DM only ↔ player visible`}
												aria-label={`${l.name} visibility: ${VIS_LABEL[l.visibility] ?? l.visibility} — toggle`}
												disabled={busy}
												onClick={() => toggleLayerVisibility(l.layerId, l.visibility)}
												style={ghostBtn}
											>
												<VisibilityChip level={VIS_CHIP[l.visibility] ?? 'dm-only'} compact />
											</button>
											<Switch
												checked={l.enabled}
												aria-label={`Show ${l.name} on the map`}
												// The only control in the row that stayed live mid-dispatch, so a second
												// click was swallowed by `run`'s busy guard with no feedback at all.
												disabled={busy}
												onChange={() => toggleLayerEnabled(l.layerId, l.enabled)}
											/>
										</>
									) : (
										<VisibilityChip level={VIS_CHIP[l.visibility] ?? 'dm-only'} />
									)}
								</div>
							))}
							{layers.length === 0 &&
								(loading ? (
									<Skeleton height={44} />
								) : (
									<EmptyState
										inset
										icon="layers"
										title="No layers are visible to you"
										description={isDm && selectedId ? 'Add one with the + above.' : undefined}
									/>
								))}
						</div>
					</Panel>

					<Panel
						title={
							<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								Points of interest
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{mapView?.pois.length ?? 0}
									{isDm && mapView && mapView.hidden.pois > 0
										? ` · ${mapView.hidden.pois} hidden`
										: ''}
								</span>
							</span>
						}
					>
						{isDm && mapView && (
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 6,
									paddingBottom: 10,
									borderBottom: `1px solid ${T.bd}`,
								}}
							>
								<Button variant="secondary" size="sm" icon="poi" onClick={() => openBuilder('poi')}>
									Place point of interest
								</Button>
								<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
									Opens the map editor — click the map to place it, or drag a marker to move it.
								</div>
							</div>
						)}
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{mapView?.pois.map((poi) => (
								<div
									key={poi.id}
									style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}
								>
									<button
										type="button"
										title="Highlight on map"
										aria-label={`Highlight ${poi.label} on the map`}
										// The last colour-only selection state in this screen: the row's only
										// cue was the label turning accent-coloured (WCAG 1.4.1/4.1.2). The map
										// chips (aria-current) and Graph's nodes/facets (aria-pressed) already
										// expose theirs.
										aria-pressed={poi.id === selPoiId}
										onClick={() => setSelPoiId(poi.id === selPoiId ? null : poi.id)}
										style={{
											...ghostBtn,
											flex: 1,
											minWidth: 0,
											flexDirection: 'column',
											alignItems: 'flex-start',
											textAlign: 'left',
										}}
									>
										<span
											style={{
												font: `12.5px ${T.sans}`,
												color: poi.id === selPoiId ? T.acc : T.ink,
												whiteSpace: 'nowrap',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												maxWidth: '100%',
											}}
										>
											{poi.label}
										</span>
										<span style={{ font: `10.5px ${T.mono}`, color: T.ter }}>{poi.category}</span>
									</button>
									{isDm ? (
										<>
											{/* compact chip = the grayscale-safe status display; the button stays the toggle */}
											<button
												type="button"
												title={`Visibility: ${VIS_LABEL[poi.visibility] ?? poi.visibility} — click to toggle DM only ↔ player visible`}
												aria-label={`${poi.label} visibility: ${VIS_LABEL[poi.visibility] ?? poi.visibility} — toggle`}
												disabled={busy}
												onClick={() => togglePoiVisibility(poi.id, poi.visibility)}
												style={ghostBtn}
											>
												<VisibilityChip level={VIS_CHIP[poi.visibility] ?? 'dm-only'} compact />
											</button>
											<button
												type="button"
												title="Delete point of interest"
												aria-label={`Delete ${poi.label} (undo available)`}
												disabled={busy}
												onClick={() => void deletePoi(poi.id)}
												style={ghostBtn}
											>
												<Icon name="delete" size={14} color={T.ter} />
											</button>
										</>
									) : (
										<VisibilityChip level={VIS_CHIP[poi.visibility] ?? 'dm-only'} />
									)}
								</div>
							))}
							{mapView && mapView.pois.length === 0 && (
								<EmptyState
									inset
									icon="poi"
									title={
										isDm ? 'No points of interest yet' : 'No points of interest are visible to you'
									}
									description={
										isDm ? 'Use “Place point of interest” to mark a spot on the map.' : undefined
									}
								/>
							)}
							{!mapView &&
								(loading ? (
									<Skeleton height={44} />
								) : (
									<EmptyState
										inset
										icon="atlas-map"
										title="Open a map to see its points of interest"
									/>
								))}
						</div>
					</Panel>

					<Panel
						title={
							<span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
								Fog of war
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									{mapView?.fog.length ?? 0}{' '}
									{(mapView?.fog.length ?? 0) === 1 ? 'change' : 'changes'}
								</span>
							</span>
						}
					>
						<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>
							Revealed and concealed areas apply in order — where they overlap, the newer one wins.
							Every change is kept. Draw areas in the map editor.
						</div>
						{isDm && mapView && (
							<div style={{ display: 'flex', gap: 8 }}>
								<Button
									variant="secondary"
									size="sm"
									icon="reveal"
									disabled={!selectedId}
									onClick={() => openBuilder('fog', 'reveal')}
								>
									Reveal area
								</Button>
								<Button
									variant="secondary"
									size="sm"
									icon="conceal"
									disabled={!selectedId}
									onClick={() => openBuilder('fog', 'conceal')}
								>
									Conceal area
								</Button>
							</div>
						)}
						{mapView && mapView.fog.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								{mapView.fog.slice(-4).map((op) => (
									<div
										key={op.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											font: `11px ${T.mono}`,
											color: T.ter,
										}}
									>
										<Badge status={op.kind === 'reveal' ? 'success' : 'neutral'}>
											{op.kind === 'reveal' ? 'Revealed' : 'Concealed'}
										</Badge>
										#{op.sequence} · {fogRegionSummary(op.region)}
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
