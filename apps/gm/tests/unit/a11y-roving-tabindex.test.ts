import { describe, expect, it } from 'vitest';
import {
	applyRovingTabindex,
	nextRovingIndex,
	typeaheadIndex,
} from '../../src/lib/gui/a11y/roving-tabindex';

// UX-A11Y-012 / UX-A11Y-009: one roving-tabindex engine for tabs/menus/trees/grids — arrow keys
// move with wrap, Home/End jump, only one item holds tabindex=0 (no positive tabindex, AP-8).

describe('nextRovingIndex', () => {
	it('moves forward/backward horizontally and wraps (APG tabs)', () => {
		const base = { count: 4, orientation: 'horizontal' as const };
		expect(nextRovingIndex({ key: 'ArrowRight', currentIndex: 0, ...base })).toBe(1);
		expect(nextRovingIndex({ key: 'ArrowLeft', currentIndex: 0, ...base })).toBe(3); // wrap
		expect(nextRovingIndex({ key: 'ArrowRight', currentIndex: 3, ...base })).toBe(0); // wrap
	});

	it('jumps to first/last on Home/End', () => {
		expect(nextRovingIndex({ key: 'Home', currentIndex: 2, count: 5 })).toBe(0);
		expect(nextRovingIndex({ key: 'End', currentIndex: 2, count: 5 })).toBe(4);
	});

	it('ignores out-of-orientation arrows (vertical list ignores Left/Right)', () => {
		expect(
			nextRovingIndex({ key: 'ArrowLeft', currentIndex: 1, count: 4, orientation: 'vertical' }),
		).toBeNull();
		expect(
			nextRovingIndex({ key: 'ArrowDown', currentIndex: 1, count: 4, orientation: 'vertical' }),
		).toBe(2);
	});

	it('does not wrap when wrap=false (clamps at the ends)', () => {
		expect(
			nextRovingIndex({
				key: 'ArrowRight',
				currentIndex: 3,
				count: 4,
				orientation: 'horizontal',
				wrap: false,
			}),
		).toBe(3);
		expect(
			nextRovingIndex({
				key: 'ArrowLeft',
				currentIndex: 0,
				count: 4,
				orientation: 'horizontal',
				wrap: false,
			}),
		).toBe(0);
	});

	it('returns null for non-navigation keys and empty sets', () => {
		expect(nextRovingIndex({ key: 'a', currentIndex: 0, count: 3 })).toBeNull();
		expect(nextRovingIndex({ key: 'ArrowDown', currentIndex: 0, count: 0 })).toBeNull();
	});

	it('treats both-orientation widgets as accepting all four arrows', () => {
		const base = { count: 3, orientation: 'both' as const };
		expect(nextRovingIndex({ key: 'ArrowUp', currentIndex: 0, ...base })).toBe(2);
		expect(nextRovingIndex({ key: 'ArrowRight', currentIndex: 0, ...base })).toBe(1);
	});
});

describe('typeaheadIndex', () => {
	const labels = ['Alpha', 'Bravo', 'Charlie', 'beta'];

	it('finds the next match forward, wrapping, case-insensitively', () => {
		expect(typeaheadIndex(labels, 'b', 0)).toBe(1);
		expect(typeaheadIndex(labels, 'b', 1)).toBe(3); // next "b" after Bravo is "beta"
		expect(typeaheadIndex(labels, 'a', 1)).toBe(0); // wraps to Alpha
	});

	it('returns null when nothing matches or input is not a single char', () => {
		expect(typeaheadIndex(labels, 'z', 0)).toBeNull();
		expect(typeaheadIndex(labels, 'ab', 0)).toBeNull();
	});
});

describe('applyRovingTabindex', () => {
	it('sets tabindex=0 on the active item and -1 on the rest', () => {
		const items = [0, 1, 2].map(() => document.createElement('button'));
		applyRovingTabindex(items, 1);
		expect(items.map((el) => el.tabIndex)).toEqual([-1, 0, -1]);
	});
});
