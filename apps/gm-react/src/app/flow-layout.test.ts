import { describe, expect, it } from 'vitest';
import {
	FLOW_COLUMNS,
	FLOW_COLUMN_STEP,
	FLOW_ROW_STEP,
	flowKeyBetween,
	flowOrder,
	flowPlacements,
	flowRenumber,
	flowReorderMoves,
	flowSpanOf,
	flowSpanWidth,
	type FlowRect,
} from './board-helpers';

/**
 * RC-CAN-7.7 / ADR-041 — the FLOW layout policy's pure model.
 *
 * The properties under test are the ones the policy actually rests on: reading order is the layout
 * order, a narrower tier REFLOWS rather than rescaling, a reorder is one `scene.move-widget`, and a
 * resize never reorders.
 */

const tile = (id: string, x: number, y: number, w: number, h = 200): FlowRect => ({
	id,
	x,
	y,
	w,
	h,
});

/** Half of the desktop grid, in durable px — the width a "Half" span commits. */
const HALF = flowSpanWidth(FLOW_COLUMNS.desktop / 2);

/** The Command Center's current body: `minmax(0,1.5fr) minmax(0,1fr)` is spans 7 + 5 of twelve. */
const commandCenter = (): FlowRect[] => [
	tile('main', 0, 0, flowSpanWidth(7)),
	tile('side', 7 * FLOW_COLUMN_STEP, 0, flowSpanWidth(5)),
];

/** The reading order of a placement list, which is also its DOM order. */
const idsOf = (rects: readonly FlowRect[], columns?: number) =>
	flowPlacements(rects, columns).map((placement) => placement.id);

