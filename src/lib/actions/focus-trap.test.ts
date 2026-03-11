import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './focus-trap.js';

function waitForAnimationFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

function markVisible(element: HTMLElement): void {
	Object.defineProperty(element, 'getClientRects', {
		value: () => ({
			length: 1,
			item: () => null,
			[Symbol.iterator]: function* iterator() {},
		}),
		configurable: true,
	});
}

describe('useFocusTrap', () => {
	it('cycles focus with Tab and Shift+Tab', async () => {
		document.body.innerHTML = `
			<button id="trigger">Open</button>
			<div id="dialog">
				<button id="first">First</button>
				<button id="last">Last</button>
			</div>
		`;
		const dialog = document.getElementById('dialog') as HTMLElement;
		const first = document.getElementById('first') as HTMLButtonElement;
		const last = document.getElementById('last') as HTMLButtonElement;
		markVisible(dialog);
		markVisible(first);
		markVisible(last);
		first.focus();

		const trap = useFocusTrap(dialog);
		await waitForAnimationFrame();

		last.focus();
		dialog.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(first);

		first.focus();
		dialog.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Tab',
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(document.activeElement).toBe(last);

		trap.destroy();
	});

	it('calls onEscape and restores focus on destroy', async () => {
		document.body.innerHTML = `
			<button id="trigger">Open</button>
			<div id="dialog">
				<button id="inside">Inside</button>
			</div>
		`;
		const trigger = document.getElementById('trigger') as HTMLButtonElement;
		const dialog = document.getElementById('dialog') as HTMLElement;
		const inside = document.getElementById('inside') as HTMLButtonElement;
		markVisible(dialog);
		markVisible(trigger);
		markVisible(inside);
		const onEscape = vi.fn();

		trigger.focus();
		const trap = useFocusTrap(dialog, { onEscape });
		await waitForAnimationFrame();

		dialog.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
		);
		expect(onEscape).toHaveBeenCalledTimes(1);

		trap.destroy();
		expect(document.activeElement).toBe(trigger);
	});
});
