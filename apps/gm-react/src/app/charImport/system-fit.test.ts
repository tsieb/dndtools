import { describe, expect, it } from 'vitest';
import { DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE, type SystemPackage } from '@dndtools/core';
import { applySystemFit, type ImportPlan, type SystemFitInput } from './ddbJson';

/**
 * RC-SYS-2.5 — a 5e character file measured against the campaign's ACTIVE rules system.
 *
 * The import preview's "Couldn't map" list is the only place a DM finds out what their system has no
 * room for, so anything the package does not declare has to leave the payload AND appear there. A
 * package that declares the lot leaves the plan alone.
 */

function fitOf(pkg: SystemPackage): SystemFitInput {
	return {
		displayName: pkg.displayName,
		attributeKeys: pkg.attributes.map((a) => a.key),
		skillKeys: pkg.skills.map((s) => s.key),
		declaresSpellSlots: pkg.resources.some((r) => r.kind === 'slots'),
		declaresProficiencyBonus: pkg.derived.some((d) => d.key === 'proficiencyBonus'),
		abilityPlural: pkg.vocabulary.abilityPlural,
	};
}

function plan(): ImportPlan {
	return {
		source: 'dndbeyond',
		name: 'Vex',
		quickCreate: {
			kind: 'npc',
			name: 'Vex',
			visibility: 'dm-only',
			abilityScores: { str: 10, dex: 18, con: 12, int: 13, wis: 14, cha: 8 },
			combat: { hp: 30, maxHp: 30, ac: 15 },
			data: {},
			dmOnlyFields: [],
		},
		proficiencies: {
			skills: { stealth: 'expertise', perception: 'proficient' },
			saves: ['dex', 'int'],
			proficiencyBonus: 3,
		},
		spells: [{ name: 'Hunter’s mark', level: 1, prepared: true }],
		attacks: [{ name: 'Shortbow', detail: '+7 to hit' }],
		mapped: [{ field: 'name', detail: 'Will import the name' }],
		unmapped: [{ field: 'avatarUrl', detail: 'Portraits are not imported' }],
	};
}

describe('RC-SYS-2.5 — applySystemFit', () => {
	it('leaves a 5e plan untouched under the 5e package', () => {
		const before = plan();
		expect(applySystemFit(before, fitOf(DND5E_SYSTEM_PACKAGE))).toEqual(before);
	});

	it('does not mutate the plan it is given', () => {
		const before = plan();
		applySystemFit(before, fitOf(GENERIC_SYSTEM_PACKAGE));
		expect(before.spells).toHaveLength(1);
		expect(Object.keys(before.quickCreate.abilityScores)).toHaveLength(6);
	});

	it('under Generic the scores, skills, saves and spells all go, and each says so', () => {
		const fitted = applySystemFit(plan(), fitOf(GENERIC_SYSTEM_PACKAGE));
		expect(fitted.quickCreate.abilityScores).toEqual({});
		expect(fitted.proficiencies).toBeNull();
		expect(fitted.spells).toEqual([]);
		// Nothing the system CAN hold is touched.
		expect(fitted.attacks).toHaveLength(1);
		expect(fitted.quickCreate.combat).toEqual({ hp: 30, maxHp: 30, ac: 15 });

		const fields = fitted.unmapped.map((n) => n.field);
		expect(fields).toContain('abilityScores');
		expect(fields).toContain('proficiencies.skills');
		expect(fields).toContain('spells');
		// The mapper's own report survives alongside the system's.
		expect(fields).toContain('avatarUrl');
		// The lines name the system and what was lost, not an error code.
		const spellNote = fitted.unmapped.find((n) => n.field === 'spells')!;
		expect(spellNote.detail).toContain('Generic');
		expect(spellNote.detail).toContain('not imported');
	});

	it('keeps the attributes a package DOES declare and drops only the rest', () => {
		const threeStats: SystemFitInput = {
			displayName: 'Three stats',
			attributeKeys: ['dexterity', 'wisdom', 'grit'],
			skillKeys: ['stealth'],
			declaresSpellSlots: false,
			declaresProficiencyBonus: true,
			abilityPlural: 'Powers',
		};
		const fitted = applySystemFit(plan(), threeStats);
		expect(fitted.quickCreate.abilityScores).toEqual({ dex: 18, wis: 14 });
		expect(fitted.proficiencies?.skills).toEqual({ stealth: 'expertise' });
		expect(fitted.proficiencies?.saves).toEqual(['dex']);
		// Levels exist here, so the proficiency bonus stays.
		expect(fitted.proficiencies?.proficiencyBonus).toBe(3);
		expect(fitted.unmapped.find((n) => n.field === 'abilityScores')!.detail).toContain('STR');
	});
});
