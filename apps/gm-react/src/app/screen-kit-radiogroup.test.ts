// @vitest-environment jsdom

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { radioGroupKeyDown } from './screen-kit';

// `radioGroupKeyDown` is the shared ARIA keyboard contract for this app's HAND-ROLLED radiogroups —
// the choice-card grids in Onboarding (x4), Community and Settings (x2). It only reads `key`,
// `currentTarget`, `target` and `preventDefault`, so a plain object stands in for the synthetic
// React event and no component has to be mounted (which would drag in matchMedia and react-router).

function group(specs: Array<{ label: string; disabled?: boolean }>) {
	const host = document.createElement('div');
	host.setAttribute('role', 'radiogroup');
	const clicked: string[] = [];
	for (const spec of specs) {
		const radio = document.createElement('button');
		radio.setAttribute('role', 'radio');
		radio.textContent = spec.label;
		if (spec.disabled) radio.setAttribute('aria-disabled', 'true');
		radio.addEventListener('click', () => clicked.push(spec.label));
		host.appendChild(radio);
	}
	document.body.appendChild(host);
	const radios = Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'));
	let prevented = 0;
	const press = (key: string, from: HTMLElement) => {
		radioGroupKeyDown({
			key,
			currentTarget: host,
			target: from,
			preventDefault: () => {
				prevented += 1;
			},
		} as unknown as ReactKeyboardEvent);
	};
	return { host, radios, clicked, press, prevented: () => prevented };
}

describe('radioGroupKeyDown', () => {
	it('moves the selection with the arrow keys and wraps', () => {
		const g = group([{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
		g.press('ArrowRight', g.radios[0]);
		expect(document.activeElement).toBe(g.radios[1]);
		expect(g.clicked).toEqual(['B']);
		g.press('ArrowUp', g.radios[0]);
		expect(document.activeElement).toBe(g.radios[2]);
		expect(g.clicked).toEqual(['B', 'C']);
	});

	it('skips a disabled radio instead of landing on it', () => {
		// Selection FOLLOWS focus here, so arrowing onto a radio that cannot take the selection both
		// stranded the keyboard cursor on a dead control and silently dropped the user's choice.
		const g = group([{ label: 'A' }, { label: 'B', disabled: true }, { label: 'C' }]);
		g.press('ArrowRight', g.radios[0]);
		expect(document.activeElement).toBe(g.radios[2]);
		expect(g.clicked).toEqual(['C']);
	});

	it('honours Home and End, which the WAI-ARIA radiogroup pattern requires', () => {
		// These groups render as WRAPPED grids of cards, so "the first option" is not one arrow press
		// away — Onboarding's tone picker is six cards over two rows.
		const g = group([{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }]);
		g.press('End', g.radios[0]);
		expect(document.activeElement).toBe(g.radios[3]);
		expect(g.clicked).toEqual(['D']);
		g.press('Home', g.radios[3]);
		expect(document.activeElement).toBe(g.radios[0]);
		expect(g.clicked).toEqual(['D', 'A']);
	});

	it('lands Home/End on an enabled radio, never a disabled edge', () => {
		const g = group([
			{ label: 'A', disabled: true },
			{ label: 'B' },
			{ label: 'C' },
			{ label: 'D', disabled: true },
		]);
		g.press('Home', g.radios[1]);
		expect(document.activeElement).toBe(g.radios[1]);
		g.press('End', g.radios[1]);
		expect(document.activeElement).toBe(g.radios[2]);
		expect(g.clicked).toEqual(['B', 'C']);
	});

	it('ignores keys it does not own, and events from outside the group', () => {
		const g = group([{ label: 'A' }, { label: 'B' }]);
		g.press('Enter', g.radios[0]);
		g.press('a', g.radios[0]);
		const outsider = document.createElement('input');
		document.body.appendChild(outsider);
		g.press('ArrowRight', outsider);
		g.press('End', outsider);
		expect(g.clicked).toEqual([]);
		expect(g.prevented()).toBe(0);
	});
});
