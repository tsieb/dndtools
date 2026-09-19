import { useEffect, useMemo, type RefObject } from 'react';

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
