// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandPalette as RawCommandPalette } from './CommandPalette';

// Runtime-contract tests intentionally render through an untyped seam, as ds-interaction-fixes does.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const CommandPalette = RawCommandPalette as unknown as React.ComponentType<DsProps>;

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

describe('the command palette owns Escape', () => {
	// The input takes focus on the next tick, and Escape used to be the input's own keydown — so an
	// Escape pressed straight after opening hit the opener, was dropped, and the palette stayed up
	// over the page (shell-polish e2e: the header Search click was intercepted by the scrim).
	it('closes on an Escape pressed before its input has focus', () => {
		const opener = document.createElement('button');
		document.body.appendChild(opener);
		opener.focus();
		const closed: string[] = [];
		act(() =>
			root.render(<CommandPalette open commands={[]} onClose={() => closed.push('palette')} />),
		);
		expect(document.activeElement).toBe(opener);
		act(() => {
			opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toEqual(['palette']);
		opener.remove();
	});

	it('still closes on an Escape from its own input', async () => {
		const closed: string[] = [];
		act(() =>
			root.render(<CommandPalette open commands={[]} onClose={() => closed.push('palette')} />),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
		const input = container.querySelector('input[role="combobox"]') as HTMLInputElement;
		expect(document.activeElement).toBe(input);
		act(() => {
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toEqual(['palette']);
	});
});
