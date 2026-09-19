import { describe, expect, it } from 'vitest';
import {
	BOARD_RIGHT_BOUND,
	boardHasLayoutIssues,
	boardLayoutIssues,
	clampToColumns,
	clampWidthToColumns,
	fitWidgetSize,
	nextSizePreset,
	repackBoardColumns,
	widgetSizePresets,
	type BoardLayoutRect,
	type BoardWidget,
} from './board-helpers';

/**
 * RC-CAN-3.3 — the column-overflow guard for `/board`. The bounded canvas has no free horizontal
 * scroll, so a widget dragged past the board's own columns either shrinks the fit-scale for
 * everyone or lands invisibly on another widget. `boardHasLayoutIssues` is the one predicate that
 * detects both, `clampToColumns`/`clampWidthToColumns` are the "snap back" a move/resize gets, and
 * `repackBoardColumns` is the greedy fix behind the "Fix layout" banner button.
 */

const rect = (id: string, x: number, y: number, w: number, h: number): BoardLayoutRect => ({
	id,
	x,
	y,
	w,
	h,
});

describe('clampToColumns / clampWidthToColumns', () => {
	it('leaves an in-bounds drop untouched', () => {
		expect(clampToColumns(24, 240)).toBe(24);
	});

	it('snaps an off-grid drop back to the board’s right edge', () => {
		expect(clampToColumns(3000, 240)).toBe(BOARD_RIGHT_BOUND - 240);
	});

	it('never clamps to a negative x', () => {
		expect(clampToColumns(-500, 240)).toBe(0);
	});

	it('shrinks a resize that would cross the right edge, anchored at x', () => {
		expect(clampWidthToColumns(700, 500)).toBe(BOARD_RIGHT_BOUND - 700);
	});

	it('leaves an in-bounds resize untouched', () => {
		expect(clampWidthToColumns(24, 240)).toBe(240);
	});
});

describe('fitWidgetSize / widgetSizePresets (RC-CAN-2.5)', () => {
	// A 320-wide tile whose right edge already sits on the bound.
	const edge = BOARD_RIGHT_BOUND - 320;
	const widget = {
		x: edge,
		w: 320,
		h: 200,
		minSize: { width: 200, height: 120 },
		defaultSize: { width: 320, height: 200 },
	} as BoardWidget;

	it('reports the width the bounded board will commit, not the one requested', () => {
		expect(fitWidgetSize(widget, 340, 200, true)).toEqual({ w: 320, h: 200 });
		expect(fitWidgetSize(widget, 340, 200, false)).toEqual({ w: 340, h: 200 });
	});

	it('floors both axes at the declared minimum', () => {
		expect(fitWidgetSize(widget, 100, 50, true)).toEqual({ w: 200, h: 120 });
	});

	it('fits presets to the bounded board and keeps them distinct', () => {
		expect(widgetSizePresets(widget)).toEqual([
			{ w: 200, h: 120 },
			{ w: 320, h: 200 },
			{ w: 480, h: 300 },
		]);
		expect(widgetSizePresets(widget, true)).toEqual([
			{ w: 200, h: 120 },
			{ w: 320, h: 200 },
			{ w: 320, h: 300 },
		]);
		expect(
			widgetSizePresets({ ...widget, defaultSize: { width: 320, height: 120 } }, true),
		).toEqual([
			{ w: 200, h: 120 },
			{ w: 320, h: 120 },
			{ w: 320, h: 180 },
		]);
	});

	it('cycles from the size on screen, so an unconfirmed drag draft restarts at small', () => {
		expect(nextSizePreset(widget, widget)).toEqual({ w: 480, h: 300 });
		expect(nextSizePreset(widget, { w: 240, h: 160 })).toEqual({ w: 200, h: 120 });
		expect(nextSizePreset(widget, { w: 320, h: 300 }, true)).toEqual({ w: 200, h: 120 });
	});
});

