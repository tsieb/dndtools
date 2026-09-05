import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	ABILITY_SCORE_KEYS,
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	abilityModifier,
	abilityScoreKeyFor,
	characterAttributeScore,
	characterAttributes,
	characterAttributesForPackage,
	characterSkillsForPackage,
	computeDraftCompleteness,
	createGenericSystemPackage,
	derivedProficiencyBonus,
	dispatchCommand,
	draftAttributeFieldId,
	draftStepsForPackage,
	effectiveProficiencyBonus,
	getCharacterForActor,
	passivePerception,
	passiveSkillScore,
	setCharacterAttribute,
	validateDraftStep,
	type Character,
	type CoreStateSlice,
	type SystemPackage,
} from '../src';

/**
 * RC-SYS-2.1 — the character domain reads its attributes, skills and derived numbers from the ACTIVE
 * SystemPackage. Two things are being proven together: 5e stays byte-identical (the whole existing
 * suite is the wider proof; these tests pin the specific shapes that could have drifted), and a
 * Generic character with no attributes validates and reads back as an honest empty list.
 */

function withActors(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

/** The same state with a different package selected (`system.select` is RC-SYS-1.3, not this story). */
function playing(state: CoreStateSlice, pkg: SystemPackage): CoreStateSlice {
	return {
		...state,
		systems: {
			...state.systems,
			packages: { ...state.systems.packages, [pkg.id]: pkg },
			activePackageId: pkg.id,
		},
	};
}

function character(overrides: Partial<Character> = {}): Character {
	return {
		id: 'char-1',
		kind: 'pc',
		name: 'Wren',
		visibility: 'shared',
		sharedWith: [],
		abilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 16, cha: 13 },
		attacks: [],
		combat: { hp: 10, maxHp: 10, tempHp: 0, ac: 12, conditions: [] },
		data: { level: 5 },
		dmOnlyFields: [],
		createdBy: DM_ACTOR.id,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		finalizedFromDraftId: null,
		schemaVersion: 1,
		...overrides,
	} as Character;
}

describe('RC-SYS-2.1 — the attribute hydrator over the six fixed fields', () => {
	it('hydrates the six fixed fields without any stored `attributes` map', () => {
		const wren = character();
		expect(wren.attributes).toBeUndefined();
		expect(characterAttributes(wren)).toEqual({
			str: 8,
			dex: 14,
			con: 12,
			int: 10,
			wis: 16,
			cha: 13,
		});
	});

	it('resolves a package attribute key through its legacy alias', () => {
		const wren = character();
		expect(abilityScoreKeyFor('wisdom')).toBe('wis');
		expect(abilityScoreKeyFor('wis')).toBe('wis');
		expect(abilityScoreKeyFor('grit')).toBeNull();
		// The 5e package spells its attributes long; the document stores them short.
		for (const attribute of DND5E_SYSTEM_PACKAGE.attributes) {
			expect(ABILITY_SCORE_KEYS).toContain(abilityScoreKeyFor(attribute.key));
		}
		expect(characterAttributeScore(wren, 'wisdom')).toBe(16);
		expect(characterAttributeScore(wren, 'grit')).toBeUndefined();
	});

	it('omits an absent score rather than defaulting it', () => {
		const statBlock = character({ abilityScores: { str: 15 } });
		expect(characterAttributes(statBlock)).toEqual({ str: 15 });
		expect(characterAttributeScore(statBlock, 'dexterity')).toBeUndefined();
	});

	it('writes an aliased key into the fixed field and keeps the document shape (no schema bump)', () => {
		const wren = setCharacterAttribute(character(), 'strength', 18);
		expect(wren.abilityScores.str).toBe(18);
		expect(wren.attributes).toBeUndefined();
	});

	it('writes a package-only key into the open map, and an explicit entry wins over the alias', () => {
		const custom = setCharacterAttribute(character(), 'grit', 3);
		expect(custom.attributes).toEqual({ grit: 3 });
		expect(characterAttributes(custom)).toMatchObject({ str: 8, grit: 3 });

		const shadowed = setCharacterAttribute({ ...character(), attributes: { wis: 20 } }, 'wis', 20);
		expect(shadowed.attributes).toEqual({ wis: 20 });
		expect(characterAttributes(shadowed).wis).toBe(20);
	});
});

