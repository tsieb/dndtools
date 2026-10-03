import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type RefObject,
} from 'react';
import { omitKey, ZOOM_KEY, type ZoomPreset } from '../SceneBoardModel';

/** Metadata order is authoritative; ignore stale/duplicate ids and include newly mounted tiles. */
export function readingOrder(ids: readonly string[], metadata: readonly string[] = []): string[] {
	const present = new Set(ids);
	return [...new Set([...metadata.filter((id) => present.has(id)), ...ids])];
}

export interface SpatialTile {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Nearest centre in the requested half-plane. Metadata order breaks equal-distance ties. */
export function spatialNeighbour(
	tiles: readonly SpatialTile[],
	id: string,
	delta: readonly [number, number],
): string | undefined {
	const origin = tiles.find((tile) => tile.id === id);
	if (!origin) return;
	let distance = Infinity;
	let next: string | undefined;
	for (const tile of tiles) {
		if (tile.id === id) continue;
		const dx = tile.x + tile.w / 2 - (origin.x + origin.w / 2);
		const dy = tile.y + tile.h / 2 - (origin.y + origin.h / 2);
		if (dx * delta[0] + dy * delta[1] <= 0) continue;
		const squared = dx * dx + dy * dy;
		if (squared < distance) {
			distance = squared;
			next = tile.id;
		}
	}
	return next;
}

/** Both canvas hosts already expose the gallery through the same translated Add toggle.
 * Activate that control so panel state, focus return and mutual exclusion stay host-owned. */
export function openGallery(canvas: HTMLElement, label: string): void {
	const screen = canvas.closest('main') ?? canvas.closest('[role="main"]');
	const trigger = [
		...(screen?.querySelectorAll<HTMLButtonElement>('button[aria-expanded]') ?? []),
	].find((button) => (button.getAttribute('aria-label') ?? button.textContent)?.trim() === label);
	if (!trigger || trigger.disabled) return;
	trigger.focus();
	if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
}

/** Frames in metadata reading order. When the focused frame is removed and focus fell to the
 * body, hand it to the first surviving frame, else to the (then empty) canvas. */
export function useReadingOrder<T extends SpatialTile>(
	widgets: readonly T[],
	focusOrder: readonly string[] | undefined,
	focusedId: string | null,
	frameRefs: { readonly current: ReadonlyMap<string, HTMLElement> },
	canvasRef: RefObject<HTMLElement | null>,
): T[] {
	const { orderIds, orderedWidgets } = useMemo(() => {
		const byId = new Map(widgets.map((w) => [w.id, w]));
		const orderIds = readingOrder([...byId.keys()], focusOrder);
		return { orderIds, orderedWidgets: orderIds.map((id) => byId.get(id)!) };
	}, [widgets, focusOrder]);
	useEffect(() => {
		if (focusedId && !orderIds.includes(focusedId) && document.activeElement === document.body) {
			(frameRefs.current.get(orderIds[0]) ?? canvasRef.current)?.focus();
		}
	}, [focusedId, orderIds, frameRefs, canvasRef]);
	return orderedWidgets;
}

interface FrameKeyEvent {
	key: string;
	target: EventTarget;
	currentTarget: EventTarget;
	defaultPrevented: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
}

/** How a frame should treat a keydown: `leave` = Escape back to the frame from the frame itself
 * or from inside its content; `frame` = a canvas key on the frame or its content region; `null` =
 * the key belongs to one of the tile's own controls (or carries a modifier). */
export function frameKey(e: FrameKeyEvent): 'leave' | 'frame' | null {
	const target = e.target as HTMLElement;
	const onFrame = target === e.currentTarget || target.hasAttribute('data-tile-content');
	if (
		e.key === 'Escape' &&
		!e.defaultPrevented &&
		(onFrame || target.closest('[data-tile-content]'))
	)
		return 'leave';
	if (!onFrame || e.ctrlKey || e.metaKey || e.altKey) return null;
	return 'frame';
}

const CONTENT_CONTROL =
	'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Enter moves focus into the tile: its first control, else the named content region. */
export function enterTileContent(frame: HTMLElement): void {
	const content = frame.querySelector<HTMLElement>('[data-tile-content]');
	(content?.querySelector<HTMLElement>(CONTENT_CONTROL) ?? content)?.focus();
}

/** Leave content keys with the widget, but let panel buttons reach the canvas undo history. */
export function isTileContentKey(e: KeyboardEvent): boolean {
	const target = e.target as HTMLElement | null;
	const historyShortcut =
		(e.ctrlKey || e.metaKey) && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase());
	return (
		!!target?.closest('[data-tile-content]') &&
		!target.hasAttribute('data-tile-content') &&
		!historyShortcut
	);
}

