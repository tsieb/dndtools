// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Minimap as RawMinimap } from './Minimap.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Minimap = RawMinimap as React.ComponentType<DsProps>;

// The minimap's only real function is jumping the viewport (UX-MAP-003), and it lived on a bare
// <div onClick> that derived its target from clientX/Y — so it was entirely mouse-only.

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

function jumpTarget(): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>('button[aria-label^="Jump viewport"]');
	if (!el) throw new Error('Minimap jump target did not render');
	return el;
}

function press(el: HTMLElement, key: string): void {
	act(() => {
		el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	});
}

const VIEWPORT = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

describe('Minimap', () => {
	it('exposes the viewport jump as a real focusable button', () => {
		render(<Minimap viewport={VIEWPORT} onJump={() => {}} />);
		expect(jumpTarget().tagName).toBe('BUTTON');
		expect(jumpTarget().getAttribute('aria-label')).toMatch(/jump viewport/i);
	});

	it('pans the viewport centre with the arrow keys', () => {
		const onJump = vi.fn();
		render(<Minimap viewport={VIEWPORT} onJump={onJump} />);

		// Centre of the given viewport is (0.5, 0.5); a step is 0.1.
		press(jumpTarget(), 'ArrowRight');
		expect(onJump).toHaveBeenLastCalledWith({ x: 0.6, y: 0.5 });

		press(jumpTarget(), 'ArrowUp');
		expect(onJump).toHaveBeenLastCalledWith({ x: 0.5, y: 0.4 });
	});

	it('clamps a nudge to the normalized 0–1 map extent', () => {
		const onJump = vi.fn();
		render(<Minimap viewport={{ x: 0.9, y: 0, w: 0.1, h: 0.1 }} onJump={onJump} />);
		// Centre x is 0.95, so a +0.1 step would land outside the map.
		press(jumpTarget(), 'ArrowRight');
		expect(onJump).toHaveBeenLastCalledWith({ x: 1, y: 0.05 });
	});

	it('ignores unrelated keys', () => {
		const onJump = vi.fn();
		render(<Minimap viewport={VIEWPORT} onJump={onJump} />);
		press(jumpTarget(), 'a');
		expect(onJump).not.toHaveBeenCalled();
	});

	it('keeps the collapse and expand affordances labelled', () => {
		render(<Minimap viewport={VIEWPORT} onJump={() => {}} collapsed />);
		expect(container.querySelector('[aria-label="Expand minimap"]')).not.toBeNull();
		render(<Minimap viewport={VIEWPORT} onJump={() => {}} />);
		expect(container.querySelector('[aria-label="Collapse minimap"]')).not.toBeNull();
	});
});
