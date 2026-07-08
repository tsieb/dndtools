import { describe, expect, it } from 'vitest';
import {
	MIN_WIDGET_H,
	MIN_WIDGET_W,
	aspectResize,
	clampSize,
	normalizeAngle,
	offCanvasCorrect,
	snapRotation,
} from '../../src/lib/gui/ux-canvas/transform';

// UX-CANVAS-003 move/resize geometry + UX-CANVAS-004 rotation snapping.

describe('clampSize (UX-CANVAS-003 minimum extent)', () => {
	it('enforces the 120×80 minimum', () => {
		expect(clampSize({ w: 10, h: 10 })).toEqual({ w: MIN_WIDGET_W, h: MIN_WIDGET_H });
	});
	it('leaves a valid size unchanged', () => {
		expect(clampSize({ w: 300, h: 200 })).toEqual({ w: 300, h: 200 });
	});
});

describe('aspectResize', () => {
	it('keeps the ratio when locked, driven by the larger delta', () => {
		const out = aspectResize({ w: 200, h: 100 }, { w: 400, h: 110 }, true);
		// width grew by 200 (dominant), so height follows the 2:1 ratio → 200.
		expect(out).toEqual({ w: 400, h: 200 });
	});
	it('is free when unlocked', () => {
		expect(aspectResize({ w: 200, h: 100 }, { w: 400, h: 110 }, false)).toEqual({ w: 400, h: 110 });
	});
	it('still clamps to the minimum when locked', () => {
		const out = aspectResize({ w: 200, h: 100 }, { w: 10, h: 5 }, true);
		expect(out.w).toBeGreaterThanOrEqual(MIN_WIDGET_W);
		expect(out.h).toBeGreaterThanOrEqual(MIN_WIDGET_H);
	});
});

describe('offCanvasCorrect (UX-CANVAS-003 AC4)', () => {
	const visible = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
	it('snaps a widget dragged far past the right edge back inside', () => {
		const out = offCanvasCorrect({ x: 1300, y: 100, w: 100, h: 100 }, visible);
		expect(out.x).toBe(1000 - 20 - 100);
	});
	it('snaps a widget dragged far past the left edge back inside', () => {
		const out = offCanvasCorrect({ x: -400, y: 100, w: 100, h: 100 }, visible);
		expect(out.x).toBe(20);
	});
	it('leaves an on-canvas widget untouched', () => {
		expect(offCanvasCorrect({ x: 100, y: 100, w: 100, h: 100 }, visible)).toEqual({ x: 100, y: 100 });
	});
});

describe('rotation (UX-CANVAS-004)', () => {
	it('snaps to the nearest 15° by default', () => {
		expect(snapRotation(20)).toBe(15);
		expect(snapRotation(38)).toBe(45);
	});
	it('snaps to 1° when free (Shift)', () => {
		expect(snapRotation(37.6, true)).toBe(38);
	});
	it('normalises into [0, 360)', () => {
		expect(normalizeAngle(-30)).toBe(330);
		expect(normalizeAngle(370)).toBe(10);
		expect(snapRotation(-15)).toBe(345);
	});
});
