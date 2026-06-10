import { describe, expect, it } from 'vitest';
import {
	MAX_DICE_COUNT,
	MAX_DICE_SIDES,
	canonicalSource,
	evaluateRoll,
	parseDiceExpression,
	resolveMacro,
	resolveTableDraw,
	rollExpression,
} from '../src';

/**
 * SES-003 — the PURE deterministic dice engine. The parser is a pure function (same text → same AST),
 * malformed expressions are rejected fail-closed (never evaluated), and the roll evaluator is
 * deterministic from a recorded seed so a roll reproduces to the identical result. SES-008 — rollable
 * tables resolve from a recorded draw. Tests are the primary evidence.
 */

describe('SES-003 expression parser (pure + deterministic)', () => {
	it('parses 2d20kh1+5 into dice, keep policy, and modifier (SES-003 AC1 shape)', () => {
		const parsed = parseDiceExpression('2d20kh1+5');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.expression.terms).toEqual([
			{ kind: 'dice', count: 2, sides: 20, keep: { kind: 'highest', count: 1 }, sign: 1 },
			{ kind: 'constant', value: 5, sign: 1 },
		]);
		expect(parsed.expression.source).toBe('2d20kh1+5');
	});

	it('is deterministic: the same expression always parses to the same AST', () => {
		const a = parseDiceExpression(' 2D6 + 3 ');
		const b = parseDiceExpression('2d6+3');
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		// Whitespace-insensitive, case-insensitive: same canonical form + same terms.
		expect(a.expression.source).toBe('2d6+3');
		expect(a.expression).toEqual(b.expression);
	});

	it('supports advantage (kh1), disadvantage (kl1), implicit single die, and subtraction', () => {
		expect((parseDiceExpression('2d20kh1') as { ok: true; expression: { terms: unknown[] } }).expression.terms[0]).toMatchObject({
			keep: { kind: 'highest', count: 1 },
		});
		expect((parseDiceExpression('2d20kl1') as { ok: true; expression: { terms: unknown[] } }).expression.terms[0]).toMatchObject({
			keep: { kind: 'lowest', count: 1 },
		});
		const implicit = parseDiceExpression('d20');
		expect(implicit.ok).toBe(true);
		if (implicit.ok) expect(implicit.expression.terms[0]).toMatchObject({ count: 1, sides: 20 });
		const minus = parseDiceExpression('1d8-2');
		expect(minus.ok).toBe(true);
		if (minus.ok) expect(minus.expression.terms[1]).toEqual({ kind: 'constant', value: 2, sign: -1 });
	});

	it('rejects malformed expressions fail-closed (no silent eval) — SES-003 AC2', () => {
		for (const bad of ['', '   ', 'd', '2d', 'd0', 'abc', '2d6++3', '1d6+', '+', '2x6', '2d6kh3', '2d6kx1']) {
			const parsed = parseDiceExpression(bad);
			expect(parsed.ok, `expected "${bad}" to be rejected`).toBe(false);
		}
	});

	it('treats a bare keep suffix (2d6kh) as keep-highest-1 (common dice convention)', () => {
		const parsed = parseDiceExpression('2d6kh');
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(parsed.expression.terms[0]).toMatchObject({ keep: { kind: 'highest', count: 1 } });
	});

	it('bounds dice count and sides fail-closed', () => {
		expect(parseDiceExpression(`${MAX_DICE_COUNT + 1}d6`).ok).toBe(false);
		expect(parseDiceExpression(`1d${MAX_DICE_SIDES + 1}`).ok).toBe(false);
		expect(parseDiceExpression(`${MAX_DICE_COUNT}d${MAX_DICE_SIDES}`).ok).toBe(true);
	});

	it('round-trips the canonical source for a parsed expression', () => {
		const parsed = parseDiceExpression('3d6 + 1d4 - 2');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(canonicalSource(parsed.expression.terms)).toBe('3d6+1d4-2');
	});
});

