// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu as RawMenu } from './Menu.jsx';

type DsProps = Record<string, unknown> & {
	open?: boolean;
	title?: string;
	children?: React.ReactNode;
};
const Menu = RawMenu as React.ComponentType<DsProps>;

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

describe('Menu', () => {
	it('renders with role=menu and keeps popover content', () => {
		act(() =>
			root.render(
				<Menu open title="Actions">
					<div>Item</div>
				</Menu>,
			),
		);
		const menu = container.querySelector('[role="menu"]');
		expect(menu).toBeTruthy();
		expect(container.textContent).toContain('Item');
	});
});

it('navigates enabled menu items and dismisses on Escape', async () => {
	const onClose = vi.fn();
	act(() =>
		root.render(
			<Menu title="Actions" onClose={onClose}>
				<button role="menuitem">First</button>
				<button role="menuitem" disabled>
					Unavailable
				</button>
				<button role="menuitem">Last</button>
			</Menu>,
		),
	);
	const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
	expect(document.activeElement).toBe(items[0]);
	act(() =>
		items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
	);
	expect(document.activeElement).toBe(items[2]);
	act(() => items[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
	expect(document.activeElement).toBe(items[0]);
	act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
	expect(onClose).toHaveBeenCalledTimes(1);
});
