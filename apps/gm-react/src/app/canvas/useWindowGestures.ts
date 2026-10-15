import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { fitWidgetSize, type BoardWidget } from '../board-helpers';
import { snapTo, type Drag, type View } from '../SceneBoardModel';
import { alignTo, boxFromPoints, dragGuides, type Box, type DragGuides } from './geometry';
import type { useDragOverlay } from './keyboard';
import type { OperationText } from './surfaceA11y';
import type { LayoutHistory } from './useLayoutHistory';

type Point = { x: number; y: number };

/** The canvas state a pointer gesture reads and writes, handed over as refs and setters. */
export interface WindowGestureContext {
	dragRef: MutableRefObject<Drag | null>;
	marqueeRef: MutableRefObject<(Point & { base: string[] }) | null>;
	groupDrag: MutableRefObject<Record<string, Point>>;
	resizeMoved: MutableRefObject<boolean>;
	boardPoint: MutableRefObject<(e: { clientX: number; clientY: number }) => Point>;
	marqueeEnd: MutableRefObject<(box: Box, base: string[]) => void>;
	wrapRef: MutableRefObject<HTMLDivElement | null>;
	historyRef: MutableRefObject<LayoutHistory | undefined>;
	overlay: ReturnType<typeof useDragOverlay>['overlay'];
	widgets: BoardWidget[];
	scale: number;
	snap: boolean;
	policy: 'bounded' | 'canvas';
	moveAll: (list: (Point & { id: string })[]) => Promise<void>;
	cycleSize: (w: BoardWidget) => Promise<unknown>;
	resizeWidget: (w: BoardWidget, width: number, height: number) => Promise<unknown>;
	announce: (text: string) => void;
	op: OperationText;
	setMarquee: Dispatch<SetStateAction<Box | null>>;
	setView: Dispatch<SetStateAction<View>>;
	setGuides: Dispatch<SetStateAction<(DragGuides & { id: string }) | null>>;
}

/** Capture a pointer that starts a canvas gesture, so its moves keep arriving off the tile. */
export function capturePointer(e: React.PointerEvent) {
	try {
		e.currentTarget.setPointerCapture(e.pointerId);
	} catch {
		/* a pointer that has already ended cannot be captured — the listeners still cover us */
	}
}

/**
 * RC-POL-1.2 — the canvas's window-level pointer listeners, out of `SceneBoardCanvas.tsx`. A gesture
 * the canvas started (move, resize, pan, scroll-pan or a marquee) is followed on the window, so it
 * survives the pointer leaving the tile; pointer-up commits it through the undo stack, and
 * pointer-cancel (a long-press opening the tile menu raises one) abandons it.
 */
export function useWindowGestures(c: WindowGestureContext) {
	const { scale, snap, policy, moveAll, overlay, widgets, cycleSize, resizeWidget, announce, op } =
		c;
	useEffect(() => {
		const move = (e: PointerEvent) => {
			const m = c.marqueeRef.current;
			if (m) return c.setMarquee(boxFromPoints(m, c.boardPoint.current(e)));
			const d = c.dragRef.current;
			if (!d) return;
			if (d.mode === 'pan') {
				c.setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.sx), ty: d.ty + (e.clientY - d.sy) }));
				return;
			}
			if (d.mode === 'scroll-pan') {
				const el = c.wrapRef.current;
				if (el) {
					el.scrollLeft = d.sl - (e.clientX - d.sx);
					el.scrollTop = d.st - (e.clientY - d.sy);
				}
				return;
			}
			const dx = (e.clientX - d.sx) / scale;
			const dy = (e.clientY - d.sy) / scale;
			if (d.mode === 'move') {
				const size = overlay.sizeRef.current[d.id] ??
					widgets.find((w) => w.id === d.id) ?? { w: 0, h: 0 };
				const still = widgets.filter((w) => w.id !== d.id && !(w.id in c.groupDrag.current));
				const free = { x: d.ox + dx, y: d.oy + dy, w: size.w, h: size.h };
				// RC-CAN-8.3 — with Snap on, a still tile's edge or centre within 6 screen px wins over
				// the grid, and the guides show what the tile now shares.
				const pull = snap ? alignTo(free, still, 6 / scale) : {};
				const x = Math.max(0, pull.x ?? snapTo(free.x, snap));
				const y = Math.max(0, pull.y ?? snapTo(free.y, snap));
				overlay.setPos((prev) => {
					const next = { ...prev, [d.id]: { x, y } };
					for (const [id, o] of Object.entries(c.groupDrag.current))
						next[id] = { x: Math.max(0, o.x + x - d.ox), y: Math.max(0, o.y + y - d.oy) };
					return next;
				});
				c.setGuides({ id: d.id, ...dragGuides({ ...free, x, y }, still) });
			} else {
				if (!c.resizeMoved.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
				c.resizeMoved.current = true;
				const widget = widgets.find((w) => w.id === d.id);
				if (!widget) return;
				const width = snapTo(d.ow + dx, snap);
				const next = fitWidgetSize(widget, width, snapTo(d.oh + dy, snap), policy === 'bounded');
				overlay.setSize((prev) => ({ ...prev, [d.id]: next }));
			}
		};
		const up = (e: PointerEvent) => {
			const d = c.dragRef.current;
			const m = c.marqueeRef.current;
			c.dragRef.current = null;
			c.marqueeRef.current = null;
			c.setGuides(null);
			document.body.style.userSelect = '';
			if (m) {
				c.setMarquee(null);
				c.marqueeEnd.current(boxFromPoints(m, c.boardPoint.current(e)), m.base);
			}
			if (!d) return;
			if (d.mode === 'move') {
				const ids = [d.id, ...Object.keys(c.groupDrag.current)];
				c.groupDrag.current = {};
				const drafts = overlay.posRef.current;
				const p = drafts[d.id];
				const list = ids.flatMap((id) => (drafts[id] ? [{ id, ...drafts[id] }] : []));
				// The overlay clears when the commit settles, so the frame lands on the committed
				// (possibly clamped) layout rather than on the pointer's drop point.
				const step = () => moveAll(list);
				if (p)
					void (c.historyRef.current?.oneStep(step) ?? step()).finally(() => overlay.clear(ids));
				const w = widgets.find((candidate) => candidate.id === d.id);
				if (p && w) announce(op.moved(w.title, p.x, p.y));
			} else if (d.mode === 'resize') {
				const s = overlay.sizeRef.current[d.id];
				const widget = widgets.find((w) => w.id === d.id);
				if (widget) {
					const commit = c.resizeMoved.current
						? s && resizeWidget(widget, s.w, s.h)
						: cycleSize(widget);
					void commit?.finally(() => overlay.clear([d.id]));
				}
			}
		};
		const cancel = () => {
			const d = c.dragRef.current;
			c.dragRef.current = null;
			c.marqueeRef.current = null;
			c.setMarquee(null);
			c.setGuides(null);
			document.body.style.userSelect = '';
			if (!d || d.mode === 'pan' || d.mode === 'scroll-pan') return;
			overlay.clear([d.id, ...Object.keys(c.groupDrag.current)]);
			c.groupDrag.current = {};
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
		};
		// The refs and setters in `c` are stable; the values below are what re-subscribes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scale, snap, policy, moveAll, overlay, widgets, cycleSize, resizeWidget, announce, op]);
}
