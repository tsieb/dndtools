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
	NATIVE_ASSET_MIME_TYPES,
	previewMapImport,
	type MapFeature,
	type MapFogRegion,
	type MapImportElementKind,
	type MapImportPreview,
	type MapLayerCategory,
	type MapLayerQueryEntry,
	type MapPoiCategory,
	type MapPoiView,
	type MapView,
	type SceneVisibility,
} from '@dndtools/core';
import {
	Button,
	Dialog,
	Field,
	Icon,
	POIMarker,
	SegmentedControl,
	Select,
	Stepper,
	VisibilityChip,
} from '../ds';
import { FogRegionShape } from './fogRegions';
import {
	appendPolygonVertex,
	appendStrokePoint,
	closePolygonRegion,
	rectRegionFromDrag,
	strokeRegionFromPoints,
	type NormPoint,
} from './mapGeometry';
import { T, eb } from './screen-kit';
import { terrainColor } from './map/mapVocab';
import { useAssetObjectUrl } from '../platform/assetUrl';
import { putAssetBytes } from '../platform/storage/assetStore';
import { useRuntime } from '../runtime/RuntimeContext';
import { MapEditor } from './map/MapEditor';

/**
 * MapBuilder — real spatial map authoring (ports the STRUCTURE of the online prototype's
 * map-builder.jsx: tool rail · canvas well · right inspector) wired to the Processing Core.
 *
 * ADR-014 note: this deliberately builds NO raster/pixel engine (no canvas/WebGL/Pixi). The core's
 * map model is already geometric — normalized-coordinate fog regions, POIs, tokens, layer features —
 * so `MapCanvas` below is an engine-free SVG/absolute-div geometry renderer shared by the Atlas
 * preview and this builder. Every authoring gesture dispatches a durable core command with the REAL
 * drawn geometry (replacing the old hardcoded {x:.2,y:.2,w:.3,h:.3} fog rect and the {.5,.5} POI
 * drop): drag-draw a rect → `map.append-fog`, click → `map.create-poi` / `map.create-token`, drag a
 * marker → `map.update-poi` / `map.move-token`. Reads come from the actor-filtered
 * `getMapViewForActor` / `queryMapLayers`, so the same renderer is player-safe when the Atlas
 * preview renders a non-DM actor's view.
 *
 * Fog authoring is fully shaped (MAP-012 union): drag-draw rects, click-placed polygons
 * (double-click/Enter closes, Esc cancels), and swept brush strokes — each with an optional
 * feathered edge — all dispatch the real `map.append-fog`. Generation dispatches the deterministic
 * `map.generate-layers` (MAP-004). Import stores REAL bytes: `map.import-asset` records the
 * content-addressed metadata while the byte payload lands in the app-side asset store under the
 * SAME content-hash id, and the canvas renders the raster as an `<image>` base layer (with an
 * honest placeholder when the bytes are absent on this device).
 */

export type MapTool = 'select' | 'pan' | 'poi' | 'token' | 'fog';
export type FogShape = 'rect' | 'polygon' | 'brush';

// ── Shared vocabulary (also imported by Atlas) ──────────────────────────────────────────────────

/** Layer-type → `--layer-*` hue map (mirrors the archived Svelte MapLayerPanel.svelte CATEGORY tones). */
export const CATEGORY_VAR: Record<MapLayerCategory, string> = {
	base: '--layer-base',
	terrain: '--layer-height',
	roads: '--layer-roads',
	poi: '--layer-poi',
	fog: '--layer-fog',
	'dm-annotations': '--layer-dm',
	'player-overlay': '--layer-player',
};
export const CATEGORY_LABEL: Record<MapLayerCategory, string> = {
	base: 'Base',
	terrain: 'Terrain',
	roads: 'Roads',
	poi: 'POI',
	fog: 'Fog',
	'dm-annotations': 'DM notes',
	'player-overlay': 'Player overlay',
};
export const VIS_LABEL: Record<string, string> = {
	'dm-only': 'DM only',
	'player-visible': 'Player visible',
	shared: 'Shared',
};
export const VIS_STATUS: Record<string, 'neutral' | 'info' | 'success'> = {
	'dm-only': 'neutral',
	'player-visible': 'info',
	shared: 'success',
};
export const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Player visible' },
	{ value: 'shared', label: 'Shared' },
];
/** Core visibility → the safety-critical VisibilityChip level (same map as Knowledge/Campaign).
 *  `shared` reads as "players can see it" — the chip's players level is the honest signal. */
export const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};

