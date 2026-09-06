import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import {
	type MapFogRegion,
	type MapLayerQueryEntry,
	type MapPoiView,
	type MapView,
} from '@dndtools/core';
import {
	appendPolygonVertex,
	appendStrokePoint,
	closePolygonRegion,
	rectRegionFromDrag,
	strokeRegionFromPoints,
	type NormPoint,
} from '../../mapGeometry';
import { Icon } from '../../../ds';
import { T } from '../../screen-kit';
import { useAssetObjectUrl } from '../../../platform/assetUrl';
import { clamp01 } from '../mapVocab';
import { type FogShape, type MapTool } from '../mapVisibility';
import { type DragState, type Point } from './geometry';
import { BakeLayer, planBake } from './BakeLayer';
import { MapSvgLayers } from './MapSvgLayers';
import { MapMarkers } from './MapMarkers';
import { useI18n } from '../../../i18n';

/**
 * MapCanvas — the engine-free SVG/absolute-div geometry renderer shared by the Atlas preview and
 * the map editor (ADR-014: the core's map model is already geometric, so no raster/pixel engine).
 * Reads come from the actor-filtered `getMapViewForActor` / `queryMapLayers`, so the same renderer
 * is player-safe when the Atlas renders a non-DM actor's view. Every authoring gesture reports the
 * REAL drawn geometry to its `on*` prop; the consumer owns the dispatch. Extracted from
 * MapBuilder.tsx unchanged (RC-STB-2.6).
 */

