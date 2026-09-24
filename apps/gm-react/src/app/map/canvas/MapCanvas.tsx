import { Icon } from '../../../ds';
import { FogRevealFlash } from '../../fogRegions';
import { T } from '../../screen-kit';
import { BakeLayer } from './BakeLayer';
import { CombatOverlay } from './CombatOverlay';
import { LightLayer } from './LightLayer';
import { MapCanvasProps } from './mapCanvasTypes';
import { MapMarkers } from './MapMarkers';
import { MapSvgLayers } from './MapSvgLayers';
import { useMapCanvas } from './useMapCanvas';

export function MapCanvas({
	view,
	layers = [],
	isDm,
	zoom = 1,
	center = { x: 0.5, y: 0.5 },
	tool = 'select',
	fogMode = 'reveal',
	fogShape = 'rect',
	fogBrushRadius = 0.024,
	rasterAssetId = null,
	editable = false,
	showFogOutlines = false,
	height = 560,
	selectedPoiId = null,
	selectedTokenId = null,
	onSelectPoi,
	onSelectToken,
	onPlace,
	onFogRegion,
	onPolygonVertexCount,
	onMovePoi,
	onMoveToken,
	onPan,
	renderPoiPopover,
	hideCombatOverlay = false,
	compactCombat = false,
	children,
	style,
}: MapCanvasProps) {
	const {
		t,
		wellRef,
		drag,
		fogMaskId,
		polyPoints,
		rasterUrl,
		toVisual,
		annotationVisible,
		fogOps,
		bakePlan,
		lightingPlan,
		onWellPointerDown,
		onWellPointerMove,
		onWellPointerUp,
		onWellClick,
		onWellDoubleClick,
		markerDragHandlers,
		clickGuard,
		flashing,
		fogOpacity,
		markersInteractive,
		selectedPoi,
		cursor,
	} = useMapCanvas({
		view,
		layers,
		isDm,
		zoom,
		center,
		tool,
		fogMode,
		fogShape,
		fogBrushRadius,
		rasterAssetId,
		editable,
		showFogOutlines,
		height,
		selectedPoiId,
		selectedTokenId,
		onSelectPoi,
		onSelectToken,
		onPlace,
		onFogRegion,
		onPolygonVertexCount,
		onMovePoi,
		onMoveToken,
		onPan,
		renderPoiPopover,
		hideCombatOverlay,
		compactCombat,
		children,
		style,
	});

	return (
		<div
			ref={wellRef}
			data-testid="map-canvas-well"
			style={{
				position: 'relative',
				height,
				borderRadius: 'var(--radius-lg)',
				overflow: 'hidden',
				background:
					'radial-gradient(60% 45% at 40% 30%, color-mix(in oklab, var(--layer-base) 14%, var(--map-canvas-bg)), var(--map-canvas-bg) 78%)',
				border: `1px solid ${T.bd}`,
				cursor,
				// A READ-ONLY well (Atlas mounts one at height 560 with no `editable` and no `onPan`) claims
				// every touch gesture with `touchAction:'none'` and then drops it — `onWellPointerDown`
				// returns immediately when `!editable`. On a handset that made a canvas taller than half the
				// page an absolute scroll dead zone, so the Layers/POI/Fog rails under it were unreachable.
				// `SceneBoardCanvas.tsx` already draws this distinction for its bounded policy.
				touchAction: editable ? 'none' : 'pan-y',
				...style,
			}}
			onPointerDown={onWellPointerDown}
			onPointerMove={onWellPointerMove}
			onPointerUp={onWellPointerUp}
			onClick={onWellClick}
			onDoubleClick={onWellDoubleClick}
		>
			{/* scaled map space (grid + geometry) */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					transform: `scale(${zoom}) translate(${(0.5 - center.x) * 100}%, ${(0.5 - center.y) * 100}%)`,
					transformOrigin: 'center center',
					transition: drag ? 'none' : 'transform var(--duration-fast) var(--easing-standard)',
				}}
			>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '40px 40px',
					}}
				/>
				{view && bakePlan.active && <BakeLayer groups={bakePlan.baked} zoom={zoom} />}
				{view && (
					<MapSvgLayers
						view={view}
						isDm={isDm}
						fogMode={fogMode}
						fogBrushRadius={fogBrushRadius}
						showFogOutlines={showFogOutlines}
						drag={drag}
						fogMaskId={fogMaskId}
						polyPoints={polyPoints}
						rasterUrl={rasterUrl}
						annotationVisible={annotationVisible}
						fogOps={fogOps}
						visibleFeatures={bakePlan.svg}
						fogOpacity={fogOpacity}
					/>
				)}
				{/* RC-MAP-3.6 — the lighting/LOS wash, above the features so it reads as light falling on
				    the map. Decoration only (aria-hidden, no pointer events). */}
				{view && <LightLayer plan={lightingPlan} />}
				{/* RC-MAP-2.4 — the wash dissolving off ground the DM just revealed. Its own overlay `<svg>`
				    in the same 0..100 space as the fog mask it echoes, so nothing about the mask changes. */}
				{view && (
					<svg
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							pointerEvents: 'none',
						}}
					>
						<FogRevealFlash ops={fogOps} flashing={flashing} opacity={fogOpacity} />
					</svg>
				)}
			</div>

			{/* honest missing-bytes state: asset metadata names a raster, but the bytes are not in this
			    device's asset store (evicted / imported elsewhere). Geometry still renders; no crash. */}
			{view && rasterAssetId && !rasterUrl && (
				<div
					style={{
						position: 'absolute',
						left: '50%',
						bottom: 14,
						transform: 'translateX(-50%)',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
						padding: 'var(--space-1) var(--space-3)',
						borderRadius: 'var(--radius-md)',
						background: 'color-mix(in oklab, var(--map-canvas-bg) 80%, transparent)',
						border: `1px solid ${T.bd}`,
						font: `11.5px ${T.sans}`,
						color: T.sub,
						pointerEvents: 'none',
						zIndex: 2,
					}}
				>
					<Icon name="warning" size={13} color={T.warn} />
					{t('mapEditor.imageMissing')}
				</div>
			)}

			{/* markers (unscaled, positioned via the zoom/pan transform so hit targets stay 44px) */}
			<MapMarkers
				view={view}
				isDm={isDm}
				editable={editable}
				selectedPoiId={selectedPoiId}
				selectedTokenId={selectedTokenId}
				onSelectPoi={onSelectPoi}
				onSelectToken={onSelectToken}
				renderPoiPopover={renderPoiPopover}
				drag={drag}
				toVisual={toVisual}
				annotationVisible={annotationVisible}
				markerDragHandlers={markerDragHandlers}
				clickGuard={clickGuard}
				markersInteractive={markersInteractive}
				selectedPoi={selectedPoi}
			/>

			{/* RC-MAP-2.3 — the running fight, read-only, on every surface that shows a map. The list is
			    empty unless the consumer asked `getMapViewForActor` for `{ combat }`, so the editor (which
			    draws its own INTERACTIVE token layer) never double-draws. */}
			{!hideCombatOverlay && view && (
				<CombatOverlay tokens={view.combatTokens} toVisual={toVisual} compact={compactCombat} />
			)}

			{/* HUD overlays — clicks never fall through to the map */}
			<div
				onClick={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
				style={{ display: 'contents' }}
			>
				{children}
			</div>
		</div>
	);
}

// ── Builder-internal primitives ─────────────────────────────────────────────────────────────────

export type { MapCanvasProps } from './mapCanvasTypes';
