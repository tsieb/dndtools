import { afterEach, describe, expect, it } from 'vitest';
import {
	createFocusTrap,
	getFocusable,
	isFocusable,
	nextTrapTarget,
} from '../../src/lib/gui/a11y/focus-trap';

// UX-A11Y-009 / UX-A11Y-012: one reusable focus trap — Tab cycles inside, Escape escapes (AP-3),
// focus restores to the trigger on close.

function mountContainer(html: string): HTMLElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.appendChild(container);
	return container;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('isFocusable / getFocusable', () => {
	it('excludes disabled, hidden, aria-hidden, and tabindex=-1 elements', () => {
		const container = mountContainer(`
			<button id="a">A</button>
			<button id="b" disabled>B</button>
			<button id="c" hidden>C</button>
			<button id="d" aria-hidden="true">D</button>
			<button id="e" tabindex="-1">E</button>
			<a id="f" href="#x">F</a>
		`);
		const ids = getFocusable(container).map((el) => el.id);
		expect(ids).toEqual(['a', 'f']);
		expect(isFocusable(container.querySelector('#b')!)).toBe(false);
		expect(isFocusable(container.querySelector('#a')!)).toBe(true);
	});

	it('excludes a focusable inside a hidden ancestor', () => {
		const container = mountContainer(`<div hidden><button id="a">A</button></div><button id="b">B</button>`);
		expect(getFocusable(container).map((el) => el.id)).toEqual(['b']);
	});
});

describe('nextTrapTarget (pure Tab-cycle resolver)', () => {
	const els = ['x', 'y', 'z'].map((id) => {
		const el = document.createElement('button');
		el.id = id;
		return el;
	});

	it('wraps forward from the last element to the first', () => {
		expect(nextTrapTarget(els, els[2]!, false)).toBe(els[0]);
	});

	it('wraps backward from the first element to the last', () => {
		expect(nextTrapTarget(els, els[0]!, true)).toBe(els[2]);
	});

	it('moves forward/backward in the middle', () => {
		expect(nextTrapTarget(els, els[1]!, false)).toBe(els[2]);
		expect(nextTrapTarget(els, els[1]!, true)).toBe(els[0]);
	});

	it('pulls focus to an end when focus is currently outside the trap', () => {
		expect(nextTrapTarget(els, null, false)).toBe(els[0]);
		expect(nextTrapTarget(els, null, true)).toBe(els[2]);
	});

	it('returns null when there is nothing focusable', () => {
		expect(nextTrapTarget([], null, false)).toBeNull();
	});
});

describe('createFocusTrap (DOM controller)', () => {
	it('focuses the first focusable on activate and restores the trigger on deactivate', () => {
		const trigger = document.createElement('button');
		trigger.id = 'trigger';
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const container = mountContainer(`<button id="one">One</button><button id="two">Two</button>`);
		const trap = createFocusTrap(container, {});
		trap.activate();
		expect(document.activeElement).toBe(container.querySelector('#one'));

		trap.deactivate();
		// Focus returns to the element that was focused at activation (the trigger).
		expect(document.activeElement).toBe(trigger);
	});

	it('cycles focus on Tab and never leaves the trap (AC: focus never leaves until Escape)', () => {
		const container = mountContainer(`<button id="one">One</button><button id="two">Two</button>`);
		const trap = createFocusTrap(container, {});
		trap.activate();
		const one = container.querySelector<HTMLButtonElement>('#one')!;
		const two = container.querySelector<HTMLButtonElement>('#two')!;

		two.focus();
		// Tab from the last focusable wraps back to the first (focus stays inside the trap).
		two.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(one);

		// Shift+Tab from the first wraps to the last.
		one.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(two);
		trap.deactivate();
	});

	it('invokes onEscape so the trap is always escapable (AP-3)', () => {
		const container = mountContainer(`<button id="one">One</button>`);
		let escaped = 0;
		const trap = createFocusTrap(container, { onEscape: () => (escaped += 1) });
		trap.activate();
		container
			.querySelector('#one')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		expect(escaped).toBe(1);
		trap.deactivate();
	});

	it('honours an explicit initialFocus and returnFocusTo', () => {
		const ret = document.createElement('button');
		ret.id = 'ret';
		document.body.appendChild(ret);
		const container = mountContainer(`<button id="one">One</button><button id="two">Two</button>`);
		const two = container.querySelector<HTMLButtonElement>('#two')!;
		const trap = createFocusTrap(container, { initialFocus: two, returnFocusTo: ret });
		trap.activate();
		expect(document.activeElement).toBe(two);
		trap.deactivate();
		expect(document.activeElement).toBe(ret);
	});
});
