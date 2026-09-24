import type { MapLayer } from '@dndtools/core';
import { memo } from 'react';
import { Icon } from '../../../ds';
import { T } from '../../screen-kit';
import { mapCanvasLabel } from '../mapA11y';
import { CATEGORY_VAR } from '../mapVisibility';
import { COMBAT_TOKEN_TOOLS } from '../tools';
import type { MapEditorApi } from '../useMapEditor';
import { CombatTokenLayer } from './CombatTokenLayer';
import { CombatToolLayer } from './CombatToolLayer';
import { EditorCanvasHud } from './EditorCanvasHud';
import { PATH_TOOLS, Pt } from './editorCanvasTypes';
import { EditorPoiPopover } from './EditorPoiPopover';
import { FeatureShape } from './FeatureShape';
import { FogBrushHandle } from './FogBrushHandle';
import { MapCanvas } from './MapCanvas';
import { useEditorCanvas } from './useEditorCanvas';

const MemoMapCanvas = memo(MapCanvas);

/**
 * MAP-021 — the editor's interactive canvas. It uses the shared `MapCanvas` purely as the player-safe
 * renderer (grid, features, fog, markers, POI popover) and layers its own interaction surface on top for
 * the tools MapCanvas does not know: brush/room/wall/door/water/light/stamp/scatter/text/measure and the
 * marquee, plus wheel-zoom-to-cursor, hold-Space pan, snapping (Ctrl overrides), and the generation
 * ghost preview. Every authoring gesture dispatches an INCREMENTAL command (`map.add-features` /
 * `map.remove-features`), never `map.edit-layer`. For the tools MapCanvas already handles
 * (select/pan/poi/token/fog) the overlay steps aside and MapCanvas owns the gesture.
 */
