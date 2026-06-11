/**
 * Multi-touch canvas gestures (UX-CANVAS-016): two-finger pinch-to-zoom and two-finger pan resolved as
 * pure transforms over a {@link Viewport}. Every gesture here has a non-gesture alternative wired in the
 * `CanvasViewport` (zoom +/− buttons, the zoom input, arrow-key pan, the minimap, the scroll wheel), so
 * no viewport action is gesture-only (UX-CANVAS-016 mapping table; WCAG 2.2 §2.5.1 / §2.5.7).
 *
 * Pinch anchors at the midpoint of the two touch points (UX-CANVAS-001 §Pinch anchor), and the same
 * frame also applies the midpoint translation, so a combined pinch-and-drag feels natural. Pointer
 * cancellation (WCAG 2.5.2) is reused from the shared a11y drag-alternative so a release away from the
 * start target cancels with no commit. Pan inertia is a pure ease-out-cubic decay; the caller disables
 * it under reduced motion (UX-CANVAS-001 §Pan inertia).
 */

import { panByScreen, zoomByFactor, type Vec2, type Viewport } from './viewport';
import { shouldCommitPointer } from '../gui/a11y/drag-alternative';

export { shouldCommitPointer };

export interface TouchPointInput {
	x: number;
	y: number;
}

/** Midpoint of two touch points (the pinch/zoom anchor). */
export function midpoint(a: TouchPointInput, b: TouchPointInput): Vec2 {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Euclidean distance between two touch points (the pinch spread). */
export function distance(a: TouchPointInput, b: TouchPointInput): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A sampled pinch frame: the two-finger midpoint and spread. */
export interface PinchSample {
	mid: Vec2;
	dist: number;
}

export function pinchSample(a: TouchPointInput, b: TouchPointInput): PinchSample {
	return { mid: midpoint(a, b), dist: distance(a, b) };
}

/**
 * Resolve one pinch frame: zoom by the spread ratio anchored at the new midpoint, then pan by the
 * midpoint delta (combined pinch + two-finger pan). A zero previous spread is treated as no zoom so the
 * first frame only establishes the baseline.
 */
export function resolvePinch(v: Viewport, prev: PinchSample, next: PinchSample): Viewport {
	const factor = prev.dist > 0 ? next.dist / prev.dist : 1;
	const zoomed = zoomByFactor(v, factor, next.mid);
	return panByScreen(zoomed, next.mid.x - prev.mid.x, next.mid.y - prev.mid.y);
}

/** Pan inertia duration (UX-CANVAS-001 §Pan inertia): momentum decays over 400 ms, ease-out cubic. */
export const INERTIA_DURATION_MS = 400;

/** Ease-out cubic on a clamped 0..1 progress. */
export function easeOutCubic(u: number): number {
	const c = 1 - Math.min(1, Math.max(0, u));
	return 1 - c * c * c;
}

/**
 * Total displacement (px) a flick of `velocity` (px/ms) carries under the ease-out decay. The average
 * velocity over an ease-out cubic flick is half the launch velocity, so displacement = v · duration / 2.
 */
export function inertiaDisplacement(velocity: number, duration = INERTIA_DURATION_MS): number {
	return (velocity * duration) / 2;
}

/** The offset from the flick origin at `elapsedMs` into the inertia animation. */
export function inertiaOffsetAt(velocity: number, elapsedMs: number, duration = INERTIA_DURATION_MS): number {
	return inertiaDisplacement(velocity, duration) * easeOutCubic(elapsedMs / duration);
}
