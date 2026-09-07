import {
	useEffect,
	useRef,
	useState,
	type RefObject,
	type PointerEvent as ReactPointerEvent,
} from 'react';
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
import { useI18n } from '../../../i18n';
import type { MapEditorApi } from '../useMapEditor';

type Pt = { x: number; y: number };

/**
 * RC-MAP-4.3 — the editor canvas's touch gesture model, split out of `EditorCanvas` by
 * responsibility (RC-STB-2.7): pinch-to-zoom, momentum after a released pan, double-tap zoom and
 * the long-press that opens the context menu. Everything here writes VIEWPORT state only
 * (`setZoom` / `setCenter`), never a command, so nothing is undoable and nothing reaches a player.
 * The three capture handlers are the ONLY pinch-to-zoom in the editor; the container sets
 * `touch-action: none`, so the browser's native pinch is suppressed as well.
 */
export function useTouchNavigation({
	containerRef,
	zoomRef,
	centerRef,
	editor,
	tool,
	trackHover,
	toMap,
	announce,
	onHover,
	onPinchStart,
	onLongPress,
}: {
	containerRef: RefObject<HTMLDivElement | null>;
	zoomRef: { current: number };
	centerRef: { current: Pt };
	editor: Pick<MapEditorApi, 'isDm' | 'setZoom' | 'setCenter'>;
	tool: MapEditorApi['tool'];
	/** Whether the capture-phase move should report a hover point (the fog brush's size ring). */
	trackHover: boolean;
	toMap: (clientX: number, clientY: number) => Pt;
	announce: (message: string) => void;
	onHover: (p: Pt) => void;
	/** A second finger cancels any in-progress single-pointer drawing gesture. */
	onPinchStart: () => void;
	onLongPress: (menu: { touch: boolean; anchorPx: Pt; mapPt: Pt }) => void;
}) {
	const { t } = useI18n();
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

	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
	const cancelLongPress = () => {
		if (longPressTimer.current !== null) clearTimeout(longPressTimer.current);
		longPressTimer.current = null;
		longPressStart.current = null;
	};

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
		onPinchStart();
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
			onLongPress({
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
		if (trackHover) {
			onHover(toMap(event.clientX, event.clientY));
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

	useEffect(() => {
		return () => {
			cancelLongPress();
			stopInertia();
		};
		// cancelLongPress and stopInertia only touch refs; they never go stale.
	}, []);

	return {
		pinching,
		navigationEpoch,
		stopInertia,
		onTouchDownCapture,
		onTouchMoveCapture,
		endTouchCapture,
	};
}
