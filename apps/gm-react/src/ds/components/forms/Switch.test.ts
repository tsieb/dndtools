// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch.jsx';

const TestSwitch = Switch as ComponentType<{
	checked?: boolean;
	label?: string;
	onChange?: (checked: boolean) => void;
	'aria-label'?: string;
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

describe('Switch accessibility', () => {
	it('associates its visible label and lets either affordance toggle once', async () => {
		const onChange = vi.fn();
		await act(async () =>
			root.render(createElement(TestSwitch, { label: 'Cloud backup', onChange })),
		);
		const button = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		const labelId = button.getAttribute('aria-labelledby');
		expect(labelId).toBeTruthy();
		expect(document.getElementById(labelId!)?.textContent).toBe('Cloud backup');

		await act(async () => document.getElementById(labelId!)!.click());
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(true);
	});

	it('preserves an explicit accessible name for icon-only switches', async () => {
		await act(async () =>
			root.render(createElement(TestSwitch, { 'aria-label': 'Reduce motion', checked: true })),
		);
		const button = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		expect(button.getAttribute('aria-label')).toBe('Reduce motion');
		expect(button.hasAttribute('aria-labelledby')).toBe(false);
	});
});
