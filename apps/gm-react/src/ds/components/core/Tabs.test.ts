// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs.jsx';

const TestTabs = Tabs as ComponentType<{
	tabs: Array<{ id: string; label: string; disabled?: boolean }>;
	value: string;
	onChange: (value: string) => void;
}>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Tabs keyboard navigation', () => {
	it('uses one tab stop and moves selection with arrow keys while skipping disabled tabs', async () => {
		const onChange = vi.fn();
		await act(async () =>
			root.render(
				createElement(TestTabs, {
					tabs: [
						{ id: 'one', label: 'One' },
						{ id: 'two', label: 'Two', disabled: true },
						{ id: 'three', label: 'Three' },
					],
					value: 'one',
					onChange,
				}),
			),
		);
		const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
		expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
		tabs[0].focus();

		await act(async () => {
			tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		});
		expect(document.activeElement).toBe(tabs[2]);
		expect(onChange).toHaveBeenCalledWith('three');
	});
});