/** A canvas key that needs no tile: a named zoom step, a step through them, undo or redo. */
export type CanvasKey =
	| { kind: 'zoom'; preset: ZoomPreset }
	| { kind: 'step'; by: 1 | -1 }
	| { kind: 'undo' }
	| { kind: 'redo' };

export function canvasKey(e: {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}): CanvasKey | null {
	if (!e.ctrlKey && !e.metaKey && !e.altKey) {
		const preset = ZOOM_KEY[e.key];
		if (preset) return { kind: 'zoom', preset };
		if (e.key === '+' || e.key === '=') return { kind: 'step', by: 1 };
		if (e.key === '-' || e.key === '_') return { kind: 'step', by: -1 };
		return null;
	}
	if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
	const key = e.key.toLowerCase();
	if (key === 'z') return { kind: e.shiftKey ? 'redo' : 'undo' };
	return key === 'y' ? { kind: 'redo' } : null;
}

type Nudged = Partial<Omit<SpatialTile, 'id'>>;

/**
 * RC-CAN-8.1 — where a keyboard-nudged tile is HEADED while its commit is still queued. The runtime
 * applies commands one at a time and re-renders after each persist, so a second arrow press inside
 * that window read the old layout and committed the same target again: three presses moved the tile
 * one step, and Ctrl+Z reversed a step that changed nothing on screen. Never painted; each entry
 * drops once its commit settles, and the next press reads the layout the board received.
 */
export function useNudges() {
	const pending = useRef<Record<string, Nudged & { seq: number }>>({});
	const seq = useRef(0);
	return useMemo(
		() => ({
			pending: (id: string): Nudged | undefined => pending.current[id],
			nudge(id: string, to: Nudged, commit: Promise<unknown>) {
				const mine = ++seq.current;
				pending.current[id] = { ...pending.current[id], ...to, seq: mine };
				void commit.finally(() => {
					if (pending.current[id]?.seq === mine) delete pending.current[id];
				});
			},
		}),
		[],
	);
}

/**
 * RC-CAN-8.1 — the DRAG OVERLAY: where a tile under the pointer is painted while the gesture is
 * live. It is never a second source of truth. The canvas clears each entry once its commit settles
 * (accepted, clamped or refused alike), and every entry goes on any undo/redo (`historySeq`), so a
 * frame always comes back to the layout the board receives. Before this, a drop the board clamped
 * never matched the committed layout, so the draft outlived the commit and an Undo rewound the
 * state while the frame stayed where it was dropped.
 */
export function useDragOverlay(historySeq: number | undefined, dragging: () => boolean) {
	const [posDraft, setPosDraft] = useState<Record<string, { x: number; y: number }>>({});
	const [sizeDraft, setSizeDraft] = useState<Record<string, { w: number; h: number }>>({});
	const posDraftRef = useRef(posDraft);
	const sizeDraftRef = useRef(sizeDraft);
	posDraftRef.current = posDraft;
	sizeDraftRef.current = sizeDraft;
	const clearDrafts = useCallback((ids: readonly string[]) => {
		setPosDraft((prev) => ids.reduce((acc, id) => omitKey(acc, id), prev));
		setSizeDraft((prev) => ids.reduce((acc, id) => omitKey(acc, id), prev));
	}, []);
	const draggingRef = useRef(dragging);
	draggingRef.current = dragging;
	useEffect(() => {
		if (historySeq === undefined || draggingRef.current()) return;
		setPosDraft((prev) => (Object.keys(prev).length ? {} : prev));
		setSizeDraft((prev) => (Object.keys(prev).length ? {} : prev));
	}, [historySeq]);
	// One stable handle, so pointer listeners can name it as a single dependency.
	const overlay = useMemo(
		() => ({
			setPos: setPosDraft,
			setSize: setSizeDraft,
			posRef: posDraftRef,
			sizeRef: sizeDraftRef,
			clear: clearDrafts,
		}),
		[clearDrafts],
	);
	return { posDraft, sizeDraft, overlay };
}
