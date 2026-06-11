/**
 * Canvas viewport math (UX-CANVAS-001): the pure pan/zoom model shared by every spatial surface —
 * Command Center, Scenes, maps, and player views all consume the SAME viewport so the foundational
 * canvas runtime is built once, not per surface (doc 16 §6.3; canvas-renderer decision: interim
 * DOM/CSS baseline behind a renderer-abstraction boundary, `docs/planning/v2/ux/architecture-decisions.md`
 * §4).
 *
 * Coordinate model — a single affine transform:
 *   screen = world * scale + translate
 * so `{ tx, ty, scale }` fully describes pan (translate) + zoom (scale). World coordinates are the
 * durable widget layout space; screen coordinates are CSS px inside the viewport element. Every helper
 * is PURE (no DOM), so the Svelte `CanvasViewport` maps an input event to a new `Viewport` and the math
 * is unit-tested in isolation. Cursor/pinch-anchored zoom keeps the world point under the anchor fixed
 * (the Figma model — eliminates disorientation, UX-CANVAS-001 spec / research §3.1).
 *
 * The arrow-key → pan mapping reuses the shared `arrowDirection` matcher from the a11y canvas-keyboard
 * helper rather than re-deriving key handling (UX-A11Y reuse mandate), so the viewport keyboard path
 * stays consistent with the spatial-navigation engine.
 */

import { arrowDirection } from '../gui/a11y/canvas-keyboard';

export interface Viewport {
	/** Horizontal translate (screen px). */
	tx: number;
	/** Vertical translate (screen px). */
	ty: number;
	/** Zoom scale (world→screen multiplier). */
	scale: number;
}

export interface Vec2 {
	x: number;
	y: number;
}

