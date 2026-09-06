import { beforeAll, describe, expect, it } from 'vitest';
import { DND5E_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE } from '@dndtools/core';
import { monsterFieldReport, type CreatureSchemaField } from './import';
import { loadBundledMonsters } from './srd';
import type { CompendiumMonster } from './types';

/**
 * RC-SYS-2.5 — the compendium import maps a 5e statblock onto the ACTIVE package's creature schema.
 *
 * Two things must be true before the DM commits: they can see which facts their system has no place
 * for, and an import their system cannot legally hold does not happen at all.
 */

function schemaOf(pkg: typeof DND5E_SYSTEM_PACKAGE): CreatureSchemaField[] {
	return pkg.creatureSchema.map((f) => ({ key: f.key, label: f.label, required: f.required }));
}

let goblin: CompendiumMonster;

beforeAll(async () => {
	const { entries } = await loadBundledMonsters();
	goblin = entries.find((m) => m.name === 'Goblin')!;
});

describe('RC-SYS-2.5 — monsterFieldReport', () => {
	it('under D&D 5e the schema holds the statblock: name, AC, HP, speed and CR all land', () => {
		const report = monsterFieldReport(goblin, schemaOf(DND5E_SYSTEM_PACKAGE));
		expect(report.canHold).toBe(true);
		expect(report.missingRequired).toEqual([]);
		expect(report.mapped.map((f) => f.key)).toEqual(
			expect.arrayContaining([
				'name',
				'size',
				'type',
				'armorClass',
				'hitPoints',
				'speed',
				'challengeRating',
			]),
		);
	});

	it('under Generic the creature still imports, and the preview names what is dropped', () => {
		const report = monsterFieldReport(goblin, schemaOf(GENERIC_SYSTEM_PACKAGE));
		expect(report.canHold).toBe(true);
		// Generic declares name / concept / hp / notes: the name, the type-as-concept and the HP land.
		expect(report.mapped.map((f) => f.key).sort()).toEqual(['concept', 'hp', 'name']);
		// Everything a narrative system has no field for is named rather than silently lost.
		const unmapped = report.unmapped.map((f) => f.key);
		expect(unmapped).toEqual(
			expect.arrayContaining(['cr', 'ac', 'alignment', 'senses', 'actions']),
		);
		expect(unmapped).not.toContain('name');
		expect(unmapped).not.toContain('hp');
	});

	it('refuses with a field report when the package requires something a statblock cannot answer', () => {
		const schema: CreatureSchemaField[] = [
			{ key: 'name', label: 'Name', required: true },
			{ key: 'sanity', label: 'Sanity', required: true },
			{ key: 'occupation', label: 'Occupation', required: false },
		];
		const report = monsterFieldReport(goblin, schema);
		expect(report.canHold).toBe(false);
		expect(report.missingRequired.map((f) => f.label)).toEqual(['Sanity']);
		expect(report.mapped.map((f) => f.key)).toEqual(['name']);
	});

	it('an optional field a statblock cannot answer is not a refusal, only an absence', () => {
		const schema: CreatureSchemaField[] = [
			{ key: 'name', label: 'Name', required: true },
			{ key: 'sanity', label: 'Sanity', required: false },
		];
		const report = monsterFieldReport(goblin, schema);
		expect(report.canHold).toBe(true);
		expect(report.mapped.map((f) => f.key)).toEqual(['name']);
	});

	it('a package that declares no creature schema at all holds anything and drops nothing', () => {
		const report = monsterFieldReport(goblin, []);
		expect(report).toEqual({ mapped: [], unmapped: [], missingRequired: [], canHold: true });
	});

	it('every bundled SRD monster fits the 5e package (the import never refuses its own system)', async () => {
		const { entries } = await loadBundledMonsters();
		for (const monster of entries) {
			const report = monsterFieldReport(monster, schemaOf(DND5E_SYSTEM_PACKAGE));
			expect(
				report.canHold,
				`${monster.name} missing ${report.missingRequired.map((f) => f.key).join(', ')}`,
			).toBe(true);
		}
	});
});
