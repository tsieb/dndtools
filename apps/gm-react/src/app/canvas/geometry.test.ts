import { describe, expect, it } from 'vitest';
import {
	alignRects,
	arrangeShortcut,
	boundsOf,
	boxFromPoints,
	distributeRects,
	enclosedIds,
	planPlacements,
	reorderLayers,
	toggleSelection,
	withGroupMates,
	type Rect,
} from './geometry';

// Three notes cascaded diagonally, the way the board's Add places them.
const tiles: Rect[] = [
	{ id: 'a', x: 48, y: 48, w: 200, h: 100 },
	{ id: 'b', x: 76, y: 176, w: 120, h: 80 },
	{ id: 'c', x: 104, y: 300, w: 160, h: 60 },
];

const at = (placements: { id: string; x: number; y: number }[]) =>
	Object.fromEntries(placements.map((p) => [p.id, [p.x, p.y]]));

describe('marquee selection', () => {
	it('normalises a drag in any direction', () => {
		expect(boxFromPoints({ x: 300, y: 50 }, { x: 100, y: 250 })).toEqual({
			x: 100,
			y: 50,
			w: 200,
			h: 200,
		});
	});

	it('selects only tiles the box fully encloses', () => {
		expect(enclosedIds(tiles, { x: 40, y: 40, w: 230, h: 230 })).toEqual(['a', 'b']);
		// Clipping c by one pixel leaves it out.
		expect(enclosedIds(tiles, { x: 40, y: 40, w: 230, h: 319 })).toEqual(['a', 'b']);
		expect(enclosedIds(tiles, { x: 40, y: 40, w: 230, h: 320 })).toEqual(['a', 'b', 'c']);
		expect(enclosedIds(tiles, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
	});
});

describe('align', () => {
	it('bounds the selection', () => {
		expect(boundsOf(tiles)).toEqual({ x: 48, y: 48, w: 216, h: 312 });
	});

	it('aligns horizontally to the selection edges and centre', () => {
		expect(at(alignRects(tiles, 'left'))).toEqual({ b: [48, 176], c: [48, 300] });
		expect(at(alignRects(tiles, 'right'))).toEqual({ a: [64, 48], b: [144, 176] });
		expect(at(alignRects(tiles, 'center'))).toEqual({ a: [56, 48], b: [96, 176], c: [76, 300] });
	});

	it('aligns vertically to the selection edges and middle', () => {
		expect(at(alignRects(tiles, 'top'))).toEqual({ b: [76, 48], c: [104, 48] });
		expect(at(alignRects(tiles, 'bottom'))).toEqual({ a: [48, 260], b: [76, 280] });
		expect(at(alignRects(tiles, 'middle'))).toEqual({ a: [48, 154], b: [76, 164], c: [104, 174] });
	});

	it('does nothing for fewer than two tiles or an already aligned selection', () => {
		expect(alignRects(tiles.slice(0, 1), 'left')).toEqual([]);
		const aligned = tiles.map((t) => ({ ...t, x: 48 }));
		expect(alignRects(aligned, 'left')).toEqual([]);
	});
});

describe('distribute', () => {
	it('evens the gaps and keeps the outer tiles in place', () => {
		// Vertical span 48..360 = 312, heights 240, so two gaps of 36.
		expect(at(distributeRects(tiles, 'vertical'))).toEqual({ b: [76, 184] });
		// Horizontal span 48..264 = 216 cannot hold widths of 480, so the centres are spaced
		// instead: 148 and 184 around b, whose centre lands on 166.
		expect(at(distributeRects(tiles, 'horizontal'))).toEqual({ b: [106, 176] });
	});

	it('sorts by position, not selection order, and needs three tiles', () => {
		const shuffled = [tiles[2], tiles[0], tiles[1]];
		expect(at(distributeRects(shuffled, 'vertical'))).toEqual({ b: [76, 184] });
		expect(distributeRects(tiles.slice(0, 2), 'vertical')).toEqual([]);
	});

	it('plans placements only for positional actions', () => {
		expect(planPlacements({ kind: 'align', mode: 'left' }, tiles)).toHaveLength(2);
		expect(planPlacements({ kind: 'group' }, tiles)).toEqual([]);
	});
});

describe('z-order', () => {
	const order = ['a', 'b', 'c', 'd', 'e'];

	it('brings a tile forward one step and sends one back', () => {
		expect(reorderLayers(order, ['b'], 'forward')).toEqual(['a', 'c', 'b', 'd', 'e']);
		expect(reorderLayers(order, ['d'], 'backward')).toEqual(['a', 'b', 'd', 'c', 'e']);
	});

	it('moves a contiguous selection as a block and stops at the ends', () => {
		expect(reorderLayers(order, ['b', 'c'], 'forward')).toEqual(['a', 'd', 'b', 'c', 'e']);
		expect(reorderLayers(order, ['e'], 'forward')).toEqual(order);
		expect(reorderLayers(order, ['a'], 'backward')).toEqual(order);
	});

	it('sends a scattered selection to the front or back in its own order', () => {
		expect(reorderLayers(order, ['d', 'a'], 'front')).toEqual(['b', 'c', 'e', 'a', 'd']);
		expect(reorderLayers(order, ['d', 'b'], 'back')).toEqual(['b', 'd', 'a', 'c', 'e']);
	});
});

describe('selection', () => {
	it('toggles tiles in and out', () => {
		expect(toggleSelection(['a'], ['b'])).toEqual(['a', 'b']);
		expect(toggleSelection(['a', 'b'], ['a'])).toEqual(['b']);
	});

	it('pulls in every member of a selected tile’s group', () => {
		const groups = new Map<string, string | null>([
			['a', 'g1'],
			['b', null],
			['c', 'g1'],
		]);
		expect(withGroupMates(['a'], groups)).toEqual(['a', 'c']);
		expect(withGroupMates(['b'], groups)).toEqual(['b']);
		expect(toggleSelection(['a', 'c', 'b'], withGroupMates(['c'], groups))).toEqual(['b']);
	});
});

describe('shortcuts', () => {
	const key = (
		code: string,
		mods: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>>,
	) => ({
		code,
		altKey: !!mods.alt,
		ctrlKey: !!mods.ctrl,
		metaKey: !!mods.meta,
		shiftKey: !!mods.shift,
	});

	it('maps Alt letters to align and Alt+Shift to distribute', () => {
		expect(arrangeShortcut(key('KeyA', { alt: true }))).toEqual({ kind: 'align', mode: 'left' });
		expect(arrangeShortcut(key('KeyS', { alt: true }))).toEqual({ kind: 'align', mode: 'bottom' });
		expect(arrangeShortcut(key('KeyV', { alt: true, shift: true }))).toEqual({
			kind: 'distribute',
			axis: 'vertical',
		});
		expect(arrangeShortcut(key('KeyA', { alt: true, shift: true }))).toBeNull();
	});

	it('maps Ctrl/⌘ brackets, G and A', () => {
		expect(arrangeShortcut(key('BracketRight', { meta: true }))).toEqual({
			kind: 'layer',
			move: 'forward',
		});
		expect(arrangeShortcut(key('BracketLeft', { ctrl: true, shift: true }))).toEqual({
			kind: 'layer',
			move: 'back',
		});
		expect(arrangeShortcut(key('KeyG', { ctrl: true, shift: true }))).toEqual({ kind: 'ungroup' });
		expect(arrangeShortcut(key('KeyA', { ctrl: true }))).toEqual({ kind: 'select-all' });
		expect(arrangeShortcut(key('KeyZ', { ctrl: true }))).toBeNull();
		expect(arrangeShortcut(key('KeyA', {}))).toBeNull();
	});
});
