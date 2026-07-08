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
	MAP_POI_CATEGORIES,
	NATIVE_ASSET_MIME_TYPES,
	deliveredMapIdsForActor,
	getMapViewForActor,
	previewMapImport,
	queryMapLayers,
	type MapFeature,
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
	Badge,
	Button,
	Dialog,
	Field,
	FogControls,
	GenerationPanel,
	Icon,
	IconButton,
	Input,
	Minimap,
	POIMarker,
	POIPopover,
	SegmentedControl,
	Select,
	Stepper,
	Switch,
	Textarea,
	ToolPalette,
} from '../ds';
import { T, eb } from './screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

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
 * Honest stubs kept (labeled in-UI, no fake results): the procedural/AI GenerationPanel (no
 * generation backend is wired in this build) and the fog brush/polygon/feather sub-tools (the core
 * fog op is an axis-aligned rect). Import IS real: `map.import-asset` / `map.commit-import` create
 * the content-addressed asset metadata record — the byte payload itself has no storage path in the
 * core prototype (ADR-014: no blob store), which the wizard states explicitly.
 */

export type MapTool = 'select' | 'pan' | 'poi' | 'token' | 'fog';

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
const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ghostBtn = {
	border: 'none',
	background: 'transparent',
	cursor: 'pointer',
	padding: 2,
	display: 'inline-flex',
} as const;

// ── MapCanvas — the shared engine-free geometry renderer ────────────────────────────────────────

interface Point {
	x: number;
	y: number;
}
interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

type DragState =
	| { kind: 'fog'; start: Point; cur: Point }
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
	/** Drag-drawn rect with the fog tool → normalized region (already clamped, w/h > 0). */
	onFogRegion?: (region: Region) => void;
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

/** One painted layer feature (MAP-003 normalized geometry) as SVG in the 0–100 viewBox. */
function FeatureShape({ feature, color }: { feature: MapFeature; color: string }) {
	const pts = feature.points.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ');
	switch (feature.kind) {
		case 'fill':
		case 'room':
			return <polygon points={pts} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />;
		case 'marker': {
			const p = feature.points[0]!;
			return <circle cx={p.x * 100} cy={p.y * 100} r={1.1} fill={color} />;
		}
		case 'road':
			return <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />;
		case 'wall':
			return <polyline points={pts} fill="none" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
		default: // 'stroke'
			return <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
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

	const setDrag = (d: DragState | null) => {
		dragRef.current = d;
		setDragState(d);
	};

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
		() => layers.filter((l) => l.enabled && l.content.length > 0).slice().sort((a, b) => a.order - b.order),
		[layers],
	);

	// ── Well-level gestures (fog rect draw · pan · click-to-place) ────────────────────────────
	const onWellPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		pressRef.current = null; // a well press is never a marker press (markers stop propagation)
		if (!editable || e.button !== 0) return;
		if (tool === 'fog' && isDm && onFogRegion) {
			e.currentTarget.setPointerCapture(e.pointerId);
			const p = toMap(e);
			setDrag({ kind: 'fog', start: p, cur: p });
		} else if (tool === 'pan' && onPan) {
			e.currentTarget.setPointerCapture(e.pointerId);
			setDrag({ kind: 'pan', px: e.clientX, py: e.clientY, c0: center });
		}
	};
	const onWellPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (!d) return;
		if (d.kind === 'fog') setDrag({ ...d, cur: toMap(e) });
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
			const x = Math.min(d.start.x, d.cur.x);
			const y = Math.min(d.start.y, d.cur.y);
			const w = Math.min(Math.abs(d.cur.x - d.start.x), 1 - x);
			const h = Math.min(Math.abs(d.cur.y - d.start.y), 1 - y);
			// The core rejects a zero-area region (w/h must be > 0) — ignore accidental micro-drags.
			if (w >= 0.01 && h >= 0.01) onFogRegion({ x, y, w, h });
		}
	};
	const onWellClick = (e: ReactMouseEvent<HTMLDivElement>) => {
		if (!editable) return;
		if ((tool === 'poi' || tool === 'token') && onPlace) onPlace(toMap(e));
	};

	// ── Marker press/drag. Selection resolves on POINTERUP (under pointer capture the follow-up
	// click's target is browser-dependent — Chrome retargets it to the capture element — so the
	// inner button's onClick cannot be the pointer path; it remains the keyboard path). ──────────
	const markerDragHandlers = (kind: 'poi' | 'token', id: string, canDrag: boolean, onSelect: () => void) => ({
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
		editable && tool === 'fog' ? 'crosshair'
		: editable && (tool === 'poi' || tool === 'token') ? 'copy'
		: editable && tool === 'pan' ? (drag?.kind === 'pan' ? 'grabbing' : 'grab')
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
				touchAction: 'none',
				...style,
			}}
			onPointerDown={onWellPointerDown}
			onPointerMove={onWellPointerMove}
			onPointerUp={onWellPointerUp}
			onClick={onWellClick}
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
						style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
					>
						{/* painted layer features (MAP-003), in render order, tinted by layer category */}
						{contentLayers.map((l) => (
							<g key={l.layerId} opacity={l.opacity}>
								{l.content.map((f) => (
									<FeatureShape key={f.id} feature={f} color={`var(${CATEGORY_VAR[l.category] ?? '--layer-custom'})`} />
								))}
							</g>
						))}
						{/* routes (MAP-013) */}
						{view.routes
							.filter((r) => annotationVisible(r.layerId))
							.map((r) => (
								<g key={r.id}>
									<polyline
										points={r.waypoints.map((w) => `${w.position.x * 100},${w.position.y * 100}`).join(' ')}
										fill="none"
										stroke={r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'}
										strokeWidth={2}
										strokeDasharray="6 4"
										vectorEffect="non-scaling-stroke"
										opacity={0.85}
									/>
									{r.waypoints.map((w) => (
										<circle key={w.id} cx={w.position.x * 100} cy={w.position.y * 100} r={0.9} fill={r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'} />
									))}
								</g>
							))}
						{/* fog of war — mask composed op-by-op so a later op overrides an earlier overlap */}
						{fogOps.length > 0 && (
							<>
								<defs>
									<mask id={fogMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
										<rect x={0} y={0} width={100} height={100} fill="black" />
										{fogOps.map((op) => (
											<rect
												key={op.id}
												x={op.region.x * 100}
												y={op.region.y * 100}
												width={op.region.w * 100}
												height={op.region.h * 100}
												fill={op.kind === 'conceal' ? 'white' : 'black'}
											/>
										))}
									</mask>
								</defs>
								<rect x={0} y={0} width={100} height={100} fill="var(--map-fog-fill)" opacity={fogOpacity} mask={`url(#${fogMaskId})`} />
							</>
						)}
						{/* DM authoring aid: dashed per-op outlines */}
						{showFogOutlines &&
							isDm &&
							fogOps.map((op) => (
								<rect
									key={`o-${op.id}`}
									x={op.region.x * 100}
									y={op.region.y * 100}
									width={op.region.w * 100}
									height={op.region.h * 100}
									fill="none"
									stroke={op.kind === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
									strokeWidth={1.2}
									strokeDasharray="4 3"
									vectorEffect="non-scaling-stroke"
									opacity={0.75}
								/>
							))}
						{/* ghost rect while drag-drawing fog */}
						{drag?.kind === 'fog' && (
							<rect
								x={Math.min(drag.start.x, drag.cur.x) * 100}
								y={Math.min(drag.start.y, drag.cur.y) * 100}
								width={Math.abs(drag.cur.x - drag.start.x) * 100}
								height={Math.abs(drag.cur.y - drag.start.y) * 100}
								fill={fogMode === 'reveal' ? 'color-mix(in oklab, var(--color-accent) 18%, transparent)' : 'color-mix(in oklab, var(--map-fog-fill) 45%, transparent)'}
								stroke={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
								strokeWidth={1.4}
								strokeDasharray="4 3"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</svg>
				)}
			</div>

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
								<span style={{ font: `10px ${T.sans}`, color: T.sub, background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)', padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>
									{t.label}
									{t.visibility === 'dm-only' && <span style={{ color: T.dm }}> · DM</span>}
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
								<span style={{ font: `10px ${T.sans}`, color: T.ink, background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap', marginTop: -6 }}>
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
									<div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
										{renderPoiPopover(selectedPoi, { x: `${v.x * 100}%`, y: `${(placement === 'top' ? v.y - 0.045 : v.y + 0.01) * 100}%` }, placement)}
									</div>
								);
							})()}
						</div>
					</div>
				)}
			</div>

			{/* HUD overlays — clicks never fall through to the map */}
			<div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ display: 'contents' }}>
				{children}
			</div>
		</div>
	);
}

