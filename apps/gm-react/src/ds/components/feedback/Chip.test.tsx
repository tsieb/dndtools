// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chip as RawChip } from './Chip.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Chip = RawChip as React.ComponentType<DsProps>;

// A clickable Chip used to render a bare <span onClick> with `cursor: pointer` — keyboard-dead, and
// announced as static text. `selected` also drove a background change with no semantic counterpart.

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

function chip(): HTMLElement {
	const el = container.firstElementChild;
	if (!(el instanceof HTMLElement)) throw new Error('Chip did not render');
	return el;
}

describe('Chip', () => {
	it('exposes a clickable chip as a focusable button', () => {
		render(<Chip onClick={() => {}}>Poisoned</Chip>);
		expect(chip().getAttribute('role')).toBe('button');
		expect(chip().tabIndex).toBe(0);
	});

	it('reflects the selected state with aria-pressed', () => {
		render(
			<Chip onClick={() => {}} selected>
				Concentrating
			</Chip>,
		);
		expect(chip().getAttribute('aria-pressed')).toBe('true');

		render(<Chip onClick={() => {}}>Concentrating</Chip>);
		expect(chip().getAttribute('aria-pressed')).toBe('false');
	});

	it('activates on Enter and on Space', () => {
		const onClick = vi.fn();
		render(<Chip onClick={onClick}>Prone</Chip>);

		act(() => {
			chip().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		});
		expect(onClick).toHaveBeenCalledTimes(1);

		act(() => {
			chip().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		});
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	it('ignores unrelated keys', () => {
		const onClick = vi.fn();
		render(<Chip onClick={onClick}>Blinded</Chip>);
		act(() => {
			chip().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		});
		expect(onClick).not.toHaveBeenCalled();
	});

	// Most chips are plain tags; a decorative chip must not become a tab stop.
	it('leaves a non-clickable chip as static content', () => {
		render(<Chip>Undead</Chip>);
		expect(chip().getAttribute('role')).toBeNull();
		expect(chip().getAttribute('tabindex')).toBeNull();
		expect(chip().getAttribute('aria-pressed')).toBeNull();
	});

	// WCAG 2.5.8 — the remove affordance was a 12px glyph with `padding: 0`.
	it('gives the remove control a 24px minimum target', () => {
		render(<Chip onRemove={() => {}}>Charmed</Chip>);
		const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove"]');
		expect(remove).not.toBeNull();
		expect(remove!.style.minWidth).toBe('var(--density-touch-target, 24px)');
		expect(remove!.style.minHeight).toBe('var(--density-touch-target, 24px)');
	});

	it('removes without also triggering the chip body click', () => {
		const onClick = vi.fn();
		const onRemove = vi.fn();
		render(
			<Chip onClick={onClick} onRemove={onRemove}>
				Frightened
			</Chip>,
		);
		const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove"]')!;
		act(() => remove.click());
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onClick).not.toHaveBeenCalled();
	});
});
