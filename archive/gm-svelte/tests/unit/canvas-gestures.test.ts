import { describe, expect, it } from 'vitest';
import {
	INERTIA_DURATION_MS,
	distance,
	easeOutCubic,
	inertiaDisplacement,
	inertiaOffsetAt,
	midpoint,
	pinchSample,
	resolvePinch,
	shouldCommitPointer,
} from '../../src/lib/canvas-runtime/gestures';
import { screenToWorld, type Viewport } from '../../src/lib/canvas-runtime/viewport';

// UX-CANVAS-016: multi-touch pinch + two-finger pan resolved as pure transforms, each with a
// non-gesture alternative. Pointer cancellation (WCAG 2.5.2) reused from the shared drag-alternative.

describe('midpoint + distance', () => {
	it('computes the two-finger midpoint and spread', () => {
		expect(midpoint({ x: 0, y: 0 }, { x: 100, y: 200 })).toEqual({ x: 50, y: 100 });
		expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});
});

describe('resolvePinch — zoom about the midpoint (UX-CANVAS-001 §Pinch anchor)', () => {
	const V: Viewport = { tx: 0, ty: 0, scale: 1 };

	it('zooms by the spread ratio and keeps the (stationary) midpoint world point fixed', () => {
		const prev = pinchSample({ x: 100, y: 100 }, { x: 200, y: 100 }); // spread 100, mid (150,100)
		const next = pinchSample({ x: 50, y: 100 }, { x: 250, y: 100 }); // spread 200, same mid
		const v = resolvePinch(V, prev, next);
		expect(v.scale).toBeCloseTo(2, 6); // 200/100
		const worldBefore = screenToWorld(V, 150, 100);
		const worldAfter = screenToWorld(v, 150, 100);
		expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
		expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
	});

	it('also pans by the midpoint delta (combined pinch + drag)', () => {
		const prev = pinchSample({ x: 100, y: 100 }, { x: 200, y: 100 }); // mid (150,100)
		const next = pinchSample({ x: 140, y: 130 }, { x: 240, y: 130 }); // same spread, mid (190,130)
		const v = resolvePinch(V, prev, next);
		expect(v.scale).toBeCloseTo(1, 6);
		expect(v.tx).toBeCloseTo(40, 6);
		expect(v.ty).toBeCloseTo(30, 6);
	});
});

describe('pointer cancellation (WCAG 2.5.2)', () => {
	it('commits only when released over the start target', () => {
		const target = {};
		expect(shouldCommitPointer(target, target)).toBe(true);
		expect(shouldCommitPointer(target, {})).toBe(false);
		expect(shouldCommitPointer(null, null)).toBe(false);
	});
});

describe('pan inertia (UX-CANVAS-001 §Pan inertia)', () => {
	it('ease-out cubic is monotonic 0→1 and saturates', () => {
		expect(easeOutCubic(0)).toBe(0);
		expect(easeOutCubic(1)).toBe(1);
		expect(easeOutCubic(2)).toBe(1); // clamped
		expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // decelerating
	});
	it('displacement is velocity * duration / 2 and the offset reaches it at the end', () => {
		expect(inertiaDisplacement(2)).toBe((2 * INERTIA_DURATION_MS) / 2);
		expect(inertiaOffsetAt(2, INERTIA_DURATION_MS)).toBeCloseTo(inertiaDisplacement(2), 6);
		expect(inertiaOffsetAt(2, 0)).toBe(0);
	});
});