/** Core POI category → the DS POIMarker/POIPopover glyph family (the DS knows 6 tones, core 9). */
export const POI_MARKER_CAT: Record<MapPoiCategory, string> = {
	settlement: 'location',
	landmark: 'location',
	dungeon: 'danger',
	quest: 'quest',
	hazard: 'danger',
	shop: 'treasure',
	npc: 'npc',
	note: 'note',
	other: 'location',
};

/** Core visibility ↔ the DS POIPopover's segmented values (`players` vs core `player-visible`). */
export function visToDs(v: SceneVisibility): string {
	return v === 'player-visible' ? 'players' : v;
}
export function dsToVis(v: string): SceneVisibility {
	return (v === 'players' ? 'player-visible' : v) as SceneVisibility;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── MapCanvas — the shared engine-free geometry renderer ────────────────────────────────────────

interface Point {
	x: number;
	y: number;
}

type DragState =
	| { kind: 'fog'; start: Point; cur: Point }
	| { kind: 'brush'; points: NormPoint[] }
	| { kind: 'pan'; px: number; py: number; c0: Point }
	| { kind: 'poi' | 'token'; id: string; pos: Point; sx: number; sy: number; moved: boolean };

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

/** A rect from `room`/`fill`'s two corner points, as an `x,y,w,h` tuple in the 0–100 viewBox. */
function rectOf(feature: MapFeature): { x: number; y: number; w: number; h: number } {
	const a = feature.points[0] ?? { x: 0, y: 0 };
	const b = feature.points[1] ?? a;
	const x = Math.min(a.x, b.x) * 100;
	const y = Math.min(a.y, b.y) * 100;
	return { x, y, w: Math.abs(b.x - a.x) * 100, h: Math.abs(b.y - a.y) * 100 };
}

/**
 * One painted/generated layer feature (MAP-003 / MAP-021 normalized geometry) as SVG in the 0–100
 * viewBox. `color` is the layer-category tint; a feature may override presentation through `props`
 * (e.g. a light's own colour), but never geometry. Every kind the core can emit renders here — a kind
 * this switch does not know still falls through to a visible polyline rather than vanishing, so a
 * forward-compatible core never produces an invisible map.
 */
export function FeatureShape({ feature, color }: { feature: MapFeature; color: string }) {
	const pts = feature.points
		.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
		.join(' ');
	const props = feature.props ?? {};
	// A painted `terrain:*` style overrides the layer-category colour; anything else keeps it. Without
	// this the Terrain select's eight swatches were decorative only — every one painted the same tint.
	const paint = terrainColor(feature.style) ?? color;
	switch (feature.kind) {
		case 'fill':
		case 'room': {
			const r = rectOf(feature);
			return (
				<rect
					x={r.x}
					y={r.y}
					width={r.w}
					height={r.h}
					fill={paint}
					fillOpacity={0.3}
					stroke={paint}
					strokeWidth={1.4}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'polygon': {
			// The workhorse: caves, biomes, wards, landmasses. A `props.hole` polygon is an interior
			// void (a pillar, a lake in land) — render it as a knock-out tint so it reads as "not floor".
			const isHole = props.hole === true;
			return (
				<polygon
					points={pts}
					fill={isHole ? 'var(--map-canvas-bg)' : color}
					fillOpacity={isHole ? 0.9 : 0.32}
					stroke={color}
					strokeWidth={1.2}
					vectorEffect="non-scaling-stroke"
					strokeLinejoin="round"
				/>
			);
		}
		case 'water': {
			// A river is a flowing polyline (width from props.width); a lake/sea is a filled ring. The
			// two are distinguished by the style token / props, NOT by point count — a river naturally has
			// many vertices, so counting points would wrongly render every river as a filled lake.
			const isRiver =
				feature.style.includes('river') || props.biome === 'river' || props.flow !== undefined;
			const width = typeof props.width === 'number' ? Math.max(0.4, props.width * 100) : 1.6;
			return isRiver ? (
				<polyline
					points={pts}
					fill="none"
					stroke="var(--layer-water)"
					strokeWidth={width}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			) : (
				<polygon
					points={pts}
					fill="var(--layer-water)"
					fillOpacity={0.45}
					stroke="var(--layer-water)"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'marker': {
			const p = feature.points[0]!;
			return <circle cx={p.x * 100} cy={p.y * 100} r={1.1} fill={color} />;
		}
		case 'prop': {
			const p = feature.points[0]!;
			const scale = typeof props.scale === 'number' ? props.scale : 1;
			return (
				<circle
					cx={p.x * 100}
					cy={p.y * 100}
					r={Math.max(0.5, 0.9 * scale)}
					fill={color}
					fillOpacity={0.85}
				/>
			);
		}
		case 'light': {
			const p = feature.points[0]!;
			const radius = typeof props.radius === 'number' ? props.radius * 100 : 6;
			const lightColor = typeof props.color === 'string' ? props.color : '#ffd6aa';
			return (
				<g>
					<circle
						cx={p.x * 100}
						cy={p.y * 100}
						r={radius}
						fill={lightColor}
						fillOpacity={0.1}
						stroke={lightColor}
						strokeOpacity={0.35}
						strokeWidth={0.8}
						vectorEffect="non-scaling-stroke"
					/>
					<circle cx={p.x * 100} cy={p.y * 100} r={0.9} fill={lightColor} />
				</g>
			);
		}
		case 'door': {
			// A door spans a wall opening. Solid = closed/locked, dashed = open/archway.
			const state = props.state;
			const open = state === 'open' || props.portal === 'archway';
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={props.portal === 'secret' ? 'var(--layer-dm)' : 'var(--layer-roads)'}
					strokeWidth={3.2}
					strokeLinecap="butt"
					strokeDasharray={open ? '3 2' : props.portal === 'secret' ? '1 2' : undefined}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'text': {
			const p = feature.points[0]!;
			const text = typeof props.text === 'string' ? props.text : '';
			const size = typeof props.size === 'number' ? props.size : 3;
			return (
				<text
					x={p.x * 100}
					y={p.y * 100}
					fill={color}
					fontSize={size}
					textAnchor="middle"
					style={{ font: `${size}px var(--font-display, serif)` }}
				>
					{text}
				</text>
			);
		}
		case 'road':
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={color}
					strokeWidth={1.6}
					strokeDasharray="5 3"
					vectorEffect="non-scaling-stroke"
				/>
			);
		case 'wall':
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={color}
					strokeWidth={2.4}
					vectorEffect="non-scaling-stroke"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			);
		default: // 'stroke'
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={paint}
					strokeWidth={1.4}
					vectorEffect="non-scaling-stroke"
					strokeLinecap="round"
				/>
			);
	}
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
				{view && (
					<svg
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							pointerEvents: 'none',
							overflow: 'visible',
						}}
					>
						{/* raster base layer — the imported image bytes, content-addressed. Rendered FIRST so
						    every vector layer, annotation, and (critically) the fog mask covers it. */}
						{rasterUrl && (
							<image
								href={rasterUrl}
								x={0}
								y={0}
								width={100}
								height={100}
								preserveAspectRatio="none"
							/>
						)}
						{/* painted layer features (MAP-003), in render order, tinted by layer category */}
						{visibleFeatures.map(({ layer: l, features }) => (
							<g key={l.layerId} opacity={l.opacity}>
								{features.map((f) => (
									<FeatureShape
										key={f.id}
										feature={f}
										color={`var(${CATEGORY_VAR[l.category] ?? '--layer-custom'})`}
									/>
								))}
							</g>
						))}
						{/* routes (MAP-013) */}
						{view.routes
							.filter((r) => annotationVisible(r.layerId))
							.map((r) => (
								<g key={r.id}>
									<polyline
										points={r.waypoints
											.map((w) => `${w.position.x * 100},${w.position.y * 100}`)
											.join(' ')}
										fill="none"
										stroke={
											r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'
										}
										strokeWidth={2}
										strokeDasharray="6 4"
										vectorEffect="non-scaling-stroke"
										opacity={0.85}
									/>
									{r.waypoints.map((w) => (
										<circle
											key={w.id}
											cx={w.position.x * 100}
											cy={w.position.y * 100}
											r={0.9}
											fill={
												r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'
											}
										/>
									))}
								</g>
							))}
						{/* fog of war — mask composed op-by-op so a later op overrides an earlier overlap */}
						{fogOps.length > 0 && (
							<>
								<defs>
									<mask
										id={fogMaskId}
										maskUnits="userSpaceOnUse"
										x={0}
										y={0}
										width={100}
										height={100}
									>
										<rect x={0} y={0} width={100} height={100} fill="black" />
										{fogOps.map((op) => (
											<g key={op.id}>
												<FogRegionShape
													region={op.region}
													paint={op.kind === 'conceal' ? 'white' : 'black'}
													mode="fill"
													feather={op.feather}
												/>
											</g>
										))}
									</mask>
								</defs>
								<rect
									x={0}
									y={0}
									width={100}
									height={100}
									fill="var(--map-fog-fill)"
									opacity={fogOpacity}
									mask={`url(#${fogMaskId})`}
								/>
							</>
						)}
						{/* DM authoring aid: dashed per-op outlines */}
						{showFogOutlines &&
							isDm &&
							fogOps.map((op) => (
								<g key={`o-${op.id}`}>
									<FogRegionShape
										region={op.region}
										paint={op.kind === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
										mode="outline"
									/>
								</g>
							))}
						{/* ghost previews while a fog gesture is in progress (rect drag · brush sweep · polygon) */}
						{drag?.kind === 'fog' && (
							<rect
								x={Math.min(drag.start.x, drag.cur.x) * 100}
								y={Math.min(drag.start.y, drag.cur.y) * 100}
								width={Math.abs(drag.cur.x - drag.start.x) * 100}
								height={Math.abs(drag.cur.y - drag.start.y) * 100}
								fill={
									fogMode === 'reveal'
										? 'color-mix(in oklab, var(--color-accent) 18%, transparent)'
										: 'color-mix(in oklab, var(--map-fog-fill) 45%, transparent)'
								}
								stroke={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
								strokeWidth={1.4}
								strokeDasharray="4 3"
								vectorEffect="non-scaling-stroke"
							/>
						)}
						{drag?.kind === 'brush' && (
							<g opacity={0.7}>
								<FogRegionShape
									region={{ shape: 'stroke', points: drag.points, radius: fogBrushRadius }}
									paint={
										fogMode === 'reveal'
											? 'color-mix(in oklab, var(--color-accent) 30%, transparent)'
											: 'color-mix(in oklab, var(--map-fog-fill) 55%, transparent)'
									}
									mode="fill"
								/>
							</g>
						)}
						{polyPoints.length > 0 && (
							<g>
								<polyline
									points={polyPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
									fill={
										polyPoints.length >= 3
											? fogMode === 'reveal'
												? 'color-mix(in oklab, var(--color-accent) 14%, transparent)'
												: 'color-mix(in oklab, var(--map-fog-fill) 35%, transparent)'
											: 'none'
									}
									stroke={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
									strokeWidth={1.4}
									strokeDasharray="4 3"
									vectorEffect="non-scaling-stroke"
								/>
								{polyPoints.map((p, i) => (
									<circle
										key={i}
										cx={p.x * 100}
										cy={p.y * 100}
										r={0.8}
										fill={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
									/>
								))}
							</g>
						)}
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
					This map’s image isn’t on this device — showing shapes only
				</div>
			)}

			{/* markers (unscaled, positioned via the zoom/pan transform so hit targets stay 44px) */}
			<div
				style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
				onClick={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
			>
				{view?.tokens
					.filter((t) => annotationVisible(t.layerId))
					.map((t) => {
						const dragging = drag && drag.kind === 'token' && drag.id === t.id;
						const v = toVisual(dragging && drag.kind === 'token' ? drag.pos : t.position);
						if (v.x < -0.05 || v.x > 1.05 || v.y < -0.05 || v.y > 1.05) return null;
						const canDrag = editable && markersInteractive && (isDm || t.canMove);
						const d = Math.round(30 * Math.min(2, Math.max(0.7, t.size)));
						const on = t.id === selectedTokenId;
						const selectToken = () => onSelectToken?.(on ? null : t.id);
						return (
							<div
								key={t.id}
								{...markerDragHandlers('token', t.id, canDrag, selectToken)}
								style={{
									position: 'absolute',
									left: `${v.x * 100}%`,
									top: `${v.y * 100}%`,
									transform: 'translate(-50%,-50%)',
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									gap: 4,
									pointerEvents: markersInteractive ? 'auto' : 'none',
									cursor: canDrag ? (dragging ? 'grabbing' : 'grab') : 'pointer',
									zIndex: on ? 3 : 2,
								}}
							>
								<button
									type="button"
									aria-label={`Token: ${t.label}`}
									aria-pressed={on}
									title={t.label}
									onClick={clickGuard(selectToken)}
									style={{
										width: d,
										height: d,
										borderRadius: '50%',
										border: `2.5px solid ${t.linkedActorId ? T.ok : T.err}`,
										background: T.bg,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										font: `700 11px ${T.mono}`,
										color: T.ink,
										cursor: 'inherit',
										boxShadow: on ? `0 0 0 3px var(--color-interactive-selected), ${T.ssm}` : T.ssm,
										padding: 0,
									}}
								>
									{t.label[0]}
								</button>
								<span
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 4,
										font: `10px ${T.sans}`,
										color: T.sub,
										background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
										padding: '1px 5px',
										borderRadius: 4,
										whiteSpace: 'nowrap',
									}}
								>
									{t.label}
									{t.visibility === 'dm-only' && <VisibilityChip level="dm-only" compact />}
								</span>
							</div>
						);
					})}

				{view?.pois
					.filter((p) => annotationVisible(p.layerId))
					.map((p) => {
						const dragging = drag && drag.kind === 'poi' && drag.id === p.id;
						const v = toVisual(dragging && drag.kind === 'poi' ? drag.pos : p.position);
						if (v.x < -0.05 || v.x > 1.05 || v.y < -0.05 || v.y > 1.05) return null;
						const canDrag = editable && markersInteractive && isDm;
						const selectPoi = () => onSelectPoi?.(p.id === selectedPoiId ? null : p.id);
						return (
							<div
								key={p.id}
								{...markerDragHandlers('poi', p.id, canDrag, selectPoi)}
								style={{
									position: 'absolute',
									left: `${v.x * 100}%`,
									top: `${v.y * 100}%`,
									transform: 'translate(-50%,-88%)',
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									pointerEvents: markersInteractive ? 'auto' : 'none',
									cursor: canDrag ? (dragging ? 'grabbing' : 'grab') : 'pointer',
									zIndex: p.id === selectedPoiId ? 4 : 2,
								}}
							>
								<POIMarker
									category={POI_MARKER_CAT[p.category] ?? 'location'}
									label={p.label}
									dmOnly={p.visibility === 'dm-only'}
									active={p.id === selectedPoiId}
									onClick={clickGuard(selectPoi)}
								/>
								<span
									style={{
										font: `10px ${T.sans}`,
										color: T.ink,
										background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
										padding: '1px 6px',
										borderRadius: 5,
										whiteSpace: 'nowrap',
										marginTop: -6,
									}}
								>
									{p.label}
								</span>
							</div>
						);
					})}

				{/* POI popover, anchored at the marker's visual position (consumer supplies the actions) */}
				{selectedPoi && renderPoiPopover && annotationVisible(selectedPoi.layerId) && (
					<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
						<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
							{(() => {
								const v = toVisual(selectedPoi.position);
								const placement = v.y < 0.42 ? 'bottom' : 'top';
								return (
									<div
										style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
										onClick={(e) => e.stopPropagation()}
									>
										{renderPoiPopover(
											selectedPoi,
											{
												x: `${v.x * 100}%`,
												y: `${(placement === 'top' ? v.y - 0.045 : v.y + 0.01) * 100}%`,
											},
											placement,
										)}
									</div>
								);
							})()}
						</div>
					</div>
				)}
			</div>

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

function PanelLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				margin: '2px 0 8px',
			}}
		>
			<span style={eb}>{children}</span>
			{action}
		</div>
	);
}

// ── Import wizard (real map.import-asset / map.commit-import) ───────────────────────────────────

const IMPORT_ELEMENT_KINDS: MapImportElementKind[] = [
	'dimensions',
	'grid',
	'background-image',
	'walls',
	'lights',
	'notes',
	'layers',
	'tokens',
];

const SUPPORT_PILL: Record<string, { tone: string; bg: string; label: string; icon: string }> = {
	importable: {
		tone: 'var(--color-status-success)',
		bg: 'var(--color-status-success-subtle)',
		label: 'Importable',
		icon: 'success',
	},
	lossy: {
		tone: 'var(--color-status-warning)',
		bg: 'var(--color-status-warning-subtle)',
		label: 'Lossy',
		icon: 'warning',
	},
	unsupported: {
		tone: 'var(--color-status-error)',
		bg: 'var(--color-status-error-subtle)',
		label: 'Unsupported',
		icon: 'error',
	},
	blocked: {
		tone: 'var(--color-text-tertiary)',
		bg: 'var(--color-surface-sunken)',
		label: 'Blocked',
		icon: 'lock',
	},
};

interface PickedFile {
	file: File;
	bytes: Uint8Array;
	dimensions: { width: number; height: number } | null;
}

export function ImportMapDialog({
	mapId,
	mapName,
	onClose,
}: {
	mapId: string;
	mapName: string;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [step, setStep] = useState(0);
	const [source, setSource] = useState<'native' | 'external'>('native');
	const [picked, setPicked] = useState<PickedFile | null>(null);
	const [readError, setReadError] = useState<string | null>(null);
	const formats = runtime.mapImportAdapters.formats();
	const [formatId, setFormatId] = useState(formats[0] ?? '');
	const [declared, setDeclared] = useState<MapImportElementKind[]>([
		'dimensions',
		'grid',
		'background-image',
	]);
	const [busy, setBusy] = useState(false);
	const [commitError, setCommitError] = useState<string | null>(null);
	const [result, setResult] = useState<{
		assetId: string | null;
		deduped: boolean;
		dropped: number;
		byteError: string | null;
	} | null>(null);

	const nativeMimes = Object.keys(NATIVE_ASSET_MIME_TYPES);

	async function pickFile(file: File | undefined) {
		setReadError(null);
		setPicked(null);
		if (!file) return;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			let dimensions: { width: number; height: number } | null = null;
			if (file.type !== 'image/svg+xml') {
				try {
					const bmp = await createImageBitmap(file);
					dimensions = { width: bmp.width, height: bmp.height };
					bmp.close();
				} catch {
					dimensions = null; // undecodable raster — the core validates MIME/size itself
				}
			}
			setPicked({ file, bytes, dimensions });
		} catch (err) {
			setReadError(err instanceof Error ? err.message : String(err));
		}
	}

	// Read-only, pure preview against the SAME registry + validation the commit handler re-runs
	// (MAP-002/MAP-020): nothing is written until the explicit commit in step 2.
	const preview: MapImportPreview | null = useMemo(() => {
		if (step !== 1) return null;
		const now = new Date().toISOString();
		if (source === 'native') {
			if (!picked) return null;
			return previewMapImport(runtime.mapImportAdapters, {
				formatId: null,
				asset: {
					bytes: picked.bytes,
					mimeType: picked.file.type,
					fileName: picked.file.name,
					dimensions: picked.dimensions,
				},
				declaredElements: [],
				importedBy: actorId,
				importedAt: now,
			});
		}
		return previewMapImport(runtime.mapImportAdapters, {
			formatId: formatId || 'unknown',
			asset: null,
			declaredElements: declared,
			importedBy: actorId,
			importedAt: now,
		});
	}, [step, source, picked, formatId, declared, actorId, runtime.mapImportAdapters]);

	async function commit() {
		if (busy) return;
		setBusy(true);
		setCommitError(null);
		try {
			const res = await runtime.dispatch(
				source === 'native'
					? {
							type: 'map.import-asset',
							actorId,
							payload: {
								mapId,
								bytes: Array.from(picked?.bytes ?? []),
								asset: {
									mimeType: picked?.file.type ?? '',
									fileName: picked?.file.name ?? '',
									dimensions: picked?.dimensions ?? null,
								},
							},
						}
					: {
							type: 'map.commit-import',
							actorId,
							payload: { mapId, formatId, declaredElements: declared, bytes: null, asset: null },
						},
			);
			if (res.status === 'accepted') {
				const ev = (
					res.events as
						| Array<{
								kind: string;
								assetId?: string | null;
								assetDeduped?: boolean;
								droppedElementCount?: number;
						  }>
						| undefined
				)?.find((e) => e.kind === 'map.import-committed');
				// Store the REAL bytes in the app-side content-addressed store (same hash id as the core
				// metadata record, so the canvas can resolve them). A byte-store failure is reported
				// honestly on the result step — the metadata record stands, the raster just won't render.
				let byteError: string | null = null;
				if (source === 'native' && picked) {
					try {
						await putAssetBytes(picked.bytes, picked.file.type);
					} catch (err) {
						byteError = err instanceof Error ? err.message : String(err);
					}
				}
				setResult({
					assetId: ev?.assetId ?? null,
					deduped: ev?.assetDeduped ?? false,
					dropped: ev?.droppedElementCount ?? 0,
					byteError,
				});
				setStep(2);
			} else {
				setCommitError(res.rejection.message);
			}
		} catch (error) {
			// `finally` alone only un-freezes the button. `runtime.dispatch` RETHROWS after a failed
			// persist, so without this branch Import simply did nothing, forever, with no message —
			// the wizard sat on the preview step looking as though the click had never registered.
			setCommitError(
				error instanceof Error ? error.message : 'The import couldn’t be completed — try again.',
			);
		} finally {
			setBusy(false);
		}
	}

	const canPreview =
		source === 'native' ? picked !== null : declared.length > 0 && formatId.length > 0;
	const meta: Array<[string, string]> = picked
		? [
				['Filename', picked.file.name],
				['MIME type', picked.file.type || 'unknown'],
				[
					'Dimensions',
					picked.dimensions ? `${picked.dimensions.width} × ${picked.dimensions.height} px` : '—',
				],
				['Byte size', `${(picked.bytes.length / 1024).toFixed(1)} KB`],
			]
		: [];

	return (
		<Dialog
			open
			onClose={onClose}
			title="Import map"
			description={`Attach an image or external scene to “${mapName}”. Review the preview before importing; cancel at any time to leave the map unchanged.`}
			icon="import"
			size="md"
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<Stepper steps={['Source', 'Preview', 'Result']} current={step} />

				{step === 0 && (
					<>
						<SegmentedControl
							fullWidth
							ariaLabel="Source type"
							value={source}
							onChange={(v: string) => setSource(v as 'native' | 'external')}
							options={[
								{ value: 'native', label: 'Image / SVG' },
								{ value: 'external', label: 'External scene format' },
							]}
						/>
						{source === 'native' ? (
							<label
								style={{
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									gap: 8,
									padding: '26px 16px',
									border: `1.5px dashed ${T.bdS}`,
									borderRadius: 11,
									background: T.sunken,
									cursor: 'pointer',
									textAlign: 'center',
								}}
							>
								<input
									type="file"
									accept={nativeMimes.join(',')}
									style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
									onChange={(e: { target: { files: FileList | null } }) =>
										void pickFile(e.target.files?.[0])
									}
								/>
								<Icon name="upload" size={26} color={T.ter} />
								{picked ? (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
										<strong style={{ color: T.ink }}>{picked.file.name}</strong> ·{' '}
										{(picked.bytes.length / 1024).toFixed(1)} KB
									</span>
								) : (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
										Choose an image or SVG
									</span>
								)}
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									PNG · JPG · WebP · GIF · SVG — up to{' '}
									{Math.round((8 * 1024 * 1024) / (1024 * 1024))} MB
								</span>
								{readError && (
									<span style={{ font: `12px ${T.sans}`, color: T.err }}>{readError}</span>
								)}
							</label>
						) : (
							<>
								<Field
									label="Import format"
									help="Choose the format that created this file. Unsupported formats are left untouched."
								>
									<Select
										value={formatId}
										options={formats.map((f) => ({ value: f, label: f }))}
										onChange={(e: { target: { value: string } }) => setFormatId(e.target.value)}
									/>
								</Field>
								<div>
									<PanelLabel>Elements the file contains</PanelLabel>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
										{IMPORT_ELEMENT_KINDS.map((k) => {
											const on = declared.includes(k);
											return (
												<label
													key={k}
													style={{
														display: 'flex',
														alignItems: 'center',
														gap: 8,
														padding: '6px 8px',
														borderRadius: 8,
														border: `1px solid ${on ? T.accBd : T.bd}`,
														background: on ? T.accSub : 'transparent',
														cursor: 'pointer',
														font: `12px ${T.sans}`,
														color: on ? T.acc : T.sub,
													}}
												>
													<input
														type="checkbox"
														checked={on}
														onChange={() =>
															setDeclared((d) => (on ? d.filter((x) => x !== k) : [...d, k]))
														}
														style={{ accentColor: 'var(--color-accent)' }}
													/>
													{k}
												</label>
											);
										})}
									</div>
									<div style={{ marginTop: 8, font: `11px/1.5 ${T.sans}`, color: T.ter }}>
										Scene files are not parsed in this build — declare what the file contains and
										the adapter classifies each element. Unsupported elements are reported, never
										silently dropped.
									</div>
								</div>
							</>
						)}
						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon="preview"
								disabled={!canPreview}
								onClick={() => setStep(1)}
							>
								Preview
							</Button>
						</div>
					</>
				)}

				{step === 1 && preview && (
					<>
						{!preview.ok ? (
							<div
								style={{
									display: 'flex',
									gap: 8,
									padding: 12,
									borderRadius: 9,
									background: 'var(--color-status-error-subtle)',
									border: `1px solid ${T.err}`,
								}}
							>
								<Icon name="error" size={16} color={T.err} />
								<span style={{ font: `13px ${T.sans}`, color: 'var(--color-status-error-text)' }}>
									{preview.message} This file can’t be imported.
								</span>
							</div>
						) : (
							<>
								{source === 'native' && preview.asset && (
									<div
										style={{
											display: 'grid',
											gridTemplateColumns: 'auto 1fr',
											rowGap: 6,
											columnGap: 14,
											font: `13px ${T.sans}`,
										}}
									>
										{[...meta, ['File fingerprint', preview.asset.id] as [string, string]].map(
											([k, v]) => (
												<span key={k} style={{ display: 'contents' }}>
													<span style={{ color: T.ter }}>{k}</span>
													<span
														style={{
															color: T.ink,
															fontFamily: k === 'File fingerprint' ? T.mono : undefined,
															wordBreak: 'break-all',
														}}
													>
														{v}
													</span>
												</span>
											),
										)}
									</div>
								)}
								{preview.diagnostics.length > 0 && (
									<div style={{ border: `1px solid ${T.bd}`, borderRadius: 9, overflow: 'hidden' }}>
										{preview.diagnostics.map((d, i) => {
											const s = SUPPORT_PILL[d.support] ?? SUPPORT_PILL.unsupported!;
											return (
												<div
													key={d.kind}
													style={{
														display: 'flex',
														alignItems: 'center',
														justifyContent: 'space-between',
														gap: 8,
														padding: '7px 11px',
														background: i % 2 ? T.alt : 'transparent',
													}}
												>
													<span style={{ font: `13px ${T.sans}`, color: T.ink }}>{d.kind}</span>
													<span
														style={{
															display: 'inline-flex',
															alignItems: 'center',
															gap: 4,
															padding: '2px 8px',
															borderRadius: 999,
															background: s.bg,
															color: s.tone,
															border: `1px solid ${s.tone}`,
															font: `600 10.5px ${T.sans}`,
														}}
													>
														<Icon name={s.icon} size={12} /> {s.label}
													</span>
												</div>
											);
										})}
									</div>
								)}
								{preview.droppedElements.length > 0 && (
									<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
										These elements will not be imported and will remain listed in the import report:{' '}
										<strong style={{ color: T.ink }}>{preview.droppedElements.join(', ')}</strong>
									</div>
								)}
								<div
									style={{
										display: 'flex',
										gap: 8,
										padding: '9px 12px',
										borderRadius: 9,
										background: T.alt,
										border: `1px solid ${T.bd}`,
										font: `12px/1.5 ${T.sans}`,
										color: T.sub,
									}}
								>
									<Icon name="info" size={15} color={T.info} />
									<span>
										DND Tools saves the file and its details on this device. The image becomes this
										map’s background.
									</span>
								</div>
							</>
						)}
						{commitError && (
							<div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{commitError}</div>
						)}
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
							<Button variant="ghost" size="sm" icon="chevron-left" onClick={() => setStep(0)}>
								Back
							</Button>
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="ghost" size="sm" onClick={onClose}>
									Cancel
								</Button>
								{preview.ok && (
									<Button
										variant="primary"
										size="sm"
										icon="check"
										disabled={busy}
										onClick={() => void commit()}
									>
										{busy ? 'Importing…' : 'Import'}
									</Button>
								)}
							</div>
						</div>
					</>
				)}

				{step === 2 && result && (
					<>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: 12,
								borderRadius: 9,
								background: 'var(--color-status-success-subtle)',
								border: `1px solid ${T.ok}`,
							}}
						>
							<Icon name="success" size={20} color={T.ok} />
							<div style={{ font: `13px ${T.sans}` }}>
								<div style={{ fontWeight: 600, color: T.ink }}>Import committed to “{mapName}”</div>
								<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
									{result.assetId ? (
										<>
											Asset <span style={{ fontFamily: T.mono }}>{result.assetId}</span>
											{result.deduped
												? ' (deduped — identical bytes already imported)'
												: ' recorded'}
										</>
									) : (
										'Scene elements recorded'
									)}
									{result.dropped > 0
										? ` · ${result.dropped} unsupported element${result.dropped === 1 ? '' : 's'} reported & dropped`
										: ''}
								</div>
							</div>
						</div>
						{result.byteError && (
							<div
								style={{
									display: 'flex',
									gap: 8,
									padding: '9px 12px',
									borderRadius: 9,
									background: 'var(--color-status-warning-subtle)',
									border: `1px solid ${T.warn}`,
									font: `12px/1.5 ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name="warning" size={15} color={T.warn} />
								<span>
									The map was imported, but the image itself couldn’t be stored on this device:{' '}
									{result.byteError} The map will show its shapes without the image — free up
									storage and import the file again to add it.
								</span>
							</div>
						)}
						<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
							<Button variant="primary" size="sm" onClick={onClose}>
								Done
							</Button>
						</div>
					</>
				)}
			</div>
		</Dialog>
	);
}

// ── MapBuilder — the full-screen authoring overlay ──────────────────────────────────────────────
//
// MAP-021: the shell is now the rebuilt professional editor (`app/map/MapEditor.tsx`). This wrapper
// keeps `MapBuilder`'s public signature so `screens/Atlas.tsx` (which imports it plus `MapCanvas` and
// the shared vocab above) keeps compiling and working unchanged. `MapTool` is a subset of the editor's
// `ToolId`, so the Atlas launcher's initial tool/fog mode pass straight through.

export function MapBuilder({
	mapId,
	initialTool = 'select',
	initialFogMode = 'reveal',
	onClose,
}: {
	mapId: string;
	initialTool?: MapTool;
	initialFogMode?: 'reveal' | 'conceal';
	onClose: () => void;
}) {
	return (
		<MapEditor
			mapId={mapId}
			initialTool={initialTool}
			initialFogMode={initialFogMode}
			onClose={onClose}
		/>
	);
}
