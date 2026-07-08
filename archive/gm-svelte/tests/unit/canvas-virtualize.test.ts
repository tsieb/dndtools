import { describe, expect, it } from 'vitest';
import {
	cullToViewport,
	inflateBounds,
	isWithinViewport,
	rectIntersectsBounds,
	renderRegion,
	type RectItem,
} from '../../src/lib/canvas-runtime/virtualize';
import type { Viewport } from '../../src/lib/canvas-runtime/viewport';

// UX-CANVAS-014 §Virtualization: widgets entirely outside the viewport + one-viewport bleed margin are
// not rendered; the bleed prevents pop-in during a slow pan.

const V: Viewport = { tx: 0, ty: 0, scale: 1 };
const SIZE = { w: 200, h: 200 };

describe('renderRegion + inflateBounds', () => {
	it('inflates the visible world rect by one viewport on each side (default bleed)', () => {
		// Visible world rect is 0..200; one-viewport bleed extends it by 200 on each side.
		expect(renderRegion(V, SIZE)).toEqual({ minX: -200, minY: -200, maxX: 400, maxY: 400 });
	});
	it('inflateBounds scales by the bleed factor', () => {
		expect(inflateBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 0.5)).toEqual({
			minX: -50,
			minY: -50,
			maxX: 150,
			maxY: 150,
		});
	});
});

describe('rectIntersectsBounds', () => {
	it('treats touching edges as visible and rejects fully-outside rects', () => {
		const region = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
		expect(rectIntersectsBounds({ x: 100, y: 100, w: 10, h: 10 }, region)).toBe(true); // touching
		expect(rectIntersectsBounds({ x: 200, y: 0, w: 10, h: 10 }, region)).toBe(false);
	});
});

describe('cullToViewport (UX-CANVAS-014 AC: off-screen widgets not rendered)', () => {
	const items: RectItem[] = [
		{ id: 'in', x: 50, y: 50, w: 20, h: 20 }, // inside the visible rect
		{ id: 'bleed', x: 300, y: 0, w: 20, h: 20 }, // inside the bleed margin (kept, no pop-in)
		{ id: 'far', x: 5000, y: 5000, w: 20, h: 20 }, // far away -> culled
	];

	it('keeps visible + bleed items and drops far-away items, preserving order', () => {
		const kept = cullToViewport(items, V, SIZE);
		expect(kept.map((i) => i.id)).toEqual(['in', 'bleed']);
	});

	it('isWithinViewport agrees with the cull result', () => {
		expect(isWithinViewport(items[0]!, V, SIZE)).toBe(true);
		expect(isWithinViewport(items[2]!, V, SIZE)).toBe(false);
	});

	it('a zoomed-out viewport reveals more items', () => {
		const zoomedOut: Viewport = { tx: 0, ty: 0, scale: 0.02 };
		const kept = cullToViewport(items, zoomedOut, SIZE);
		expect(kept.map((i) => i.id)).toContain('far');
	});
});
