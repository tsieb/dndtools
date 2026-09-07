import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MapFeature, MapFogRegion, MapLayer, SceneVisibility } from '@dndtools/core';
import { Icon, POIPopover } from '../../../ds';
import { T } from '../../screen-kit';
import { CATEGORY_VAR, POI_MARKER_CAT, dsToVis, visToDs, type MapTool } from '../mapVisibility';
import { FeatureShape } from './FeatureShape';
import { MapCanvas } from './MapCanvas';
import { EditorCanvasHud } from './EditorCanvasHud';
import { clamp01 } from '../mapVocab';
import {
	DOUBLE_TAP_MS,
	DOUBLE_TAP_SLOP_PX,
	inertialPanStep,
	nextDoubleTapZoom,
	panVelocityFromSamples,
	viewportForAnchoredZoom,
	viewportForPinch,
	type TouchSample,
} from '../quickMap';
import { ROUTE_DEFAULT_NAME } from '../tools';
import { categoryForTool } from '../useMapEditor';
import { useI18n } from '../../../i18n';
import type { MapEditorApi } from '../useMapEditor';

const MemoMapCanvas = memo(MapCanvas);

type Pt = { x: number; y: number };

const DRAWING_TOOLS = new Set([
	'brush',
	'fill',
	'erase',
	'room',
	'wall',
	'door',
	'water',
	'light',
	'stamp',
	'scatter',
	'text',
	'measure',
	'marquee',
	'generate',
	// 'route' was missing here, so the interaction overlay that owns the click-to-add-vertex
	// gesture never mounted for it: the Route tool showed its "Click to add points" hint, then
	// dropped every click through to MapCanvas (which maps route -> pan). Its whole finish path
	// (map.create-route below) already existed and was simply unreachable.
	'route',
]);
/** Tools whose gesture is a persistent click-to-add-vertex path finished with Enter/double-click. */
const PATH_TOOLS = new Set(['wall', 'water', 'route']);