describe('RC-SYS-2.1 — derived values come from the package formulas', () => {
	it('reproduces the 5e proficiency progression exactly at every level', () => {
		const expected = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
		for (let level = 1; level <= 20; level += 1) {
			expect(derivedProficiencyBonus(level)).toBe(expected[level - 1]);
		}
		// Clamped below level 1, exactly as before.
		expect(derivedProficiencyBonus(0)).toBe(2);
		expect(derivedProficiencyBonus(Number.NaN)).toBe(2);
	});

	it('reproduces the 5e ability modifier, including negatives', () => {
		expect(abilityModifier(8)).toBe(-1);
		expect(abilityModifier(7)).toBe(-2);
		expect(abilityModifier(10)).toBe(0);
		expect(abilityModifier(undefined)).toBe(0);
		expect(abilityModifier(20)).toBe(5);
	});

	it('reproduces 5e passive perception, and honours an explicit proficiency bonus', () => {
		// WIS 16 (+3), no perception proficiency ⇒ 13.
		expect(passivePerception(character())).toBe(13);
		// Proficient at level 5 (+3) ⇒ 16; expertise ⇒ 19.
		const proficient = character({
			proficiencies: {
				skills: { perception: 'proficient' },
				saves: [],
				proficiencyBonus: null,
				hitDice: { die: 'd8', total: 5, spent: 0 },
			},
		});
		expect(passivePerception(proficient)).toBe(16);
		expect(effectiveProficiencyBonus(proficient)).toBe(3);
	});

	it('reads no proficiency bonus and no passive score from a package that declares neither', () => {
		const wren = character();
		expect(derivedProficiencyBonus(5, GENERIC_SYSTEM_PACKAGE)).toBe(0);
		expect(effectiveProficiencyBonus(wren, GENERIC_SYSTEM_PACKAGE)).toBe(0);
		// Honest null, not a borrowed 5e 13.
		expect(passiveSkillScore(wren, GENERIC_SYSTEM_PACKAGE)).toBeNull();
		expect(passiveSkillScore(wren)).toBe(13);
		// An explicit override is still the character's own number under any system.
		const overridden = character({
			proficiencies: {
				skills: {},
				saves: [],
				proficiencyBonus: 4,
				hitDice: { die: 'd8', total: 1, spent: 0 },
			},
		});
		expect(effectiveProficiencyBonus(overridden, GENERIC_SYSTEM_PACKAGE)).toBe(4);
	});
});

describe('RC-SYS-2.1 — attribute and skill read models', () => {
	it('lists the 5e attributes in package order with their modifiers', () => {
		const rows = characterAttributesForPackage(character());
		expect(rows.map((row) => row.key)).toEqual([
			'strength',
			'dexterity',
			'constitution',
			'intelligence',
			'wisdom',
			'charisma',
		]);
		expect(rows[0]).toEqual({
			key: 'strength',
			label: 'Strength',
			abbreviation: 'STR',
			score: 8,
			modifier: -1,
		});
		expect(rows[4]!.modifier).toBe(3);
	});

	it('reads an EMPTY attribute list under a system with no attributes ("no attributes")', () => {
		expect(characterAttributesForPackage(character(), GENERIC_SYSTEM_PACKAGE)).toEqual([]);
		expect(characterSkillsForPackage(character(), GENERIC_SYSTEM_PACKAGE)).toEqual([]);
	});

	it('reads a score with no modifier when the system derives nothing from it', () => {
		const approaches = createGenericSystemPackage({ approaches: true });
		const scrapper = { ...character(), attributes: { force: 2 } } as Character;
		const rows = characterAttributesForPackage(scrapper, approaches);
		expect(rows.map((row) => row.key)).toEqual(['force', 'finesse', 'focus']);
		expect(rows[0]).toMatchObject({ score: 2, modifier: null });
		expect(rows[1]).toMatchObject({ score: null, modifier: null });
		// A pool system counts dice; it does not add a modifier, so the skill bonus is honestly null.
		expect(characterSkillsForPackage(scrapper, approaches)[0]).toMatchObject({
			key: 'overcome',
			attribute: 'force',
			bonus: null,
		});
	});

	it('adds the attribute modifier and the proficiency contribution to a 5e skill bonus', () => {
		const scout = character({
			proficiencies: {
				skills: { stealth: 'expertise', perception: 'proficient' },
				saves: [],
				proficiencyBonus: null,
				hitDice: { die: 'd8', total: 5, spent: 0 },
			},
		});
		const skills = characterSkillsForPackage(scout);
		expect(skills).toHaveLength(18);
		// DEX 14 (+2) with expertise at level 5 (+3 ×2) ⇒ 8.
		expect(skills.find((skill) => skill.key === 'stealth')).toMatchObject({
			proficiency: 'expertise',
			bonus: 8,
		});
		// WIS 16 (+3) proficient ⇒ 6.
		expect(skills.find((skill) => skill.key === 'perception')).toMatchObject({
			proficiency: 'proficient',
			bonus: 6,
		});
		// Untrained still reads its attribute modifier.
		expect(skills.find((skill) => skill.key === 'athletics')).toMatchObject({
			proficiency: 'none',
			bonus: -1,
		});
	});
});

