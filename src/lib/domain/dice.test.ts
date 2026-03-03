// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	DiceExpressionError,
	normalizeDiceMacros,
	parseInlineRollCommand,
	rollDiceExpression,
} from './dice.js';

function sequenceRandom(values: number[]): () => number {
	let index = 0;
	return () => {
		const value = values[index];
		index += 1;
		if (value === undefined) {
			throw new Error('Random sequence exhausted.');
		}
		return value;
	};
}

describe('dice domain', () => {
	it('rolls basic arithmetic expressions with dice terms', () => {
		const result = rollDiceExpression('1d20+5', {
			random: sequenceRandom([0.55]),
		});
		expect(result.total).toBe(17);
		expect(result.breakdown).toBe('12 + 5');
		expect(result.markdownLine).toBe('> 🎲 1d20+5 = **17** (12 + 5)');
		expect(result.rolls).toHaveLength(1);
		expect(result.rolls[0]).toMatchObject({
			notation: '1d20',
			rolls: [12],
			kept: [12],
			dropped: [],
			subtotal: 12,
		});
	});

	it('supports keep-highest modifiers', () => {
		const result = rollDiceExpression('4d6kh3', {
			random: sequenceRandom([0.1, 0.4, 0.8, 0.95]),
		});
		expect(result.total).toBe(14);
		expect(result.breakdown).toBe('3 + 5 + 6');
		expect(result.rolls[0]).toMatchObject({
			notation: '4d6kh3',
			rolls: [1, 3, 5, 6],
			kept: [3, 5, 6],
			dropped: [1],
			subtotal: 14,
			keepMode: 'highest',
			keepCount: 3,
		});
	});

	it('supports advantage/disadvantage shorthand', () => {
		const adv = rollDiceExpression('adv + 2', {
			random: sequenceRandom([0.35, 0.9]),
		});
		expect(adv.total).toBe(21);
		expect(adv.rolls[0]?.notation).toBe('adv');
		expect(adv.rolls[0]?.rolls).toEqual([8, 19]);
		expect(adv.rolls[0]?.kept).toEqual([19]);
		expect(adv.breakdown).toBe('19 + 2');

		const dis = rollDiceExpression('dis', {
			random: sequenceRandom([0.35, 0.9]),
		});
		expect(dis.total).toBe(8);
		expect(dis.rolls[0]?.notation).toBe('dis');
		expect(dis.rolls[0]?.kept).toEqual([8]);
	});

	it('supports parenthesized arithmetic', () => {
		const result = rollDiceExpression('2 * (1d4 + 1)', {
			random: sequenceRandom([0.75]),
		});
		expect(result.total).toBe(10);
		expect(result.rolls[0]?.rolls).toEqual([4]);
	});

	it('parses /roll slash commands', () => {
		expect(parseInlineRollCommand('/roll 1d20 + 5')).toBe('1d20 + 5');
		expect(parseInlineRollCommand('  /ROLL   adv   ')).toBe('adv');
		expect(parseInlineRollCommand('/roll')).toBeNull();
		expect(parseInlineRollCommand('not a slash command')).toBeNull();
	});

	it('normalizes dice macros from untrusted settings payloads', () => {
		const normalized = normalizeDiceMacros([
			{
				id: 'macro-2',
				label: 'Fireball Save',
				expression: '8d6',
				createdAt: '2026-03-02T00:00:00.000Z',
				updatedAt: '2026-03-02T00:00:00.000Z',
			},
			{
				id: 'macro-1',
				label: 'Sneak Attack',
				expression: '1d20+7',
				createdAt: '2026-03-02T00:00:00.000Z',
				updatedAt: '2026-03-02T00:00:00.000Z',
			},
			{
				id: 'macro-1',
				label: 'Sneak Attack (Updated)',
				expression: '1d20+8',
				createdAt: '2026-03-02T00:00:00.000Z',
				updatedAt: '2026-03-02T01:00:00.000Z',
			},
			{ id: '', label: 'Invalid', expression: '1d4' },
			{ id: 'bad', label: '', expression: '1d4' },
		]);
		expect(normalized).toHaveLength(2);
		expect(normalized.map((macro) => macro.label)).toEqual([
			'Fireball Save',
			'Sneak Attack (Updated)',
		]);
		expect(normalized.find((macro) => macro.id === 'macro-1')?.expression).toBe('1d20+8');
	});

	it('rejects invalid dice expressions', () => {
		expect(() => rollDiceExpression('')).toThrow(DiceExpressionError);
		expect(() => rollDiceExpression('d0')).toThrow(DiceExpressionError);
		expect(() => rollDiceExpression('201d6')).toThrow(DiceExpressionError);
		expect(() => rollDiceExpression('2d6kh3')).toThrow(DiceExpressionError);
		expect(() => rollDiceExpression('2d6 / 0')).toThrow(DiceExpressionError);
	});
});