type Gesture =
	| { kind: 'stroke'; pts: Pt[] }
	| { kind: 'rect'; start: Pt; cur: Pt; square: boolean }
	| { kind: 'measure'; start: Pt; cur: Pt }
	| { kind: 'pan'; sx: number; sy: number; c0: Pt }
	| null;

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
	const touchPointers = useRef(new Map<number, Pt>());
	const touchNavigationBlocked = useRef(false);
	const pinchRef = useRef<{
		startZoom: number;
		startCenter: Pt;
		startCentroid: Pt;
		startDistance: number;
	} | null>(null);
	const [pinching, setPinching] = useState(false);
	// RC-MAP-4.3 — momentum: the trailing samples of the navigation point (the finger, or the
	// two-finger centroid) and the frame handle of the glide they hand off to.
	const panSamples = useRef<TouchSample[]>([]);
	const inertiaFrame = useRef<number | null>(null);
	const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
	// Remount MapCanvas when a second finger cancels one of its in-progress single-pointer gestures.
	const [navigationEpoch, setNavigationEpoch] = useState(0);

	// RC-MAP-2.5 — the canvas context menu (right-click on desktop, long-press on touch), and the
	// timer that turns a held single touch into the touch equivalent since there is no contextmenu
	// event for touch.
	const [contextMenu, setContextMenu] = useState<{
		touch: boolean;
		anchorPx: Pt;
		mapPt: Pt;
	} | null>(null);
	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
	const cancelLongPress = () => {
		if (longPressTimer.current !== null) clearTimeout(longPressTimer.current);
		longPressTimer.current = null;
		longPressStart.current = null;
	};

	const isDrawing = DRAWING_TOOLS.has(tool);

	const localTouchPoint = (clientX: number, clientY: number): Pt => {
		const rect = containerRef.current?.getBoundingClientRect();
		return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
	};
	const firstTwoTouches = (): [Pt, Pt] | null => {
		const points = [...touchPointers.current.values()];
		return points.length >= 2 ? [points[0]!, points[1]!] : null;
	};
	/** The point touch navigation tracks: the two-finger centroid, else the single finger. */
	const navigationPoint = (): Pt | null => {
		const points = [...touchPointers.current.values()];
		if (points.length >= 2) {
			const [a, b] = points as [Pt, Pt];
			return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		}
		return points[0] ?? null;
	};
	const sampleNavigation = () => {
		const point = navigationPoint();
		if (!point) return;
		const now = performance.now();
		panSamples.current.push({ x: point.x, y: point.y, t: now });
		while (panSamples.current.length > 8) panSamples.current.shift();
	};
	const stopInertia = () => {
		if (inertiaFrame.current !== null) cancelAnimationFrame(inertiaFrame.current);
		inertiaFrame.current = null;
	};
	// RC-MAP-4.3 — a released touch pan keeps travelling and decays, the way every map on a phone
	// behaves. Viewport state only (`setCenter`), never a command, so nothing here is undoable and
	// nothing here can be seen by a player.
	const startInertia = () => {
		const rect = containerRef.current?.getBoundingClientRect();
		const samples = panSamples.current;
		panSamples.current = [];
		if (!rect) return;
		let velocity = panVelocityFromSamples(samples, {
			zoom: zoomRef.current,
			width: rect.width,
			height: rect.height,
		});
		if (velocity.x === 0 && velocity.y === 0) return;
		let last = performance.now();
		const frame = (now: number) => {
			const step = inertialPanStep({
				center: centerRef.current,
				velocity,
				dtMs: now - last,
			});
			last = now;
			velocity = step.velocity;
			editor.setCenter(step.center);
			inertiaFrame.current = step.done ? null : requestAnimationFrame(frame);
		};
		inertiaFrame.current = requestAnimationFrame(frame);
	};
	const beginPinch = (target: HTMLDivElement) => {
		const points = firstTwoTouches();
		if (!points) return;
		for (const pointerId of touchPointers.current.keys()) {
			try {
				target.setPointerCapture(pointerId);
			} catch {
				// A browser may have already retired one pointer between events; the remaining pair still works.
			}
		}
		const [a, b] = points;
		pinchRef.current = {
			startZoom: zoomRef.current,
			startCenter: centerRef.current,
			startCentroid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
			startDistance: Math.hypot(b.x - a.x, b.y - a.y),
		};
		touchNavigationBlocked.current = true;
		panSamples.current = [];
		setPinching(true);
		setG(null);
		setPath([]);
		setNavigationEpoch((value) => value + 1);
	};
	// These three capture handlers are the ONLY pinch-to-zoom in the editor, and the container sets
	// `touch-action: none`, so the browser's native pinch is suppressed as well. They used to also
	// require `quickMapMode`, which `platform/capabilities.ts` grants on Android only — meaning on
	// iOS, an iPad, or any other touch device the map canvas could not be zoomed at all, and with a
	// drawing tool armed the interaction overlay blocked MapCanvas's own pan too. The pinch path only
	// writes viewport state (`setZoom`/`setCenter`), never a command, so there is nothing
	// quick-mode-specific about it.
	// RC-MAP-2.5 — a held single touch (no second finger, no drift) opens the context menu as a
	// bottom sheet, the touch equivalent of a right-click. Armed here, disarmed by movement past the
	// threshold, a second touch starting a pinch, or the touch ending before it fires.
	const LONG_PRESS_MS = 300;
	const LONG_PRESS_SLOP_PX = 10;
	const armLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
		cancelLongPress();
		longPressStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
		const { clientX, clientY } = event;
		longPressTimer.current = setTimeout(() => {
			longPressTimer.current = null;
			longPressStart.current = null;
			const rect = containerRef.current?.getBoundingClientRect();
			setContextMenu({
				touch: true,
				anchorPx: { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) },
				mapPt: toMap(clientX, clientY),
			});
		}, LONG_PRESS_MS);
	};
	// RC-MAP-4.3 — a second tap in the same spot inside DOUBLE_TAP_MS is one zoom step anchored under
	// the finger. Only while navigating: with a path tool armed a double tap already means "finish the
	// path", and with fog armed it would paint twice. The zoom buttons in the HUD are the keyboard
	// equivalent of this gesture.
	const consumeDoubleTap = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
		if (tool !== 'pan') {
			lastTap.current = null;
			return false;
		}
		const now = performance.now();
		const previous = lastTap.current;
		lastTap.current = { x: event.clientX, y: event.clientY, t: now };
		if (
			!previous ||
			now - previous.t > DOUBLE_TAP_MS ||
			Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > DOUBLE_TAP_SLOP_PX
		) {
			return false;
		}
		lastTap.current = null;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return false;
		const zoom = nextDoubleTapZoom(zoomRef.current);
		const next = viewportForAnchoredZoom({
			zoom: zoomRef.current,
			center: centerRef.current,
			factor: zoom / zoomRef.current,
			anchor: localTouchPoint(event.clientX, event.clientY),
			width: rect.width,
			height: rect.height,
		});
		editor.setZoom(next.zoom);
		editor.setCenter(next.center);
		announce(t('mapEditor.zoomedTo', { percent: Math.round(next.zoom * 100) }));
		return true;
	};
	const onTouchDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== 'touch') return;
		stopInertia();
		touchPointers.current.set(event.pointerId, localTouchPoint(event.clientX, event.clientY));
		panSamples.current = [];
		if (touchPointers.current.size >= 2) {
			cancelLongPress();
			beginPinch(event.currentTarget);
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (consumeDoubleTap(event)) {
			cancelLongPress();
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (editor.isDm) armLongPress(event);
	};
	const onTouchMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
		// RC-MAP-3.9 — the fog brush's own gesture lives entirely inside MapCanvas (its pointer capture
		// owns the drag), so this overlay never sees a move while armed. But the CAPTURE phase still
		// fires on every ancestor regardless of who ends up handling the event, mouse or touch alike —
		// so it is the only place left to read a live cursor position for the size-preview ring.
		if (tool === 'fog' && options.fogShape === 'stroke') {
			setHoverPt(toMap(event.clientX, event.clientY));
		}
		if (event.pointerType !== 'touch') return;
		if (touchPointers.current.has(event.pointerId)) {
			touchPointers.current.set(event.pointerId, localTouchPoint(event.clientX, event.clientY));
			// Sampled for the momentum glide only while the gesture really is navigation: the
			// two-finger centroid, or one finger with the navigate tool armed (MapCanvas owns that
			// drag, this only reads it). A marker drag under Select must never fling the map.
			if (touchNavigationBlocked.current || tool === 'pan') sampleNavigation();
		}
		const start = longPressStart.current;
		if (start && start.pointerId === event.pointerId) {
			const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
			if (moved > LONG_PRESS_SLOP_PX) cancelLongPress();
		}
		if (!touchNavigationBlocked.current) return;
		const points = firstTwoTouches();
		const pinch = pinchRef.current;
		const rect = containerRef.current?.getBoundingClientRect();
		if (points && pinch && rect) {
			const [a, b] = points;
			const next = viewportForPinch({
				...pinch,
				centroid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
				distance: Math.hypot(b.x - a.x, b.y - a.y),
				width: rect.width,
				height: rect.height,
			});
			editor.setZoom(next.zoom);
			editor.setCenter(next.center);
		}
		event.preventDefault();
		event.stopPropagation();
	};
	const endTouchCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== 'touch') return;
		if (longPressStart.current?.pointerId === event.pointerId) cancelLongPress();
		const blocked = touchNavigationBlocked.current;
		const before = touchPointers.current.size;
		touchPointers.current.delete(event.pointerId);
		if (touchPointers.current.size < 2) pinchRef.current = null;
		if (touchPointers.current.size === 0) {
			touchNavigationBlocked.current = false;
			setPinching(false);
		}
		// The glide starts the moment the gesture stops being a navigation: the pinch losing its
		// second finger, or the single navigating finger lifting. The trailing finger of a released
		// pinch moves nothing, so its samples are dropped rather than flung.
		if ((before >= 2 && touchPointers.current.size < 2) || (before === 1 && tool === 'pan')) {
			startInertia();
		} else {
			panSamples.current = [];
		}
		if (blocked) {
			event.preventDefault();
			event.stopPropagation();
		}
	};

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

	useEffect(() => {
		return () => {
			cancelLongPress();
			stopInertia();
		};
		// cancelLongPress and stopInertia only touch refs; they never go stale.
	}, []);

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

	// ── path tools: Enter finishes, Esc cancels ──────────────────────────────────────────────────
	useEffect(() => {
		if (path.length === 0) return;
		// Bound on `document` in the CAPTURE phase with stopPropagation, so without this guard (which
		// the Space-pan listener above already has) Enter in the map-name field or the Search box
		// finished the in-progress wall path and never reached the input at all.
		const isTypingTarget = (t: EventTarget | null) => {
			const el = t as HTMLElement | null;
			return (
				!!el &&
				(['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true)
			);
		};
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				finishPath();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				setPath([]);
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [path.length, tool, options.waterKind]);

	// ── incremental dispatch helpers ──────────────────────────────────────────────────────────────
	// `editor.run` is SINGLE-FLIGHT: it returns false immediately while another command is in flight,
	// and false again when the core rejects (a locked layer, a permission ceiling). Every caller here
	// used to fire it with `void` and then announce success on the very next line, so the live region
	// said "Painted terrain." / "Room added." when nothing had been added — for a DM working by ear the
	// editor was unfalsifiable. Take the message here and announce it only once the write lands.
	const addFeatures = useCallback(
		(features: MapFeature[], okMessage?: string) => {
			if (!activeId || features.length === 0) return;
			void editor
				.run({
					type: 'map.add-features',
					actorId: editor.actorId,
					payload: { mapId: editor.mapId, layerId: activeId, features },
				} as never)
				.then((accepted) => {
					if (accepted && okMessage) announce(okMessage);
				});
		},
		[activeId, announce, editor],
	);

	const mkFeature = (
		kind: MapFeature['kind'],
		points: Pt[],
		style: string,
		props?: MapFeature['props'],
	): MapFeature => ({
		id: editor.nextId(kind),
		kind,
		points: points.map((p) => ({ x: p.x, y: p.y })),
		style: style || kind,
		...(props ? { props } : {}),
	});

	function finishPath() {
		const pts = pathRef.current;
		setPath([]);
		if (pts.length < 2) return;
		if (tool === 'wall') {
			addFeatures([mkFeature('wall', pts, 'wall')], `Wall added (${pts.length} points).`);
		} else if (tool === 'water') {
			addFeatures(
				[
					// The style string is what `FeatureShape` reads to tell a river from a lake
					// (`MapBuilder.tsx`, `feature.style.includes('river')`) — and it is the vocabulary the
					// core's own generators emit ('water:river' / 'water:lake'). Passing the bare 'water'
					// made the "Water type" control a visual no-op: a hand-drawn river painted as a
					// lake-coloured blob. `width` alone is not one of the keys the renderer tests.
					mkFeature(
						'water',
						pts,
						options.waterKind === 'river' ? 'water:river' : 'water:lake',
						options.waterKind === 'river' ? { width: 0.012 } : undefined,
					),
				],
				`${options.waterKind === 'river' ? 'River' : 'Lake'} added.`,
			);
		} else if (tool === 'route') {
			// RC-MAP-3.7: the route carries the name the DM typed into the tool options (blank falls
			// back), and the finished line becomes the SELECTION so the status bar's distance and
			// travel-time readout is about the route they just drew, not about nothing.
			const routeId = editor.nextId('route');
			void editor
				.run({
					type: 'map.create-route',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						id: routeId,
						layerId: activeId,
						label: options.routeName.trim() || ROUTE_DEFAULT_NAME,
						visibility: options.newVisibility,
						waypoints: pts.map((p) => ({ id: editor.nextId('wp'), position: { x: p.x, y: p.y } })),
					},
				} as never)
				.then((accepted) => {
					if (!accepted) return;
					editor.setSelection([routeId]);
					announce('Route added.');
				});
		}
	}

	function eraseAt(pts: Pt[]) {
		const layer = layers.find((l) => l.layerId === activeId);
		if (!layer) return;
		const r = options.brushSize / 2000;
		const hitIds = layer.content
			.filter((f) =>
				f.points.some((fp) => pts.some((sp) => Math.hypot(fp.x - sp.x, fp.y - sp.y) < r)),
			)
			.map((f) => f.id);
		if (hitIds.length === 0) return;
		void editor
			.run({
				type: 'map.remove-features',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, layerId: activeId, featureIds: hitIds },
			} as never)
			.then((accepted) => {
				if (accepted) announce(`Erased ${hitIds.length} features.`);
			});
	}

	function scatterAlong(pts: Pt[]) {
		const density = options.scatterDensity;
		const style = `prop:${options.scatterObject}`;
		const features: MapFeature[] = [];
		for (const p of pts) {
			if (Math.random() > density) continue;
			if (features.length >= 200) break;
			features.push(
				mkFeature(
					'prop',
					[
						{
							x: clamp01(p.x + (Math.random() - 0.5) * 0.02),
							y: clamp01(p.y + (Math.random() - 0.5) * 0.02),
						},
					],
					style,
					{
						scale: 0.7 + Math.random() * 0.6,
					},
				),
			);
		}
		if (features.length > 0) {
			addFeatures(features, `Scattered ${features.length} objects.`);
		}
	}

	// ── overlay pointer handlers (drawing tools) ──────────────────────────────────────────────────
	const onOverlayDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		const p = toMap(e.clientX, e.clientY);
		if (tool === 'brush' || tool === 'erase' || tool === 'scatter')
			setG({ kind: 'stroke', pts: [p] });
		else if (tool === 'room' || tool === 'marquee')
			setG({ kind: 'rect', start: p, cur: p, square: e.shiftKey });
		else if (tool === 'measure') setG({ kind: 'measure', start: p, cur: p });
	};
	const onOverlayMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const p = toMap(e.clientX, e.clientY);
		setHoverPt(p);
		onCursor(p);
		const g = gestureRef.current;
		if (!g) return;
		if (g.kind === 'stroke') setG({ kind: 'stroke', pts: [...g.pts, p] });
		else if (g.kind === 'rect') setG({ ...g, cur: p, square: e.shiftKey });
		else if (g.kind === 'measure') setG({ ...g, cur: p });
	};
	const onOverlayUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gestureRef.current;
		setG(null);
		if (!g) return;
		if (g.kind === 'stroke') {
			if (g.pts.length < 2) return;
			if (tool === 'brush') {
				addFeatures([mkFeature('stroke', g.pts, options.terrainStyle)], 'Painted terrain.');
			} else if (tool === 'erase') eraseAt(g.pts);
			else if (tool === 'scatter') scatterAlong(g.pts);
		} else if (g.kind === 'rect') {
			if (tool === 'room') {
				const [a, b] = rectCorners(g.start, g.cur, g.square);
				if (Math.abs(b.x - a.x) < 0.005 || Math.abs(b.y - a.y) < 0.005) return;
				addFeatures([mkFeature('room', [snap(a), snap(b)], options.terrainStyle)], 'Room added.');
			} else if (tool === 'marquee') {
				selectInRect(g.start, g.cur, e.shiftKey);
			}
		}
	};
	const onOverlayClick = (e: ReactPointerEvent<HTMLDivElement>) => {
		// single-click placement / vertex tools
		const raw = toMap(e.clientX, e.clientY);
		if (tool === 'stamp') {
			addFeatures(
				// RC-MAP-3.1 — the Rotation/Size options ride along into `props`, where both the editor
				// renderer and the player view read them. `scale` multiplies the catalogue default.
				[
					mkFeature('prop', [snap(raw)], options.stampAsset, {
						scale: options.stampScale,
						rotation: options.stampRotation,
					}),
				],
				'Placed object.',
			);
		} else if (tool === 'light') {
			addFeatures(
				[
					mkFeature('light', [snap(raw)], 'light', {
						radius: options.lightRadius,
						color: options.lightColor,
					}),
				],
				'Placed light.',
			);
		} else if (tool === 'door') {
			const c = snap(raw);
			addFeatures(
				[
					mkFeature(
						'door',
						[
							{ x: clamp01(c.x - 0.02), y: c.y },
							{ x: clamp01(c.x + 0.02), y: c.y },
						],
						'door',
						{ portal: options.doorKind, state: 'closed' },
					),
				],
				'Placed door.',
			);
		} else if (tool === 'text') {
			const text = options.labelText.trim();
			addFeatures(
				[mkFeature('text', [snap(raw)], 'text', { text: text || 'Label', size: 3 })],
				'Placed label.',
			);
		} else if (tool === 'fill') {
			const cell = 1 / (editor.map?.overlay?.gridSize ?? 10);
			const a = snap(raw);
			addFeatures(
				[
					mkFeature(
						'fill',
						[a, { x: clamp01(a.x + cell), y: clamp01(a.y + cell) }],
						options.terrainStyle,
					),
				],
				'Filled a cell.',
			);
		} else if (PATH_TOOLS.has(tool)) {
			const last = pathRef.current[pathRef.current.length - 1];
			setPath((prev) => [...prev, snap(raw, last)]);
		}
	};
	const onOverlayDouble = () => {
		if (PATH_TOOLS.has(tool)) finishPath();
	};

	function rectCorners(a: Pt, b: Pt, square: boolean): [Pt, Pt] {
		if (!square) return [a, b];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const s = Math.max(Math.abs(dx), Math.abs(dy));
		return [a, { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s }];
	}

	function selectInRect(a: Pt, b: Pt, additive: boolean) {
		const x0 = Math.min(a.x, b.x);
		const x1 = Math.max(a.x, b.x);
		const y0 = Math.min(a.y, b.y);
		const y1 = Math.max(a.y, b.y);
		const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
		const ids = [
			...(editor.map?.pois ?? []).filter((p) => inside(p.position)).map((p) => p.id),
			...(editor.map?.tokens ?? []).filter((t) => inside(t.position)).map((t) => t.id),
		];
		editor.setSelection(additive ? [...new Set([...editor.selection, ...ids])] : ids);
		if (ids.length > 0) editor.setDock('inspector');
		announce(`${ids.length} selected.`);
	}

	// ── space-pan handlers ─────────────────────────────────────────────────────────────────────────
	const onPanDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		setG({ kind: 'pan', sx: e.clientX, sy: e.clientY, c0: centerRef.current });
	};
	const onPanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gestureRef.current;
		if (!g || g.kind !== 'pan') return;
		const r = containerRef.current?.getBoundingClientRect();
		if (!r) return;
		editor.setCenter({
			x: clamp01(g.c0.x - (e.clientX - g.sx) / (r.width * zoomRef.current)),
			y: clamp01(g.c0.y - (e.clientY - g.sy) / (r.height * zoomRef.current)),
		});
	};
	const onPanUp = () => setG(null);

	// ── MapCanvas (renderer + built-in select/pan/poi/token/fog gestures) ───────────────────────────
	const canvasTool: MapTool =
		tool === 'select'
			? 'select'
			: tool === 'pan'
				? 'pan'
				: tool === 'poi'
					? 'poi'
					: tool === 'token'
						? 'token'
						: tool === 'fog'
							? 'fog'
							: 'pan';
	const canvasEditable = editor.isDm && !editor.busy && !isDrawing;

	const selectedId = editor.selection.length === 1 ? editor.selection[0]! : null;
	const selPoiId = editor.map?.pois.some((p) => p.id === selectedId) ? selectedId : null;
	const selTokenId = editor.map?.tokens.some((t) => t.id === selectedId) ? selectedId : null;

	const handleSelectPoi = useCallback(
		(id: string | null) => {
			editor.setSelection(id ? [id] : []);
			if (id) editor.setDock('inspector');
		},
		[editor],
	);
	const handleSelectToken = useCallback(
		(id: string | null) => {
			editor.setSelection(id ? [id] : []);
			if (id) editor.setDock('inspector');
		},
		[editor],
	);
	const handlePlace = useCallback(
		(pos: Pt) => {
			if (tool === 'poi') {
				const id = editor.nextId('poi');
				void editor
					.run({
						type: 'map.create-poi',
						actorId: editor.actorId,
						payload: {
							mapId: editor.mapId,
							id,
							layerId: activeId,
							label: 'New POI',
							category: 'landmark',
							position: pos,
							visibility: options.newVisibility,
						},
					} as never)
					.then((accepted) => {
						if (!accepted) return;
						editor.setSelection([id]);
						editor.setDock('inspector');
						announce('POI placed.');
						if (quickMapMode) editor.setTool('pan');
					});
			} else if (tool === 'token') {
				const id = editor.nextId('token');
				void editor
					.run({
						type: 'map.create-token',
						actorId: editor.actorId,
						payload: {
							mapId: editor.mapId,
							id,
							layerId: activeId,
							label: `Token ${(editor.map?.tokens.length ?? 0) + 1}`,
							linkedActorId: null,
							position: pos,
							size: 1,
							visibility: options.newVisibility,
							controllerActorId: null,
						},
					} as never)
					.then((accepted) => {
						if (!accepted) return;
						editor.setSelection([id]);
						editor.setDock('inspector');
						announce('Token placed.');
						if (quickMapMode) editor.setTool('pan');
					});
			}
		},
		[tool, editor, activeId, options.newVisibility, announce, quickMapMode],
	);
	const handleFog = useCallback(
		(region: MapFogRegion) => {
			if (!fogLayerId) return;
			void editor
				.run({
					type: 'map.append-fog',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						id: editor.nextId('fog'),
						layerId: fogLayerId,
						kind: options.fogMode,
						region,
						...(options.fogFeather > 0 ? { feather: Math.min(0.2, options.fogFeather) } : {}),
						visibility: 'shared',
						connectionState: 'connected',
					},
				} as never)
				.then((accepted) => {
					if (!accepted) return;
					announce(options.fogMode === 'reveal' ? 'Fog revealed.' : 'Fog concealed.');
					if (quickMapMode) editor.setTool('pan');
				});
		},
		[fogLayerId, editor, options.fogMode, options.fogFeather, announce, quickMapMode],
	);
	const handleMovePoi = useCallback(
		(poiId: string, position: Pt) =>
			void editor.run({
				type: 'map.update-poi',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, poiId, position },
			} as never),
		[editor],
	);
	const handleMoveToken = useCallback(
		(tokenId: string, position: Pt) =>
			void editor.run({
				type: 'map.move-token',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, tokenId, position },
			} as never),
		[editor],
	);
	const handleUpdatePoiVis = useCallback(
		(poiId: string, v: string) =>
			void editor.run({
				type: 'map.update-poi',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, poiId, visibility: dsToVis(v) as SceneVisibility },
			} as never),
		[editor],
	);

	// measurement readout in real units
	const measureText = (() => {
		if (gesture?.kind !== 'measure') return null;
		const d = Math.hypot(gesture.cur.x - gesture.start.x, gesture.cur.y - gesture.start.y);
		const scale = editor.map?.scale;
		return scale
			? `${(d * scale.unitsPerMap).toFixed(1)} ${scale.unit}`
			: `${(d * 100).toFixed(1)}% of map`;
	})();

	const scaledStyle = {
		position: 'absolute' as const,
		inset: 0,
		transform: `scale(${zoom}) translate(${(0.5 - center.x) * 100}%, ${(0.5 - center.y) * 100}%)`,
		transformOrigin: 'center center',
		pointerEvents: 'none' as const,
	};

	return (
		<div
			ref={containerRef}
			role="application"
			// The human label, not the internal id — a screen reader used to announce
			// "Drawing tool: poi".
			aria-label={`Map canvas — ${editor.map?.name ?? 'map'}. Drawing tool: ${editor.toolLabel}.`}
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
				style={{ borderRadius: 0, border: 'none' }}
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
						readOnly={!editor.isDm}
						onClose={() => editor.clearSelection()}
						onVisibilityChange={(v: string) => handleUpdatePoiVis(poi.id, v)}
						onEdit={() => editor.setDock('inspector')}
						onFocus={() => editor.setDock('inspector')}
					/>
				)}
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
							style={{
								position: 'absolute',
								left: `${hoverPt.x * 100}%`,
								top: `${hoverPt.y * 100}%`,
								width: `${(options.brushSize / 1000) * 200}%`,
								height: `${(options.brushSize / 1000) * 200}%`,
								transform: 'translate(-50%,-50%)',
								borderRadius: '50%',
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
						gap: 8,
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
							borderRadius: 12,
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

const BRUSH_MIN = 5;
const BRUSH_MAX = 200;
const BRUSH_STEP = 5;
/** Pixels of drag per unit of brush size — a full-height drag covers the whole range on a phone. */
const BRUSH_PX_PER_UNIT = 2.4;

/**
 * RC-MAP-4.3 — the fog brush's size, as a thing you drag. Vertical because the fog tool's own
 * gesture is horizontal-ish and a phone has more height than width to spare. It is a real
 * `role="slider"`, so the arrow keys, Home and End reach the identical values without a pointer.
 */
function FogBrushHandle({
	size,
	label,
	onChange,
}: {
	size: number;
	label: string;
	onChange: (value: number) => void;
}) {
	const drag = useRef<{ pointerId: number; y: number; size: number } | null>(null);
	const set = (value: number) =>
		onChange(Math.round(Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, value))));
	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={label}
			aria-valuemin={BRUSH_MIN}
			aria-valuemax={BRUSH_MAX}
			aria-valuenow={size}
			aria-orientation="vertical"
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = { pointerId: event.pointerId, y: event.clientY, size };
				event.stopPropagation();
			}}
			onPointerMove={(event) => {
				const active = drag.current;
				if (!active || active.pointerId !== event.pointerId) return;
				// Up is bigger: the handle grows towards the ring it is sizing.
				set(active.size + (active.y - event.clientY) / BRUSH_PX_PER_UNIT);
				event.stopPropagation();
			}}
			onPointerUp={(event) => {
				drag.current = null;
				event.stopPropagation();
			}}
			onPointerCancel={() => {
				drag.current = null;
			}}
			onKeyDown={(event) => {
				const step =
					event.key === 'ArrowUp' || event.key === 'ArrowRight'
						? BRUSH_STEP
						: event.key === 'ArrowDown' || event.key === 'ArrowLeft'
							? -BRUSH_STEP
							: 0;
				if (step !== 0) {
					event.preventDefault();
					set(size + step);
				} else if (event.key === 'Home') {
					event.preventDefault();
					set(BRUSH_MIN);
				} else if (event.key === 'End') {
					event.preventDefault();
					set(BRUSH_MAX);
				}
			}}
			style={{
				pointerEvents: 'auto',
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 48,
				height: 48,
				borderRadius: 24,
				border: `1px solid ${T.accBd}`,
				background: T.surf,
				color: T.acc,
				font: `700 12px ${T.sans}`,
				touchAction: 'none',
				cursor: 'ns-resize',
			}}
		>
			{size}
		</div>
	);
}
