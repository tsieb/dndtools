import { isAbilityId, type AbilityId } from './skills';
import type { ImportPlan, ImportFieldNote } from './types';

/**
 * RC-SYS-2.5 — the parts of the active {@link import('@dndtools/core').SystemPackage} a 5e character
 * file has to be measured against, reduced to plain data so this module stays pure.
 *
 * `attributeKeys` and `skillKeys` are the package's own keys; both are matched case-insensitively
 * and 5e's long attribute names (`dexterity`) are recognised as the short ids the plan uses (`dex`).
 */
export interface SystemFitInput {
	displayName: string;
	attributeKeys: readonly string[];
	skillKeys: readonly string[];
	/** True when the package declares any `slots` resource — somewhere for a spell list to live. */
	declaresSpellSlots: boolean;
	/** True when the package declares a `proficiencyBonus` derived value. */
	declaresProficiencyBonus: boolean;
	/** What this system calls a spell, for the report line ("Spells", "Powers", "Moves"). */
	abilityPlural: string;
}

/** Long-form 5e attribute names → the short ids the import plan uses. */
const LONG_ABILITY_NAMES: Record<string, AbilityId> = {
	strength: 'str',
	dexterity: 'dex',
	constitution: 'con',
	intelligence: 'int',
	wisdom: 'wis',
	charisma: 'cha',
};

/** The short ability ids a package's `attributes[]` covers, under either naming. */
function declaredAbilityIds(attributeKeys: readonly string[]): Set<string> {
	const ids = new Set<string>();
	for (const raw of attributeKeys) {
		const key = raw.toLowerCase();
		if (isAbilityId(key)) ids.add(key);
		const long = LONG_ABILITY_NAMES[key];
		if (long) ids.add(long);
	}
	return ids;
}

/**
 * RC-SYS-2.5 — narrow an import plan to what the ACTIVE rules system can actually hold.
 *
 * `parseCharacterImport` reads a 5e character file and knows nothing about the campaign's system.
 * A campaign running a narrative package has no ability scores, no skill list and nowhere to put a
 * spell list, and importing them anyway would write a character its own system cannot describe. So
 * every part the package does not declare is REMOVED from the payloads and reported in
 * `plan.unmapped` — the same preview the DM already reads before committing, which is the only place
 * the difference can honestly be shown.
 *
 * Pure: a new plan, the input untouched. A package that declares the lot gets its plan back
 * unchanged, so 5e imports are byte-identical.
 */
export function applySystemFit(plan: ImportPlan, system: SystemFitInput): ImportPlan {
	const unmapped: ImportFieldNote[] = [...plan.unmapped];
	const declaredAbilities = declaredAbilityIds(system.attributeKeys);

	const abilityScores: Partial<Record<AbilityId, number>> = {};
	const droppedAbilities: string[] = [];
	for (const [id, score] of Object.entries(plan.quickCreate.abilityScores)) {
		if (declaredAbilities.has(id)) abilityScores[id as AbilityId] = score;
		else droppedAbilities.push(id.toUpperCase());
	}
	if (droppedAbilities.length > 0) {
		unmapped.push({
			field: 'abilityScores',
			detail: `${system.displayName} has no ${droppedAbilities.join(', ')} — not imported.`,
		});
	}

	let proficiencies = plan.proficiencies;
	if (proficiencies) {
		const declaredSkills = new Set(system.skillKeys.map((k) => k.toLowerCase()));
		const skills: Record<string, 'proficient' | 'expertise'> = {};
		const droppedSkills: string[] = [];
		for (const [key, level] of Object.entries(proficiencies.skills ?? {})) {
			if (declaredSkills.has(key.toLowerCase())) skills[key] = level;
			else droppedSkills.push(key);
		}
		if (droppedSkills.length > 0) {
			unmapped.push({
				field: 'proficiencies.skills',
				detail: `${system.displayName} does not list ${droppedSkills.join(', ')} — not imported.`,
			});
		}
		const saves = (proficiencies.saves ?? []).filter((s) => declaredAbilities.has(s.toLowerCase()));
		if (saves.length < (proficiencies.saves ?? []).length) {
			unmapped.push({
				field: 'proficiencies.saves',
				detail: `${system.displayName} has no saving throws for those attributes — not imported.`,
			});
		}
		if (!system.declaresProficiencyBonus && proficiencies.proficiencyBonus !== undefined) {
			unmapped.push({
				field: 'proficiencies.proficiencyBonus',
				detail: `${system.displayName} derives no proficiency bonus — not imported.`,
			});
		}
		proficiencies = {
			...proficiencies,
			...(Object.keys(skills).length > 0 ? { skills } : { skills: undefined }),
			...(saves.length > 0 ? { saves } : { saves: undefined }),
			...(system.declaresProficiencyBonus ? {} : { proficiencyBonus: undefined }),
		};
		// Nothing left to set is nothing to dispatch.
		const hasAny =
			Object.keys(proficiencies.skills ?? {}).length > 0 ||
			(proficiencies.saves ?? []).length > 0 ||
			proficiencies.proficiencyBonus !== undefined ||
			proficiencies.hitDice !== undefined;
		if (!hasAny) proficiencies = null;
	}

	let spells = plan.spells;
	if (!system.declaresSpellSlots && spells.length > 0) {
		unmapped.push({
			field: 'spells',
			detail: `${system.displayName} has no ${system.abilityPlural.toLowerCase()} to import them into — ${spells.length} not imported.`,
		});
		spells = [];
	}

	return {
		...plan,
		quickCreate: { ...plan.quickCreate, abilityScores },
		proficiencies,
		spells,
		unmapped,
	};
}
