import {
	DICE_SCHEMA_VERSION,
	parseDiceExpression,
	readRollUnderSystem,
	type EvaluatedDiceTerm,
	type EvaluatedTerm,
	type SystemPackage,
	type SystemRollReadout,
} from '@dndtools/core';

/*
 * How a recorded roll reads under the active system package. Moved out of `QuickPanel.tsx` for size
 * (RC-POL-1.4); the quick panel and the /session dice tray both read rolls through here.
 */

/** What a recorded roll carries that its readout needs — a `DiceRollView` and the tray's rows both fit. */
export interface RecordedRoll {
	expression: string;
	total: number;
	dice: number[];
	modifier: number;
	terms?: EvaluatedTerm[];
}

/** A recorded roll as `DiceResult` props. */
export interface RollChipProps {
	notation: string;
	total: number;
	rolls: number[];
	modifier: number;
	model?: SystemRollReadout['model'];
	dice?: SystemRollReadout['dice'];
	successes?: number | null;
	successThreshold?: number | null;
	tier?: SystemRollReadout['tier'];
	crit: 'success' | 'fail' | undefined;
	critNatural: number | null;
}

/** The sides of the package's CORE die: the die in `dice.notation` (5e's `1d20`, Generic's `1d6`). */
function coreDieSides(pkg: SystemPackage): number | null {
	const parsed = parseDiceExpression(pkg.dice.notation);
	if (!parsed.ok) return null;
	const term = parsed.expression.terms.find((t) => t.kind === 'dice');
	return term?.kind === 'dice' ? term.sides : null;
}

/**
 * RC-SES-2.4 — a recorded roll as `DiceResult` props, read through the ACTIVE system package
 * (RC-SYS-2.4): the package's model and headline, and crit/fumble by its own `dice.crit` rules. The
 * quick panel and the /session tray both read rolls through here, so the two readouts of one roll
 * cannot disagree.
 *
 * A natural is judged on the package's CORE die only. `readRollUnderSystem` reads naturals off the
 * widest die in the expression, so under 5e a `2d6+3` damage roll showing a 1 reads as a fumble, and
 * `1d20+1d100` crits whenever the d100 clears 20 — true to the numbers, wrong at the table. A 5e
 * roll crits off its d20, a Generic pool off its d6, and a roll without the core die has no natural
 * to celebrate. A tiered (2d6-pbta) package spends its bounds on the tier, as the core does. A legacy
 * record with no `terms` has no faces to read and stays plain.
 */
export function diceResultProps(pkg: SystemPackage, roll: RecordedRoll): RollChipProps {
	const base = {
		notation: roll.expression,
		total: roll.total,
		rolls: roll.dice,
		modifier: roll.modifier,
	};
	const terms = roll.terms ?? [];
	const diceTerms = terms.filter((t): t is EvaluatedDiceTerm => t.kind === 'dice');
	if (diceTerms.length === 0) return { ...base, crit: undefined, critNatural: null };
	const read = readRollUnderSystem(pkg, {
		expression: roll.expression,
		seed: 0,
		terms,
		dice: roll.dice,
		kept: diceTerms.flatMap((t) => t.kept),
		modifier: roll.modifier,
		total: roll.total,
		schemaVersion: DICE_SCHEMA_VERSION,
	});
	const sides = coreDieSides(pkg);
	const faces = diceTerms.filter((t) => t.sides === sides).flatMap((t) => t.kept);
	const { naturalHigh, naturalLow } = pkg.dice.crit;
	const judged = read.tier === null;
	const high = judged && naturalHigh !== null ? faces.filter((f) => f >= naturalHigh) : [];
	const low = judged && naturalLow !== null ? faces.filter((f) => f <= naturalLow) : [];
	const crit = high.length > 0 ? 'success' : low.length > 0 ? 'fail' : undefined;
	return {
		...base,
		model: read.model,
		dice: read.dice,
		successes: read.headlineKind === 'successes' ? read.headline : null,
		successThreshold: read.successThreshold,
		tier: read.tier,
		crit,
		critNatural: crit === 'success' ? Math.max(...high) : crit === 'fail' ? Math.min(...low) : null,
	};
}
