// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Seg } from './screen-kit';

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

const radios = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const tabStops = () => radios().filter((r) => r.getAttribute('tabindex') === '0');

/**
 * `Seg` is this app's most-used radiogroup (15+ live groups) and it owns a roving tabindex: exactly
 * one option carries `tabIndex={0}` so the whole group costs one Tab stop. The stop has to sit on
 * the CHECKED option — which is never natively disabled, because `Seg` renders an option inert only
 * when `disabled && !checked`.
 */
describe('Seg keeps exactly one reachable tab stop', () => {
	it('puts the single tab stop on the checked option', () => {
		act(() =>
			root.render(
				<Seg
					ariaLabel="Viewpoint"
					value="b"
					onChange={() => {}}
					options={[
						{ value: 'a', label: 'A' },
						{ value: 'b', label: 'B' },
						{ value: 'c', label: 'C' },
					]}
				/>,
			),
		);
		expect(radios()).toHaveLength(3);
		expect(tabStops()).toHaveLength(1);
		expect(tabStops()[0]!.textContent).toBe('B');
	});

	it('keeps the stop on the checked option even when that option is disabled', () => {
		// The old lookup required `!o.disabled`, so a checked-but-disabled option resolved to -1 and
		// the group's only tab stop slid onto an UNCHECKED sibling — an ARIA radiogroup is supposed
		// to land the keyboard on the current selection. Session's phase rail hits exactly this
		// (the checked phase is passed `disabled` because its transitions are not allowed).
		act(() =>
			root.render(
				<Seg
					ariaLabel="Phase"
					value="b"
					onChange={() => {}}
					options={[
						{ value: 'a', label: 'A' },
						{ value: 'b', label: 'B', disabled: true },
						{ value: 'c', label: 'C' },
					]}
				/>,
			),
		);
		expect(tabStops()).toHaveLength(1);
		expect(tabStops()[0]!.textContent).toBe('B');
		// …and it is genuinely focusable: `off = disabled && !checked`, so the checked option never
		// gets the native attribute.
		expect(tabStops()[0]!.disabled).toBe(false);
	});

	it('stays keyboard-reachable when EVERY option is disabled', () => {
		// Settings' AI-provider picker sets `disabled: hasKey` on BOTH of its options, so storing an
		// API key used to drop the whole radiogroup out of the tab order (WCAG 2.1.1) while it still
		// rendered as a normal, checked control. No axe rule covers that.
		act(() =>
			root.render(
				<Seg
					ariaLabel="AI provider"
					value="anthropic"
					onChange={() => {}}
					options={[
						{ value: 'anthropic', label: 'Anthropic', disabled: true },
						{ value: 'openai-compatible', label: 'OpenAI-compatible', disabled: true },
					]}
				/>,
			),
		);
		expect(tabStops()).toHaveLength(1);
		expect(tabStops()[0]!.textContent).toBe('Anthropic');
		expect(tabStops()[0]!.disabled).toBe(false);
	});
});
