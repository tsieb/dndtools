import { describe, expect, it } from 'vitest';
import {
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STOPS,
	centerOnWorld,
	clampZoom,
	fitBounds,
	nextZoomStop,
	panByScreen,
	prevZoomStop,
	resolveViewportKey,
	screenToWorld,
	unionBounds,
	visibleWorldRect,
	worldToScreen,
	zoomByFactor,
	zoomPercent,
	zoomToScale,
	type Viewport,
} from '../../src/lib/canvas-runtime/viewport';

// UX-CANVAS-001: the pure pan/zoom model. Cursor/pinch-anchored zoom keeps the world point under the
// anchor fixed; discrete snap stops; zoom-to-fit; keyboard parity for every gesture.

const V: Viewport = { tx: 0, ty: 0, scale: 1 };

describe('clampZoom + zoomPercent', () => {
	it('clamps into the supported range and rounds the percent', () => {
		expect(clampZoom(0.001)).toBe(ZOOM_MIN);
		expect(clampZoom(99)).toBe(ZOOM_MAX);
		expect(clampZoom(Number.NaN)).toBe(1);
		expect(zoomPercent(1.5)).toBe(150);
	});
});

describe('world/screen transforms round-trip', () => {
	it('screenToWorld inverts worldToScreen', () => {
		const v: Viewport = { tx: 40, ty: -20, scale: 2 };
		const screen = worldToScreen(v, 100, 50);
		expect(screen).toEqual({ x: 240, y: 80 });
		expect(screenToWorld(v, screen.x, screen.y)).toEqual({ x: 100, y: 50 });
	});
});

describe('zoomToScale — cursor-anchored (UX-CANVAS-001 AC1)', () => {
	it('keeps the world point under the anchor fixed while zooming', () => {
		const anchor = { x: 300, y: 200 };
		const worldBefore = screenToWorld(V, anchor.x, anchor.y);
		const next = zoomToScale(V, 2, anchor);
		expect(next.scale).toBe(2);
		const worldAfter = screenToWorld(next, anchor.x, anchor.y);
		expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
		expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
	});
	it('zoomByFactor multiplies the current scale, clamped', () => {
		expect(zoomByFactor(V, 3, { x: 0, y: 0 }).scale).toBe(3);
		expect(zoomByFactor({ ...V, scale: 4 }, 4, { x: 0, y: 0 }).scale).toBe(ZOOM_MAX);
	});
});

describe('discrete zoom snap stops (UX-CANVAS-001 §+/−)', () => {
	it('steps to the next/prev stop and saturates at the bounds', () => {
		expect(nextZoomStop(1)).toBe(1.5);
		expect(prevZoomStop(1)).toBe(0.75);
		expect(nextZoomStop(0.4)).toBe(0.5);
		expect(prevZoomStop(0.12)).toBe(0.1);
		expect(nextZoomStop(4)).toBe(ZOOM_MAX);
		expect(prevZoomStop(0.1)).toBe(ZOOM_MIN);
	});
	it('every declared stop is inside the zoom range', () => {
		for (const stop of ZOOM_STOPS) {
			expect(stop).toBeGreaterThanOrEqual(ZOOM_MIN);
			expect(stop).toBeLessThanOrEqual(ZOOM_MAX);
		}
	});
});

describe('panByScreen + centerOnWorld', () => {
	it('translates by a screen delta', () => {
		expect(panByScreen(V, 10, -5)).toEqual({ tx: 10, ty: -5, scale: 1 });
	});
	it('centers a world point in the viewport', () => {
		const size = { w: 400, h: 300 };
		const v = centerOnWorld({ x: 1000, y: 1000 }, size, 1);
		const center = worldToScreen(v, 1000, 1000);
		expect(center.x).toBeCloseTo(200, 6);
		expect(center.y).toBeCloseTo(150, 6);
	});
});

describe('unionBounds + fitBounds (zoom-to-fit)', () => {
	it('computes the union box, or null when empty', () => {
		expect(unionBounds([])).toBeNull();
		expect(
			unionBounds([
				{ x: 0, y: 0, w: 100, h: 100 },
				{ x: 200, y: 50, w: 100, h: 100 },
			]),
		).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 150 });
	});
	it('fits content within the viewport with padding and centers it', () => {
		const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
		const size = { w: 500, h: 500 };
		const v = fitBounds(bounds, size, 48);
		// Content (1000) must fit into 500 - 2*48 = 404 px.
		expect(v.scale).toBeCloseTo(404 / 1000, 6);
		const center = worldToScreen(v, 500, 500);
		expect(center.x).toBeCloseTo(250, 6);
		expect(center.y).toBeCloseTo(250, 6);
	});
	it('resets to identity for empty content', () => {
		expect(fitBounds(null, { w: 400, h: 300 })).toEqual({ tx: 0, ty: 0, scale: 1 });
	});
});

describe('visibleWorldRect', () => {
	it('returns the world rectangle currently in view', () => {
		const v: Viewport = { tx: -100, ty: -100, scale: 1 };
		expect(visibleWorldRect(v, { w: 200, h: 200 })).toEqual({
			minX: 100,
			minY: 100,
			maxX: 300,
			maxY: 300,
		});
	});
});

describe('resolveViewportKey — keyboard parity (UX-CANVAS-001/015)', () => {
	it('maps arrows to pan deltas (Shift = far step)', () => {
		expect(resolveViewportKey('ArrowRight', false)).toEqual({ kind: 'pan', dx: -32, dy: 0 });
		expect(resolveViewportKey('ArrowLeft', false)).toEqual({ kind: 'pan', dx: 32, dy: 0 });
		expect(resolveViewportKey('ArrowDown', false)).toEqual({ kind: 'pan', dx: 0, dy: -32 });
		expect(resolveViewportKey('ArrowUp', true)).toEqual({ kind: 'pan', dx: 0, dy: 128 });
	});
	it('maps zoom keys', () => {
		expect(resolveViewportKey('+', false)).toEqual({ kind: 'zoom-in' });
		expect(resolveViewportKey('-', false)).toEqual({ kind: 'zoom-out' });
		expect(resolveViewportKey('0', false)).toEqual({ kind: 'zoom-fit' });
		expect(resolveViewportKey('0', true)).toEqual({ kind: 'zoom-selection' });
		expect(resolveViewportKey(')', false)).toEqual({ kind: 'zoom-selection' });
		expect(resolveViewportKey('1', false)).toEqual({ kind: 'zoom-to', scale: 1 });
		expect(resolveViewportKey('2', false)).toEqual({ kind: 'zoom-to', scale: 2 });
		expect(resolveViewportKey('5', false)).toEqual({ kind: 'zoom-to', scale: 0.5 });
	});
	it('returns null for unrelated keys', () => {
		expect(resolveViewportKey('a', false)).toBeNull();
		expect(resolveViewportKey('Enter', false)).toBeNull();
	});
});
