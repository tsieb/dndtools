// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as RawCard } from './Card.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Card = RawCard as React.ComponentType<DsProps>;

// An `interactive` Card is a control — the Command Center library tiles, the Characters roster, and
// the Knowledge note grid are all built from one. It used to render as a bare <div> with nothing but
// `cursor: pointer`, so those grids were reachable only with a mouse (WCAG 2.1.1 / 4.1.2).

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

function card(): HTMLElement {
	const el = container.firstElementChild;
	if (!(el instanceof HTMLElement)) throw new Error('Card did not render');
	return el;
}

describe('Card', () => {
	it('exposes an interactive card as a focusable button', () => {
		render(
			<Card interactive onClick={() => {}}>
				Characters
			</Card>,
		);
		expect(card().getAttribute('role')).toBe('button');
		expect(card().tabIndex).toBe(0);
	});

	it('activates on Enter and on Space', () => {
		const onClick = vi.fn();
		render(
			<Card interactive onClick={onClick}>
				Notes
			</Card>,
		);

		act(() => {
			card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		});
		expect(onClick).toHaveBeenCalledTimes(1);

		act(() => {
			card().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		});
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	it('ignores unrelated keys', () => {
		const onClick = vi.fn();
		render(
			<Card interactive onClick={onClick}>
				Maps
			</Card>,
		);
		act(() => {
			card().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		});
		expect(onClick).not.toHaveBeenCalled();
	});

	// A decorative panel must NOT become a tab stop just because it is styled as a card — most Cards
	// in the app are plain containers.
	it('leaves a non-interactive card as a plain container', () => {
		render(<Card>Panel body</Card>);
		expect(card().getAttribute('role')).toBeNull();
		expect(card().getAttribute('tabindex')).toBeNull();
	});

	it('leaves an interactive card with no onClick as a plain container', () => {
		render(<Card interactive>Decorative</Card>);
		expect(card().getAttribute('role')).toBeNull();
		expect(card().getAttribute('tabindex')).toBeNull();
	});

	it('lets a call site override the implied role', () => {
		render(
			<Card interactive role="link" onClick={() => {}}>
				Elsewhere
			</Card>,
		);
		expect(card().getAttribute('role')).toBe('link');
	});
});
