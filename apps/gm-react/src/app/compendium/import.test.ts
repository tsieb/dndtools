import { describe, expect, it } from 'vitest';
import { quickCreateCharacterInputSchema, validateObjectFrontmatter } from '@dndtools/core';
import {
	actionDetail,
	formatCr,
	formatSenses,
	formatSpeed,
	monsterToQuickCreatePayload,
	spellDuration,
	spellSummary,
	spellToCreateObjectPayload,
	type ImportSourceMeta,
} from './import';
import { loadBundledMonsters, loadBundledSpells } from './srd';

// The mappers are validated against the REAL core input schemas — if `character.quick-create`
// or the `spell` vault-object schema changes shape, these tests fail before the UI does.

const SOURCE: ImportSourceMeta = {
	document: 'System Reference Document 5.1',
	license: 'CC-BY-4.0',
	attribution: 'This work includes material taken from the System Reference Document 5.1 by Wizards of the Coast LLC.',
};

describe('monsterToQuickCreatePayload', () => {
	it('produces a payload the core quick-create schema accepts, for EVERY bundled monster', async () => {
		const { entries } = await loadBundledMonsters();
		for (const monster of entries) {
			const payload = monsterToQuickCreatePayload(monster, SOURCE);
			const parsed = quickCreateCharacterInputSchema.safeParse(payload);
			expect(parsed.success, `${monster.name}: ${JSON.stringify(parsed.success ? '' : parsed.error.issues)}`).toBe(true);
		}
	});

	it('maps the goblin statblock sensibly (kind monster, dm-only, scores/combat/attacks/data)', async () => {
		const { entries } = await loadBundledMonsters();
		const goblin = entries.find((m) => m.name === 'Goblin')!;
		const payload = monsterToQuickCreatePayload(goblin, SOURCE) as any;

		expect(payload.kind).toBe('monster');
		expect(payload.visibility).toBe('dm-only'); // fail closed — never player-visible by default
		expect(payload.abilityScores).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
		expect(payload.combat).toEqual({ hp: 7, maxHp: 7, ac: 15 });
		expect(payload.attacks.length).toBeGreaterThan(0);
		expect(payload.attacks[0]).toHaveProperty('name');
		expect(payload.attacks[0]).toHaveProperty('detail');
		expect(payload.data.cr).toBe('1/4');
		expect(payload.data.type).toBe('Humanoid');
		expect(payload.data.source).toBe('System Reference Document 5.1 (CC-BY-4.0)');
		expect(payload.data.attribution).toBe(SOURCE.attribution);
	});
});

describe('formatting helpers', () => {
	it('formatCr renders fractional CRs statblock-style', () => {
		expect(formatCr(0.125)).toBe('1/8');
		expect(formatCr(0.25)).toBe('1/4');
		expect(formatCr(0.5)).toBe('1/2');
		expect(formatCr(10)).toBe('10');
	});

	it('formatSpeed joins modes and folds boolean notes like hover', () => {
		expect(formatSpeed({ walk: 10, swim: 40 })).toBe('walk 10 ft., swim 40 ft.');
		expect(formatSpeed({ fly: 60, hover: true })).toBe('fly 60 ft. (hover)');
		expect(formatSpeed(undefined)).toBe('');
	});

	it('formatSenses includes passive Perception', () => {
		expect(formatSenses({ darkvision: 120 }, 20)).toBe('darkvision 120 ft., passive Perception 20');
		expect(formatSenses(undefined, undefined)).toBe('');
	});

	it('actionDetail prefixes legendary cost and usage limits', () => {
		expect(actionDetail({ name: 'Detect', desc: 'Looks around.', actionType: 'LEGENDARY_ACTION' })).toBe(
			'Legendary. Looks around.',
		);
		expect(
			actionDetail({
				name: 'Wing Attack',
				desc: 'Beats its wings.',
				actionType: 'LEGENDARY_ACTION',
				legendaryCost: 2,
			}),
		).toBe('Legendary (costs 2). Beats its wings.');
		expect(
			actionDetail({ name: 'Enslave', desc: 'Targets one creature.', usageLimits: { type: 'PER_DAY', param: 3 } }),
		).toBe('3/day. Targets one creature.');
		expect(actionDetail({ name: 'Bite', desc: 'Bites.' })).toBe('Bites.');
	});
});

describe('spellToCreateObjectPayload', () => {
	it('produces frontmatter the core spell vault-object schema accepts, for EVERY bundled spell', async () => {
		const { entries } = await loadBundledSpells();
		for (const spell of entries) {
			const payload = spellToCreateObjectPayload(spell, SOURCE) as any;
			const validation = validateObjectFrontmatter('spell', payload.fields);
			expect(validation.valid, `${spell.name}: ${JSON.stringify(validation.issues)}`).toBe(true);
		}
	});

	it('maps a concentration spell with detail fields and the rules text in the body', async () => {
		const { entries } = await loadBundledSpells();
		const spell = entries.find((s) => s.concentration === true)!;
		const payload = spellToCreateObjectPayload(spell, SOURCE) as any;

		expect(payload.subtype).toBe('spell');
		expect(payload.title).toBe(spell.name);
		expect(payload.visibility).toBeUndefined(); // omitted → core default (dm-only) applies
		expect(payload.fields.name).toBe(spell.name);
		expect(payload.fields.level).toBe(spell.level);
		expect(payload.fields.duration).toMatch(/^Concentration, up to /);
		expect(payload.body).toContain(spell.desc);
		expect(payload.body).toContain(SOURCE.attribution); // the license travels with the import
	});

	it('folds higher-level text and classes into the body', async () => {
		const { entries } = await loadBundledSpells();
		const fireball = entries.find((s) => s.name === 'Fireball')!;
		const payload = spellToCreateObjectPayload(fireball, SOURCE) as any;
		expect(payload.body).toContain('**At higher levels.**');
		expect(payload.body).toContain('**Classes:**');
	});

	it('spellSummary keeps the first sentence and caps runaway ones', () => {
		expect(spellSummary('Short zap. It hurts a lot.')).toBe('Short zap.');
		const long = `${'word '.repeat(60)}end.`;
		expect(spellSummary(long).length).toBeLessThanOrEqual(180);
		expect(spellSummary(long).endsWith('…')).toBe(true);
	});

	it('spellDuration does not double-prefix an already-concentration duration', () => {
		expect(
			spellDuration({ key: 'x', name: 'X', level: 1, school: '', castingTime: '', range: '', components: '', duration: 'Concentration, up to 1 minute', concentration: true, desc: '' }),
		).toBe('Concentration, up to 1 minute');
		expect(
			spellDuration({ key: 'x', name: 'X', level: 1, school: '', castingTime: '', range: '', components: '', duration: '1 minute', concentration: true, desc: '' }),
		).toBe('Concentration, up to 1 minute');
	});
});
