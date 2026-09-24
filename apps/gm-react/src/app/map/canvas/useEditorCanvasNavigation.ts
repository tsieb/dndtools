import type { MapLayer } from '@dndtools/core';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import { useI18n } from '../../../i18n';
import { clamp01 } from '../mapVocab';
import type { MapEditorApi } from '../useMapEditor';
import { categoryForTool } from '../useMapEditor';
import { DRAWING_TOOLS, Gesture, Pt } from './editorCanvasTypes';
import { useTouchNavigation } from './useTouchNavigation';
export function useEditorCanvasNavigation({
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
	const { t } = useI18n();
	const { tool, options, zoom, center, layers } = editor;
	const containerRef = useRef<HTMLDivElement>(null);
	const zoomRef = useRef(zoom);
	const centerRef = useRef(center);
	zoomRef.current = zoom;
	centerRef.current = center;

	const [gesture, setGesture] = useState<Gesture>(null);
	const gestureRef = useRef<Gesture>(null);
	const setG = (g: Gesture) => {
		gestureRef.current = g;
		setGesture(g);
	};
	const [path, setPath] = useState<Pt[]>([]);
	const pathRef = useRef<Pt[]>([]);
	pathRef.current = path;
	const [hoverPt, setHoverPt] = useState<Pt | null>(null);
	/** RC-MAP-3.9 — mirrors MapCanvas's in-progress fog-polygon vertex count for the HUD readout. */
	const [polyVertexCount, setPolyVertexCount] = useState(0);
	const [spacePan, setSpacePan] = useState(false);
	const ctrlRef = useRef(false);

	// RC-MAP-2.5 — the canvas context menu (right-click on desktop, long-press on touch), and the
	// timer that turns a held single touch into the touch equivalent since there is no contextmenu
	// event for touch.
	const [contextMenu, setContextMenu] = useState<{
		touch: boolean;
		anchorPx: Pt;
		mapPt: Pt;
	} | null>(null);

	const isDrawing = DRAWING_TOOLS.has(tool);

	// Active layer new content lands on: the explicit active layer, else one in the tool's category, else
	// the first layer.
	const activeId = useMemo(() => {
		if (editor.activeLayerId && layers.some((l) => l.layerId === editor.activeLayerId))
			return editor.activeLayerId;
		const cat = categoryForTool(tool);
		return layers.find((l) => l.category === cat)?.layerId ?? layers[0]?.layerId ?? null;
	}, [editor.activeLayerId, layers, tool]);

	const fogLayerId = editor.map?.layers.find((l) => l.category === 'fog')?.id ?? activeId;

	// ── coordinate transforms ────────────────────────────────────────────────────────────────────
	const toMap = useCallback((clientX: number, clientY: number): Pt => {
		const r = containerRef.current?.getBoundingClientRect();
		if (!r || r.width === 0 || r.height === 0) return { x: 0.5, y: 0.5 };
		const z = zoomRef.current;
		const c = centerRef.current;
		return {
			x: clamp01(((clientX - r.left) / r.width - 0.5) / z + c.x),
			y: clamp01(((clientY - r.top) / r.height - 0.5) / z + c.y),
		};
	}, []);

	const {
		pinching,
		navigationEpoch,
		stopInertia,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
	} = useTouchNavigation({
		containerRef,
		zoomRef,
		centerRef,
		editor,
		tool,
		trackHover: tool === 'fog' && options.fogShape === 'stroke',
		toMap,
		announce,
		onHover: setHoverPt,
		onPinchStart: () => {
			setG(null);
			setPath([]);
		},
		onLongPress: setContextMenu,
	});

	// RC-MAP-2.5 — right-click opens the context menu at the pointer. `preventDefault` suppresses the
	// browser's native menu; the same event fires for the keyboard context-menu key (Shift+F10 / the
	// Menu key) at the focused element's position, so this is the pointer AND keyboard entry point.
	const onContextMenu = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			event.preventDefault();
			const rect = containerRef.current?.getBoundingClientRect();
			setContextMenu({
				touch: false,
				anchorPx: { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) },
				mapPt: toMap(event.clientX, event.clientY),
			});
		},
		[toMap],
	);

	const snap = useCallback(
		(p: Pt, angleFrom?: Pt): Pt => {
			if (ctrlRef.current) return p;
			let { x, y } = p;
			const grid = editor.map?.overlay?.gridSize ?? 0;
			if (options.snapGrid && grid > 0) {
				x = Math.round(x * grid) / grid;
				y = Math.round(y * grid) / grid;
			}
			if (options.snapAngle && angleFrom) {
				const dx = x - angleFrom.x;
				const dy = y - angleFrom.y;
				const len = Math.hypot(dx, dy);
				const step = Math.PI / 12; // 15°
				const ang = Math.round(Math.atan2(dy, dx) / step) * step;
				x = angleFrom.x + Math.cos(ang) * len;
				y = angleFrom.y + Math.sin(ang) * len;
			}
			return { x: clamp01(x), y: clamp01(y) };
		},
		[options.snapGrid, options.snapAngle, editor.map?.overlay?.gridSize],
	);

	// ── wheel zoom to cursor ─────────────────────────────────────────────────────────────────────
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			stopInertia();
			const r = el.getBoundingClientRect();
			const fx = (e.clientX - r.left) / r.width;
			const fy = (e.clientY - r.top) / r.height;
			const oldZoom = zoomRef.current;
			const factor = Math.exp(-e.deltaY * 0.0015);
			const newZoom = Math.min(6, Math.max(0.4, +(oldZoom * factor).toFixed(3)));
			const c = centerRef.current;
			const mapX = (fx - 0.5) / oldZoom + c.x;
			const mapY = (fy - 0.5) / oldZoom + c.y;
			editor.setZoom(newZoom);
			editor.setCenter({
				x: clamp01(mapX - (fx - 0.5) / newZoom),
				y: clamp01(mapY - (fy - 0.5) / newZoom),
			});
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
		// setZoom/setCenter are stable state setters; the listener reads live zoom/center via refs.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── hold Space = pan; track Ctrl for snap override ───────────────────────────────────────────
	useEffect(() => {
		const isTyping = (t: EventTarget | null) => {
			const el = t as HTMLElement | null;
			return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
		};
		const down = (e: KeyboardEvent) => {
			if (e.key === 'Control') ctrlRef.current = true;
			if (e.key === ' ' && !isTyping(e.target)) {
				// Space is also "activate the focused button". Without this, holding Space to pan
				// after clicking e.g. Zoom in re-fired that button on release.
				e.preventDefault();
				setSpacePan(true);
			}
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === 'Control') ctrlRef.current = false;
			if (e.key === ' ') setSpacePan(false);
		};
		// A window that loses focus while Space is held (Alt+Tab, an OS overlay) never delivers the
		// keyup — and space-pan renders a full-canvas `zIndex: 9` grab overlay, so the editor was left
		// with every tool, the zoom cluster and the minimap dead behind an invisible sheet, with no
		// affordance saying why. Releasing the pan on blur is the only reset the user cannot miss.
		const release = () => {
			ctrlRef.current = false;
			setSpacePan(false);
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', release);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', release);
		};
	}, []);

	return {
		editor,
		previewLayers,
		announce,
		rasterAssetId,
		onCursor,
		quickMapMode,
		t,
		tool,
		options,
		zoom,
		center,
		layers,
		containerRef,
		zoomRef,
		centerRef,
		gesture,
		gestureRef,
		setG,
		path,
		setPath,
		pathRef,
		hoverPt,
		setHoverPt,
		polyVertexCount,
		setPolyVertexCount,
		spacePan,
		contextMenu,
		setContextMenu,
		isDrawing,
		activeId,
		fogLayerId,
		toMap,
		pinching,
		navigationEpoch,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
		onContextMenu,
		snap,
	};
}
