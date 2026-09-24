import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import { useI18n } from '../../../i18n';
import { useAssetObjectUrl } from '../../../platform/assetUrl';
import { useFogRevealFlash } from '../../fogRegions';
import {
	appendPolygonVertex,
	appendStrokePoint,
	closePolygonRegion,
	rectRegionFromDrag,
	strokeRegionFromPoints,
	type NormPoint,
} from '../../mapGeometry';
import { clamp01 } from '../mapVocab';
import { planBake } from './BakeLayer';
import { type DragState, type Point } from './geometry';
import { planLighting } from './LightLayer';
import type { MapCanvasProps } from './mapCanvasTypes';
export function useMapCanvas({
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

	// RC-MAP-3.9 — the vertex count is the one piece of the in-progress polygon a DM cannot see by
	// eye once vertices overlap at this zoom, so the editor's status readout needs it live. The
	// polygon itself stays MapCanvas's own state (the gesture is player-view-safe geometry, same as
	// every other fog draw); this only mirrors its length outward.
	useEffect(() => {
		onPolygonVertexCount?.(polyPoints.length);
	}, [polyPoints, onPolygonVertexCount]);

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

	// RC-MAP-3.6 — lighting + line of sight. Cast from the UNCULLED feature set: a wall just off the
	// viewport still throws a shadow into it, so the viewport cull that `visibleFeatures` applies
	// would make lights leak through walls as you pan. The vision preview follows the token the DM has
	// already selected — no second selection model, and no new control to leave dangling.
	const lightingFeatures = useMemo(() => contentLayers.flatMap((l) => l.content), [contentLayers]);
	const selectedTokenPosition = useMemo(() => {
		if (!selectedTokenId || !view) return null;
		// Only placed map tokens are selectable here (`MapMarkers.tsx` renders the selection ring for
		// `view.tokens`); a combat token has no selection of its own to preview from.
		return view.tokens.find((tk) => tk.id === selectedTokenId)?.position ?? null;
	}, [selectedTokenId, view]);
	const lightingPlan = useMemo(
		() => planLighting(lightingFeatures, { visionOrigin: selectedTokenPosition }),
		[lightingFeatures, selectedTokenPosition],
	);

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

	// RC-MAP-2.4 — which reveals just landed. Diffed against the RAW `view.fog` (not `fogOps`) so
	// toggling a layer's display back on is not mistaken for the DM revealing that ground; the flash
	// then renders only the ops `fogOps` actually shows. Keyed on the map so switching maps re-baselines.
	const flashing = useFogRevealFlash(view?.fog, view?.mapId ?? null);

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

	return {
		view,
		isDm,
		zoom,
		center,
		fogMode,
		fogBrushRadius,
		rasterAssetId,
		editable,
		showFogOutlines,
		height,
		selectedPoiId,
		selectedTokenId,
		onSelectPoi,
		onSelectToken,
		renderPoiPopover,
		hideCombatOverlay,
		compactCombat,
		children,
		style,
		t,
		wellRef,
		drag,
		fogMaskId,
		polyPoints,
		rasterUrl,
		toVisual,
		annotationVisible,
		fogOps,
		visibleFeatures,
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
	};
}