describe('flowOrder', () => {
	it('reads top to bottom, then left to right', () => {
		const rects = [tile('c', 0, 240, 96), tile('b', 480, 0, 96), tile('a', 0, 0, 96)];
		expect(flowOrder(rects).map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	it('breaks a coordinate tie by id, so the order is total and stable', () => {
		const rects = [tile('b', 0, 0, 96), tile('a', 0, 0, 96)];
		expect(flowOrder(rects).map((r) => r.id)).toEqual(['a', 'b']);
		expect(flowOrder(rects.slice().reverse()).map((r) => r.id)).toEqual(['a', 'b']);
	});
});

describe('flowSpanOf / flowSpanWidth', () => {
	it('reads a stored width as a span of the authoring grid', () => {
		expect(flowSpanOf(tile('a', 0, 0, flowSpanWidth(7)))).toBe(7);
		expect(flowSpanWidth(7)).toBe(7 * FLOW_COLUMN_STEP);
	});

	it('clamps a span to the tier, which is what makes a narrow tier reflow', () => {
		expect(flowSpanOf(tile('a', 0, 0, flowSpanWidth(7)), FLOW_COLUMNS.rail)).toBe(
			FLOW_COLUMNS.rail,
		);
		expect(flowSpanOf(tile('a', 0, 0, flowSpanWidth(7)), FLOW_COLUMNS.phone)).toBe(1);
	});

	it('floors an unreadable or sub-column width at one column', () => {
		expect(flowSpanOf(tile('a', 0, 0, 1))).toBe(1);
		expect(flowSpanOf(tile('a', 0, 0, Number.NaN))).toBe(1);
	});
});

describe('flowPlacements — the responsive column grid', () => {
	it('reproduces the Command Center two-column arrangement at desktop', () => {
		const placements = flowPlacements(commandCenter(), FLOW_COLUMNS.desktop);
		expect(placements).toEqual([
			{ id: 'main', column: 0, row: 0, span: 7, index: 0 },
			{ id: 'side', column: 7, row: 0, span: 5, index: 1 },
		]);
	});

	it('reflows that arrangement to one tile per row at rail, each filling the row', () => {
		const placements = flowPlacements(commandCenter(), FLOW_COLUMNS.rail);
		expect(placements.map((p) => p.row)).toEqual([0, 1]);
		// Every tile is full width: clamping alone would have left the 5-column tile ragged.
		expect(placements.every((p) => p.column === 0 && p.span === FLOW_COLUMNS.rail)).toBe(true);
	});

	it('reflows an even two-column row at rail rather than shrinking it to stay two-up', () => {
		// The case that separates CLAMPING from proportional rescaling: two span-6 tiles would both
		// become span-3 under a rescale and still share a rail row — i.e. never reflow at all.
		const even = [tile('one', 0, 0, HALF), tile('two', HALF, 0, HALF)];
		expect(flowPlacements(even, FLOW_COLUMNS.desktop).map((p) => p.row)).toEqual([0, 0]);
		expect(flowPlacements(even, FLOW_COLUMNS.rail).map((p) => p.row)).toEqual([0, 1]);
	});

	it('collapses to a single full-width column at phone', () => {
		const placements = flowPlacements(commandCenter(), FLOW_COLUMNS.phone);
		expect(placements).toEqual([
			{ id: 'main', column: 0, row: 0, span: 1, index: 0 },
			{ id: 'side', column: 0, row: 1, span: 1, index: 1 },
		]);
	});

	it('keeps a deliberately half-width desktop tile half width — the authoring tier never stretches', () => {
		const placements = flowPlacements([tile('solo', 0, 0, HALF)], FLOW_COLUMNS.desktop);
		expect(placements[0].span).toBe(FLOW_COLUMNS.desktop / 2);
	});

	it('starts a new row rather than pulling a later tile into an earlier gap', () => {
		// 7 + 7 cannot share a twelve-column row. A dense/masonry pack would have put `c` (span 4)
		// beside `a` and painted it before `b`; reading order forbids that.
		const rects = [
			tile('a', 0, 0, flowSpanWidth(7)),
			tile('b', 0, FLOW_ROW_STEP, flowSpanWidth(7)),
			tile('c', 0, 2 * FLOW_ROW_STEP, flowSpanWidth(4)),
		];
		const placements = flowPlacements(rects, FLOW_COLUMNS.desktop);
		expect(placements.map((p) => p.row)).toEqual([0, 1, 1]);
		expect(placements.map((p) => p.column)).toEqual([0, 0, 7]);
	});

	it('numbers reading order, DOM order and focus order identically', () => {
		const rects = [tile('c', 0, 480, 96), tile('a', 0, 0, 96), tile('b', 96, 0, 96)];
		const placements = flowPlacements(rects, FLOW_COLUMNS.desktop);
		expect(placements.map((p) => p.id)).toEqual(['a', 'b', 'c']);
		expect(placements.map((p) => p.index)).toEqual([0, 1, 2]);
	});
});

describe('flowKeyBetween', () => {
	const a = tile('a', 0, 0, 96);
	const b = tile('b', 96, 0, 96);
	const c = tile('c', 0, FLOW_ROW_STEP, 96);

	it('steps one column past the predecessor when the neighbours are on different rows', () => {
		expect(flowKeyBetween(a, c)).toEqual({ x: FLOW_COLUMN_STEP, y: 0 });
	});

	it('takes the midpoint when the neighbours share a row', () => {
		expect(flowKeyBetween(a, b)).toEqual({ x: 48, y: 0 });
	});

	it('goes a row above the first tile and a row below the last', () => {
		expect(flowKeyBetween(null, c)).toEqual({ x: 0, y: 0 });
		expect(flowKeyBetween(a, null)).toEqual({ x: 0, y: FLOW_ROW_STEP });
	});

	it('refuses a key when two same-row neighbours are adjacent doubles', () => {
		// `1 + Number.EPSILON` is the very next representable double after 1, so their midpoint
		// rounds back onto 1 and there is genuinely nothing between them.
		const left = tile('l', 1, 0, 96);
		const right = tile('r', 1 + Number.EPSILON, 0, 96);
		expect(flowKeyBetween(left, right)).toBeNull();
	});
});

describe('flowReorderMoves — drag, keyboard and menu all land here', () => {
	const row = (): FlowRect[] => [
		tile('a', 0, 0, 96),
		tile('b', 0, FLOW_ROW_STEP, 96),
		tile('c', 0, 2 * FLOW_ROW_STEP, 96),
		tile('d', 0, 3 * FLOW_ROW_STEP, 96),
	];

	const applied = (rects: FlowRect[], id: string, toIndex: number) => {
		const moves = flowReorderMoves(rects, id, toIndex);
		const next = rects.map((rect) => {
			const move = moves.find((m) => m.id === rect.id);
			return move ? { ...rect, x: move.x, y: move.y } : rect;
		});
		return { moves, order: idsOf(next) };
	};

	it('moves a tile one step later with ONE move command', () => {
		const { moves, order } = applied(row(), 'a', 1);
		expect(moves).toHaveLength(1);
		expect(moves[0].id).toBe('a');
		expect(order).toEqual(['b', 'a', 'c', 'd']);
	});

	it('moves a tile one step earlier with ONE move command', () => {
		const { moves, order } = applied(row(), 'd', 2);
		expect(moves).toHaveLength(1);
		expect(order).toEqual(['a', 'b', 'd', 'c']);
	});

	it('moves a tile to the start and to the end', () => {
		expect(applied(row(), 'd', 0).order).toEqual(['d', 'a', 'b', 'c']);
		expect(applied(row(), 'a', 3).order).toEqual(['b', 'c', 'd', 'a']);
	});

	it('drops a tile onto a distant one and takes its place, in either direction', () => {
		expect(applied(row(), 'a', 2).order).toEqual(['b', 'c', 'a', 'd']);
		expect(applied(row(), 'c', 1).order).toEqual(['a', 'c', 'b', 'd']);
	});

	it('is a no-op when the tile is already at the target index', () => {
		expect(flowReorderMoves(row(), 'b', 1)).toEqual([]);
	});

	it('clamps an out-of-range target instead of dropping the gesture', () => {
		expect(applied(row(), 'a', 99).order).toEqual(['b', 'c', 'd', 'a']);
		expect(applied(row(), 'd', -4).order).toEqual(['d', 'a', 'b', 'c']);
	});

	it('names no widget it was not given', () => {
		expect(flowReorderMoves(row(), 'missing', 0)).toEqual([]);
	});

	it('falls back to a canonical renumber when no single coordinate fits', () => {
		// Three tiles at the SAME coordinate: the order is the id tie-break, and there is no
		// coordinate strictly between two equal keys, so the whole reading order is renumbered.
		const stacked = [tile('a', 0, 0, 96), tile('b', 0, 0, 96), tile('c', 0, 0, 96)];
		const { moves, order } = applied(stacked, 'c', 1);
		expect(moves.length).toBeGreaterThan(1);
		expect(order).toEqual(['a', 'c', 'b']);
	});
});

describe('flowRenumber', () => {
	it('writes the authoring grid and returns only the tiles that actually move', () => {
		const ordered = [tile('a', 0, 0, flowSpanWidth(12)), tile('b', 999, 999, flowSpanWidth(12))];
		expect(flowRenumber(ordered)).toEqual([{ id: 'b', x: 0, y: FLOW_ROW_STEP }]);
	});
});

describe('a span pick never reorders', () => {
	it('leaves the reading order untouched when only a width changes', () => {
		const rects = commandCenter();
		const before = idsOf(rects);
		const resized = rects.map((rect) =>
			rect.id === 'main' ? { ...rect, w: flowSpanWidth(FLOW_COLUMNS.desktop) } : rect,
		);
		expect(idsOf(resized)).toEqual(before);
	});
});