export interface Size {
	w: number;
	h: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Useful working range (UX-CANVAS-001 spec): 5% overview → 800% detail. */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;

/** Discrete snap stops the +/− controls and the zoom-preset menu step through (UX-CANVAS-001 spec). */
export const ZOOM_STOPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** Padding (screen px) left around content on zoom-to-fit / zoom-to-selection (UX-CANVAS-001 spec). */
export const ZOOM_FIT_PADDING = 48;

/** Arrow-key pan step (UX-CANVAS-001/015): 32 px per press; 128 px with Shift. */
export const PAN_STEP = 32;
export const PAN_STEP_LARGE = 128;

export const IDENTITY_VIEWPORT: Viewport = { tx: 0, ty: 0, scale: 1 };

/** Clamp a scale into the supported zoom range; non-finite input collapses to 100%. */
export function clampZoom(scale: number): number {
	if (!Number.isFinite(scale)) return 1;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** Current zoom as an integer percentage (UX-CANVAS-001 zoom indicator). */
export function zoomPercent(scale: number): number {
	return Math.round(scale * 100);
}

export function worldToScreen(v: Viewport, x: number, y: number): Vec2 {
	return { x: x * v.scale + v.tx, y: y * v.scale + v.ty };
}

export function screenToWorld(v: Viewport, x: number, y: number): Vec2 {
	return { x: (x - v.tx) / v.scale, y: (y - v.ty) / v.scale };
}

/**
 * Zoom to an absolute scale anchored at a screen point: the world point currently under the anchor
 * stays under the anchor after the zoom (cursor/pinch-anchored zoom; UX-CANVAS-001 AC1/AC2).
 */
export function zoomToScale(v: Viewport, scale: number, anchor: Vec2): Viewport {
	const s = clampZoom(scale);
	const world = screenToWorld(v, anchor.x, anchor.y);
	return { scale: s, tx: anchor.x - world.x * s, ty: anchor.y - world.y * s };
}

/** Multiply the current scale by `factor` (wheel / pinch), anchored at a screen point. */
export function zoomByFactor(v: Viewport, factor: number, anchor: Vec2): Viewport {
	return zoomToScale(v, v.scale * factor, anchor);
}

/** The next discrete snap stop strictly above the current scale, clamped to the max. */
export function nextZoomStop(scale: number): number {
	for (const stop of ZOOM_STOPS) {
		if (stop > scale + 1e-6) return clampZoom(stop);
	}
	return ZOOM_MAX;
}

/** The previous discrete snap stop strictly below the current scale, clamped to the min. */
export function prevZoomStop(scale: number): number {
	for (let i = ZOOM_STOPS.length - 1; i >= 0; i -= 1) {
		const stop = ZOOM_STOPS[i];
		if (stop !== undefined && stop < scale - 1e-6) return clampZoom(stop);
	}
	return ZOOM_MIN;
}

/** Translate the viewport by a screen-space delta (pan). */
export function panByScreen(v: Viewport, dx: number, dy: number): Viewport {
	return { ...v, tx: v.tx + dx, ty: v.ty + dy };
}

/** Pan so a world point sits at the viewport centre, keeping the current scale (minimap navigation). */
export function centerOnWorld(point: Vec2, size: Size, scale: number): Viewport {
	const s = clampZoom(scale);
	return { scale: s, tx: size.w / 2 - point.x * s, ty: size.h / 2 - point.y * s };
}

/** Union bounding box of a set of world-space rects, or `null` when the set is empty. */
export function unionBounds(rects: readonly Rect[]): Bounds | null {
	if (rects.length === 0) return null;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const r of rects) {
		minX = Math.min(minX, r.x);
		minY = Math.min(minY, r.y);
		maxX = Math.max(maxX, r.x + r.w);
		maxY = Math.max(maxY, r.y + r.h);
	}
	return { minX, minY, maxX, maxY };
}

/**
 * Fit a content bounding box into the viewport with uniform padding (zoom-to-fit, UX-CANVAS-001). An
 * empty box or a degenerate viewport resets to 100% centred on the origin so the surface is never blank.
 */
export function fitBounds(bounds: Bounds | null, size: Size, padding = ZOOM_FIT_PADDING): Viewport {
	if (!bounds || size.w <= 0 || size.h <= 0) {
		return { ...IDENTITY_VIEWPORT };
	}
	const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
	const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
	const availW = Math.max(1, size.w - 2 * padding);
	const availH = Math.max(1, size.h - 2 * padding);
	const scale = clampZoom(Math.min(availW / bw, availH / bh));
	const cx = (bounds.minX + bounds.maxX) / 2;
	const cy = (bounds.minY + bounds.maxY) / 2;
	return { scale, tx: size.w / 2 - cx * scale, ty: size.h / 2 - cy * scale };
}

/** The world-space rectangle currently visible in the viewport (used for virtualization + minimap). */
export function visibleWorldRect(v: Viewport, size: Size): Bounds {
	const tl = screenToWorld(v, 0, 0);
	const br = screenToWorld(v, size.w, size.h);
	return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
}

export type ViewportKeyAction =
	| { kind: 'pan'; dx: number; dy: number }
	| { kind: 'zoom-in' }
	| { kind: 'zoom-out' }
	| { kind: 'zoom-fit' }
	| { kind: 'zoom-selection' }
	| { kind: 'zoom-to'; scale: number };

/**
 * Resolve a keyboard event over the canvas into a viewport action, or `null` for an unrelated key
 * (UX-CANVAS-001 §Input, UX-CANVAS-015 shortcut table). Arrow keys pan (Shift = large step); `+`/`−`
 * step one zoom stop; `0` zoom-to-fit; `Shift+0` zoom-to-selection; `1` = 100%, `2` = 200%, `5` = 50%.
 *
 * Arrow direction is matched through the shared a11y `arrowDirection` helper. Pan deltas are screen
 * translate deltas: pressing Right reveals content to the right (the viewport moves right ⇒ translate
 * decreases), so the same convention a sighted scroll would produce.
 */
export function resolveViewportKey(key: string, shiftKey: boolean): ViewportKeyAction | null {
	const dir = arrowDirection(key);
	if (dir) {
		const step = shiftKey ? PAN_STEP_LARGE : PAN_STEP;
		switch (dir) {
			case 'right':
				return { kind: 'pan', dx: -step, dy: 0 };
			case 'left':
				return { kind: 'pan', dx: step, dy: 0 };
			case 'down':
				return { kind: 'pan', dx: 0, dy: -step };
			case 'up':
				return { kind: 'pan', dx: 0, dy: step };
		}
	}
	switch (key) {
		case '+':
		case '=':
		case 'Add':
			return { kind: 'zoom-in' };
		case '-':
		case '_':
		case 'Subtract':
			return { kind: 'zoom-out' };
		case '0':
			return shiftKey ? { kind: 'zoom-selection' } : { kind: 'zoom-fit' };
		case ')':
			// Shift+0 reports ')' on US layouts — treat it as zoom-to-selection.
			return { kind: 'zoom-selection' };
		case '1':
			return { kind: 'zoom-to', scale: 1 };
		case '2':
			return { kind: 'zoom-to', scale: 2 };
		case '5':
			return { kind: 'zoom-to', scale: 0.5 };
		default:
			return null;
	}
}

/** Polite live-region text spoken on a debounced zoom change (UX-CANVAS-001 accessibility). */
export function zoomAnnouncement(scale: number): string {
	return `Zoom ${zoomPercent(scale)} percent.`;
}
