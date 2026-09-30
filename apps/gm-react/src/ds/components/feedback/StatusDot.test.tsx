// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusDot } from './StatusDot';

// RC-ENG-9.1 — StatusDot rendered its pulse keyframes as an inline `<style>` child. A `<style>`'s
// text is text content, so every control named from its content (the sidebar's live-scene row)
// announced `@keyframes dndPulse{…}` ahead of its real name.

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

describe('StatusDot', () => {
	it('renders no <style> child, pulsing or not', () => {
		act(() =>
			root.render(
				<>
					<StatusDot status="live" pulse />
					<StatusDot status="live" pulse label="Live" />
					<StatusDot status="idle" />
				</>,
			),
		);
		expect(container.querySelector('style')).toBeNull();
		expect(container.textContent).not.toContain('@keyframes');
	});

	it('pulses with keyframes from the motion stylesheet', () => {
		act(() => root.render(<StatusDot status="live" pulse label="Live" />));
		const ring = Array.from(container.querySelectorAll<HTMLElement>('span')).find((el) =>
			el.style.animation.includes('motion-sheet-slide'),
		);
		expect(ring?.style.animation).toContain('motion-fade-in');
		expect(ring?.style.getPropertyValue('--motion-sheet-from')).toBe('scale(2.6)');
		// The label is the only text: nothing else is there to leak into an accessible name.
		expect(container.textContent).toBe('Live');
	});
});
