import { describe, expect, it } from 'vitest';
import {
	applyBatchSelection,
	applySelection,
	marqueeHits,
	marqueeRect,
	selectAllIds,
	selectionAnnouncement,
	selectionBounds,
	type SpatialWidget,
} from '../../src/lib/gui/ux-canvas/selection';

// UX-CANVAS-005: single / multi (toggle, add) / marquee selection + bounds. The marquee uses the
// fully-enclosed rule. NO-LEAK: every function operates only on the supplied (viewer-filtered) set.

const widgets: SpatialWidget[] = [
	{ id: 'a', x: 0, y: 0, w: 100, h: 100 },
	{ id: 'b', x: 200, y: 0, w: 100, h: 100 },
	{ id: 'c', x: 0, y: 200, w: 100, h: 100 },
];

describe('applySelection', () => {
	it('replace selects only the target', () => {
		expect([...applySelection(new Set(['a', 'b']), 'c', 'replace')]).toEqual(['c']);
	});
	it('toggle adds then removes', () => {
		const added = applySelection(new Set(['a']), 'b', 'toggle');
		expect([...added].sort()).toEqual(['a', 'b']);
		expect([...applySelection(added, 'b', 'toggle')]).toEqual(['a']);
	});
	it('add unions without removing', () => {
		expect([...applyBatchSelection(new Set(['a']), ['b', 'c'], 'add')].sort()).toEqual(['a', 'b', 'c']);
	});
});

describe('marquee', () => {
	it('normalises corners regardless of drag direction', () => {
		expect(marqueeRect({ x: 30, y: 40 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 20, h: 20 });
	});
	it('selects only fully-enclosed widgets', () => {
		// A rect enclosing only widget "a" fully.
		expect(marqueeHits(widgets, { x: -10, y: -10, w: 130, h: 130 })).toEqual(['a']);
	});
	it('does not select a partially-overlapped widget', () => {
		expect(marqueeHits(widgets, { x: 0, y: 0, w: 50, h: 50 })).toEqual([]);
	});
	it('a zero-area marquee (a click) selects nothing', () => {
		expect(marqueeHits(widgets, { x: 50, y: 50, w: 0, h: 0 })).toEqual([]);
	});
	it('encloses multiple widgets', () => {
		expect(marqueeHits(widgets, { x: -10, y: -10, w: 400, h: 400 }).sort()).toEqual(['a', 'b', 'c']);
	});
});

describe('selectAll / bounds (no-leak: only the supplied set)', () => {
	it('select-all returns exactly the supplied ids', () => {
		// The route only ever passes the viewer-filtered set; a DM-only widget absent here is never selected.
		expect(selectAllIds(widgets).sort()).toEqual(['a', 'b', 'c']);
	});
	it('selection bounds spans the selected widgets only', () => {
		expect(selectionBounds(widgets, new Set(['a', 'b']))).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 100 });
	});
	it('empty selection has null bounds', () => {
		expect(selectionBounds(widgets, new Set())).toBeNull();
	});
});

describe('announcements', () => {
	it('announces the selection count', () => {
		expect(selectionAnnouncement(0)).toBe('Selection cleared.');
		expect(selectionAnnouncement(1)).toBe('1 widget selected.');
		expect(selectionAnnouncement(3)).toBe('3 widgets selected.');
	});
});