describe('boardHasLayoutIssues', () => {
	it('is false for the default seeded three-column grid', () => {
		const widgets = [
			rect('a', 24, 24, 240, 160),
			rect('b', 288, 24, 240, 160),
			rect('c', 552, 24, 240, 160),
		];
		expect(boardHasLayoutIssues(widgets)).toBe(false);
	});

	it('is true when a widget crosses the right bound', () => {
		expect(boardHasLayoutIssues([rect('a', BOARD_RIGHT_BOUND - 100, 24, 240, 160)])).toBe(true);
	});

	it('is true when two widgets overlap, even fully in-bounds', () => {
		expect(boardHasLayoutIssues([rect('a', 24, 24, 240, 160), rect('b', 24, 24, 240, 160)])).toBe(
			true,
		);
	});

	it('is false for widgets that merely share an edge', () => {
		expect(boardHasLayoutIssues([rect('a', 24, 24, 240, 160), rect('b', 264, 24, 240, 160)])).toBe(
			false,
		);
	});
});

describe('boardLayoutIssues', () => {
	it('is empty for the default seeded three-column grid', () => {
		const widgets = [
			rect('a', 24, 24, 240, 160),
			rect('b', 288, 24, 240, 160),
			rect('c', 552, 24, 240, 160),
		];
		expect(boardLayoutIssues(widgets)).toEqual([]);
	});

	it('reports an overflow issue naming the offending widget', () => {
		const widgets = [rect('a', BOARD_RIGHT_BOUND - 100, 24, 240, 160)];
		expect(boardLayoutIssues(widgets)).toEqual([{ kind: 'overflow', widgetId: 'a' }]);
	});

	it('reports an overlap issue naming both widgets, once per pair', () => {
		const widgets = [rect('a', 24, 24, 240, 160), rect('b', 24, 24, 240, 160)];
		expect(boardLayoutIssues(widgets)).toEqual([
			{ kind: 'overlap', widgetId: 'a', otherWidgetId: 'b' },
		]);
	});

	it('reports both an overflow and an overlap when both are present', () => {
		const widgets = [
			rect('a', BOARD_RIGHT_BOUND - 100, 24, 240, 160),
			rect('b', 24, 24, 240, 160),
			rect('c', 24, 24, 240, 160),
		];
		expect(boardLayoutIssues(widgets)).toEqual([
			{ kind: 'overflow', widgetId: 'a' },
			{ kind: 'overlap', widgetId: 'b', otherWidgetId: 'c' },
		]);
	});

	it('agrees with boardHasLayoutIssues on whether the board is clean', () => {
		const dirty = [rect('a', 24, 24, 240, 160), rect('b', 24, 24, 240, 160)];
		const clean = [rect('a', 24, 24, 240, 160), rect('b', 288, 24, 240, 160)];
		expect(boardLayoutIssues(dirty).length > 0).toBe(boardHasLayoutIssues(dirty));
		expect(boardLayoutIssues(clean).length > 0).toBe(boardHasLayoutIssues(clean));
	});
});

describe('repackBoardColumns', () => {
	it('resolves an exact overlap by moving the later widget to the next open shelf', () => {
		const widgets = [rect('a', 24, 24, 240, 160), rect('b', 24, 24, 240, 160)];
		const next = repackBoardColumns(widgets);
		const placed = widgets.map((w) => ({ ...w, ...next.get(w.id)! }));
		expect(boardHasLayoutIssues(placed)).toBe(false);
	});

	it('leaves an already-clean grid unchanged', () => {
		const widgets = [
			rect('a', 24, 24, 240, 160),
			rect('b', 288, 24, 240, 160),
			rect('c', 552, 24, 240, 160),
		];
		const next = repackBoardColumns(widgets);
		for (const w of widgets) {
			expect(next.get(w.id)).toEqual({ x: w.x, y: w.y });
		}
	});

	it('is deterministic for the same input', () => {
		const widgets = [
			rect('a', 900, 900, 240, 160),
			rect('b', 900, 900, 240, 160),
			rect('c', 24, 24, 240, 160),
		];
		const first = repackBoardColumns(widgets);
		const second = repackBoardColumns(widgets);
		expect([...first.entries()]).toEqual([...second.entries()]);
	});

	it('always repacks within the board’s right bound', () => {
		const widgets = [
			rect('a', 5000, 5000, 240, 160),
			rect('b', 5000, 5000, 240, 160),
			rect('c', 5000, 5000, 240, 160),
			rect('d', 5000, 5000, 240, 160),
		];
		const next = repackBoardColumns(widgets);
		for (const w of widgets) {
			const pos = next.get(w.id)!;
			expect(pos.x + w.w).toBeLessThanOrEqual(BOARD_RIGHT_BOUND);
		}
	});
});
