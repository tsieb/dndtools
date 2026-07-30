// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Field as RawField } from './Field.jsx';
import { Input as RawInput, Textarea as RawTextarea } from './Input.jsx';
import { Slider as RawSlider } from './Slider.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the imports as open prop bags rather than restating each contract.
type DsProps = Record<string, unknown>;
const Input = RawInput as React.ComponentType<DsProps>;
const Textarea = RawTextarea as React.ComponentType<DsProps>;
const Slider = RawSlider as React.ComponentType<DsProps>;
const Field = RawField as React.ComponentType<DsProps>;

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

// Field rendered its `help`/`error` copy in an unlinked sibling <span>. The <label> was correctly
// auto-associated, so a screen-reader user heard the field's NAME but never its format hint and
// never the reason a submit was rejected — and several call sites (SceneCardsPanel's card form)
// carry real validation copy in `help`. WCAG 1.3.1 / 3.3.1.
describe('Field help and error text', () => {
	function described(): { control: Element | null; text: string | null } {
		const control = container.querySelector('input');
		const id = control?.getAttribute('aria-describedby');
		// getElementById, not querySelector: React's useId emits colons, which are legal in an
		// HTML id and in an IDREF list but not in a CSS id selector.
		const target = id ? document.getElementById(id) : null;
		return { control, text: target?.textContent ?? null };
	}

	it('describes the control with its help text', () => {
		render(
			<Field label="Party name" help="Shown to every player who joins.">
				<Input readOnly value="" />
			</Field>,
		);
		expect(described().text).toBe('Shown to every player who joins.');
	});

	it('describes the control with its error text and marks it invalid', () => {
		render(
			<Field label="Title" error="Title is required.">
				<Input readOnly value="" />
			</Field>,
		);
		const { control, text } = described();
		expect(text).toBe('Title is required.');
		expect(control?.getAttribute('aria-invalid')).toBe('true');
	});

	// An error that appears on submit must announce itself, not wait for the next focus visit.
	it('gives the error copy a live region', () => {
		render(
			<Field label="Title" error="Title is required.">
				<Input readOnly value="" />
			</Field>,
		);
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('Title is required.');
		// Help text is not urgent, so it must NOT be an alert.
		act(() =>
			root.render(
				<Field label="Title" help="Keep it short.">
					<Input readOnly value="" />
				</Field>,
			),
		);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	// `error` wins over `help` visually, so it must win in the description too — otherwise the
	// control would point at an id that renders nothing.
	it('prefers the error over the help text when both are supplied', () => {
		render(
			<Field label="Title" help="Keep it short." error="Title is required.">
				<Input readOnly value="" />
			</Field>,
		);
		expect(described().text).toBe('Title is required.');
	});

	it('preserves a describedby the call site already set', () => {
		render(
			<Field label="Title" help="Keep it short.">
				<Input readOnly value="" aria-describedby="outside-hint" />
			</Field>,
		);
		const ids = container.querySelector('input')?.getAttribute('aria-describedby')?.split(' ');
		expect(ids?.[0]).toBe('outside-hint');
		expect(ids).toHaveLength(2);
	});

	it('adds no describedby when there is neither help nor error', () => {
		render(
			<Field label="Title">
				<Input readOnly value="" />
			</Field>,
		);
		expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBeNull();
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
