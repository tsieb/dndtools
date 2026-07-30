// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl as RawSegmentedControl } from './SegmentedControl.jsx';
import { Seg } from '../../../app/screen-kit';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const SegmentedControl = RawSegmentedControl as React.ComponentType<DsProps>;

// Both segmented controls declare role="radiogroup" with role="radio" children. An ARIA radiogroup
// is ONE tab stop whose selection moves with the arrow keys; these two shipped with every radio as
// its own tab stop and no key handling at all, so the pattern was declared but not implemented.

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function render(node: React.ReactNode): void {
	act(() => root.render(node));
}

function radios(): HTMLElement[] {
	return Array.from(container.querySelectorAll('[role="radio"]')) as HTMLElement[];
}

function press(el: HTMLElement, key: string): void {
	act(() => {
		el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	});
}

const OPTIONS = [
	{ value: 'terrain', label: 'Terrain' },
	{ value: 'settlement', label: 'Settlement' },
	{ value: 'dungeon', label: 'Dungeon' },
];

describe('SegmentedControl radiogroup', () => {
	it('exposes exactly one tab stop, on the checked radio', () => {
		render(<SegmentedControl options={OPTIONS} value="settlement" onChange={() => {}} />);
		expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
	});

	it('falls back to the first enabled radio when nothing is checked', () => {
		render(<SegmentedControl options={OPTIONS} value="" onChange={() => {}} />);
		expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
	});

	it('moves the selection with ArrowRight and wraps at the end', () => {
		const onChange = vi.fn();
		render(<SegmentedControl options={OPTIONS} value="terrain" onChange={onChange} />);

		press(radios()[0], 'ArrowRight');
		expect(onChange).toHaveBeenLastCalledWith('settlement');

		// Wrapping: from the last option, forward returns to the first.
		press(radios()[2], 'ArrowRight');
		expect(onChange).toHaveBeenLastCalledWith('terrain');
	});

	it('moves the selection with ArrowLeft, Home and End', () => {
		const onChange = vi.fn();
		render(<SegmentedControl options={OPTIONS} value="settlement" onChange={onChange} />);

		press(radios()[1], 'ArrowLeft');
		expect(onChange).toHaveBeenLastCalledWith('terrain');

		press(radios()[1], 'Home');
		expect(onChange).toHaveBeenLastCalledWith('terrain');

		press(radios()[1], 'End');
		expect(onChange).toHaveBeenLastCalledWith('dungeon');
	});

	it('skips a disabled option when moving', () => {
		const onChange = vi.fn();
		render(
			<SegmentedControl
				options={[OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]}
				value="terrain"
				onChange={onChange}
			/>,
		);
		press(radios()[0], 'ArrowRight');
		expect(onChange).toHaveBeenLastCalledWith('dungeon');
	});

	it('ignores unrelated keys', () => {
		const onChange = vi.fn();
		render(<SegmentedControl options={OPTIONS} value="terrain" onChange={onChange} />);
		press(radios()[0], 'a');
		expect(onChange).not.toHaveBeenCalled();
	});

	// The group had no accessible name at several call sites (WCAG 4.1.2).
	it('names the group from ariaLabel', () => {
		render(
			<SegmentedControl options={OPTIONS} value="terrain" onChange={() => {}} ariaLabel="Map kind" />,
		);
		const group = container.querySelector('[role="radiogroup"]');
		expect(group?.getAttribute('aria-label')).toBe('Map kind');
	});
});

describe('Seg radiogroup (screen-kit twin)', () => {
	it('exposes exactly one tab stop, on the checked radio', () => {
		render(<Seg options={OPTIONS} value="dungeon" onChange={() => {}} ariaLabel="Note visibility" />);
		expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
	});

	it('moves the selection with the arrow keys', () => {
		const onChange = vi.fn();
		render(<Seg options={OPTIONS} value="terrain" onChange={onChange} ariaLabel="Note visibility" />);

		press(radios()[0], 'ArrowRight');
		expect(onChange).toHaveBeenLastCalledWith('settlement');

		press(radios()[0], 'ArrowLeft');
		expect(onChange).toHaveBeenLastCalledWith('dungeon');
	});

	it('carries its accessible name', () => {
		render(<Seg options={OPTIONS} value="terrain" onChange={() => {}} ariaLabel="Note visibility" />);
		const group = container.querySelector('[role="radiogroup"]');
		expect(group?.getAttribute('aria-label')).toBe('Note visibility');
	});
});
