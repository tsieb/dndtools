// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeDirection, useDirection } from './useViewport';

/**
 * RC-UX-1.3 — RTL readiness. `useDirection` is the one reactive read of `<html dir>` that
 * direction-sensitive layout code consumes; these tests pin its default, its reaction to a runtime
 * flip (a locale switch), and that it never invents a value the DOM doesn't have.
 */

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
	document.documentElement.removeAttribute('dir');
});

describe('computeDirection', () => {
	it('defaults to ltr when the document has no dir attribute', () => {
		expect(computeDirection()).toBe('ltr');
	});

	it('reads rtl straight off the html element', () => {
		document.documentElement.dir = 'rtl';
		expect(computeDirection()).toBe('rtl');
	});

	it('treats any non-rtl value as ltr', () => {
		document.documentElement.dir = 'auto';
		expect(computeDirection()).toBe('ltr');
	});
});

describe('useDirection', () => {
	function Probe() {
		const dir = useDirection();
		return <span data-testid="dir">{dir}</span>;
	}
	const reading = () => container.querySelector('[data-testid="dir"]')?.textContent;

	it('picks up the direction already on the document at mount', () => {
		document.documentElement.dir = 'rtl';
		act(() => root.render(<Probe />));
		expect(reading()).toBe('rtl');
	});

	it('reacts when a runtime locale switch flips the dir attribute', async () => {
		act(() => root.render(<Probe />));
		expect(reading()).toBe('ltr');

		await act(async () => {
			document.documentElement.dir = 'rtl';
			// The MutationObserver callback fires as a microtask, not synchronously.
			await Promise.resolve();
		});
		expect(reading()).toBe('rtl');
	});
});
