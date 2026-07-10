import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCharacterImport, type ImportPlan } from './ddbJson';
import { normalizeSkillId, SKILLS } from './skills';

const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

function planOf(text: string): ImportPlan {
	const result = parseCharacterImport(text);
	if (!result.ok) throw new Error(`expected ok parse, got: ${result.error}`);
	return result.plan;
}

const unmappedFields = (plan: ImportPlan) => plan.unmapped.map((n) => n.field);

describe('charImport skills registry', () => {
	it('normalizes names, spaces, and case to canonical kebab-case ids', () => {
		expect(normalizeSkillId('Sleight of Hand')).toBe('sleight-of-hand');
		expect(normalizeSkillId('animal_handling')).toBe('animal-handling');
		expect(normalizeSkillId('PERCEPTION')).toBe('perception');
		expect(normalizeSkillId('basket-weaving')).toBeNull();
	});

	it('covers the 18 standard 5e skills including the core-interpreted `perception` key', () => {
		expect(SKILLS).toHaveLength(18);
		expect(SKILLS.some((s) => s.id === 'perception' && s.ability === 'wis')).toBe(true);
	});
});

describe('parseCharacterImport — native shape', () => {
	const plan = planOf(fixture('native-character.json'));

	it('maps identity, ability scores, and combat onto the quick-create payload', () => {
		expect(plan.source).toBe('native');
		expect(plan.name).toBe('Brother Aldric');
		expect(plan.quickCreate.abilityScores).toEqual({ str: 10, dex: 12, con: 14, int: 13, wis: 16, cha: 8 });
		expect(plan.quickCreate.combat).toEqual({ hp: 21, maxHp: 24, tempHp: 3, ac: 16 });
		expect(plan.quickCreate.data.class).toBe('Cleric');
		expect(plan.quickCreate.data.race).toBe('Hill Dwarf');
		expect(plan.quickCreate.data.level).toBe('3');
		expect(plan.quickCreate.data.speed).toBe('25');
	});

	it('imports a "pc" file as an NPC-kind sheet and says so in the report (quick-create excludes pc)', () => {
		expect(plan.quickCreate.kind).toBe('npc');
		expect(plan.mapped.some((n) => n.field === 'kind' && /NPC-kind/.test(n.detail))).toBe(true);
	});

	it('marks DM notes DM-only at creation', () => {
		expect(plan.quickCreate.data.dmNotes).toBe("Secretly owes the thieves' guild a debt.");
		expect(plan.quickCreate.dmOnlyFields).toEqual(['data.dmNotes']);
	});

	it('builds the set-proficiencies payload, normalizing skill keys', () => {
		expect(plan.proficiencies).toEqual({
			skills: { insight: 'proficient', religion: 'expertise', medicine: 'proficient' },
			saves: ['wis', 'cha'],
			proficiencyBonus: 2,
			hitDice: { die: 'd8', total: 3, spent: 1 },
		});
	});

	it('FAIL-CLOSED: every unrecognized field/sub-field is in the unmapped report, never dropped silently', () => {
		const fields = unmappedFields(plan);
		expect(fields).toContain('homebrewMana'); // unknown top-level key
		expect(fields).toContain('abilityScores.luck'); // unknown ability
		expect(fields).toContain('skills.basket-weaving'); // unknown skill
		expect(fields).toContain('skills.perception'); // bad proficiency level
		expect(fields).toContain('saves.moxie'); // bad save id
		expect(fields).toContain('attacks[1]'); // attack without a name
		expect(fields).toContain('spells[2]'); // spell without a level
	});

	it('keeps valid attacks and spells (with detail fields) after rejecting the bad ones', () => {
		expect(plan.attacks).toEqual([{ name: 'Warhammer', detail: '+4 to hit, 1d8+2 bludgeoning' }]);
		expect(plan.spells).toHaveLength(2);
		expect(plan.spells[0]).toEqual({
			name: 'Cure Wounds',
			level: 1,
			prepared: true,
			castingTime: 'action',
			range: 'Touch',
			components: 'V, S',
			duration: 'Instantaneous',
			school: 'Evocation',
		});
		// Missing `prepared` defaults true; absent detail fields stay absent (set-spell schema needs min(1)).
		expect(plan.spells[1]).toEqual({ name: 'Sacred Flame', level: 0, prepared: true });
	});

	it('respects an explicit recognized visibility but never widens on a bad value', () => {
		expect(plan.quickCreate.visibility).toBe('dm-only');
		const widened = planOf(JSON.stringify({ name: 'X', visibility: 'player-visible' }));
		expect(widened.quickCreate.visibility).toBe('player-visible');
		const bogus = planOf(JSON.stringify({ name: 'X', visibility: 'everyone!!' }));
		expect(bogus.quickCreate.visibility).toBe('dm-only');
		expect(unmappedFields(bogus)).toContain('visibility');
	});
});

