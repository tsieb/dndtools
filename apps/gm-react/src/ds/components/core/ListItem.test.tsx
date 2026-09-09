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

describe('ListItem', () => {
	it('renders a list item with list styling and selection state', () => {
		render(<ListItem selected>Choice row</ListItem>);
		const row = container.querySelector('li');
		expect(row).toBeTruthy();
		expect(row?.getAttribute('data-selected')).toBe('true');
	});

	it('fires onSelect and Enter for interactive rows', () => {
		const onSelect = vi.fn();
		render(
			<ListItem interactive onSelect={onSelect}>
				Rows
			</ListItem>,
		);
		const row = container.querySelector('li');
		if (!row) throw new Error('list item did not render');

		act(() => {
			row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		});
		expect(onSelect).toHaveBeenCalledTimes(1);
	});
});
