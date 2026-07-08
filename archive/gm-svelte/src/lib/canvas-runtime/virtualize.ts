/**
 * Canvas virtualization (UX-CANVAS-014 §Virtualization): a widget whose bounding box lies entirely
 * outside the current viewport plus a one-viewport bleed margin is not rendered. The bleed margin
 * prevents pop-in during a slow pan (Figma/Miro tile-culling model, research §3.8). Pure — no DOM —
 * so the cull is unit-tested and the same logic serves the DOM baseline today and any GPU backend
 * later (renderer-abstraction boundary, architecture-decisions §4).
 */

import { visibleWorldRect, type Bounds, type Rect, type Size, type Viewport } from './viewport';

export interface RectItem extends Rect {
	id: string;
}

/** Default bleed: render one extra viewport of content on every side (UX-CANVAS-014 spec). */
export const DEFAULT_BLEED_VIEWPORTS = 1;

/** Inflate a world-rect by a multiple of its own size on each side. */
export function inflateBounds(b: Bounds, bleedViewports: number): Bounds {
	const w = b.maxX - b.minX;
	const h = b.maxY - b.minY;
	return {
		minX: b.minX - w * bleedViewports,
		minY: b.minY - h * bleedViewports,
		maxX: b.maxX + w * bleedViewports,
		maxY: b.maxY + h * bleedViewports,
	};
}

/** Whether a world rect intersects a world bounds (touching edges count as visible). */
export function rectIntersectsBounds(r: Rect, b: Bounds): boolean {
	return r.x <= b.maxX && r.x + r.w >= b.minX && r.y <= b.maxY && r.y + r.h >= b.minY;
}

/**
 * The render region: the visible world rect inflated by the bleed margin. Exposed so a caller can
 * reason about (or test) the cull window independently of the items.
 */
export function renderRegion(
	v: Viewport,
	size: Size,
	bleedViewports: number = DEFAULT_BLEED_VIEWPORTS,
): Bounds {
	return inflateBounds(visibleWorldRect(v, size), bleedViewports);
}

/** Whether a single item is within the render region (visible viewport + bleed). */
export function isWithinViewport(
	item: Rect,
	v: Viewport,
	size: Size,
	bleedViewports: number = DEFAULT_BLEED_VIEWPORTS,
): boolean {
	return rectIntersectsBounds(item, renderRegion(v, size, bleedViewports));
}

/**
 * Cull a set of world-positioned items to those within the render region. The returned array
 * preserves input order so z-order / focus-order metadata downstream is unaffected.
 */
export function cullToViewport<T extends RectItem>(
	items: readonly T[],
	v: Viewport,
	size: Size,
	bleedViewports: number = DEFAULT_BLEED_VIEWPORTS,
): T[] {
	const region = renderRegion(v, size, bleedViewports);
	return items.filter((item) => rectIntersectsBounds(item, region));
}
