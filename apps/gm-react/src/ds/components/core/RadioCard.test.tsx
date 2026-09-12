// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RadioCard as RawRadioCard } from './RadioCard.jsx';

type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const RadioCard = RawRadioCard as React.ComponentType<DsProps>;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('RadioCard', () => {
	it('activates with Enter and sets checked state', () => {
		const onChange = vi.fn();
		act(() =>
			root.render(
				<RadioCard value="a" checked onChange={onChange}>
					Choice
				</RadioCard>,
			),
		);
		const card = container.querySelector('button');
		if (!card) throw new Error('radio card did not render');
		expect(card.getAttribute('role')).toBe('radio');
		expect(card.getAttribute('aria-checked')).toBe('true');

		act(() => {
			card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		});
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});
