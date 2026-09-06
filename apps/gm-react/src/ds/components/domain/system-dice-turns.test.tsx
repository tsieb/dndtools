// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	readRollUnderSystem,
	resolveTurnModel,
	rollExpression,
	type DiceRollResult,
	type SystemPackage,
} from '@dndtools/core';
import { DiceResult as RawDiceResult } from './DiceResult.jsx';
import { InitiativeRow as RawInitiativeRow } from './InitiativeRow.jsx';

/**
 * RC-SYS-2.4 — the dice readout and the tracker row render the ACTIVE PACKAGE'S model.
 *
 * The design system is framework-pure and takes plain props, so these tests feed it exactly what a
 * screen would: the package's model plus the readout the core already derived. The snapshots are of
 * the READ-OUT TEXT rather than the styled markup — what a DM (or a screen reader) actually gets out
 * of the row is the contract worth pinning; the inline styles are not.
 */

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the imports as open prop bags rather than restating each component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const DiceResult = RawDiceResult as React.ComponentType<DsProps>;
const InitiativeRow = RawInitiativeRow as React.ComponentType<DsProps>;

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

function render(node: React.ReactElement): void {
	act(() => root.render(node));
}

/** The readable snapshot of a rendered surface: its text, with runs of whitespace collapsed. */
function readout(): string {
	return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function roll(expression: string, seed: number): DiceRollResult {
	const result = rollExpression(expression, seed);
	if (!result.ok) throw new Error(`expected a rollable expression: ${result.error.message}`);
	return result.result;
}

/** Render `DiceResult` the way a screen does: package model + the core's derived readout. */
function renderRoll(pkg: SystemPackage, expression: string, seed: number): void {
	const result = roll(expression, seed);
	const read = readRollUnderSystem(pkg, result);
	render(
		<DiceResult
			notation={result.expression}
			model={read.model}
			total={read.total}
			dice={read.dice}
			successes={read.headlineKind === 'successes' ? read.headline : null}
			successThreshold={read.successThreshold}
			tier={read.tier}
			modifier={read.modifier}
			crit={read.crit ?? undefined}
		/>,
	);
}

describe('DiceResult renders the package’s dice model', () => {
	it('a d20 package leads with the total', () => {
		renderRoll(DND5E_SYSTEM_PACKAGE, '1d20+5', 4242);
		expect(readout()).toMatchSnapshot();
		expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toMatch(
			/^1d20\+5: \d+$/,
		);
	});

	it('a pool package leads with the success COUNT and marks each successful die', () => {
		const result = roll('5d6', 99);
		const successes = result.kept.filter((face) => face >= 4).length;
		renderRoll(GENERIC_SYSTEM_PACKAGE, '5d6', 99);
		expect(readout()).toMatchSnapshot();
		expect(readout()).toContain('successes at 4+');
		expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
			`5d6: ${successes} successes`,
		);
		// A success is marked with a check, not only a colour, so the count survives grayscale.
		expect(container.querySelectorAll('svg').length).toBe(1 + successes);
		expect(
			[...container.querySelectorAll('[title]')].filter((node) =>
				(node.getAttribute('title') ?? '').endsWith('— success'),
			),
		).toHaveLength(successes);
	});

	it('a 2d6 package names the outcome tier', () => {
		const pbta: SystemPackage = {
			...GENERIC_SYSTEM_PACKAGE,
			dice: {
				model: '2d6-pbta',
				notation: '2d6',
				advantage: 'extra-die',
				successThreshold: null,
				crit: { naturalHigh: 10, naturalLow: 6, effect: 'extra-effect' },
			},
		};
		renderRoll(pbta, '2d6', 7);
		expect(readout()).toMatchSnapshot();
		expect(readout()).toMatch(/Strong hit|Partial hit|Miss/);
	});

	it('with no model given it renders exactly what it always did', () => {
		render(<DiceResult notation="1d20" total={18} rolls={[13]} modifier={5} />);
		expect(readout()).toBe('1d2018[13] +5');
	});
});

describe('InitiativeRow renders the package’s turn model', () => {
	const base = { name: 'Goblin', current: 5, max: 7, active: true };

	it('an initiative package shows the number and marks whose turn it is', () => {
		expect(resolveTurnModel(DND5E_SYSTEM_PACKAGE).kind).toBe('initiative');
		render(<InitiativeRow {...base} initiative={15} turnModel="initiative" />);
		expect(readout()).toMatchSnapshot();
		expect(readout()).toContain('15');
		expect(container.querySelector('[aria-label="In the spotlight"]')).toBeNull();
	});

	it('a `none` package drops the initiative number and marks the SPOTLIGHT instead', () => {
		expect(resolveTurnModel(GENERIC_SYSTEM_PACKAGE).spotlight).toBe(true);
		render(<InitiativeRow {...base} initiative={15} turnModel="none" />);
		expect(readout()).toMatchSnapshot();
		expect(readout()).not.toContain('15');
		expect(container.querySelector('[aria-label="In the spotlight"]')).not.toBeNull();
	});

	it('an `actions-per-turn` package draws the action budget as pips, with the count read aloud', () => {
		render(
			<InitiativeRow
				{...base}
				initiative={15}
				turnModel="actions-per-turn"
				actionsPerTurn={3}
				actionsUsed={1}
			/>,
		);
		// `[aria-label]`-suffixed rather than `[role="img"]`: the turn marker icon is a role="img" too.
		const pips = container.querySelector('[aria-label$="actions left"]');
		expect(pips?.getAttribute('aria-label')).toBe('2 of 3 actions left');
		expect(pips?.childElementCount).toBe(3);
		expect(readout()).not.toContain('15');
		expect(container.querySelector('[aria-label="Their turn"]')).not.toBeNull();
	});

	it('spending more actions than the budget never draws negative pips', () => {
		render(
			<InitiativeRow {...base} turnModel="actions-per-turn" actionsPerTurn={2} actionsUsed={9} />,
		);
		expect(container.querySelector('[aria-label$="actions left"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="0 of 2 actions left"]')?.childElementCount).toBe(
			2,
		);
	});

	it('with no turn model given it renders exactly what it always did', () => {
		render(<InitiativeRow {...base} initiative={15} conditions={['Prone']} />);
		expect(readout()).toBe('15GGoblinProne5/7−+');
	});
});
