// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
	dispatchCommand,
	findWidgetDefinition,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { boardWidgetsOf, type BoardWidget } from '../board-helpers';

/**
 * RC-CAN-8.8 — Configure dialogs carry a placeholder, an example and a validation message per entry
 * field (Dice: `1d20+5, 2d6`); Enter saves, Escape cancels behind an unsaved-changes guard.
 */

const runtimeRef: {
	state: CoreStateSlice;
	defaultActorId: string;
	dispatch: Mock<(command: CoreCommand) => Promise<CommandResult>>;
} = {
	state: buildInitialState(DM_ACTOR),
	defaultActorId: DM_ACTOR.id,
	dispatch: vi.fn(),
};

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

const { TileConfigureDialog, fieldGuide, validateDiceFormulas, validateNumberField, DICE_EXAMPLE } =
	await import('./TileDialogs');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('validateDiceFormulas', () => {
	it('accepts the example, implicit counts, keep suffixes and an empty field', () => {
		expect(validateDiceFormulas(DICE_EXAMPLE)).toBeNull();
		expect(validateDiceFormulas('d20, 2d20kh1, 4d6kl3 - 1')).toBeNull();
		expect(validateDiceFormulas('')).toBeNull();
		// The tile skips empty pieces, so a trailing or doubled comma is not an error either.
		expect(validateDiceFormulas('1d20+5,, 2d6,')).toBeNull();
	});

	it('names the first formula it cannot read and shows what to write instead', () => {
		expect(validateDiceFormulas('1d20+5, 2x6, banana')).toBe(
			'“2x6” is not a dice formula. Write dice like 1d20+5 or 2d6.',
		);
		expect(validateDiceFormulas('1d20+')).toMatch(/“1d20\+” is not a dice formula/);
	});

	it('passes the parser’s own reason on for a well-formed formula out of range', () => {
		expect(validateDiceFormulas('0d6')).toMatch(/^“0d6”: Dice count must be between 1 and \d+\.$/);
	});
});

describe('validateNumberField', () => {
	const zoom = { min: 1, max: 4, step: 0.25 };
	it('checks a number, its bounds and its step', () => {
		expect(validateNumberField(zoom, '2.5')).toBeNull();
		expect(validateNumberField(zoom, '')).toBe('Enter a number.');
		expect(validateNumberField(zoom, 'abc')).toBe('Enter a number.');
		expect(validateNumberField(zoom, '5')).toBe('Enter a number from 1 to 4.');
		expect(validateNumberField(zoom, '1.3')).toBe('Use steps of 0.25.');
		expect(validateNumberField({ min: 1, step: 1 }, '2.5')).toBe('Enter a whole number.');
		expect(validateNumberField({ min: 1, step: 1 }, '0')).toBe('Enter a number 1 or more.');
	});
});

describe('fieldGuide', () => {
	const state = buildInitialState(DM_ACTOR);
	it('gives every entry field a placeholder, an example and a check', () => {
		for (const type of ['dice', 'timer', 'note', 'handout', 'quick-reference', 'map']) {
			const definition = findWidgetDefinition(state.widgets, type)!;
			for (const field of definition.configFields ?? []) {
				if (!['text', 'textarea', 'number'].includes(field.control)) continue;
				const guide = fieldGuide(type, field, definition.displayName);
				expect(guide.placeholder, `${type}.${field.key}`).toBeTruthy();
				expect(guide.example, `${type}.${field.key}`).toBeTruthy();
				expect(guide.validate, `${type}.${field.key}`).toBeTypeOf('function');
			}
		}
		const dice = findWidgetDefinition(state.widgets, 'dice')!;
		const formulas = dice.configFields!.find((field) => field.key === 'formulas')!;
		expect(fieldGuide('dice', formulas, 'Dice')).toMatchObject({
			placeholder: '1d20+5, 2d6',
			example: expect.stringContaining('1d20+5, 2d6'),
		});
	});
});

describe('TileConfigureDialog', () => {
	let host: HTMLDivElement;
	let root: Root;
	let dice: BoardWidget;
	let onClose: Mock<() => void>;

	beforeEach(() => {
		const env = makeEnvironment();
		const result = dispatchCommand(buildInitialState(DM_ACTOR), env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		if (result.status !== 'accepted') throw new Error('no home');
		runtimeRef.state = result.nextState;
		runtimeRef.dispatch = vi.fn(async (command: CoreCommand) =>
			dispatchCommand(runtimeRef.state, env, command),
		);
		const scene = runtimeRef.state.scenes.scenes[runtimeRef.state.commandCenter.homeSceneId!]!;
		dice = boardWidgetsOf(
			scene.widgets,
			new Map(),
			(type) => findWidgetDefinition(runtimeRef.state.widgets, type) ?? null,
			{ includeUndelivered: true },
		).find((widget) => widget.type === 'dice')!;
		onClose = vi.fn<() => void>();
		host = document.createElement('div');
		document.body.appendChild(host);
		root = createRoot(host);
		act(() => root.render(<TileConfigureDialog w={dice} onClose={onClose} />));
	});

	afterEach(() => {
		act(() => root.unmount());
		host.remove();
		document.body.innerHTML = '';
	});

	const dialog = () =>
		document.querySelector<HTMLElement>('[data-testid="tile-configure-dialog"]')!;
	const formulasInput = () =>
		[...dialog().querySelectorAll('input')].find((input) => input.placeholder === DICE_EXAMPLE)!;
	function type(input: HTMLInputElement, value: string) {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		act(() => {
			setter.call(input, value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
	}
	const press = (target: EventTarget, key: string) =>
		act(() => {
			target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		});
	const configureCalls = () =>
		runtimeRef.dispatch.mock.calls.filter(([c]) => c.type === 'scene.configure-widget');

	it('shows the Dice placeholder and example, and Enter saves a valid formula list', async () => {
		const input = formulasInput();
		expect(input).toBeTruthy();
		expect(dialog().textContent).toContain('for example 1d20+5, 2d6');

		type(input, '1d20+5, 2x6');
		press(input, 'Enter');
		expect(dialog().textContent).toContain('“2x6” is not a dice formula');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(configureCalls()).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();

		type(input, '1d20+5, 2d6');
		await act(async () => {
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		});
		expect(configureCalls()).toHaveLength(1);
		const [command] = configureCalls()[0]!;
		expect((command.payload as { configuration: unknown }).configuration).toMatchObject({
			formulas: '1d20+5, 2d6',
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('Escape closes an untouched dialog and guards an edited one', () => {
		type(formulasInput(), '2d6');
		press(document, 'Escape');
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(
			'You have unsaved changes',
		);
		// Escape again backs out of the guard and keeps the draft.
		press(document, 'Escape');
		expect(dialog().querySelector('[role="alert"]')).toBeNull();
		expect(formulasInput().value).toBe('2d6');

		press(document, 'Escape');
		const discard = [...dialog().querySelectorAll('button')].find(
			(button) => button.textContent === 'Discard changes',
		)!;
		act(() => discard.click());
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(configureCalls()).toHaveLength(0);

		// A fresh dialog nobody touched closes on the first Escape.
		act(() => root.render(<TileConfigureDialog key="again" w={dice} onClose={onClose} />));
		press(document, 'Escape');
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});
