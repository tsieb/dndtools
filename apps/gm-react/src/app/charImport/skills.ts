/**
 * The canonical 5e skill registry shared by the character-file import mapper and the
 * skills/saves sheet panels. Pure data — framework-free so the mapper stays unit-testable
 * under `pnpm test:app` and the screens can compute skill bonuses from the same ids the
 * core stores in `Character.proficiencies.skills` (kebab-case keys; the core treats the
 * key as an opaque string — `perception` is the only key it interprets, for passive
 * perception, and it is listed here under exactly that id).
 */

export type AbilityId = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_IDS: readonly AbilityId[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABEL: Record<AbilityId, string> = {
	str: 'Strength',
	dex: 'Dexterity',
	con: 'Constitution',
	int: 'Intelligence',
	wis: 'Wisdom',
	cha: 'Charisma',
};

export interface SkillDef {
	/** The stored proficiency key (kebab-case; matches D&D Beyond modifier subTypes). */
	id: string;
	label: string;
	ability: AbilityId;
}

export const SKILLS: readonly SkillDef[] = [
	{ id: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
	{ id: 'animal-handling', label: 'Animal Handling', ability: 'wis' },
	{ id: 'arcana', label: 'Arcana', ability: 'int' },
	{ id: 'athletics', label: 'Athletics', ability: 'str' },
	{ id: 'deception', label: 'Deception', ability: 'cha' },
	{ id: 'history', label: 'History', ability: 'int' },
	{ id: 'insight', label: 'Insight', ability: 'wis' },
	{ id: 'intimidation', label: 'Intimidation', ability: 'cha' },
	{ id: 'investigation', label: 'Investigation', ability: 'int' },
	{ id: 'medicine', label: 'Medicine', ability: 'wis' },
	{ id: 'nature', label: 'Nature', ability: 'int' },
	{ id: 'perception', label: 'Perception', ability: 'wis' },
	{ id: 'performance', label: 'Performance', ability: 'cha' },
	{ id: 'persuasion', label: 'Persuasion', ability: 'cha' },
	{ id: 'religion', label: 'Religion', ability: 'int' },
	{ id: 'sleight-of-hand', label: 'Sleight of Hand', ability: 'dex' },
	{ id: 'stealth', label: 'Stealth', ability: 'dex' },
	{ id: 'survival', label: 'Survival', ability: 'wis' },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): SkillDef | undefined {
	return BY_ID.get(id);
}

/** Normalize a free-form skill name/key to a canonical skill id, or null when unknown. */
export function normalizeSkillId(raw: string): string | null {
	const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
	return BY_ID.has(key) ? key : null;
}

export function isAbilityId(raw: string): raw is AbilityId {
	return (ABILITY_IDS as readonly string[]).includes(raw);
}
