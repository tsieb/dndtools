import { describe, expect, it } from 'vitest';
import { DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE } from '@dndtools/core';
import { previewClass } from './classPreview';

const scores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

describe('previewClass', () => {
	it("evaluates the package's formulas at the chosen level", () => {
		const preview = previewClass(DND5E_SYSTEM_PACKAGE, 'fighter', {
			level: 1,
			scores,
			subclass: '',
		});
		const byKey = Object.fromEntries(preview.features.map((f) => [f.key, f]));
		expect(byKey.secondWind).toMatchObject({ value: 1, unlocksAt: null, recovery: 'short' });
		expect(byKey.actionSurge).toMatchObject({ value: 0, unlocksAt: 2 });
		expect(byKey.superiorityDice).toMatchObject({ needsSubclass: 'Battle Master' });
		expect(preview.spellcasting).toBeNull();
	});

	it('lifts the subclass gate once that subclass is picked', () => {
		const preview = previewClass(DND5E_SYSTEM_PACKAGE, 'fighter', {
			level: 7,
			scores,
			subclass: 'Battle Master',
		});
		expect(preview.features.find((f) => f.key === 'superiorityDice')).toMatchObject({
			value: 5,
			needsSubclass: null,
		});
		expect(preview.features.find((f) => f.key === 'actionSurge')).toMatchObject({ value: 1 });
	});

	it("feeds the class ability's modifier into the formula", () => {
		const preview = previewClass(DND5E_SYSTEM_PACKAGE, 'bard', {
			level: 1,
			scores: { ...scores, CHA: 16 },
			subclass: '',
		});
		expect(preview.features).toEqual([
			expect.objectContaining({ key: 'bardicInspiration', value: 3, diceNotation: '1d6' }),
		]);
		expect(preview.spellcasting).toBe('CHA');
	});

	it('lists nothing for a class the package gives no resources', () => {
		const preview = previewClass(DND5E_SYSTEM_PACKAGE, 'rogue', { level: 5, scores, subclass: '' });
		expect(preview.features).toEqual([]);
		expect(preview.spellcasting).toBeNull();
	});

	it('lists nothing the active package does not declare', () => {
		const preview = previewClass(GENERIC_SYSTEM_PACKAGE, 'barbarian', {
			level: 5,
			scores,
			subclass: '',
		});
		expect(preview.features).toEqual([]);
	});
});
