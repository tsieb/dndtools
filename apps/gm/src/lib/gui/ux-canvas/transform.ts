/**
 * Widget transform math (UX-CANVAS-003 move/resize, UX-CANVAS-004 rotation). Pure geometry shared by
 * the keyboard path, the numeric properties panel, and the pointer-drag handles, so a nudge, a typed
 * value, and a drag all resolve to the IDENTICAL layout (the single-command guarantee from
 * `drag-alternative`). No DOM, no `$state` — unit-tested directly.
 */

import type { Rect, Bounds } from '$lib/canvas-runtime/viewport';

/** Minimum widget extent (UX-CANVAS-003 §Minimum widget size: 120×80 CSS px, enforced). */
export const MIN_WIDGET_W = 120;
export const MIN_WIDGET_H = 80;

/** Keyboard move steps (UX-CANVAS-003 §Move by keyboard / UX-CANVAS-015 arrow map). */
export const MOVE_STEP = 1; // Arrow
export const MOVE_STEP_NUDGE = 8; // Shift+Arrow
export const MOVE_STEP_LARGE = 32; // Ctrl/Cmd+Shift+Arrow

/** Keyboard resize steps (UX-CANVAS-003 §Resize by keyboard). */
export const RESIZE_STEP = 8; // Arrow on a resize handle
export const RESIZE_STEP_LARGE = 32; // Shift+Arrow

/** Off-canvas guard (UX-CANVAS-003 §Off-canvas prevention). */
export const OFF_CANVAS_MARGIN = 200;
export const OFF_CANVAS_INSET = 20;

export interface Size {
	w: number;
	h: number;
}

export interface Vec2 {
	x: number;
	y: number;
}

/** Clamp a size to the enforced minimum widget extent. */
export function clampSize(size: Size): Size {
	return { w: Math.max(MIN_WIDGET_W, size.w), h: Math.max(MIN_WIDGET_H, size.h) };
}

/**
 * Resize keeping the original aspect ratio when `lock` is set (Shift+drag on a corner handle, or the
 * panel's aspect-lock toggle). The driving axis is the one whose proposed delta is larger, so the gesture
 * feels natural; the other axis follows the ratio. Always clamped to the minimum widget extent.
 */
export function aspectResize(original: Size, proposed: Size, lock: boolean): Size {
	if (!lock || original.w <= 0 || original.h <= 0) return clampSize(proposed);
	const ratio = original.w / original.h;
	const dw = Math.abs(proposed.w - original.w);
	const dh = Math.abs(proposed.h - original.h);
	let w: number;
	let h: number;
	if (dw >= dh) {
		w = proposed.w;
		h = proposed.w / ratio;
	} else {
		h = proposed.h;
		w = proposed.h * ratio;
	}
	return clampSize({ w, h });
}

/**
 * Off-canvas prevention (UX-CANVAS-003 AC4): if a widget's bounding box would sit entirely outside the
 * visible world rect by more than {@link OFF_CANVAS_MARGIN}, snap it back to {@link OFF_CANVAS_INSET}
 * inside the nearest viewport edge so the user never loses a widget off-screen. Returns the corrected
 * top-left position.
 */
export function offCanvasCorrect(rect: Rect, visible: Bounds): Vec2 {
	let { x, y } = rect;
	// Horizontal: widget fully past the right edge, or fully past the left edge.
	if (x > visible.maxX + OFF_CANVAS_MARGIN) {
		x = visible.maxX - OFF_CANVAS_INSET - rect.w;
	} else if (x + rect.w < visible.minX - OFF_CANVAS_MARGIN) {
		x = visible.minX + OFF_CANVAS_INSET;
	}
	if (y > visible.maxY + OFF_CANVAS_MARGIN) {
		y = visible.maxY - OFF_CANVAS_INSET - rect.h;
	} else if (y + rect.h < visible.minY - OFF_CANVAS_MARGIN) {
		y = visible.minY + OFF_CANVAS_INSET;
	}
	return { x, y };
}

// --- Rotation (UX-CANVAS-004) ----------------------------------------------------------------------

/** Default rotation snap increment (UX-CANVAS-004: 15°; Shift = free 1° rotation). */
export const ROTATION_SNAP = 15;

/** Normalise any angle into the [0, 360) range. */
export function normalizeAngle(deg: number): number {
	if (!Number.isFinite(deg)) return 0;
	const mod = deg % 360;
	return mod < 0 ? mod + 360 : mod;
}

/**
 * Snap a rotation to the nearest {@link ROTATION_SNAP} increment, or — when `free` (Shift held) — to the
 * nearest whole degree (1° precision). Result is normalised into [0, 360).
 */
export function snapRotation(deg: number, free = false): number {
	const step = free ? 1 : ROTATION_SNAP;
	return normalizeAngle(Math.round(deg / step) * step);
}

/** The angle (degrees) of the pointer relative to a widget's centre, used by the rotation handle. */
export function angleFromCenter(center: Vec2, point: Vec2): number {
	// 0° points up (toward the rotation handle above the widget); clockwise positive.
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}