export interface MapCanvasProps {
	/** The actor-filtered map view (already player-safe). Null renders an empty well. */
	view: MapView | null;
	/** Actor-filtered layer entries (carries the painted `content` features). */
	layers?: MapLayerQueryEntry[];
	isDm: boolean;
	zoom?: number;
	/** Normalized view center (pan). Fixed {.5,.5} for the Atlas preview. */
	center?: Point;
	tool?: MapTool;
	fogMode?: 'reveal' | 'conceal';
	/** Which fog sub-tool is active: drag-rect, click-vertex polygon, or swept brush. */
	fogShape?: FogShape;
	/** Normalized brush radius (0..0.5) for the fog brush sub-tool. */
	fogBrushRadius?: number;
	/**
	 * Content-addressed raster asset id rendered as the base `<image>` layer under the vector
	 * geometry. Null/absent ⇒ pure geometry well. Missing bytes render an honest placeholder.
	 */
	rasterAssetId?: string | null;
	/** Enables authoring gestures (builder). The Atlas preview passes false → select/inspect only. */
	editable?: boolean;
	/** Draw dashed per-op fog outlines (DM authoring aid). */
	showFogOutlines?: boolean;
	height?: number | string;
	selectedPoiId?: string | null;
	selectedTokenId?: string | null;
	onSelectPoi?: (poiId: string | null) => void;
	onSelectToken?: (tokenId: string | null) => void;
	/** Click with the poi/token tool → normalized position. */
	onPlace?: (position: Point) => void;
	/** A completed fog gesture (rect drag, closed polygon, or brush sweep) → the shaped region. */
	onFogRegion?: (region: MapFogRegion) => void;
	onMovePoi?: (poiId: string, position: Point) => void;
	onMoveToken?: (tokenId: string, position: Point) => void;
	onPan?: (center: Point) => void;
	/** Renders the POI popover at the marker's visual anchor (consumer owns the actions). */
	renderPoiPopover?: (
		poi: MapPoiView,
		anchor: { x: string; y: string },
		placement: 'top' | 'bottom',
	) => ReactNode;
	/** HUD overlays (title card, zoom cluster, minimap…) — pointer events are isolated from the map. */
	children?: ReactNode;
	style?: CSSProperties;
}

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
	onMovePoi,
	onMoveToken,
	onPan,
	renderPoiPopover,
	children,
	style,
}: MapCanvasProps) {
	const { t } = useI18n();
	const wellRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragState | null>(null);
	const [drag, setDragState] = useState<DragState | null>(null);
	/** Swallow the ghost click that follows a pointer press on a marker (its target is browser-
	 *  dependent under pointer capture); the button's onClick stays as the KEYBOARD path. */
	const suppressClickUntil = useRef(0);
	/** A press on a non-draggable marker (no capture) — select on release. */
	const pressRef = useRef<{ id: string } | null>(null);
	const fogMaskId = useId();
	/** In-progress polygon vertices (fog polygon sub-tool). */
	const [polyPoints, setPolyPoints] = useState<NormPoint[]>([]);
	const polyRef = useRef<NormPoint[]>(polyPoints);
	polyRef.current = polyPoints;
	/** Raster base layer: object URL for the map's content-addressed image bytes (null = absent). */
	const rasterUrl = useAssetObjectUrl(rasterAssetId);

	const setDrag = (d: DragState | null) => {
		dragRef.current = d;
		setDragState(d);
	};

	const fogActive = editable && tool === 'fog' && isDm;
	const onFogRegionRef = useRef(onFogRegion);
	onFogRegionRef.current = onFogRegion;

	// Leaving the fog tool / switching sub-tool abandons an in-progress polygon (never dispatches).
	useEffect(() => {
		setPolyPoints([]);
	}, [tool, fogShape, fogMode]);

	// Polygon keyboard contract while vertices exist: Enter closes (≥3 vertices), Escape cancels.
	// Registered in the CAPTURE phase so the builder overlay's own document-level Escape handler
	// (which would close the whole builder) never sees an Escape that belongs to the polygon.
	const polyActive = polyPoints.length > 0;
	useEffect(() => {
		if (!polyActive) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				e.preventDefault();
				setPolyPoints([]);
			} else if (e.key === 'Enter') {
				const region = closePolygonRegion(polyRef.current);
				if (region) {
					e.stopPropagation();
					e.preventDefault();
					setPolyPoints([]);
					onFogRegionRef.current?.(region);
				}
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	}, [polyActive]);

	// visual = 0.5 + zoom·(p − center); inverse: p = (visual − 0.5)/zoom + center.
	const toVisual = (p: Point): Point => ({
		x: 0.5 + zoom * (p.x - center.x),
		y: 0.5 + zoom * (p.y - center.y),
	});
	const toMap = (e: { clientX: number; clientY: number }): Point => {
		const r = wellRef.current?.getBoundingClientRect();
		if (!r || r.width === 0 || r.height === 0) return { x: 0.5, y: 0.5 };
		return {
			x: clamp01(((e.clientX - r.left) / r.width - 0.5) / zoom + center.x),
			y: clamp01(((e.clientY - r.top) / r.height - 0.5) / zoom + center.y),
		};
	};

	// A DM-display-disabled layer hides its annotations too (MAP-006 `enabled` axis).
	const layerOn = useMemo(() => {
		const on = new Map<string, boolean>();
		for (const l of view?.layers ?? []) on.set(l.id, l.enabled);
		return on;
	}, [view?.layers]);
	const annotationVisible = (layerId: string) => layerOn.get(layerId) === true;

	// Fog ops composed in sequence order — a later op overrides an earlier overlap (MAP-012).
	const fogOps = useMemo(
		() =>
			(view?.fog ?? [])
				.filter((op) => annotationVisible(op.layerId))
				.slice()
				.sort((a, b) => a.sequence - b.sequence),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[view?.fog, layerOn],
	);

	const contentLayers = useMemo(
		() =>
			layers
				.filter((l) => l.enabled && l.content.length > 0)
				.slice()
				.sort((a, b) => a.order - b.order),
		[layers],
	);

	// PERF (MAP-021): a generated world holds thousands of features. When zoomed in, cull features whose
	// bounds fall entirely outside the visible viewport so a dense map never freezes the editor. At
	// zoom ≤ 1 (the Atlas preview and the fit view) the visible box covers the whole map, so nothing is
	// culled and the shared renderer behaves exactly as before.
	const visibleFeatures = useMemo(() => {
		const half = 0.5 / zoom;
		const vx0 = center.x - half - 0.02;
		const vx1 = center.x + half + 0.02;
		const vy0 = center.y - half - 0.02;
		const vy1 = center.y + half + 0.02;
		const cullNeeded = zoom > 1.001;
		return contentLayers.map((l) => {
			if (!cullNeeded) return { layer: l, features: l.content };
			const features = l.content.filter((f) => {
				let minX = Infinity;
				let minY = Infinity;
				let maxX = -Infinity;
				let maxY = -Infinity;
				for (const p of f.points) {
					if (p.x < minX) minX = p.x;
					if (p.x > maxX) maxX = p.x;
					if (p.y < minY) minY = p.y;
					if (p.y > maxY) maxY = p.y;
				}
				return maxX >= vx0 && minX <= vx1 && maxY >= vy0 && minY <= vy1;
			});
			return { layer: l, features };
		});
	}, [contentLayers, zoom, center.x, center.y]);

	// PERF (RC-MAP-3.3): above a density threshold the inert terrain/biome fills move to a canvas-2d
	// bake layer under the SVG, so a pan/zoom frame walks a few dozen interactive nodes instead of
	// thousands of static ones. Below the threshold the plan is inactive and `plan.svg` is
	// `visibleFeatures` itself, so a small map renders through the identical path as before.
	const bakePlan = useMemo(() => planBake(visibleFeatures), [visibleFeatures]);

	// ── Well-level gestures (fog rect/brush draw · polygon vertices · pan · click-to-place) ────
	const onWellPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		pressRef.current = null; // a well press is never a marker press (markers stop propagation)
		if (!editable || e.button !== 0) return;
		if (tool === 'fog' && isDm && onFogRegion) {
			if (fogShape === 'polygon') return; // polygon collects vertices on CLICK, not on drag
			e.currentTarget.setPointerCapture(e.pointerId);
			const p = toMap(e);
			if (fogShape === 'brush') setDrag({ kind: 'brush', points: [p] });
			else setDrag({ kind: 'fog', start: p, cur: p });
		} else if (tool === 'pan' && onPan) {
			e.currentTarget.setPointerCapture(e.pointerId);
			setDrag({ kind: 'pan', px: e.clientX, py: e.clientY, c0: center });
		}
	};
	const onWellPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (!d) return;
		if (d.kind === 'fog') setDrag({ ...d, cur: toMap(e) });
		else if (d.kind === 'brush') setDrag({ ...d, points: appendStrokePoint(d.points, toMap(e)) });
		else if (d.kind === 'pan' && onPan) {
			const r = wellRef.current?.getBoundingClientRect();
			if (!r) return;
			onPan({
				x: clamp01(d.c0.x - (e.clientX - d.px) / (r.width * zoom)),
				y: clamp01(d.c0.y - (e.clientY - d.py) / (r.height * zoom)),
			});
		}
	};
	const onWellPointerUp = () => {
		const d = dragRef.current;
		if (!d) return;
		setDrag(null);
		if (d.kind === 'fog' && onFogRegion) {
			// The core rejects a zero-area region — the helper returns null for accidental micro-drags.
			const region = rectRegionFromDrag(d.start, d.cur);
			if (region) onFogRegion(region);
		} else if (d.kind === 'brush' && onFogRegion) {
			const region = strokeRegionFromPoints(d.points, fogBrushRadius);
			if (region) onFogRegion(region);
		}
	};
	const onWellClick = (e: ReactMouseEvent<HTMLDivElement>) => {
		if (!editable) return;
		if ((tool === 'poi' || tool === 'token') && onPlace) onPlace(toMap(e));
		else if (fogActive && fogShape === 'polygon' && onFogRegion) {
			setPolyPoints((pts) => appendPolygonVertex(pts, toMap(e)));
		}
	};
	const onWellDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
		if (!fogActive || fogShape !== 'polygon' || !onFogRegion) return;
		e.preventDefault();
		const region = closePolygonRegion(polyRef.current);
		setPolyPoints([]);
		if (region) onFogRegion(region);
	};

	// ── Marker press/drag. Selection resolves on POINTERUP (under pointer capture the follow-up
	// click's target is browser-dependent — Chrome retargets it to the capture element — so the
	// inner button's onClick cannot be the pointer path; it remains the keyboard path). ──────────
	const markerDragHandlers = (
		kind: 'poi' | 'token',
		id: string,
		canDrag: boolean,
		onSelect: () => void,
	) => ({
		onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			if (canDrag) {
				e.currentTarget.setPointerCapture(e.pointerId);
				setDrag({ kind, id, pos: toMap(e), sx: e.clientX, sy: e.clientY, moved: false });
			} else {
				pressRef.current = { id };
			}
		},
		onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
			const d = dragRef.current;
			if (!d || (d.kind !== 'poi' && d.kind !== 'token') || d.id !== id) return;
			const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3;
			setDrag({ ...d, pos: toMap(e), moved });
		},
		onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
			const d = dragRef.current;
			if (d && (d.kind === 'poi' || d.kind === 'token') && d.id === id) {
				setDrag(null);
				suppressClickUntil.current = performance.now() + 400;
				if (d.moved) {
					if (d.kind === 'poi') onMovePoi?.(id, toMap(e));
					else onMoveToken?.(id, toMap(e));
				} else {
					onSelect();
				}
			} else if (pressRef.current?.id === id) {
				pressRef.current = null;
				suppressClickUntil.current = performance.now() + 400;
				onSelect();
			}
		},
	});
	/** Button onClick = the keyboard-activation path only; a pointer press already selected on release. */
	const clickGuard = (fn: () => void) => () => {
		if (performance.now() < suppressClickUntil.current) return;
		fn();
	};

	const fogOpacity = isDm ? 'var(--map-fog-opacity-dm)' : 'var(--map-fog-opacity-player)';
	const markersInteractive = tool === 'select';
	const selectedPoi = view?.pois.find((p) => p.id === selectedPoiId) ?? null;

	const cursor =
		editable && tool === 'fog'
			? 'crosshair'
			: editable && (tool === 'poi' || tool === 'token')
				? 'copy'
				: editable && tool === 'pan'
					? drag?.kind === 'pan'
						? 'grabbing'
						: 'grab'
					: 'default';

	return (
		<div
			ref={wellRef}
			data-testid="map-canvas-well"
			style={{
				position: 'relative',
				height,
				borderRadius: 12,
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
						gap: 7,
						padding: '5px 11px',
						borderRadius: 8,
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
