import { describe, expect, it } from 'vitest';
import type { Character } from '@dndtools/core';
import type { ImportPlan } from '../charImport/ddbJson';
import { findRosterMatch, importDiff } from './importDiff';

const plan: ImportPlan = {
	source: 'native',
	name: 'Brother Aldric',
	quickCreate: {
		kind: 'npc',
		name: 'Brother Aldric',
		visibility: 'dm-only',
		abilityScores: { str: 10, dex: 12, con: 14, int: 13, wis: 16, cha: 8 },
		combat: { hp: 21, maxHp: 24, ac: 16 },
		data: { level: '3', class: 'Cleric' },
		dmOnlyFields: [],
	},
	proficiencies: {
		skills: { insight: 'proficient', religion: 'expertise' },
		saves: ['wis', 'cha'],
	},
	spells: [
		{ name: 'Cure Wounds', level: 1, prepared: true },
		{ name: 'Sacred Flame', level: 0, prepared: false },
	],
	attacks: [{ name: 'Warhammer', detail: '+4 to hit' }],
	mapped: [],
	unmapped: [],
};

/** A roster copy of the same character — lists reordered and re-cased, which is not a change. */
function rosterCopy(overrides: Record<string, unknown> = {}): Character {
	return {
		id: 'c1',
		kind: 'npc',
		name: 'Brother Aldric',
		visibility: 'dm-only',
		sharedWith: [],
		abilityScores: { str: 10, dex: 12, con: 14, int: 13, wis: 16, cha: 8 },
		attacks: [{ id: 'a1', name: 'Warhammer', detail: '' }],
		combat: { hp: 21, maxHp: 24, tempHp: 0, ac: 16, conditions: [] },
		data: { level: '3', class: 'Cleric' },
		dmOnlyFields: [],
		createdBy: 'dm',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		finalizedFromDraftId: null,
		proficiencies: {
			skills: { Religion: 'expertise', insight: 'proficient', history: 'none' },
			saves: ['cha', 'wis'],
			proficiencyBonus: null,
			hitDice: { die: 'd8', total: 3, spent: 0 },
		},
		resources: {
			spells: [
				{ id: 's1', name: 'Sacred Flame', level: 0, prepared: false },
				{ id: 's2', name: 'cure wounds', level: 1, prepared: true },
			],
		},
		...overrides,
	} as unknown as Character;
}

describe('importDiff', () => {
	it('reports no change for an identical copy, whatever the list order or case', () => {
		expect(importDiff(plan, rosterCopy()).filter((row) => row.changed)).toEqual([]);
	});

	it('reports exactly the fields that differ, roster value first', () => {
		const changed = importDiff(
			plan,
			rosterCopy({
				combat: { hp: 21, maxHp: 24, tempHp: 0, ac: 14, conditions: [] },
				resources: { spells: [{ id: 's1', name: 'Sacred Flame', level: 0, prepared: false }] },
			}),
		).filter((row) => row.changed);
		expect(changed).toEqual([
			{ field: 'ac', roster: '14', file: '16', changed: true },
			{ field: 'spells', roster: 'sacred flame', file: 'cure wounds, sacred flame', changed: true },
		]);
	});

	it('shows a missing value as a dash on either side', () => {
		const row = importDiff(plan, rosterCopy({ data: { class: 'Cleric' } })).find(
			(r) => r.field === 'level',
		);
		expect(row).toEqual({ field: 'level', roster: '—', file: '3', changed: true });
	});
});

describe('findRosterMatch', () => {
	it('matches the name regardless of case and surrounding space', () => {
		const match = rosterCopy({ name: '  brother ALDRIC ' });
		expect(findRosterMatch(plan, [rosterCopy({ id: 'x', name: 'Someone else' }), match])).toBe(
			match,
		);
	});

	it('prefers the most recently edited of several same-named characters', () => {
		const older = rosterCopy({ id: 'old' });
		const newer = rosterCopy({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' });
		expect(findRosterMatch(plan, [newer, older])?.id).toBe('new');
		expect(findRosterMatch(plan, [older, newer])?.id).toBe('new');
	});

	it('finds nothing when no name matches', () => {
		expect(findRosterMatch(plan, [rosterCopy({ name: 'Sister Avelin' })])).toBeNull();
	});
});
