import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MapFeature, MapFogRegion, MapLayer, SceneVisibility } from '@dndtools/core';
import { IconButton, Minimap, POIPopover } from '../../../ds';
import { T } from '../../screen-kit';
import {
	CATEGORY_VAR,
	FeatureShape,
	MapCanvas,
	POI_MARKER_CAT,
	dsToVis,
	visToDs,
	type MapTool,
} from '../../MapBuilder';
import { clamp01 } from '../mapVocab';
import { viewportForPinch } from '../quickMap';
import { TOOLS_BY_ID } from '../tools';
import { categoryForTool } from '../useMapEditor';
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
	// Remount MapCanvas when a second finger cancels one of its in-progress single-pointer gestures.
	const [navigationEpoch, setNavigationEpoch] = useState(0);

	const isDrawing = DRAWING_TOOLS.has(tool);

	const localTouchPoint = (clientX: number, clientY: number): Pt => {
		const rect = containerRef.current?.getBoundingClientRect();
		return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
	};
	const firstTwoTouches = (): [Pt, Pt] | null => {
		const points = [...touchPointers.current.values()];
		return points.length >= 2 ? [points[0]!, points[1]!] : null;
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
	const onTouchDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== 'touch') return;
		touchPointers.current.set(event.pointerId, localTouchPoint(event.clientX, event.clientY));
		if (touchPointers.current.size >= 2) {
			beginPinch(event.currentTarget);
			event.preventDefault();
			event.stopPropagation();
		}
	};
	const onTouchMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== 'touch') return;
		if (touchPointers.current.has(event.pointerId)) {
			touchPointers.current.set(event.pointerId, localTouchPoint(event.clientX, event.clientY));
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
		const blocked = touchNavigationBlocked.current;
		touchPointers.current.delete(event.pointerId);
		if (touchPointers.current.size < 2) pinchRef.current = null;
		if (touchPointers.current.size === 0) {
			touchNavigationBlocked.current = false;
			setPinching(false);
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
			void editor
				.run({
					type: 'map.create-route',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						id: editor.nextId('route'),
						layerId: activeId,
						label: 'Route',
						visibility: options.newVisibility,
						waypoints: pts.map((p) => ({ id: editor.nextId('wp'), position: { x: p.x, y: p.y } })),
					},
				} as never)
				.then((accepted) => {
					if (accepted) announce('Route added.');
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
				[mkFeature('prop', [snap(raw)], options.stampAsset, { scale: 1 })],
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
			aria-label={`Map canvas — ${editor.map?.name ?? 'map'}. Drawing tool: ${TOOLS_BY_ID.get(tool)?.label ?? tool}.`}
			onPointerDownCapture={onTouchDownCapture}
			onPointerMoveCapture={onTouchMoveCapture}
			onPointerUpCapture={endTouchCapture}
			onPointerCancelCapture={endTouchCapture}
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

			{/* brush cursor ring */}
			{(tool === 'brush' || tool === 'erase') && hoverPt && (
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

			{/* HUD: zoom cluster + minimap + measurement readout (above the drawing overlay) */}
			<div
				style={{
					position: 'absolute',
					right: 16,
					// Clears the Minimap below it. That box is `width={160}` at the default 1.4 aspect, so
					// its body is ~114px plus a ~24px header ≈ 138, and it sits at `bottom: 16` — i.e. its
					// top edge is 154px up. The old 150 put the zoom cluster's "100%" readout UNDER the
					// minimap's header on every desktop profile.
					bottom: quickMapMode ? 16 : 170,
					display: 'flex',
					flexDirection: 'column',
					gap: 6,
					zIndex: 6,
				}}
			>
				<IconButton
					icon="zoom-in"
					label="Zoom in"
					variant="outline"
					size="sm"
					onClick={() => editor.setZoom(Math.min(6, +(zoom + 0.2).toFixed(2)))}
				/>
				<IconButton
					icon="zoom-out"
					label="Zoom out"
					variant="outline"
					size="sm"
					onClick={() => editor.setZoom(Math.max(0.4, +(zoom - 0.2).toFixed(2)))}
				/>
				<IconButton
					icon="zoom-fit"
					label="Fit"
					variant="outline"
					size="sm"
					onClick={() => {
						editor.setZoom(1);
						editor.setCenter({ x: 0.5, y: 0.5 });
					}}
				/>
				<span
					style={{
						textAlign: 'center',
						padding: '2px 0',
						borderRadius: 7,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)',
						font: `10.5px ${T.mono}`,
						color: T.ink,
					}}
				>
					{Math.round(zoom * 100)}%
				</span>
			</div>
			{!quickMapMode && (
				<div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6 }}>
					<Minimap
						viewport={{
							x: clamp01(center.x - 0.5 / zoom),
							y: clamp01(center.y - 0.5 / zoom),
							w: Math.min(1, 1 / zoom),
							h: Math.min(1, 1 / zoom),
						}}
						onJump={(p: Pt) => editor.setCenter({ x: clamp01(p.x), y: clamp01(p.y) })}
						width={160}
					/>
				</div>
			)}
			{measureText && (
				<div
					style={{
						position: 'absolute',
						left: '50%',
						top: 14,
						transform: 'translateX(-50%)',
						zIndex: 6,
						padding: '5px 12px',
						borderRadius: 8,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)',
						border: `1px solid ${T.accBd}`,
						font: `600 12.5px ${T.mono}`,
						color: T.acc,
					}}
				>
					{measureText}
				</div>
			)}
			{PATH_TOOLS.has(tool) && (
				<div
					style={{
						position: 'absolute',
						left: 14,
						bottom: 16,
						zIndex: 6,
						padding: '5px 11px',
						borderRadius: 8,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)',
						border: `1px solid ${T.bd}`,
						font: `11.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					Click to add points · Enter or double-click finishes · Esc cancels
				</div>
			)}
		</div>
	);
}