// ── Builder-internal primitives ─────────────────────────────────────────────────────────────────

/** Range input committing ONE durable op on release (never per input tick). */
function CommitRange({
	value,
	min = 0,
	max = 100,
	label,
	disabled,
	onCommit,
}: {
	value: number;
	min?: number;
	max?: number;
	label: string;
	disabled?: boolean;
	onCommit: (v: number) => void;
}) {
	const [local, setLocal] = useState<number | null>(null);
	const commit = () => {
		if (local !== null && local !== value) onCommit(local);
		setLocal(null);
	};
	return (
		<input
			type="range"
			min={min}
			max={max}
			step={1}
			value={local ?? value}
			aria-label={label}
			disabled={disabled}
			onChange={(e) => setLocal(Number(e.target.value))}
			onPointerUp={commit}
			onKeyUp={(e) => {
				if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') commit();
			}}
			onBlur={commit}
			style={{ flex: 1, width: '100%', height: 3, accentColor: 'var(--color-accent)', cursor: disabled ? 'not-allowed' : 'pointer' }}
		/>
	);
}

function PanelLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 8px' }}>
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
	importable: { tone: 'var(--color-status-success)', bg: 'var(--color-status-success-subtle)', label: 'Importable', icon: 'success' },
	lossy: { tone: 'var(--color-status-warning)', bg: 'var(--color-status-warning-subtle)', label: 'Lossy', icon: 'warning' },
	unsupported: { tone: 'var(--color-status-error)', bg: 'var(--color-status-error-subtle)', label: 'Unsupported', icon: 'error' },
	blocked: { tone: 'var(--color-text-tertiary)', bg: 'var(--color-surface-sunken)', label: 'Blocked', icon: 'lock' },
};

interface PickedFile {
	file: File;
	bytes: Uint8Array;
	dimensions: { width: number; height: number } | null;
}