export function EditorCanvas({
	editor,
	previewLayers,
	announce,
	rasterAssetId,
	onCursor,
	quickMapMode = false,
}: {
	editor: MapEditorApi;
	previewLayers: MapLayer[] | null;
	announce: (message: string) => void;
	rasterAssetId: string | null;
	onCursor: (p: Pt | null) => void;
	quickMapMode?: boolean;
}) {
	const {
		t,
		tool,
		options,
		zoom,
		center,
		layers,
		containerRef,
		gesture,
		path,
		hoverPt,
		polyVertexCount,
		setPolyVertexCount,
		spacePan,
		contextMenu,
		setContextMenu,
		isDrawing,
		toMap,
		pinching,
		navigationEpoch,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
		onContextMenu,
		onOverlayDown,
		onOverlayMove,
		onOverlayUp,
		onOverlayClick,
		onOverlayDouble,
		rectCorners,
		onPanDown,
		onPanMove,
		onPanUp,
		canvasTool,
		canvasEditable,
		selPoiId,
		selTokenId,
		handleSelectPoi,
		handleSelectToken,
		handlePlace,
		handleFog,
		combatModel,
		combat,
		moveCombatToken,
		onSelectCombatant,
		handleMovePoi,
		handleMoveToken,
		poiPopover,
		measureText,
		scaledStyle,
	} = useEditorCanvas({ editor, previewLayers, announce, rasterAssetId, onCursor, quickMapMode });

	return (
		<div
			ref={containerRef}
			role="application"
			// RC-UX-2.2: name + counts + the human tool label; the List view is the non-visual path.
			aria-label={mapCanvasLabel(editor)}
			onPointerDownCapture={onTouchDownCapture}
			onPointerMoveCapture={onTouchMoveCapture}
			onPointerUpCapture={endTouchCapture}
			onPointerCancelCapture={endTouchCapture}
			onContextMenu={editor.isDm ? onContextMenu : undefined}
			style={{
				position: 'relative',
				width: '100%',
				height: '100%',
				background: 'var(--map-canvas-bg)',
				touchAction: 'none',
			}}
		>
			<MemoMapCanvas
				key={navigationEpoch}
				view={editor.map}
				// RC-MAP-2.3 — the editor draws the INTERACTIVE `CombatTokenLayer` below; MapCanvas's own
				// read-only overlay would be a second, inert copy of the same tokens.
				hideCombatOverlay
				layers={layers}
				isDm={editor.isDm}
				zoom={zoom}
				center={center}
				tool={canvasTool}
				fogMode={options.fogMode}
				fogShape={options.fogShape === 'stroke' ? 'brush' : options.fogShape}
				fogBrushRadius={options.brushSize / 1000}
				rasterAssetId={rasterAssetId}
				editable={canvasEditable && !pinching}
				showFogOutlines={tool === 'fog'}
				height="100%"
				style={{ borderRadius: 'var(--radius-none)', border: 'none' }}
				selectedPoiId={selPoiId}
				selectedTokenId={selTokenId}
				onSelectPoi={handleSelectPoi}
				onSelectToken={handleSelectToken}
				onPlace={handlePlace}
				onFogRegion={handleFog}
				onPolygonVertexCount={setPolyVertexCount}
				onMovePoi={handleMovePoi}
				onMoveToken={handleMoveToken}
				onPan={editor.setCenter}
				// Dismissed ⇒ the prop goes away entirely: `MapMarkers` lays a full-canvas
				// pointer-catching layer under the popover whenever the callback is present.
				renderPoiPopover={
					poiPopover.dismissed
						? undefined
						: (poi, anchor, placement) => (
								<EditorPoiPopover
									editor={editor}
									poi={poi}
									anchor={anchor}
									placement={placement}
									dismissal={poiPopover}
								/>
							)
				}
			/>

			<CombatTokenLayer
				combat={combat}
				zoom={zoom}
				center={center}
				interactive={COMBAT_TOKEN_TOOLS.has(tool) && !spacePan && !pinching}
				gridSize={editor.map?.overlay?.gridSize ?? 0}
				snapGrid={options.snapGrid}
				onMove={moveCombatToken}
				onSelect={onSelectCombatant}
				announce={announce}
			/>

			{/* RC-MAP-2.2 — reachable cells, the path preview and the placed areas of effect. */}
			<CombatToolLayer
				editor={editor}
				model={combatModel}
				tool={tool}
				zoom={zoom}
				center={center}
				toMap={toMap}
				announce={announce}
			/>

			{/* generation ghost preview + in-progress gesture geometry */}
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				style={{ ...scaledStyle, width: '100%', height: '100%', overflow: 'visible', zIndex: 3 }}
			>
				{previewLayers &&
					previewLayers.map((l) => (
						<g key={l.id} opacity={0.5} style={{ mixBlendMode: 'screen' }}>
							{l.content.map((f) => (
								<FeatureShape
									key={f.id}
									feature={f}
									color={`var(${CATEGORY_VAR[l.category] ?? '--layer-custom'})`}
								/>
							))}
						</g>
					))}
				{gesture?.kind === 'stroke' && (
					<polyline
						points={gesture.pts.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
						fill="none"
						stroke="var(--color-accent)"
						strokeWidth={tool === 'erase' ? 3 : 1.6}
						strokeOpacity={0.7}
						strokeDasharray={tool === 'erase' ? '2 2' : undefined}
						vectorEffect="non-scaling-stroke"
						strokeLinecap="round"
					/>
				)}
				{gesture?.kind === 'rect' &&
					(() => {
						const [a, b] = rectCorners(gesture.start, gesture.cur, gesture.square);
						return (
							<rect
								x={Math.min(a.x, b.x) * 100}
								y={Math.min(a.y, b.y) * 100}
								width={Math.abs(b.x - a.x) * 100}
								height={Math.abs(b.y - a.y) * 100}
								fill={
									tool === 'marquee'
										? 'color-mix(in oklab, var(--color-accent) 12%, transparent)'
										: 'color-mix(in oklab, var(--color-accent) 20%, transparent)'
								}
								stroke="var(--color-accent)"
								strokeWidth={1.2}
								strokeDasharray="3 2"
								vectorEffect="non-scaling-stroke"
							/>
						);
					})()}
				{gesture?.kind === 'measure' && (
					<line
						x1={gesture.start.x * 100}
						y1={gesture.start.y * 100}
						x2={gesture.cur.x * 100}
						y2={gesture.cur.y * 100}
						stroke="var(--color-accent)"
						strokeWidth={1.4}
						strokeDasharray="3 2"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{path.length > 0 && (
					<g>
						<polyline
							points={[...path, ...(hoverPt ? [hoverPt] : [])]
								.map((p) => `${p.x * 100},${p.y * 100}`)
								.join(' ')}
							fill="none"
							stroke="var(--color-accent)"
							strokeWidth={1.6}
							strokeDasharray="3 2"
							vectorEffect="non-scaling-stroke"
						/>
						{path.map((p, i) => (
							<circle key={i} cx={p.x * 100} cy={p.y * 100} r={0.8} fill="var(--color-accent)" />
						))}
					</g>
				)}
			</svg>

			{/* brush cursor ring — also armed for the fog tool's brush sub-tool (RC-MAP-3.9), where it
			    reads the identical radius MapCanvas paints the drag preview at (`fogBrushRadius` below). */}
			{(tool === 'brush' ||
				tool === 'erase' ||
				(tool === 'fog' && options.fogShape === 'stroke')) &&
				hoverPt && (
					<div style={{ ...scaledStyle, zIndex: 3 }}>
						<div
							data-brush-preview
							style={{
								position: 'absolute',
								left: `${hoverPt.x * 100}%`,
								top: `${hoverPt.y * 100}%`,
								width: `${(options.brushSize / 1000) * 200}%`,
								height: `${(options.brushSize / 1000) * 200}%`,
								transform: 'translate(-50%,-50%)',
								borderRadius: 'var(--radius-full)',
								border: `1px solid var(--color-accent)`,
								background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
							}}
						/>
					</div>
				)}

			{/* interaction overlay for the drawing tools */}
			{isDrawing && tool !== 'generate' && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 4,
						cursor: 'crosshair',
						touchAction: 'none',
					}}
					onPointerDown={onOverlayDown}
					onPointerMove={onOverlayMove}
					onPointerUp={onOverlayUp}
					onClick={onOverlayClick}
					onDoubleClick={onOverlayDouble}
				/>
			)}
			{tool === 'generate' && (
				<div
					style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}
					onPointerMove={(e) => onCursor(toMap(e.clientX, e.clientY))}
				/>
			)}

			{/* space-pan overlay — captures pan with any tool */}
			{spacePan && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 9,
						cursor: gesture?.kind === 'pan' ? 'grabbing' : 'grab',
						touchAction: 'none',
					}}
					onPointerDown={onPanDown}
					onPointerMove={onPanMove}
					onPointerUp={onPanUp}
				/>
			)}

			{/* RC-MAP-4.3 — the fog brush on touch. Quick map has no tool-options bar, so the brush
			    sub-tool and its size lived only behind the desktop bar and the `[` / `]` keys: on a
			    phone the fog tool could only ever draw rectangles. This is the touch entry point —
			    a 48dp toggle and a drag handle that is also an arrow-key slider. */}
			{quickMapMode && tool === 'fog' && (
				<div
					style={{
						position: 'absolute',
						left: 'max(8px, var(--safe-area-left, 0px))',
						bottom: 8,
						zIndex: 6,
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						pointerEvents: 'none',
					}}
				>
					<button
						type="button"
						aria-pressed={options.fogShape === 'stroke'}
						aria-label={t('mapEditor.fogBrush')}
						onClick={() =>
							editor.setOption('fogShape', options.fogShape === 'stroke' ? 'rect' : 'stroke')
						}
						style={{
							pointerEvents: 'auto',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 48,
							height: 48,
							borderRadius: 'var(--radius-lg)',
							border: `1px solid ${options.fogShape === 'stroke' ? T.accBd : T.bd}`,
							background: options.fogShape === 'stroke' ? T.accSub : T.surf,
							color: options.fogShape === 'stroke' ? T.acc : T.sub,
							cursor: 'pointer',
						}}
					>
						<Icon name="tool-brush" size={20} />
					</button>
					{options.fogShape === 'stroke' && (
						<FogBrushHandle
							size={options.brushSize}
							label={t('mapEditor.fogBrushSize')}
							onChange={(value) => editor.setOption('brushSize', value)}
						/>
					)}
				</div>
			)}

			<EditorCanvasHud
				editor={editor}
				quickMapMode={quickMapMode}
				zoom={zoom}
				center={center}
				measureText={measureText}
				showPathHint={PATH_TOOLS.has(tool)}
				polygonVertexCount={tool === 'fog' && options.fogShape === 'polygon' ? polyVertexCount : 0}
				scaledStyle={scaledStyle}
				contextMenu={contextMenu}
				onCloseContextMenu={() => setContextMenu(null)}
			/>
		</div>
	);
}
