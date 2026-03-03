import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceMacro } from '$lib/types/settings.js';

const persisted: { diceMacros: DiceMacro[] } = { diceMacros: [] };
const getSetting = vi.fn(async (key: string) => {
	if (key === 'diceMacros') return persisted.diceMacros;
	return null;
});
const setSetting = vi.fn(async (_key: string, value: DiceMacro[]) => {
	persisted.diceMacros = value;
});

vi.mock('$lib/platform/storage/index.js', () => ({
	getStorage: () => ({
		getSetting,
		setSetting,
	}),
}));

describe('diceState', () => {
	beforeEach(() => {
		persisted.diceMacros = [];
		getSetting.mockClear();
		setSetting.mockClear();
		vi.resetModules();
	});

	it('loads and normalizes dice macros from settings storage', async () => {
		persisted.diceMacros = [
			{
				id: 'macro-fireball',
				label: 'Fireball Save',
				expression: '8d6',
				createdAt: '2026-03-02T00:00:00.000Z',
				updatedAt: '2026-03-02T00:00:00.000Z',
			},
			{
				id: 'macro-sneak',
				label: 'Sneak Attack',
				expression: '1d20+7',
				createdAt: '2026-03-02T00:00:00.000Z',
				updatedAt: '2026-03-02T00:00:00.000Z',
			},
		];
		const { diceState } = await import('./dice.svelte.js');
		await diceState.loadMacros();

		expect(diceState.macros).toHaveLength(2);
		expect(diceState.macros.map((macro) => macro.label)).toEqual(['Fireball Save', 'Sneak Attack']);
		expect(getSetting).toHaveBeenCalledWith('diceMacros');
	});

	it('saves new macros and updates existing ones', async () => {
		const { diceState } = await import('./dice.svelte.js');
		await diceState.loadMacros();

		const created = await diceState.saveMacro({
			label: 'Sneak Attack',
			expression: '1d20+7',
		});
		expect(created.ok).toBe(true);
		expect(diceState.macros).toHaveLength(1);
		expect(setSetting).toHaveBeenCalled();

		const id = diceState.macros[0]?.id;
		const updated = await diceState.saveMacro({
			id,
			label: 'Sneak Attack',
			expression: '1d20+8',
		});
		expect(updated.ok).toBe(true);
		expect(diceState.macros).toHaveLength(1);
		expect(diceState.macros[0]?.expression).toBe('1d20+8');
	});

	it('rejects invalid macro expressions', async () => {
		const { diceState } = await import('./dice.svelte.js');
		await diceState.loadMacros();

		const result = await diceState.saveMacro({
			label: 'Broken Macro',
			expression: '2d6kh9',
		});
		expect(result.ok).toBe(false);
		expect(setSetting).not.toHaveBeenCalled();
	});

	it('records roll history and supports clear', async () => {
		const { diceState } = await import('./dice.svelte.js');

		const success = diceState.roll('5+5');
		expect(success.ok).toBe(true);
		expect(diceState.history).toHaveLength(1);
		expect(diceState.lastRoll?.total).toBe(10);

		const invalid = diceState.roll('0d6');
		expect(invalid.ok).toBe(false);
		expect(diceState.history).toHaveLength(1);

		diceState.clearHistory();
		expect(diceState.history).toHaveLength(0);
		expect(diceState.lastRoll).toBeNull();
	});
});
