import { MapEditor } from '../../app/map/MapEditor';
import { ListDetail, Page, T } from '../../app/screen-kit';
import { MapCreationForm } from '../../ds';
import { AtlasCanvas } from './AtlasCanvas';
import { FogPanel } from './FogPanel';
import { LayersPanel } from './LayersPanel';
import { MapChips } from './MapChips';
import { MapHierarchyTree } from './MapHierarchyTree';
import { MapLibrary } from './MapLibrary';
import { NoticeBar } from './NoticeBar';
import { PoiPanel } from './PoiPanel';
import { useAtlas } from './useAtlas';

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
	const {
		runtime,
		split,
		isDm,
		loading,
		mapZoom,
		mapCenter,
		busy,
		notice,
		setNotice,
		builder,
		setBuilder,
		selPoiId,
		setSelPoiId,
		selTokenId,
		setSelTokenId,
		creating,
		setCreating,
		delivered,
		maps,
		mapHierarchy,
		selectedId,
		selectedEntry,
		view,
		mapView,
		layerResult,
		layers,
		rasterAssetId,
		zoom,
		openBuilder,
		createMap,
		addLayer,
		toggleLayerVisibility,
		toggleLayerEnabled,
		reorderLayer,
		togglePoiVisibility,
		setPoiVisibility,
		deletePoi,
		copyPoiLink,
		projectToPlayers,
		selectMap,
		focusPoi,
	} = useAtlas();

	const chips = (
		<MapChips
			controlsOnly
			maps={maps}
			mapsState={runtime.state.maps}
			selectedId={selectedId}
			delivered={delivered}
			loading={loading}
			busy={busy}
			isDm={isDm}
			creating={creating}
			onSelect={selectMap}
			onOpenEditor={() => openBuilder('select')}
			onToggleCreate={() => setCreating((c) => !c)}
		/>
	);

	const noticeBar = notice && <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />;

	const createForm = creating && isDm && (
		<div
			style={{
				marginBottom: 'var(--space-4)',
				padding: 'var(--space-4)',
				borderRadius: 'var(--radius-md)',
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
	);

	const tree = maps.length > 0 && (
		<MapHierarchyTree tree={mapHierarchy} selectedId={selectedId} onSelect={selectMap} />
	);

	const canvas = selectedId && (
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
	);

	// The selected map's inspectors — all real, actor-filtered Core data.
	const inspectors = selectedId && (
		<>
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
		</>
	);

	const editor = builder && selectedId && (
		<MapEditor
			// RC-MAP-3.8 — keyed by mapId so drilling to a different map (breadcrumb ancestor or a
			// `map-link` POI) remounts with a clean tool/zoom/dock/undo-history state rather than
			// carrying the previous map's editor state onto the new one.
			key={selectedId}
			mapId={selectedId}
			initialTool={builder.tool}
			initialFogMode={builder.fogMode ?? 'reveal'}
			onClose={() => setBuilder(null)}
			onNavigateToMap={selectMap}
		/>
	);

	// RC-UX-4.3 — rail tier: the map library (switcher, create form, hierarchy) keeps the list pane and
	// the selected map fills the detail pane beside it, its inspectors stacked under the canvas. No
	// `detailKey`: a map is always selected, and following each pick would pull focus out of the tree.
	//
	// ONE element for both tiers, so crossing the split width only re-flows. Branching to a separate
	// `return` above replaced the whole subtree on a tablet rotation, which threw away a half-filled
	// "New map" form and the map editor's tool / zoom / undo history without asking.
	const library = (
		<Page max={split ? undefined : 1320}>
			{chips}

			{(!split || !selectedId) && noticeBar}

			{createForm}

			<div
				className={
					split || !selectedId ? 'atlas-library-layout atlas-library-split' : 'atlas-library-layout'
				}
				style={{ gap: 'var(--space-4)' }}
			>
				<div>
					<MapLibrary
						maps={maps}
						selectedId={selectedId}
						delivered={delivered}
						onSelect={selectMap}
					/>
					{tree}
				</div>
				{!split && selectedId && (
					<div className="atlas-library-preview" style={{ gap: 'var(--space-4)' }}>
						{canvas}
						{inspectors}
					</div>
				)}
			</div>
		</Page>
	);

	return (
		<>
			<ListDetail
				list={library}
				detail={
					split &&
					selectedId && (
						<Page>
							<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
								{noticeBar}
								{canvas}
								{inspectors}
							</div>
						</Page>
					)
				}
				detailLabel={selectedEntry?.name ?? ''}
			/>
			{/* A `position:fixed` overlay, so it renders the same outside the page as it did within it —
			    and from here it survives the tier change instead of remounting with a cleared canvas. */}
			{editor}
		</>
	);
}