describe('RC-SYS-2.1 — the draft flow is built from the package', () => {
	it('builds the 5e attributes step with exactly the legacy field ids and labels', () => {
		const steps = draftStepsForPackage(DND5E_SYSTEM_PACKAGE);
		expect(steps.map((step) => step.id)).toEqual(['identity', 'abilities', 'class']);
		const abilities = steps[1]!;
		expect(abilities.fields.map((field) => field.id)).toEqual([
			'str',
			'dex',
			'con',
			'int',
			'wis',
			'cha',
		]);
		expect(abilities.fields.map((field) => field.label)).toEqual([
			'STR',
			'DEX',
			'CON',
			'INT',
			'WIS',
			'CHA',
		]);
		expect(abilities.fields.every((field) => field.kind === 'number' && field.required)).toBe(true);
		expect(DND5E_SYSTEM_PACKAGE.attributes.map(draftAttributeFieldId)).toEqual([
			'str',
			'dex',
			'con',
			'int',
			'wis',
			'cha',
		]);
	});

	it('drops the attributes step entirely for a system with no attributes', () => {
		expect(draftStepsForPackage(GENERIC_SYSTEM_PACKAGE).map((step) => step.id)).toEqual([
			'identity',
			'class',
		]);
	});

	it('applies the point-buy budget only where attributes derive a modifier', () => {
		const overBudget = { str: 15, dex: 15, con: 15, int: 15, wis: 15, cha: 15 };
		expect(validateDraftStep('abilities', overBudget).valid).toBe(false);
		// The three approaches derive nothing, so a rating outside 8–15 is not an error there.
		const approaches = createGenericSystemPackage({ approaches: true });
		expect(
			validateDraftStep('abilities', { force: 3, finesse: 1, focus: 2 }, approaches).valid,
		).toBe(true);
	});

	it('reports an unknown step under a package that does not declare it', () => {
		const validation = validateDraftStep('abilities', {}, GENERIC_SYSTEM_PACKAGE);
		expect(validation.valid).toBe(false);
		expect(validation.issues[0]!.message).toBe('Unknown step.');
	});
});