describe('parseCharacterImport — D&D Beyond export shape', () => {
	const plan = planOf(fixture('ddb-export.json'));

	it('detects the shape and imports name/kind fail-closed dm-only', () => {
		expect(plan.source).toBe('dndbeyond');
		expect(plan.name).toBe('Seraphine Duskwhisper');
		expect(plan.quickCreate.kind).toBe('npc');
		expect(plan.quickCreate.visibility).toBe('dm-only');
	});

	it('computes ability scores from stats + racial score bonuses, with overrides winning', () => {
		// DEX 15 + 1 racial = 16; CHA 13 + 2 racial = 15 but override 18 wins.
		expect(plan.quickCreate.abilityScores).toEqual({ str: 8, dex: 16, con: 12, int: 14, wis: 10, cha: 18 });
	});

	it('derives HP from base + CON modifier x level, minus damage taken', () => {
		// base 21 + conMod(12 ⇒ +1) × level 4 = 25 max; 25 − 5 removed = 20 current; 4 temp.
		expect(plan.quickCreate.combat).toEqual({ maxHp: 25, hp: 20, tempHp: 4 });
	});

	it('reports AC as unmapped instead of guessing (DDB derives it from inventory)', () => {
		expect(plan.quickCreate.combat.ac).toBeUndefined();
		expect(plan.unmapped.some((n) => n.field === 'armor class')).toBe(true);
	});

	it('extracts skills (expertise wins over duplicate proficiency), saves, and hit dice from classes', () => {
		expect(plan.proficiencies).toEqual({
			hitDice: { die: 'd8', total: 4, spent: 1 },
			skills: { persuasion: 'proficient', deception: 'expertise', 'sleight-of-hand': 'proficient' },
			saves: ['dex', 'cha'],
		});
	});

	it('maps class/race/background/alignment/backstory/inspiration into sheet data', () => {
		expect(plan.quickCreate.data).toMatchObject({
			class: 'Bard 4',
			level: '4',
			race: 'Half-Elf',
			background: 'Charlatan',
			alignment: 'Chaotic good',
			bio: 'Raised in a traveling troupe; fled after a con went wrong.',
			inspiration: 'yes',
		});
	});

	it('maps spells with SRD-style detail strings and reports unreadable spell entries', () => {
		expect(plan.spells).toHaveLength(3);
		const mockery = plan.spells.find((s) => s.name === 'Vicious Mockery')!;
		expect(mockery).toMatchObject({
			level: 0,
			prepared: true,
			school: 'Enchantment',
			castingTime: 'action',
			range: '60 feet',
			components: 'V',
			duration: 'Instantaneous',
		});
		const laughter = plan.spells.find((s) => s.name === 'Hideous Laughter')!;
		expect(laughter.components).toBe('V, S, M');
		expect(laughter.duration).toBe('Concentration, up to 1 minute');
		const longstrider = plan.spells.find((s) => s.name === 'Longstrider')!;
		expect(longstrider.range).toBe('Touch');
		expect(longstrider.duration).toBe('1 hour');
		expect(longstrider.prepared).toBe(false);
		// The definition-less 4th entry is reported, not silently dropped.
		expect(plan.unmapped.some((n) => n.field === 'spells' && /1 spell entry/.test(n.detail))).toBe(true);
	});

	it('FAIL-CLOSED: skipped DDB surfaces and unknown keys all land in the unmapped report', () => {
		const fields = unmappedFields(plan);
		expect(fields).toContain('inventory');
		expect(fields).toContain('currencies');
		expect(fields).toContain('spellSlots');
		expect(fields).toContain('campaign');
		expect(fields).toContain('currentXp');
		expect(fields).toContain('notes'); // otherNotes not imported
		expect(fields).toContain('traits');
		expect(fields).toContain('mysteryBlob'); // unknown key sweep
		expect(fields).toContain('modifiers'); // 1 unrecognized magical-damage bonus
		// Empty structures don't spam the report.
		expect(fields).not.toContain('feats');
		expect(fields).not.toContain('conditions');
		expect(fields).not.toContain('pactMagic');
	});

	it('unwraps the character-service { data: … } envelope', () => {
		const wrapped = planOf(JSON.stringify({ success: true, data: JSON.parse(fixture('ddb-export.json')) }));
		expect(wrapped.name).toBe('Seraphine Duskwhisper');
		expect(wrapped.source).toBe('dndbeyond');
	});
});

describe('parseCharacterImport — malformed / unrecognized input', () => {
	it('fails closed on malformed JSON with a readable error', () => {
		const result = parseCharacterImport(fixture('malformed.json'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/Not valid JSON/);
	});

	it('rejects JSON that is not a character document', () => {
		expect(parseCharacterImport('[1,2,3]').ok).toBe(false);
		expect(parseCharacterImport('{"foo": 1}').ok).toBe(false);
		expect(parseCharacterImport('"just a string"').ok).toBe(false);
	});
});