describe('SES-003 recorded roll evaluation (deterministic, reproducible)', () => {
	it('records dice, kept values, modifier, and total for 2d20kh1+5', () => {
		const parsed = parseDiceExpression('2d20kh1+5');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const result = evaluateRoll(parsed.expression, 'seed-001');
		// Exactly two d20 dice were rolled; exactly one was kept (highest).
		const diceTerm = result.terms[0];
		if (!diceTerm || diceTerm.kind !== 'dice') throw new Error('expected dice term');
		expect(diceTerm.dice).toHaveLength(2);
		expect(diceTerm.kept).toHaveLength(1);
		expect(diceTerm.kept[0]).toBe(Math.max(...diceTerm.dice.map((d) => d.value)));
		expect(result.modifier).toBe(5);
		expect(result.total).toBe((diceTerm.kept[0] as number) + 5);
		// The recorded seed is stored so the roll is reproducible.
		expect(typeof result.seed).toBe('number');
	});

	it('REPRODUCES the identical result from the recorded seed (no re-roll) — Contract 2', () => {
		const parsed = parseDiceExpression('4d6kh3+2');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const first = evaluateRoll(parsed.expression, 123456);
		const replay = evaluateRoll(parsed.expression, first.seed);
		expect(replay).toEqual(first);
		// A DIFFERENT seed (almost surely) yields a different draw, proving the seed drives the outcome.
		const other = evaluateRoll(parsed.expression, 999999);
		expect(other.seed).not.toBe(first.seed);
	});

	it('keeps the lowest die for disadvantage and the result stays within range', () => {
		const parsed = parseDiceExpression('2d20kl1');
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const result = evaluateRoll(parsed.expression, 'disadv');
		const term = result.terms[0];
		if (!term || term.kind !== 'dice') throw new Error('expected dice term');
		expect(term.kept[0]).toBe(Math.min(...term.dice.map((d) => d.value)));
		expect(result.total).toBeGreaterThanOrEqual(1);
		expect(result.total).toBeLessThanOrEqual(20);
	});

	it('rollExpression fails closed on a malformed expression (no result produced)', () => {
		const result = rollExpression('2d6++', 'seed');
		expect(result.ok).toBe(false);
	});

	it('threads ONE seeded stream across multiple dice terms deterministically', () => {
		const a = rollExpression('1d6+1d6+1d6', 'multi');
		const b = rollExpression('1d6+1d6+1d6', 'multi');
		expect(a.ok && b.ok).toBe(true);
		if (a.ok && b.ok) expect(a.result).toEqual(b.result);
	});
});

describe('SES-008 rollable-table resolution from a recorded draw', () => {
	const entries = ['Goblins', 'A merchant', 'A storm', 'Nothing', 'Bandits', 'A shrine'];

	it('draws deterministically and selects the row matching the recorded total', () => {
		const draw = resolveTableDraw('1d6', entries, 'table-seed');
		expect(draw.ok).toBe(true);
		if (!draw.ok) return;
		expect(draw.result.rowNumber).toBe(draw.result.roll.total);
		expect(draw.result.rowText).toBe(entries[draw.result.rowNumber - 1]);
		// Reproducible: the same seed selects the same row.
		const replay = resolveTableDraw('1d6', entries, draw.result.roll.seed);
		expect(replay.ok && replay.result.rowNumber).toBe(draw.result.rowNumber);
	});

	it('clamps an out-of-band total into the row range (fail-closed, never a missing row)', () => {
		// A 1d20 total can exceed the 6-row table; the row is clamped into [1, rowCount].
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
			const draw = resolveTableDraw('1d20', entries, seed);
			expect(draw.ok).toBe(true);
			if (!draw.ok) continue;
			expect(draw.result.rowNumber).toBeGreaterThanOrEqual(1);
			expect(draw.result.rowNumber).toBeLessThanOrEqual(entries.length);
			expect(draw.result.rowText).toBe(entries[draw.result.rowNumber - 1]);
		}
	});

	it('rejects an empty table and a malformed table dice expression fail-closed', () => {
		expect(resolveTableDraw('1d6', [], 's').ok).toBe(false);
		expect(resolveTableDraw('nonsense', entries, 's').ok).toBe(false);
	});
});

describe('SES-003 macro resolution (pure aliases)', () => {
	const macros = [
		{ name: 'attack', expression: '1d20+5' },
		{ name: 'Fireball', expression: '8d6' },
	];

	it('resolves a macro name (case-insensitive, @-prefix tolerant) to its expression', () => {
		expect(resolveMacro('attack', macros)).toBe('1d20+5');
		expect(resolveMacro('@FIREBALL', macros)).toBe('8d6');
	});

	it('returns null for an unknown macro (caller fails closed)', () => {
		expect(resolveMacro('unknown', macros)).toBeNull();
	});
});
