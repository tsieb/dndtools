// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListItem as RawListItem } from './ListItem.jsx';

type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const ListItem = RawListItem as React.ComponentType<DsProps>;

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

function rowButton(): HTMLButtonElement {
	const button = container.querySelector('li > button');
	if (!(button instanceof HTMLButtonElement)) throw new Error('interactive row has no button');
	return button;
}

describe('ListItem', () => {
	it('renders a list item with list styling and selection state', () => {
		render(
			<ul>
				<ListItem selected>Choice row</ListItem>
			</ul>,
		);
		const row = container.querySelector('li');
		expect(row).toBeTruthy();
		expect(row?.getAttribute('data-selected')).toBe('true');
		// A static row adds no interaction semantics of its own.
		expect(row?.hasAttribute('role')).toBe(false);
		expect(row?.hasAttribute('tabindex')).toBe(false);
		expect(container.querySelector('button')).toBeNull();
	});

	it('keeps listitem semantics and exposes interaction through a native toggle button', () => {
		// axe `list` (WCAG 1.3.1): overriding the <li> role leaves the <ul> with a non-listitem child.
		render(
			<ul>
				<ListItem interactive selected>
					Selected row
				</ListItem>
				<ListItem interactive>Other row</ListItem>
			</ul>,
		);
		const list = container.querySelector('ul');
		for (const child of Array.from(list?.children ?? [])) {
			expect(child.tagName).toBe('LI');
			expect(child.hasAttribute('role')).toBe(false);
			expect(child.hasAttribute('tabindex')).toBe(false);
		}
		const buttons = Array.from(container.querySelectorAll('li > button'));
		expect(buttons).toHaveLength(2);
		expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button']);
		expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
		expect(buttons[0].textContent).toBe('Selected row');
	});

	it('fires onSelect and onClick when the row button is activated', () => {
		const onSelect = vi.fn();
		const onClick = vi.fn();
		render(
			<ul>
				<ListItem interactive onSelect={onSelect} onClick={onClick}>
					Rows
				</ListItem>
			</ul>,
		);
		act(() => rowButton().click());
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('disables the row button so a disabled row cannot be focused or selected', () => {
		const onSelect = vi.fn();
		render(
			<ul>
				<ListItem interactive disabled onSelect={onSelect}>
					Unavailable row
				</ListItem>
			</ul>,
		);
		const button = rowButton();
		expect(button.disabled).toBe(true);
		act(() => button.click());
		expect(onSelect).not.toHaveBeenCalled();
	});
});
