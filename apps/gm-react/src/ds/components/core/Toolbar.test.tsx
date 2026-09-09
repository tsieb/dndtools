// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toolbar as RawToolbar } from './Toolbar.jsx';

type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Toolbar = RawToolbar as React.ComponentType<DsProps>;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('Toolbar', () => {
	it('renders as role toolbar', () => {
		act(() =>
			root.render(
				<Toolbar ariaLabel="Actions">
					<button type="button">A</button>
				</Toolbar>,
			),
		);
		const toolbar = container.querySelector('[role="toolbar"]');
		expect(toolbar).toBeTruthy();
	});
});

it('moves focus with arrow keys, skipping disabled buttons', () => {
	act(() =>
		root.render(
			<Toolbar>
				<button>A</button>
				<button disabled>B</button>
				<button>C</button>
			</Toolbar>,
		),
	);
	const buttons = container.querySelectorAll('button');
	buttons[0].focus();
	act(() =>
		buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
	);
	expect(document.activeElement).toBe(buttons[2]);
	act(() =>
		buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
	);
	expect(document.activeElement).toBe(buttons[0]);
});
