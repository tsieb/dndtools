// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	readRollUnderSystem,
	rollExpression,
	type DiceRollResult,
	type SystemPackage,
} from '@dndtools/core';
import { diceResultProps } from './QuickPanel';

/**
 * RC-SES-2.4 — which rolls get the drama. The quick panel and the /session tray read every roll
 * through `diceResultProps`, so crit/fumble follow the ACTIVE package's `dice.crit` rules
 * (RC-SYS-2.4), judged on that package's core die.
 */

/** The first seeded roll of `expression` that satisfies `wanted` — deterministic, never by chance. */
function find(expression: string, wanted: (r: DiceRollResult) => boolean): DiceRollResult {
	for (let seed = 0; seed < 20000; seed += 1) {
		const rolled = rollExpression(expression, seed);
		if (!rolled.ok) throw new Error(rolled.error.message);
		if (wanted(rolled.result)) return rolled.result;
	}
	throw new Error(`no seed found for ${expression}`);
}

const recorded = (r: DiceRollResult) => ({
	expression: r.expression,
	total: r.total,
	dice: r.dice,
	modifier: r.modifier,
	terms: r.terms,
});

const facesOf = (r: DiceRollResult, sides: number) =>
	r.terms.flatMap((t) => (t.kind === 'dice' && t.sides === sides ? t.kept : []));

describe('diceResultProps — crit by the active package', () => {
	it('5e: a natural 20 on the d20 is a crit, named by its face', () => {
		const roll = find('1d20+5', (r) => facesOf(r, 20)[0] === 20);
		const props = diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(roll));
		expect(props.crit).toBe('success');
		expect(props.critNatural).toBe(20);
		expect(props.total).toBe(roll.total);
	});

	it('5e: a natural 1 on the d20 is a fumble', () => {
		const roll = find('1d20', (r) => r.total === 1);
		expect(diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(roll))).toMatchObject({
			crit: 'fail',
			critNatural: 1,
		});
	});

	it('5e: advantage crits off the KEPT die only', () => {
		const high = find('2d20kh1', (r) => facesOf(r, 20)[0] === 20);
		expect(diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(high)).crit).toBe('success');
		// Disadvantage that rolled a 20 but kept the other die is not a crit.
		const dropped = find(
			'2d20kl1',
			(r) =>
				r.terms.some((t) => t.kind === 'dice' && t.dice.some((d) => d.value === 20 && !d.kept)) &&
				facesOf(r, 20)[0] !== 1,
		);
		expect(diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(dropped)).crit).toBeUndefined();
	});

	it('5e: a damage roll showing a 1 is NOT a fumble — the d20 is the core die', () => {
		const roll = find('2d6+3', (r) => facesOf(r, 6).includes(1));
		// The core's widest-die reading would call it a fumble; the table must not see one.
		expect(readRollUnderSystem(DND5E_SYSTEM_PACKAGE, roll).crit).toBe('fail');
		expect(diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(roll)).crit).toBeUndefined();
	});

	it('5e: a d100 riding along with the d20 cannot crit the roll', () => {
		const roll = find('1d20+1d100', (r) => {
			const d20 = facesOf(r, 20)[0]!;
			return d20 > 1 && d20 < 20 && facesOf(r, 100)[0]! >= 20;
		});
		expect(diceResultProps(DND5E_SYSTEM_PACKAGE, recorded(roll)).crit).toBeUndefined();
	});

	it('Generic: a pool crits on a natural 6 and leads with its successes', () => {
		const roll = find('5d6', (r) => r.kept.includes(6));
		const props = diceResultProps(GENERIC_SYSTEM_PACKAGE, recorded(roll));
		expect(props.crit).toBe('success');
		expect(props.critNatural).toBe(6);
		expect(props.model).toBe('dice-pool');
		expect(props.successes).toBe(roll.kept.filter((f) => f >= 4).length);
	});

	it('Generic: a d20 is not its core die, so a natural 20 there is no crit', () => {
		const roll = find('1d20', (r) => r.total === 20);
		expect(diceResultProps(GENERIC_SYSTEM_PACKAGE, recorded(roll)).crit).toBeUndefined();
	});

	it('a tiered 2d6 package reports its tier and never a crit', () => {
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
		const roll = find('2d6', (r) => r.total === 12);
		const props = diceResultProps(pbta, recorded(roll));
		expect(props.tier).toBe('strong');
		expect(props.crit).toBeUndefined();
	});

	it('a legacy record with no terms has nothing to judge and stays plain', () => {
		const props = diceResultProps(DND5E_SYSTEM_PACKAGE, {
			expression: '1d20',
			total: 20,
			dice: [20],
			modifier: 0,
		});
		expect(props).toMatchObject({ crit: undefined, critNatural: null, total: 20, rolls: [20] });
		expect(props.model).toBeUndefined();
	});
});
