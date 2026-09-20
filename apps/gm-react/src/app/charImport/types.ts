import type { AbilityId } from './skills';
// ── Plan types (mirror the core zod input schemas; validated again at dispatch) ────────────────

export type ImportKind = 'npc' | 'monster' | 'sidekick';

export interface ImportSpell {
	name: string;
	level: number;
	prepared: boolean;
	castingTime?: string;
	range?: string;
	components?: string;
	duration?: string;
	school?: string;
}

export interface ImportAttack {
	name: string;
	detail: string;
}

export interface ImportProficiencies {
	skills?: Record<string, 'proficient' | 'expertise'>;
	saves?: string[];
	proficiencyBonus?: number;
	hitDice?: { die: string; total: number; spent: number };
}

export interface ImportQuickCreate {
	kind: ImportKind;
	name: string;
	visibility: 'dm-only' | 'player-visible';
	abilityScores: Partial<Record<AbilityId, number>>;
	combat: { hp?: number; maxHp?: number; tempHp?: number; ac?: number };
	data: Record<string, string>;
	dmOnlyFields: string[];
}

/** One line of the import preview: which input field, and what happens to it. */
export interface ImportFieldNote {
	field: string;
	detail: string;
}

export interface ImportPlan {
	source: 'dndbeyond' | 'native';
	name: string;
	quickCreate: ImportQuickCreate;
	/** `character.set-proficiencies` payload (sans characterId), or null when nothing to set. */
	proficiencies: ImportProficiencies | null;
	/** One `character.set-spell` payload (sans characterId/id) per entry. */
	spells: ImportSpell[];
	/** `character.update-attacks` entries (sans ids); empty ⇒ no attack dispatch. */
	attacks: ImportAttack[];
	/** "Will import X" — every consumed input field. */
	mapped: ImportFieldNote[];
	/** "Couldn't map Y" — every input field NOT imported, with the reason. Shown before commit. */
	unmapped: ImportFieldNote[];
}

export type ImportParseResult = { ok: true; plan: ImportPlan } | { ok: false; error: string };
