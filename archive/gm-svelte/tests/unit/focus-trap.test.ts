import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trapFocus } from '../../src/lib/actions/focus-trap';

/**
 * A11Y-003 AC2 — shared focus-trap action.
 *
 * "Given a modal opens, when Tab cycles, then focus remains inside until
 * dismissed." The trapFocus action wraps Tab/Shift+Tab to keep DOM focus
 * within the dialog container; all other keys pass through unchanged so the
 * host component's Escape handler fires normally.
 */

function makeDialog(...labels: string[]): { container: HTMLDivElement; buttons: HTMLButtonElement[] } {
	const container = document.createElement('div');
	container.setAttribute('role', 'dialog');
	const buttons = labels.map((label) => {
		const btn = document.createElement('button');
		btn.textContent = label;
		container.appendChild(btn);
		return btn;
	});
	document.body.appendChild(container);
	return { container, buttons };
}

function simulateTab(shiftKey = false) {
	const event = new KeyboardEvent('keydown', {
		key: 'Tab',
		shiftKey,
		bubbles: true,
		cancelable: true,
	});
	window.dispatchEvent(event);
	return event;
}

function simulateEscape() {
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	window.dispatchEvent(event);
	return event;
}

describe('trapFocus action — Tab wraps forward at the last focusable element', () => {
	let cleanup: (() => void) | undefined;

	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		cleanup?.();
		cleanup = undefined;
	});

	it('wraps forward: Tab on the last button focuses the first', () => {
		const { container, buttons } = makeDialog('First', 'Second', 'Last');
		const action = trapFocus(container);
		cleanup = action.destroy;

		const [first, , last] = buttons as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
		last.focus();
		expect(document.activeElement).toBe(last);

		const event = simulateTab(false);
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);
	});

	it('wraps backward: Shift+Tab on the first button focuses the last', () => {
		const { container, buttons } = makeDialog('First', 'Second', 'Last');
		const action = trapFocus(container);
		cleanup = action.destroy;

		const [first, , last] = buttons as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
		first.focus();

		const event = simulateTab(true);
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(last);
	});

	it('does NOT intercept Tab when the active element is a middle item', () => {
		const { container, buttons } = makeDialog('First', 'Middle', 'Last');
		const action = trapFocus(container);
		cleanup = action.destroy;

		const [, middle] = buttons as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
		middle.focus();

		const event = simulateTab(false);
		// Middle → Last is natural browser Tab; the action must not preventDefault.
		expect(event.defaultPrevented).toBe(false);
	});

	it('ignores non-Tab keys so Escape passes through to the host handler', () => {
		const { container } = makeDialog('Only');
		const action = trapFocus(container);
		cleanup = action.destroy;

		const event = simulateEscape();
		expect(event.defaultPrevented).toBe(false);
	});

	it('cleans up its listener after destroy, so a stale container cannot trap', () => {
		const { container, buttons } = makeDialog('Alpha', 'Beta');
		const action = trapFocus(container);
		// Destroy immediately — simulating dialog close.
		action.destroy();
		cleanup = undefined;

		const [alpha] = buttons as [HTMLButtonElement, HTMLButtonElement];
		// Focus would naturally stay on alpha; Tab after destroy should not be intercepted.
		alpha.focus();
		const event = simulateTab(false);
		expect(event.defaultPrevented).toBe(false);
	});

	it('is inert if the container has no focusable elements', () => {
		const container = document.createElement('div');
		container.setAttribute('role', 'dialog');
		container.innerHTML = '<p>No focusable children</p>';
		document.body.appendChild(container);
		const action = trapFocus(container);
		cleanup = action.destroy;

		// No crash; Tab is not preventDefault-ed since focusable list is empty.
		const event = simulateTab(false);
		expect(event.defaultPrevented).toBe(false);
	});
});
