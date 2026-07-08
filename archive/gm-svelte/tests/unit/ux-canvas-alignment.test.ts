import { describe, expect, it } from 'vitest';
import {
	alignWidgets,
	distributeWidgets,
	snapMove,
	snapThresholdForZoom,
	snapToGrid,
	type SnapSettings,
} from '../../src/lib/gui/ux-canvas/alignment';
import type { SpatialWidget } from '../../src/lib/gui/ux-canvas/selection';

// UX-CANVAS-009: align / distribute / grid + smart-guide snapping.

const widgets: SpatialWidget[] = [
	{ id: 'a', x: 0, y: 0, w: 100, h: 50 },
	{ id: 'b', x: 200, y: 100, w: 100, h: 50 },
	{ id: 'c', x: 400, y: 300, w: 100, h: 50 },
];

describe('alignWidgets', () => {
	it('aligns left edges to the leftmost', () => {
		const changes = alignWidgets(widgets, new Set(['a', 'b']), 'left');
		expect(changes).toContainEqual({ id: 'b', x: 0, y: 100 });
	});
	it('aligns top edges to the topmost', () => {
		const changes = alignWidgets(widgets, new Set(['a', 'b']), 'top');
		expect(changes).toContainEqual({ id: 'b', x: 200, y: 0 });
	});
	it('aligns right edges', () => {
		const changes = alignWidgets(widgets, new Set(['a', 'b']), 'right');
		// maxRight = 300 (b's right). a moves to x = 300 - 100 = 200.
		expect(changes).toContainEqual({ id: 'a', x: 200, y: 0 });
	});
	it('needs at least two widgets', () => {
		expect(alignWidgets(widgets, new Set(['a']), 'left')).toEqual([]);
	});
});

describe('distributeWidgets', () => {
	it('evenly spaces interior widgets horizontally', () => {
		const items: SpatialWidget[] = [
			{ id: 'a', x: 0, y: 0, w: 100, h: 50 },
			{ id: 'b', x: 120, y: 0, w: 100, h: 50 },
			{ id: 'c', x: 600, y: 0, w: 100, h: 50 },
		];
		const changes = distributeWidgets(items, new Set(['a', 'b', 'c']), 'horizontal');
		// span = 0..700, total widths = 300, free = 400, gap = 200. b should sit at 0+100+200 = 300.
		expect(changes).toContainEqual({ id: 'b', x: 300, y: 0 });
	});
	it('needs at least three widgets', () => {
		expect(distributeWidgets(widgets, new Set(['a', 'b']), 'horizontal')).toEqual([]);
	});
});

describe('grid snap (UX-CANVAS-009)', () => {
	it('snaps to the nearest grid line', () => {
		expect(snapToGrid(19, 16)).toBe(16);
		expect(snapToGrid(25, 16)).toBe(32);
	});
	it('scales the threshold inversely with zoom', () => {
		expect(snapThresholdForZoom(1)).toBe(4);
		expect(snapThresholdForZoom(0.5)).toBe(8);
		expect(snapThresholdForZoom(2)).toBe(2);
	});
});

describe('snapMove smart guides', () => {
	const settings: SnapSettings = { grid: false, gridSize: 16, edge: true, center: true, threshold: 4 };
	it('snaps a moving widget to a sibling left edge and yields a guide', () => {
		const siblings: SpatialWidget[] = [{ id: 's', x: 100, y: 0, w: 100, h: 100 }];
		const out = snapMove({ x: 102, y: 300, w: 50, h: 50 }, siblings, settings);
		expect(out.x).toBe(100);
		expect(out.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
	});
	it('leaves a far widget unsnapped', () => {
		const siblings: SpatialWidget[] = [{ id: 's', x: 100, y: 0, w: 100, h: 100 }];
		const out = snapMove({ x: 500, y: 500, w: 50, h: 50 }, siblings, settings);
		expect(out.x).toBe(500);
		expect(out.guides).toHaveLength(0);
	});
});
