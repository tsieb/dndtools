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

	// WCAG 2.5.8: the control's TARGET must clear 24px even though the painted pill stays 38x22.
	// The hit box is the <button>; the pill moved to an inner span so the visual did not change.
	it('gives the target a 24px minimum without growing the painted track', async () => {
		await act(async () => root.render(createElement(TestSwitch, { label: 'Snap to grid' })));
		const button = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		expect(button.style.minWidth).toBe('var(--density-touch-target, 24px)');
		expect(button.style.minHeight).toBe('var(--density-touch-target, 24px)');
		// The button itself no longer paints the track…
		expect(button.style.background).toBe('transparent');
		expect(button.style.borderStyle).toBe('none');
		// …the inner track does, at the original compact size.
		const track = button.firstElementChild as HTMLElement;
		expect(track.style.width).toBe('38px');
		expect(track.style.height).toBe('22px');
		// And the knob still lives inside the track.
		expect(track.firstElementChild).not.toBeNull();
	});
});
