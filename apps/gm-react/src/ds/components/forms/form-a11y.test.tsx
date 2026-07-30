// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Input as RawInput, Textarea as RawTextarea } from './Input.jsx';
import { Slider as RawSlider } from './Slider.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the imports as open prop bags rather than restating each contract.
type DsProps = Record<string, unknown>;
const Input = RawInput as React.ComponentType<DsProps>;
const Textarea = RawTextarea as React.ComponentType<DsProps>;
const Slider = RawSlider as React.ComponentType<DsProps>;

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

function render(node: React.ReactNode): void {
	act(() => root.render(node));
}

// `invalid` used to change the border colour and nothing else, so a rejected field (a wrong wiki
// password, a bad join code) looked unchanged to assistive tech — WCAG 3.3.1.
describe('Input invalid state', () => {
	it('exposes aria-invalid on a rejected input', () => {
		render(<Input invalid readOnly value="" />);
		expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
	});

	it('exposes aria-invalid on the icon variant too', () => {
		render(<Input invalid icon="search" readOnly value="" />);
		expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
	});

	it('exposes aria-invalid on a rejected textarea', () => {
		render(<Textarea invalid readOnly value="" />);
		expect(container.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');
	});

	// Absent, not "false" — a valid field should carry no invalid state at all.
	it('omits aria-invalid while the field is valid', () => {
		render(<Input readOnly value="" />);
		expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBeNull();
	});
});

// A panel can hold a master fader plus one slider per ambience layer. Naming every stepper the
// literal "Decrease"/"Increase" left a screen-reader user with a row of identical buttons and no way
// to tell which fader each belonged to (WCAG 2.4.6).
describe('Slider steppers', () => {
	function stepperNames(node: React.ReactNode): string[] {
		render(node);
		return [...container.querySelectorAll('button')].map(
			(b) => b.getAttribute('aria-label') ?? '',
		);
	}

	it('names the steppers after the slider label', () => {
		expect(stepperNames(<Slider steppers label="Master volume" value={50} onChange={() => {}} />)).toEqual([
			'Decrease Master volume',
			'Increase Master volume',
		]);
	});

	it('prefers an explicit aria-label over the visible label', () => {
		expect(
			stepperNames(
				<Slider steppers label="Volume" aria-label="Rain layer volume" value={50} onChange={() => {}} />,
			),
		).toEqual(['Decrease Rain layer volume', 'Increase Rain layer volume']);
	});

	it('falls back to the bare verbs when the slider is unlabelled', () => {
		expect(stepperNames(<Slider steppers value={50} onChange={() => {}} />)).toEqual([
			'Decrease',
			'Increase',
		]);
	});

	// The steppers ARE the non-drag alternative to the track (WCAG 2.5.7), so they have to follow
	// the density token rather than staying a fixed 28px square on touch.
	it('sizes the steppers from the density touch-target token', () => {
		render(<Slider steppers label="Opacity" value={50} onChange={() => {}} />);
		const button = container.querySelector('button');
		expect(button?.style.width).toContain('--density-touch-target');
		expect(button?.style.height).toContain('--density-touch-target');
	});
});
