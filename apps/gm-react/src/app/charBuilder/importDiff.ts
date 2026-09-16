/**
 * CharBuilder import review diff — the reviewed file against the roster character of the same name
 * (RC-CHR-5.2).
 *
 * Re-importing an updated D&D Beyond export is the common case, and the preview used to say nothing
 * about the copy already on the roster. Import never overwrites (it always creates), so this is a
 * comparison to decide on, not a merge: the rows are what would differ between the two copies.
 *
 * A row compares every VALUE the import writes for that field, not just the entry names — an attack
 * whose damage line changed, a spell that became prepared or a skill promoted to expertise are real
 * differences between the two copies. Only list ORDER and CASE are normalized away.
 */
import { ABILITY_SCORE_KEYS, type Character } from '@dndtools/core';
import type { ImportPlan } from '../charImport/ddbJson';

const DATA_FIELDS = ['level', 'class', 'race', 'background', 'alignment'] as const;

export type ImportDiffField =
	| 'kind'
	| (typeof ABILITY_SCORE_KEYS)[number]
	| 'hp'
	| 'maxHp'
	| 'ac'
	| (typeof DATA_FIELDS)[number]
	| 'attacks'
	| 'spells'
	| 'skills'
	| 'saves';

export interface ImportDiffRow {
	field: ImportDiffField;
	roster: string;
	file: string;
	changed: boolean;
}

const sameName = (a: string, b: string) =>
	a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The roster character the file most plausibly updates: same name, most recently edited. */
export function findRosterMatch(plan: ImportPlan, roster: readonly Character[]): Character | null {
	let best: Character | null = null;
	for (const character of roster) {
		if (!sameName(character.name, plan.name)) continue;
		if (!best || character.updatedAt > best.updatedAt) best = character;
	}
	return best;
}

const show = (value: unknown): string =>
	value === undefined || value === null || value === '' ? '—' : String(value);

/** Order-insensitive, case-insensitive list, so a reordered export isn't reported as a change. */
const list = (items: readonly string[]): string =>
	items.length === 0
		? '—'
		: items
				.map((item) => item.toLocaleLowerCase())
				.sort((a, b) => a.localeCompare(b))
				.join(', ');

/**
 * The list entries carry the VALUES the import actually writes, not just the entry names. Comparing
 * names alone reported "every compared field matches" while the file re-armed a spell, re-cased an
 * attack's damage line or promoted a skill to expertise — all of which `create.ts` imports.
 */
const attackEntry = (attack: { name: string; detail?: string }): string =>
	attack.detail?.trim() ? `${attack.name} (${attack.detail.trim()})` : attack.name;

const spellEntry = (spell: { name: string; level: number; prepared: boolean }): string =>
	`${spell.name} (level ${spell.level}${spell.prepared ? ', prepared' : ''})`;

const skillEntry = (skill: string, level: string): string => `${skill} (${level})`;

export function importDiff(plan: ImportPlan, existing: Character): ImportDiffRow[] {
	const file = plan.quickCreate;
	const rosterSkills = Object.entries(existing.proficiencies?.skills ?? {})
		.filter(([, level]) => level === 'proficient' || level === 'expertise')
		.map(([skill, level]) => skillEntry(skill, level));
	const fileSkills = Object.entries(plan.proficiencies?.skills ?? {}).map(([skill, level]) =>
		skillEntry(skill, level),
	);
	const rows: [ImportDiffField, string, string][] = [
		['kind', existing.kind, file.kind],
		...ABILITY_SCORE_KEYS.map((k): [ImportDiffField, string, string] => [
			k,
			show(existing.abilityScores[k]),
			show(file.abilityScores[k]),
		]),
		['hp', show(existing.combat.hp), show(file.combat.hp)],
		['maxHp', show(existing.combat.maxHp), show(file.combat.maxHp)],
		['ac', show(existing.combat.ac), show(file.combat.ac)],
		...DATA_FIELDS.map((k): [ImportDiffField, string, string] => [
			k,
			show(existing.data[k]),
			show(file.data[k]),
		]),
		['attacks', list(existing.attacks.map(attackEntry)), list(plan.attacks.map(attackEntry))],
		[
			'spells',
			list((existing.resources?.spells ?? []).map(spellEntry)),
			list(plan.spells.map(spellEntry)),
		],
		['skills', list(rosterSkills), list(fileSkills)],
		['saves', list(existing.proficiencies?.saves ?? []), list(plan.proficiencies?.saves ?? [])],
	];
	return rows.map(([field, roster, fromFile]) => ({
		field,
		roster,
		file: fromFile,
		changed: roster !== fromFile,
	}));
}