function ImportMapDialog({ mapId, mapName, onClose }: { mapId: string; mapName: string; onClose: () => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [step, setStep] = useState(0);
	const [source, setSource] = useState<'native' | 'external'>('native');
	const [picked, setPicked] = useState<PickedFile | null>(null);
	const [readError, setReadError] = useState<string | null>(null);
	const formats = runtime.mapImportAdapters.formats();
	const [formatId, setFormatId] = useState(formats[0] ?? '');
	const [declared, setDeclared] = useState<MapImportElementKind[]>(['dimensions', 'grid', 'background-image']);
	const [busy, setBusy] = useState(false);
	const [commitError, setCommitError] = useState<string | null>(null);
	const [result, setResult] = useState<{ assetId: string | null; deduped: boolean; dropped: number } | null>(null);

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
				asset: { bytes: picked.bytes, mimeType: picked.file.type, fileName: picked.file.name, dimensions: picked.dimensions },
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
								asset: { mimeType: picked?.file.type ?? '', fileName: picked?.file.name ?? '', dimensions: picked?.dimensions ?? null },
							},
						}
					: {
							type: 'map.commit-import',
							actorId,
							payload: { mapId, formatId, declaredElements: declared, bytes: null, asset: null },
						},
			);
			if (res.status === 'accepted') {
				const ev = (res.events as Array<{ kind: string; assetId?: string | null; assetDeduped?: boolean; droppedElementCount?: number }> | undefined)?.find(
					(e) => e.kind === 'map.import-committed',
				);
				setResult({ assetId: ev?.assetId ?? null, deduped: ev?.assetDeduped ?? false, dropped: ev?.droppedElementCount ?? 0 });
				setStep(2);
			} else {
				setCommitError(res.rejection.message);
			}
		} finally {
			setBusy(false);
		}
	}

	const canPreview = source === 'native' ? picked !== null : declared.length > 0 && formatId.length > 0;
	const meta: Array<[string, string]> = picked
		? [
				['Filename', picked.file.name],
				['MIME type', picked.file.type || 'unknown'],
				['Dimensions', picked.dimensions ? `${picked.dimensions.width} × ${picked.dimensions.height} px` : '—'],
				['Byte size', `${(picked.bytes.length / 1024).toFixed(1)} KB`],
			]
		: [];

	return (
		<Dialog
			open
			onClose={onClose}
			title="Import map"
			description={`Attach an asset or external scene to “${mapName}”. Nothing is written before the explicit commit; cancelling leaves zero state.`}
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
									onChange={(e: { target: { files: FileList | null } }) => void pickFile(e.target.files?.[0])}
								/>
								<Icon name="upload" size={26} color={T.ter} />
								{picked ? (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
										<strong style={{ color: T.ink }}>{picked.file.name}</strong> · {(picked.bytes.length / 1024).toFixed(1)} KB
									</span>
								) : (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>Choose an image or SVG</span>
								)}
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									PNG · JPG · WebP · GIF · SVG — up to {Math.round((8 * 1024 * 1024) / (1024 * 1024))} MB
								</span>
								{readError && <span style={{ font: `12px ${T.sans}`, color: T.err }}>{readError}</span>}
							</label>
						) : (
							<>
								<Field label="Declared adapter" help="External formats need a declared adapter — undeclared formats are rejected fail-closed.">
									<Select value={formatId} options={formats.map((f) => ({ value: f, label: f }))} onChange={(e: { target: { value: string } }) => setFormatId(e.target.value)} />
								</Field>
								<div>
									<PanelLabel>Elements the file contains</PanelLabel>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
										{IMPORT_ELEMENT_KINDS.map((k) => {
											const on = declared.includes(k);
											return (
												<label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : 'transparent', cursor: 'pointer', font: `12px ${T.sans}`, color: on ? T.acc : T.sub }}>
													<input
														type="checkbox"
														checked={on}
														onChange={() => setDeclared((d) => (on ? d.filter((x) => x !== k) : [...d, k]))}
														style={{ accentColor: 'var(--color-accent)' }}
													/>
													{k}
												</label>
											);
										})}
									</div>
									<div style={{ marginTop: 8, font: `11px/1.5 ${T.sans}`, color: T.ter }}>
										Scene files are not parsed in this build — declare what the file contains and the adapter classifies each element. Unsupported elements are reported, never silently dropped.
									</div>
								</div>
							</>
						)}
						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
							<Button variant="ghost" size="sm" onClick={onClose}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" icon="preview" disabled={!canPreview} onClick={() => setStep(1)}>
								Preview
							</Button>
						</div>
					</>
				)}

				{step === 1 && preview && (
					<>
						{!preview.ok ? (
							<div style={{ display: 'flex', gap: 8, padding: 12, borderRadius: 9, background: 'var(--color-status-error-subtle)', border: `1px solid ${T.err}` }}>
								<Icon name="error" size={16} color={T.err} />
								<span style={{ font: `13px ${T.sans}`, color: 'var(--color-status-error-text)' }}>{preview.message} There is no commit path.</span>
							</div>
						) : (
							<>
								{source === 'native' && preview.asset && (
									<div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 14, font: `13px ${T.sans}` }}>
										{[...meta, ['Content hash', preview.asset.id] as [string, string]].map(([k, v]) => (
											<span key={k} style={{ display: 'contents' }}>
												<span style={{ color: T.ter }}>{k}</span>
												<span style={{ color: T.ink, fontFamily: k === 'Content hash' ? T.mono : undefined, wordBreak: 'break-all' }}>{v}</span>
											</span>
										))}
									</div>
								)}
								{preview.diagnostics.length > 0 && (
									<div style={{ border: `1px solid ${T.bd}`, borderRadius: 9, overflow: 'hidden' }}>
										{preview.diagnostics.map((d, i) => {
											const s = SUPPORT_PILL[d.support] ?? SUPPORT_PILL.unsupported!;
											return (
												<div key={d.kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 11px', background: i % 2 ? T.alt : 'transparent' }}>
													<span style={{ font: `13px ${T.sans}`, color: T.ink }}>{d.kind}</span>
													<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.tone, border: `1px solid ${s.tone}`, font: `600 10.5px ${T.sans}` }}>
														<Icon name={s.icon} size={12} /> {s.label}
													</span>
												</div>
											);
										})}
									</div>
								)}
								{preview.droppedElements.length > 0 && (
									<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
										These elements will NOT be imported (reported on the durable op): <strong style={{ color: T.ink }}>{preview.droppedElements.join(', ')}</strong>
									</div>
								)}
								<div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 9, background: T.alt, border: `1px solid ${T.bd}`, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
									<Icon name="info" size={15} color={T.info} />
									<span>
										The core stores a content-addressed <strong>metadata record</strong> (hash, size, MIME, dimensions). The byte payload itself has no storage path in this prototype (ADR-014 — no blob store), so no raster preview will render on the canvas.
									</span>
								</div>
							</>
						)}
						{commitError && <div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{commitError}</div>}
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
							<Button variant="ghost" size="sm" icon="chevron-left" onClick={() => setStep(0)}>
								Back
							</Button>
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="ghost" size="sm" onClick={onClose}>
									Cancel (rollback)
								</Button>
								{preview.ok && (
									<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={() => void commit()}>
										{busy ? 'Committing…' : 'Commit import'}
									</Button>
								)}
							</div>
						</div>
					</>
				)}

				{step === 2 && result && (
					<>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 9, background: 'var(--color-status-success-subtle)', border: `1px solid ${T.ok}` }}>
							<Icon name="success" size={20} color={T.ok} />
							<div style={{ font: `13px ${T.sans}` }}>
								<div style={{ fontWeight: 600, color: T.ink }}>Import committed to “{mapName}”</div>
								<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
									{result.assetId ? (
										<>
											Asset <span style={{ fontFamily: T.mono }}>{result.assetId}</span>
											{result.deduped ? ' (deduped — identical bytes already imported)' : ' recorded'}
										</>
									) : (
										'Scene elements recorded'
									)}
									{result.dropped > 0 ? ` · ${result.dropped} unsupported element${result.dropped === 1 ? '' : 's'} reported & dropped` : ''}
								</div>
							</div>
						</div>
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

// ── Right panel: layers ─────────────────────────────────────────────────────────────────────────