describe('RC-SYS-2.1 — a Generic character with no attributes validates end to end', () => {
	it('finalizes a Generic draft without ever assigning a score, and reads back "no attributes"', () => {
		const env = makeEnvironment();
		let state = playing(withActors(), GENERIC_SYSTEM_PACKAGE);

		const created = dispatchCommand(state, env, {
			type: 'character.create-draft',
			actorId: DM_ACTOR.id,
			payload: { ownerActorId: PLAYER_ACTOR.id, name: 'Rook' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;
		state = created.nextState;
		const draftId = Object.keys(state.characters.drafts)[0]!;

		for (const step of [
			{ stepId: 'identity', values: { name: 'Rook', background: 'sage' } },
			{ stepId: 'class', values: { class: 'rogue' } },
		]) {
			const saved = dispatchCommand(state, env, {
				type: 'character.update-draft-step',
				actorId: PLAYER_ACTOR.id,
				payload: { draftId, ...step },
			});
			expect(saved.status).toBe('accepted');
			if (saved.status !== 'accepted') return;
			state = saved.nextState;
		}

		// No abilities step exists in this system, so the draft is complete without one.
		const completeness = computeDraftCompleteness(
			state.characters.drafts[draftId]!,
			GENERIC_SYSTEM_PACKAGE,
		);
		expect(completeness.readyToFinalize).toBe(true);
		expect(completeness.issues).toEqual([]);
		expect(completeness.nextStepId).toBeNull();

		const finalized = dispatchCommand(state, env, {
			type: 'character.finalize-draft',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId },
		});
		expect(finalized.status).toBe('accepted');
		if (finalized.status !== 'accepted') return;
		state = finalized.nextState;

		const rook = Object.values(state.characters.characters)[0]!;
		expect(rook.name).toBe('Rook');
		expect(rook.abilityScores).toEqual({});
		expect(rook.attributes).toBeUndefined();
		// The honest read the sheet renders as "no attributes".
		expect(characterAttributesForPackage(rook, GENERIC_SYSTEM_PACKAGE)).toEqual([]);
		const view = getCharacterForActor(
			state.characters,
			state.permissions,
			PLAYER_ACTOR.id,
			rook.id,
		);
		expect(view?.attributes).toEqual({});
	});

	it('still finalizes a 5e draft into the six fixed fields and no `attributes` map', () => {
		const env = makeEnvironment();
		let state = withActors();
		const created = dispatchCommand(state, env, {
			type: 'character.create-draft',
			actorId: DM_ACTOR.id,
			payload: { ownerActorId: PLAYER_ACTOR.id, name: 'Wren' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;
		state = created.nextState;
		const draftId = Object.keys(state.characters.drafts)[0]!;

		for (const step of [
			{ stepId: 'identity', values: { name: 'Wren', background: 'sage' } },
			{ stepId: 'abilities', values: { str: 8, dex: 14, con: 12, int: 10, wis: 15, cha: 13 } },
			{ stepId: 'class', values: { class: 'wizard' } },
		]) {
			const saved = dispatchCommand(state, env, {
				type: 'character.update-draft-step',
				actorId: PLAYER_ACTOR.id,
				payload: { draftId, ...step },
			});
			expect(saved.status).toBe('accepted');
			if (saved.status !== 'accepted') return;
			state = saved.nextState;
		}

		const finalized = dispatchCommand(state, env, {
			type: 'character.finalize-draft',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId },
		});
		expect(finalized.status).toBe('accepted');
		if (finalized.status !== 'accepted') return;

		const wren = Object.values(finalized.nextState.characters.characters)[0]!;
		expect(wren.abilityScores).toEqual({ str: 8, dex: 14, con: 12, int: 10, wis: 15, cha: 13 });
		expect(wren.attributes).toBeUndefined();
	});
});

describe('RC-SYS-2.1 — the active-package read is tolerant', () => {
	it('falls back to the built-in 5e package when a state carries no systems slice', () => {
		const env = makeEnvironment();
		// A state assembled before the `systems` slice existed, and one whose selected id is gone.
		for (const systems of [undefined, { ...withActors().systems, activePackageId: 'gone' }]) {
			const state = { ...withActors(), systems } as CoreStateSlice;
			const saved = dispatchCommand(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: { kind: 'npc', name: 'Sentry' },
			});
			expect(saved.status).toBe('accepted');
			if (saved.status !== 'accepted') return;
			const id = Object.keys(saved.nextState.characters.characters)[0]!;
			// 5e skills are accepted, which is only true if the fallback resolved to the 5e package.
			expect(
				dispatchCommand(saved.nextState, env, {
					type: 'character.set-proficiencies',
					actorId: DM_ACTOR.id,
					payload: { characterId: id, skills: { perception: 'proficient' } },
				}).status,
			).toBe('accepted');
		}
	});
});

describe('RC-SYS-2.1 — skills are the ones the active package declares', () => {
	function quickCreate(state: CoreStateSlice): { state: CoreStateSlice; id: string } {
		const env = makeEnvironment();
		const created = dispatchCommand(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'npc', name: 'Scout' },
		});
		if (created.status !== 'accepted') throw new Error('quick-create rejected');
		return {
			state: created.nextState,
			id: Object.keys(created.nextState.characters.characters)[0]!,
		};
	}

	it('accepts a 5e skill and rejects one the system does not define', () => {
		const env = makeEnvironment();
		const { state, id } = quickCreate(withActors());

		const accepted = dispatchCommand(state, env, {
			type: 'character.set-proficiencies',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, skills: { stealth: 'proficient' } },
		});
		expect(accepted.status).toBe('accepted');

		const rejected = dispatchCommand(state, env, {
			type: 'character.set-proficiencies',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, skills: { piloting: 'proficient' } },
		});
		expect(rejected.status).toBe('rejected');
		if (rejected.status !== 'rejected') return;
		expect(rejected.rejection.message).toContain('piloting');
	});

	it('constrains nothing when the active package declares no skills', () => {
		const env = makeEnvironment();
		const { state, id } = quickCreate(playing(withActors(), GENERIC_SYSTEM_PACKAGE));
		const result = dispatchCommand(state, env, {
			type: 'character.set-proficiencies',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, skills: { scrounging: 'proficient' } },
		});
		expect(result.status).toBe('accepted');
	});

	it('accepts a skill a DM-authored package declares', () => {
		const env = makeEnvironment();
		const custom: SystemPackage = {
			...GENERIC_SYSTEM_PACKAGE,
			id: 'custom:void',
			skills: [{ key: 'piloting', label: 'Piloting', attribute: null }],
		};
		const { state, id } = quickCreate(playing(withActors(), custom));
		const result = dispatchCommand(state, env, {
			type: 'character.set-proficiencies',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, skills: { piloting: 'expertise' } },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.characters.characters[id]!.proficiencies?.skills).toEqual({
			piloting: 'expertise',
		});
		expect(characterSkillsForPackage(result.nextState.characters.characters[id]!, custom)).toEqual([
			{
				key: 'piloting',
				label: 'Piloting',
				attribute: null,
				proficiency: 'expertise',
				bonus: null,
			},
		]);
	});
});
