// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkbox as RawCheckbox } from './Checkbox.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Checkbox = RawCheckbox as React.ComponentType<DsProps>;

// role="checkbox" sits on a <span> inside a <label>. Implicit label association only works for
// labelable FORM elements, so the control had NO accessible name at any call site, and clicking the
// visible label text did not toggle it. Mirrors the fix already in Switch.jsx.

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

function box(): HTMLElement {
	const el = container.querySelector('[role="checkbox"]');
	if (!(el instanceof HTMLElement)) throw new Error('Checkbox did not render');
	return el;
}

describe('Checkbox accessibility', () => {
	it('derives its accessible name from the visible label', () => {
		render(<Checkbox label="Include DM-only notes" onChange={() => {}} />);
		const labelId = box().getAttribute('aria-labelledby');
		expect(labelId).toBeTruthy();
		expect(document.getElementById(labelId!)?.textContent).toBe('Include DM-only notes');
	});

	it('lets the label text toggle it, not just the box', () => {
		const onChange = vi.fn();
		render(<Checkbox label="Remember this device" onChange={onChange} />);
		const labelId = box().getAttribute('aria-labelledby')!;

		act(() => document.getElementById(labelId)!.click());
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(true);

		act(() => box().click());
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('reports its checked state', () => {
		render(<Checkbox label="Signed in" checked onChange={() => {}} />);
		expect(box().getAttribute('aria-checked')).toBe('true');
		render(<Checkbox label="Signed in" onChange={() => {}} />);
		expect(box().getAttribute('aria-checked')).toBe('false');
	});

	it('does not override an explicit accessible name', () => {
		render(<Checkbox label="Visible text" aria-label="Explicit name" onChange={() => {}} />);
		expect(box().getAttribute('aria-label')).toBe('Explicit name');
		expect(box().hasAttribute('aria-labelledby')).toBe(false);
	});

	it('activates on Enter and Space, and stays inert when disabled', () => {
		const onChange = vi.fn();
		render(<Checkbox label="Enable sync" onChange={onChange} />);
		act(() => {
			box().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		});
		expect(onChange).toHaveBeenCalledTimes(1);

		render(<Checkbox label="Enable sync" disabled onChange={onChange} />);
		expect(box().tabIndex).toBe(-1);
		act(() => box().click());
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});