function BuilderLayerRow({
	l,
	index,
	count,
	active,
	busy,
	onActivate,
	onReorder,
	onVis,
	onLock,
	onEnabled,
	onOpacity,
}: {
	l: MapLayerQueryEntry;
	index: number;
	count: number;
	active: boolean;
	busy: boolean;
	onActivate: () => void;
	onReorder: (to: number) => void;
	onVis: () => void;
	onLock: () => void;
	onEnabled: () => void;
	onOpacity: (v: number) => void;
}) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 8px 9px', borderRadius: 8, background: active ? T.accSub : 'transparent', border: `1px solid ${active ? T.accBd : 'transparent'}` }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={{ display: 'flex', flexDirection: 'column' }}>
					<button type="button" title="Move up" aria-label={`Move ${l.name} up`} disabled={busy || index === 0} onClick={() => onReorder(index - 1)} style={{ ...ghostBtn, opacity: index === 0 ? 0.3 : 1 }}>
						<Icon name="chevron-up" size={12} color={T.ter} />
					</button>
					<button type="button" title="Move down" aria-label={`Move ${l.name} down`} disabled={busy || index === count - 1} onClick={() => onReorder(index + 1)} style={{ ...ghostBtn, opacity: index === count - 1 ? 0.3 : 1 }}>
						<Icon name="chevron-down" size={12} color={T.ter} />
					</button>
				</span>
				<button
					type="button"
					aria-pressed={active}
					title={active ? 'Active layer (new POIs/tokens land here)' : 'Set as active layer'}
					onClick={onActivate}
					style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}
				>
					<span style={{ width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in oklab, var(${CATEGORY_VAR[l.category] ?? '--layer-custom'}) 26%, transparent)`, color: `var(${CATEGORY_VAR[l.category] ?? '--layer-custom'})` }}>
						<Icon name={`layer-${l.category === 'dm-annotations' ? 'dm' : l.category === 'player-overlay' ? 'player' : l.category === 'terrain' ? 'height' : l.category}`} size={13} />
					</span>
					<span style={{ flex: 1, minWidth: 0 }}>
						<span style={{ display: 'block', font: `12.5px ${T.sans}`, color: l.enabled ? T.ink : T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
							{l.name}
							{active && <span style={{ color: T.acc }}> · active</span>}
						</span>
						<span style={{ display: 'block', font: `10px ${T.mono}`, color: T.ter }}>
							{CATEGORY_LABEL[l.category] ?? l.category} · {Math.round(l.opacity * 100)}% · {l.content.length} marks
							{l.locked ? ' · locked' : ''}
						</span>
					</span>
				</button>
				<button type="button" title={`Visibility: ${VIS_LABEL[l.visibility] ?? l.visibility} — click to toggle DM-only ↔ player-visible`} disabled={busy} onClick={onVis} style={ghostBtn}>
					<Icon name={l.visibility === 'dm-only' ? 'dm-only' : 'visibility-players'} size={15} color={l.visibility === 'dm-only' ? T.dm : T.ok} />
				</button>
				<button type="button" title={l.locked ? 'Unlock layer' : 'Lock layer'} disabled={busy} onClick={onLock} style={ghostBtn}>
					<Icon name={l.locked ? 'lock' : 'unlock'} size={14} color={l.locked ? T.acc : T.ter} />
				</button>
				<Switch checked={l.enabled} aria-label={`Display ${l.name}`} onChange={onEnabled} />
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30 }}>
				<Icon name="opacity" size={12} color={T.ter} />
				<CommitRange value={Math.round(l.opacity * 100)} label={`${l.name} opacity`} disabled={busy} onCommit={(v) => onOpacity(v / 100)} />
			</div>
		</div>
	);
}

// ── MapBuilder — the full-screen authoring overlay ──────────────────────────────────────────────

const BUILDER_TOOLS = [
	{ id: 'select', icon: 'tool-select', label: 'Select & move' },
	{ id: 'pan', icon: 'Hand', label: 'Pan' },
	{ id: 'poi', icon: 'poi', label: 'Place POI' },
	{ id: 'token', icon: 'tool-token', label: 'Place token' },
	{ id: 'fog', icon: 'layer-fog', label: 'Fog of war' },
];

export function MapBuilder({
	mapId,
	initialTool = 'select',
	initialFogMode = 'reveal',
	onClose,
}: {
	mapId: string;
	initialTool?: MapTool;
	/** Which fog mode the fog tool starts in (Atlas's Conceal shortcut opens straight into conceal). */
	initialFogMode?: 'reveal' | 'conceal';
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [tool, setTool] = useState<MapTool>(initialTool);
	const [fogMode, setFogMode] = useState<'reveal' | 'conceal'>(initialFogMode);
	const [zoom, setZoom] = useState(1);
	const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
	const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
	const [selPoiId, setSelPoiId] = useState<string | null>(null);
	const [selTokenId, setSelTokenId] = useState<string | null>(null);
	const [poiForm, setPoiForm] = useState({ label: '', category: 'landmark' as MapPoiCategory, visibility: 'dm-only' as SceneVisibility });
	const [tokenForm, setTokenForm] = useState({ label: '', visibility: 'dm-only' as SceneVisibility });
	const [rightTab, setRightTab] = useState<'layers' | 'generate' | 'map'>('layers');
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [importOpen, setImportOpen] = useState(false);
	const [poiEdit, setPoiEdit] = useState<MapPoiView | null>(null);
	const [poiDraft, setPoiDraft] = useState({ label: '', category: 'landmark' as MapPoiCategory, visibility: 'dm-only' as SceneVisibility, notes: '' });
	const [confirmConcealAll, setConfirmConcealAll] = useState(false);

	const rootRef = useRef<HTMLDivElement>(null);

	const delivered = useMemo(() => deliveredMapIdsForActor(runtime.state.session, actorId), [runtime.state.session, actorId]);
	const viewResult = useMemo(
		() => getMapViewForActor(runtime.state.maps, runtime.state.permissions, actorId, mapId, { deliveredMapIds: delivered }),
		[runtime.state.maps, runtime.state.permissions, actorId, mapId, delivered],
	);
	const view = viewResult.kind === 'available' ? viewResult : null;
	const layerResult = useMemo(
		() => queryMapLayers(runtime.state.maps, runtime.state.permissions, actorId, { mapId }),
		[runtime.state.maps, runtime.state.permissions, actorId, mapId],
	);
	const layers = layerResult.layers;

	// Command targets: the active layer receives POIs/tokens; fog prefers the fog-category layer.
	const activeId = activeLayerId && layers.some((l) => l.layerId === activeLayerId) ? activeLayerId : layers[0]?.layerId ?? null;
	const fogLayerId = view?.layers.find((l) => l.category === 'fog')?.id ?? activeId;

	// DM-only asset metadata list (no core asset QUERY exists yet; the builder itself is DM-gated,
	// and asset records are authoring metadata — hash/size/MIME — never player content).
	const mapAssets = useMemo(() => {
		if (!isDm) return [];
		const entity = runtime.state.maps.maps[mapId];
		if (!entity) return [];
		return entity.assetIds.map((id) => runtime.state.maps.assets[id]).filter((a) => a !== undefined);
	}, [isDm, runtime.state.maps, mapId]);

	// Focus containment: focus the overlay on open, restore the opener on close (dialog semantics).
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		rootRef.current?.focus();
		return () => opener?.focus?.();
	}, []);

	// Escape closes the TOPMOST surface only (popover/dialogs handle their own Escape first).
	const overlayOpenRef = useRef(false);
	overlayOpenRef.current = importOpen || poiEdit !== null || confirmConcealAll || selPoiId !== null;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
			if (e.key === 'Escape') {
				if (overlayOpenRef.current) return; // the open popover/dialog consumes this Escape
				if (typing) {
					target?.blur(); // Escape in a label field exits the FIELD, never the whole builder
					return;
				}
				e.stopPropagation();
				onCloseRef.current();
			} else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !overlayOpenRef.current && selTokenRef.current) {
				// The overlay guard matters: without it, Backspace behind an open Import/POI dialog
				// silently deletes the selected token off-screen (durable, and undo is disabled).
				void deleteTokenRef.current(selTokenRef.current);
			} else if (e.key === 'Tab' && !overlayOpenRef.current) {
				// aria-modal contract: wrap Tab inside the builder (same trap as CharBuilder's Overlay) —
				// the AppShell stays mounted underneath and must never receive focus. Open dialogs/popovers
				// stack above and own their Tab cycle, hence the overlay guard.
				const root = rootRef.current;
				if (!root) return;
				const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
				if (nodes.length === 0) {
					e.preventDefault();
					root.focus();
					return;
				}
				const firstNode = nodes[0];
				const lastNode = nodes[nodes.length - 1];
				const active = document.activeElement;
				if (e.shiftKey && (active === firstNode || active === root)) {
					e.preventDefault();
					lastNode.focus();
				} else if (!e.shiftKey && active === lastNode) {
					e.preventDefault();
					firstNode.focus();
				} else if (active instanceof HTMLElement && !root.contains(active)) {
					e.preventDefault();
					firstNode.focus(); // focus escaped (e.g. devtools round-trip) — pull it back in
				}
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const selTokenRef = useRef<string | null>(null);
	selTokenRef.current = selTokenId;

	// ── The single durable write path (re-entrancy-guarded; rejections surface as a notice) ────
	const run = async (command: Parameters<typeof runtime.dispatch>[0]) => {
		if (busy) return undefined;
		setBusy(true);
		try {
			const res = await runtime.dispatch(command);
			if (res.status === 'accepted') setSaved(true);
			else setNotice(res.rejection.message);
			return res;
		} finally {
			setBusy(false);
		}
	};

	function appendFog(region: { x: number; y: number; w: number; h: number }, kind: 'reveal' | 'conceal') {
		if (!fogLayerId) return;
		void run({
			type: 'map.append-fog',
			actorId,
			payload: { mapId, layerId: fogLayerId, kind, region, visibility: 'shared', connectionState: 'connected' },
		});
	}

	async function placePoi(position: { x: number; y: number }) {
		if (!activeId) return;
		const res = await run({
			type: 'map.create-poi',
			actorId,
			payload: {
				mapId,
				layerId: activeId,
				label: poiForm.label.trim() || 'New POI',
				category: poiForm.category,
				position,
				visibility: poiForm.visibility,
			},
		});
		if (res?.status === 'accepted') {
			const ev = (res.events as Array<{ kind: string; poiId?: string }> | undefined)?.find((e) => e.kind === 'map.poi-changed');
			if (ev?.poiId) {
				setSelPoiId(ev.poiId);
				setTool('select');
			}
		}
	}

	function placeToken(position: { x: number; y: number }) {
		if (!activeId || !view) return;
		void run({
			type: 'map.create-token',
			actorId,
			payload: {
				mapId,
				layerId: activeId,
				label: tokenForm.label.trim() || `Token ${view.tokens.length + 1}`,
				linkedActorId: null,
				position,
				size: 1,
				visibility: tokenForm.visibility,
				controllerActorId: null,
			},
		});
	}

	const movePoi = (poiId: string, position: { x: number; y: number }) =>
		void run({ type: 'map.update-poi', actorId, payload: { mapId, poiId, position } });
	const moveToken = (tokenId: string, position: { x: number; y: number }) =>
		void run({ type: 'map.move-token', actorId, payload: { mapId, tokenId, position } });
	const deletePoi = (poiId: string) => {
		setSelPoiId(null);
		void run({ type: 'map.delete-poi', actorId, payload: { mapId, poiId } });
	};
	const deleteToken = async (tokenId: string) => {
		setSelTokenId(null);
		await run({ type: 'map.delete-token', actorId, payload: { mapId, tokenId } });
	};
	const deleteTokenRef = useRef(deleteToken);
	deleteTokenRef.current = deleteToken;

	function savePoiEdit() {
		if (!poiEdit || !poiDraft.label.trim()) return;
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId, poiId: poiEdit.id, label: poiDraft.label.trim(), category: poiDraft.category, visibility: poiDraft.visibility, notes: poiDraft.notes },
		});
		setPoiEdit(null);
	}

	const zoomBy = (delta?: number, fit?: boolean) => {
		if (fit) {
			setZoom(1);
			setCenter({ x: 0.5, y: 0.5 });
			return;
		}
		setZoom((z) => Math.min(2.6, Math.max(0.6, +(z + (delta ?? 0)).toFixed(2))));
	};

	const selToken = view?.tokens.find((t) => t.id === selTokenId) ?? null;
	const toolMeta = BUILDER_TOOLS.find((t) => t.id === tool);

	if (!view) {
		// Fail-closed: hidden map (or stale id) collapses to a generic unavailable overlay.
		return (
			<div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Map builder" style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.sub, font: `13px ${T.sans}`, flexDirection: 'column', gap: 14 }}>
				This map is unavailable to you.
				<Button variant="secondary" size="sm" icon="arrow-left" onClick={onClose}>
					Back to Atlas
				</Button>
			</div>
		);
	}

	return (
		// zIndex 300 = --z-overlay (below DS Dialog's --z-modal 400, so wizards stack above).
		<div
			ref={rootRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			aria-label={`Map builder — ${view.name}`}
			style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: T.bg, color: T.ink, fontFamily: T.sans, outline: 'none', backgroundImage: 'radial-gradient(1200px 600px at 50% -280px, var(--color-accent-subtle), transparent 70%)' }}
		>
			{/* ── top bar ── */}
			<header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: `1px solid ${T.bd}`, background: T.surf, flex: '0 0 auto', flexWrap: 'wrap' }}>
				<IconButton icon="arrow-left" label="Back to Atlas" variant="ghost" size="sm" onClick={onClose} />
				<nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, font: `12px ${T.sans}`, color: T.ter }}>
					<span>Atlas</span>
					<Icon name="chevron-right" size={13} color={T.ter} />
					<span style={{ color: T.ink, fontWeight: 600 }}>{view.name}</span>
				</nav>
				<Badge status={VIS_STATUS[view.visibility] ?? 'neutral'}>{VIS_LABEL[view.visibility] ?? view.visibility}</Badge>
				<div style={{ flex: 1 }} />
				{saved && (
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `11.5px ${T.sans}`, color: T.ter }}>
						<Icon name="success" size={13} color={T.ok} />
						Saved — every edit is a durable core op
					</span>
				)}
				<Button variant="secondary" size="sm" icon="import" onClick={() => setImportOpen(true)}>
					Import
				</Button>
			</header>

			{notice && (
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: T.alt, borderBottom: `1px solid ${T.bd}`, font: `12.5px ${T.sans}`, color: T.sub }}>
					<Icon name="info" size={15} color={T.info} />
					<span style={{ flex: 1 }}>{notice}</span>
					<button type="button" onClick={() => setNotice(null)} style={ghostBtn} title="Dismiss" aria-label="Dismiss notice">
						<Icon name="close" size={14} color={T.ter} />
					</button>
				</div>
			)}

			{/* ── workspace ── */}
			<div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '56px minmax(0,1fr) 332px' }}>
				{/* tool rail — DS ToolPalette (undo/redo cluster stays disabled: no inverse-op undo yet) */}
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', borderRight: `1px solid ${T.bd}`, background: T.surf, overflowY: 'auto' }}>
					<ToolPalette
						tools={BUILDER_TOOLS}
						active={tool}
						onSelect={(id: string) => setTool(id as MapTool)}
						orientation="vertical"
						overflow={false}
						canUndo={false}
						canRedo={false}
						style={{ border: 'none', background: 'transparent' }}
					/>
				</div>

				{/* canvas well */}
				<div style={{ position: 'relative', minWidth: 0, background: 'var(--map-canvas-bg)' }}>
					<MapCanvas
						view={view}
						layers={layers}
						isDm={isDm}
						zoom={zoom}
						center={center}
						tool={tool}
						fogMode={fogMode}
						editable={isDm && !busy}
						showFogOutlines={tool === 'fog'}
						height="100%"
						style={{ borderRadius: 0, border: 'none' }}
						selectedPoiId={selPoiId}
						selectedTokenId={selTokenId}
						onSelectPoi={setSelPoiId}
						onSelectToken={setSelTokenId}
						onPlace={(pos) => (tool === 'poi' ? void placePoi(pos) : placeToken(pos))}
						onFogRegion={(region) => appendFog(region, fogMode)}
						onMovePoi={movePoi}
						onMoveToken={moveToken}
						onPan={setCenter}
						renderPoiPopover={(poi, anchor, placement) => (
							<POIPopover
								poi={{ name: poi.label, category: POI_MARKER_CAT[poi.category] ?? 'location', categoryLabel: poi.category, visibility: visToDs(poi.visibility) }}
								anchor={anchor}
								placement={placement}
								readOnly={!isDm}
								onClose={() => setSelPoiId(null)}
								onVisibilityChange={(v: string) => void run({ type: 'map.update-poi', actorId, payload: { mapId, poiId: poi.id, visibility: dsToVis(v) } })}
								onFocus={() => {
									setCenter({ ...poi.position });
									setSelPoiId(null);
								}}
								onEdit={() => {
									setPoiDraft({ label: poi.label, category: poi.category, visibility: poi.visibility, notes: poi.notes });
									setPoiEdit(poi);
									setSelPoiId(null);
								}}
								onDeepLink={() => setNotice('POI deep links are not wired in this build.')}
								onDelete={() => deletePoi(poi.id)}
							/>
						)}
					>
						{/* contextual strip (varies by tool) */}
						<div style={{ position: 'absolute', top: 12, left: 12, zIndex: 6, maxWidth: 'calc(100% - 24px)' }}>
							{tool === 'fog' && isDm && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
									<FogControls
										mode={fogMode}
										onModeChange={(m: string) => setFogMode(m as 'reveal' | 'conceal')}
										shape="rect"
										onShapeChange={(s: string) => {
											if (s !== 'rect') setNotice('Only rectangle fog regions are core-backed (MAP-012 rect ops) — brush and polygon are not wired.');
										}}
										feather={false}
										onFeather={() => setNotice('Feathered fog edges are not core-backed — regions are sharp rects.')}
										syncStatus={busy ? 'syncing' : 'synced'}
										onRevealAll={() => appendFog({ x: 0, y: 0, w: 1, h: 1 }, 'reveal')}
										onResetFog={() => setConfirmConcealAll(true)}
									/>
									<span style={{ alignSelf: 'flex-start', padding: '4px 9px', borderRadius: 7, background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)', border: `1px solid ${T.bd}`, font: `11px ${T.sans}`, color: T.sub }}>
										Drag on the map to {fogMode} a rectangle
									</span>
								</div>
							)}
							{tool === 'poi' && isDm && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)', backdropFilter: 'blur(3px)', border: `1px solid ${T.bd}`, boxShadow: T.smd, flexWrap: 'wrap' }}>
									<span style={{ ...eb, fontSize: 10 }}>New POI</span>
									<Input value={poiForm.label} placeholder="Label (default: New POI)" onChange={(e: { target: { value: string } }) => setPoiForm((f) => ({ ...f, label: e.target.value }))} style={{ width: 170 }} />
									<Select value={poiForm.category} options={MAP_POI_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(e: { target: { value: string } }) => setPoiForm((f) => ({ ...f, category: e.target.value as MapPoiCategory }))} />
									<Select value={poiForm.visibility} options={VIS_OPTIONS} onChange={(e: { target: { value: string } }) => setPoiForm((f) => ({ ...f, visibility: e.target.value as SceneVisibility }))} />
									<span style={{ font: `11px ${T.sans}`, color: T.sub }}>Click the map to place</span>
								</div>
							)}
							{tool === 'token' && isDm && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)', backdropFilter: 'blur(3px)', border: `1px solid ${T.bd}`, boxShadow: T.smd, flexWrap: 'wrap' }}>
									<span style={{ ...eb, fontSize: 10 }}>New token</span>
									<Input value={tokenForm.label} placeholder="Label (default: Token N)" onChange={(e: { target: { value: string } }) => setTokenForm((f) => ({ ...f, label: e.target.value }))} style={{ width: 170 }} />
									<Select value={tokenForm.visibility} options={VIS_OPTIONS} onChange={(e: { target: { value: string } }) => setTokenForm((f) => ({ ...f, visibility: e.target.value as SceneVisibility }))} />
									<span style={{ font: `11px ${T.sans}`, color: T.sub }}>Click the map to drop</span>
								</div>
							)}
							{tool === 'select' && selToken && isDm && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 10, background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)', backdropFilter: 'blur(3px)', border: `1px solid ${T.bd}`, boxShadow: T.smd }}>
									<Icon name="tool-token" size={14} color={T.acc} />
									<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{selToken.label}</span>
									<Badge status={VIS_STATUS[selToken.visibility] ?? 'neutral'}>{VIS_LABEL[selToken.visibility] ?? selToken.visibility}</Badge>
									<button
										type="button"
										title="Toggle player visibility"
										disabled={busy}
										onClick={() => void run({ type: 'map.update-token', actorId, payload: { mapId, tokenId: selToken.id, visibility: selToken.visibility === 'dm-only' ? 'player-visible' : 'dm-only' } })}
										style={ghostBtn}
									>
										<Icon name={selToken.visibility === 'dm-only' ? 'dm-only' : 'visibility-players'} size={15} color={selToken.visibility === 'dm-only' ? T.dm : T.ok} />
									</button>
									<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={() => void deleteToken(selToken.id)}>
										Delete
									</Button>
									<span style={{ font: `11px ${T.sans}`, color: T.sub }}>drag to move · Delete key removes</span>
								</div>
							)}
							{tool === 'select' && !selToken && (
								<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)', border: `1px solid ${T.bd}`, font: `11.5px ${T.sans}`, color: T.sub }}>
									<Icon name="info" size={14} color={T.ter} />
									Click a marker to open it · drag a POI or token to move it
								</span>
							)}
							{tool === 'pan' && (
								<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)', border: `1px solid ${T.bd}`, font: `11.5px ${T.sans}`, color: T.sub }}>
									<Icon name="Hand" size={14} color={T.ter} />
									Drag to pan the map
								</span>
							)}
						</div>

						{/* title card */}
						<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, padding: '5px 11px', borderRadius: 8, background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)', backdropFilter: 'blur(2px)', border: `1px solid ${T.bd}` }}>
							<span style={{ font: `700 16px ${T.disp}`, color: T.ink }}>{view.name}</span>
							<span style={{ font: `10.5px ${T.mono}`, color: T.sub }}>
								{view.scale ? `${view.scale.unitsPerMap} ${view.scale.unit} across` : 'no scale set'}
							</span>
						</div>

						{/* zoom cluster */}
						<div style={{ position: 'absolute', right: 16, bottom: 176, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 5 }}>
							<IconButton icon="zoom-in" label="Zoom in" variant="outline" size="sm" onClick={() => zoomBy(0.2)} />
							<IconButton icon="zoom-out" label="Zoom out" variant="outline" size="sm" onClick={() => zoomBy(-0.2)} />
							<IconButton icon="zoom-fit" label="Fit" variant="outline" size="sm" onClick={() => zoomBy(undefined, true)} />
							<span style={{ textAlign: 'center', padding: '2px 0', borderRadius: 7, background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)', font: `10.5px ${T.mono}`, color: T.ink }}>{Math.round(zoom * 100)}%</span>
						</div>

						{/* minimap (viewport = the zoom/pan window; click to jump) */}
						<div style={{ position: 'absolute', right: 16, bottom: 18, zIndex: 5 }}>
							<Minimap
								viewport={{ x: clamp01(center.x - 0.5 / zoom), y: clamp01(center.y - 0.5 / zoom), w: Math.min(1, 1 / zoom), h: Math.min(1, 1 / zoom) }}
								onJump={(p: { x: number; y: number }) => setCenter({ x: clamp01(p.x), y: clamp01(p.y) })}
								width={168}
							/>
						</div>
					</MapCanvas>
				</div>

				{/* right inspector */}
				<div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderLeft: `1px solid ${T.bd}`, background: T.surf }}>
					<div role="tablist" aria-label="Builder panels" style={{ display: 'flex', gap: 2, padding: '8px 8px 0', borderBottom: `1px solid ${T.bd}` }}>
						{(
							[
								['layers', 'Layers', 'layers'],
								['generate', 'Generate', 'generate'],
								['map', 'Map', 'tool-grid'],
							] as const
						).map(([id, lbl, ic]) => {
							const on = rightTab === id;
							return (
								<button
									key={id}
									type="button"
									role="tab"
									aria-selected={on}
									onClick={() => setRightTab(id)}
									style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 4px', border: 'none', borderBottom: `2px solid ${on ? T.acc : 'transparent'}`, background: 'transparent', cursor: 'pointer', color: on ? T.acc : T.sub, font: `${on ? 600 : 500} 12px ${T.sans}` }}
								>
									<Icon name={ic} size={14} color={on ? T.acc : T.ter} />
									{lbl}
								</button>
							);
						})}
					</div>
					<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
						{rightTab === 'layers' && (
							<div>
								<PanelLabel
									action={
										isDm ? (
											<IconButton
												icon="add"
												label="Add layer"
												variant="ghost"
												size="sm"
												disabled={busy}
												onClick={() =>
													void run({
														type: 'map.create-layer',
														actorId,
														payload: { mapId, name: `Layer ${layers.length + 1}`, category: 'dm-annotations', visibility: 'dm-only' },
													})
												}
											/>
										) : undefined
									}
								>
									Layers · {layers.length}
									{isDm && layerResult.hiddenMatchCount > 0 ? ` (+${layerResult.hiddenMatchCount} hidden)` : ''}
								</PanelLabel>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 4, background: T.raised }}>
									{layers.map((l, i) => (
										<BuilderLayerRow
											key={l.layerId}
											l={l}
											index={i}
											count={layers.length}
											active={l.layerId === activeId}
											busy={busy || !isDm}
											onActivate={() => setActiveLayerId(l.layerId)}
											onReorder={(to) => void run({ type: 'map.reorder-layer', actorId, payload: { mapId, layerId: l.layerId, toOrder: to } })}
											onVis={() =>
												void run({
													type: 'map.set-layer-visibility',
													actorId,
													payload: { mapId, layerId: l.layerId, visibility: l.visibility === 'dm-only' ? 'player-visible' : 'dm-only' },
												})
											}
											onLock={() => void run({ type: 'map.lock-layer', actorId, payload: { mapId, layerId: l.layerId, locked: !l.locked } })}
											onEnabled={() => void run({ type: 'map.set-layer-enabled', actorId, payload: { mapId, layerId: l.layerId, enabled: !l.enabled } })}
											onOpacity={(v) => void run({ type: 'map.set-layer-opacity', actorId, payload: { mapId, layerId: l.layerId, opacity: v } })}
										/>
									))}
									{layers.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '8px 6px' }}>No layers are visible to you.</div>}
								</div>
								<div style={{ marginTop: 9, font: `11px/1.5 ${T.sans}`, color: T.ter }}>
									The <strong style={{ color: T.sub }}>active</strong> layer receives new POIs and tokens. Fog ops land on the fog layer{fogLayerId && view.layers.find((l) => l.id === fogLayerId)?.category !== 'fog' ? ' (none here — using the active layer)' : ''}.
								</div>
							</div>
						)}
						{rightTab === 'generate' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
								{/* HONEST STUB — no generation backend is wired in this build; nothing dispatches. */}
								<div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 9, background: 'var(--color-status-warning-subtle)', border: `1px solid ${T.warn}`, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
									<Icon name="warning" size={15} color={T.warn} />
									<span>
										<strong style={{ color: T.ink }}>Preview only — not wired.</strong> Procedural/AI map generation has no backend in this build; Accept writes nothing.
									</span>
								</div>
								<GenerationPanel
									progress={null}
									onAccept={() => setNotice('Generation is a labeled preview — no backend is wired in this build, so nothing was written.')}
									onDiscard={() => setRightTab('layers')}
									style={{ width: '100%' }}
								/>
							</div>
						)}
						{rightTab === 'map' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
								<div>
									<PanelLabel>Map</PanelLabel>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 7, font: `12.5px ${T.sans}`, color: T.sub }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
											<span>Name</span>
											<span style={{ color: T.ink, textAlign: 'right' }}>{view.name}</span>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
											<span>Visibility</span>
											<Badge status={VIS_STATUS[view.visibility] ?? 'neutral'}>{VIS_LABEL[view.visibility] ?? view.visibility}</Badge>
										</div>
										<div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
											<span>Scale</span>
											<span style={{ font: `12px ${T.mono}`, color: T.ink }}>{view.scale ? `${view.scale.unitsPerMap} ${view.scale.unit}` : '—'}</span>
										</div>
									</div>
									<div style={{ marginTop: 8, font: `11px/1.5 ${T.sans}`, color: T.ter }}>Renaming a map has no core command yet — name and scale are set at creation.</div>
								</div>
								<div>
									<PanelLabel>Stats</PanelLabel>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
										{(
											[
												['Layers', layers.length],
												['Points of interest', view.pois.length],
												['Fog ops', view.fog.length],
												['Tokens', view.tokens.length],
												['Routes', view.routes.length],
											] as const
										).map(([k, v]) => (
											<div key={k} style={{ display: 'flex', justifyContent: 'space-between', font: `12px ${T.sans}`, color: T.sub }}>
												<span>{k}</span>
												<span style={{ font: `12px ${T.mono}`, color: T.ink }}>{v}</span>
											</div>
										))}
									</div>
								</div>
								{isDm && (
									<div>
										<PanelLabel>Imported assets · {mapAssets.length}</PanelLabel>
										{mapAssets.length === 0 ? (
											<div style={{ font: `12px ${T.sans}`, color: T.ter }}>No assets imported yet — use Import in the top bar.</div>
										) : (
											<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
												{mapAssets.map((a) => (
													<div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 9px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.raised }}>
														<span style={{ font: `12.5px ${T.sans}`, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</span>
														<span style={{ font: `10px ${T.mono}`, color: T.ter, wordBreak: 'break-all' }}>
															{a.kind} · {(a.byteLength / 1024).toFixed(1)} KB{a.dimensions ? ` · ${a.dimensions.width}×${a.dimensions.height}` : ''} · {a.id}
														</span>
													</div>
												))}
												<div style={{ font: `10.5px/1.5 ${T.sans}`, color: T.ter }}>
													Content-addressed metadata records — the bytes themselves have no storage path in this prototype, so the canvas renders geometry, not the raster.
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* status bar */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '5px 14px', borderTop: `1px solid ${T.bd}`, background: T.surf, font: `10.5px ${T.mono}`, color: T.ter, flex: '0 0 auto', flexWrap: 'wrap' }}>
				<span style={{ textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
					<Icon name={toolMeta?.icon ?? 'tool-select'} size={12} color={T.ter} />
					{toolMeta?.label ?? tool}
				</span>
				<span>active layer: {layers.find((l) => l.layerId === activeId)?.name ?? '—'}</span>
				<span>{view.fog.length} fog ops</span>
				<div style={{ flex: 1 }} />
				<span>{Math.round(zoom * 100)}%</span>
			</div>

			{/* ── overlays ── */}
			{importOpen && <ImportMapDialog mapId={mapId} mapName={view.name} onClose={() => setImportOpen(false)} />}

			{poiEdit && (
				<Dialog
					open
					onClose={() => setPoiEdit(null)}
					title={`Edit POI — ${poiEdit.label}`}
					icon="poi"
					size="sm"
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setPoiEdit(null)}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" icon="check" disabled={busy || !poiDraft.label.trim()} onClick={savePoiEdit}>
								Save
							</Button>
						</>
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
						<Field label="Label">
							<Input value={poiDraft.label} onChange={(e: { target: { value: string } }) => setPoiDraft((d) => ({ ...d, label: e.target.value }))} />
						</Field>
						<div style={{ display: 'flex', gap: 10 }}>
							<Field label="Kind" style={{ flex: 1 }}>
								<Select value={poiDraft.category} options={MAP_POI_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(e: { target: { value: string } }) => setPoiDraft((d) => ({ ...d, category: e.target.value as MapPoiCategory }))} />
							</Field>
							<Field label="Visibility" style={{ flex: 1 }}>
								<Select value={poiDraft.visibility} options={VIS_OPTIONS} onChange={(e: { target: { value: string } }) => setPoiDraft((d) => ({ ...d, visibility: e.target.value as SceneVisibility }))} />
							</Field>
						</div>
						<Field label="Note" help="DM note — a player only ever sees a player-visible POI's note.">
							<Textarea rows={3} value={poiDraft.notes} onChange={(e: { target: { value: string } }) => setPoiDraft((d) => ({ ...d, notes: e.target.value }))} />
						</Field>
					</div>
				</Dialog>
			)}

			{confirmConcealAll && (
				<Dialog
					open
					onClose={() => setConfirmConcealAll(false)}
					title="Re-conceal the whole map?"
					description="Appends a full-map conceal op — players will see nothing until you reveal again. The op history is preserved (fog is append-only)."
					tone="warning"
					icon="conceal"
					size="sm"
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setConfirmConcealAll(false)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="conceal"
								disabled={busy}
								onClick={() => {
									setConfirmConcealAll(false);
									appendFog({ x: 0, y: 0, w: 1, h: 1 }, 'conceal');
								}}
							>
								Conceal everything
							</Button>
						</>
					}
				/>
			)}
		</div>
	);
}
