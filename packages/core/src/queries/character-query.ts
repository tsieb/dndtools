import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type {
	Character,
	CharacterDraft,
	CharacterProficiencies,
	CharacterState,
} from '../state/character-state';
import {
	characterAttributeScore,
	characterAttributes,
	isDraftOwner,
	proficienciesOf,
} from '../state/character-state';
import { characterLevel } from '../state/character-advancement';
import { characterVisibleToActor } from './character-visibility';
import type { SystemPackage } from '../state/system-package';
import { evaluateFormula } from '../state/system-package';
import { DND5E_SYSTEM_PACKAGE } from '../systems';

/**
 * CHAR-001 / CHAR-002 — the ACTOR-FILTERED character read model. The data layer decides visibility
 * BEFORE any character data is returned to a non-DM surface (Contract 3 Axis 1 / Cross-Contract
 * Non-Negotiable 2), so the GUI roster, a player's character query, search, widgets, and MCP all
 * consume this rather than raw {@link CharacterState}. Fail-closed by construction:
 *
 *   - A `dm-only` DM-authored NPC is OMITTED from a player/observer query (CHAR-001 AC2). It is not
 *     redacted-but-listed; it is absent, so no title/count leaks.
 *   - A `dm-only` character's DM-only fields are stripped for any non-DM actor; a player-visible
 *     character still strips its declared `dmOnlyFields`.
 *   - A draft returns its fields ONLY to its single owner (or the DM); a non-owner player/observer
 *     gets NOTHING — no draft fields, not even existence (CHAR-002 AC3, fail closed).
 */

/** A character as seen by one actor: DM-only fields stripped from `data`/`combat` for non-DM. */
export interface CharacterView {
	id: string;
	kind: Character['kind'];
	name: string;
	visibility: Character['visibility'];
	abilityScores: Character['abilityScores'];
	/**
	 * RC-SYS-2.1 — the character's attribute scores as ONE hydrated map (the six fixed fields plus any
	 * package-keyed ones). Empty for a character in a system with no attributes.
	 */
	attributes: Record<string, number>;
	attacks: Character['attacks'];
	combat: Character['combat'];
	/** `data` with the character's declared DM-only fields removed for non-DM actors. */
	data: Record<string, unknown>;
	/** Structured proficiency state, hydrated with safe defaults (skills/saves/bonus/hit dice). */
	proficiencies: CharacterProficiencies;
	updatedAt: string;
	revision: number;
}

function redactCharacter(character: Character, isDm: boolean): CharacterView {
	const data = { ...character.data };
	const combat = { ...character.combat, conditions: [...character.combat.conditions] };
	if (!isDm) {
		for (const field of character.dmOnlyFields) {
			// DM-only field paths follow the field-edit path convention: `data.<key>` for a structured
			// sheet field, `combat.<key>` for a combat field, or a bare data key for legacy records.
			// Strip the scope prefix so the correct key is removed from `data`/`combat` and the value
			// never reaches a non-DM actor (Contract 3 field visibility / CHAR-010 non-leak).
			if (field.startsWith('combat.')) {
				const combatKey = field.slice('combat.'.length);
				if (combatKey in combat) delete (combat as Record<string, unknown>)[combatKey];
				continue;
			}
			const dataKey = field.startsWith('data.') ? field.slice('data.'.length) : field;
			delete (data as Record<string, unknown>)[dataKey];
		}
	}
	return {
		id: character.id,
		kind: character.kind,
		name: character.name,
		visibility: character.visibility,
		abilityScores: { ...character.abilityScores },
		attributes: characterAttributes(character),
		attacks: character.attacks.map((attack) => ({ ...attack })),
		combat,
		data,
		proficiencies: proficienciesOf(character),
		updatedAt: character.updatedAt,
		revision: character.revision,
	};
}

// --- Package-derived read model (RC-SYS-2.1, pure) ------------------------------------------------

/**
 * RC-SYS-2.1 — every number a character sheet shows that is not stored comes from the ACTIVE SYSTEM
 * PACKAGE's `attributes[].derivation` and `derived[]` formulas, evaluated by the package's own pure
 * evaluator. Nothing here knows what "wisdom" or "proficiency bonus" means; it knows how to look one
 * up in a package and how to say honestly that the package does not declare it.
 *
 * Every function takes the package as an OPTIONAL trailing argument defaulting to the built-in 5e
 * package, so a caller that has not been re-plumbed yet reads exactly the numbers it always did.
 */

/** The keys `derived[]` entries are looked up by. A package is free to omit any of them. */
const DERIVED_PROFICIENCY_BONUS = 'proficiencyBonus';
const DERIVED_PASSIVE_SCORE = 'passiveScore';
/** The skill whose passive score the roster/sheet surfaces. */
const PASSIVE_SKILL_KEY = 'perception';

/** Evaluate a package formula, returning `null` when the package has no such value or it will not evaluate. */
function derivedValue(
	pkg: SystemPackage,
	key: string,
	scope: Record<string, number>,
): number | null {
	const declared = pkg.derived.find((entry) => entry.key === key);
	if (!declared) return null;
	const result = evaluateFormula(declared.formula, scope);
	return result.ok ? result.value : null;
}

/**
 * The standard 5e proficiency-bonus progression: +2 at level 1, +1 every 4 levels (⌈1 + level/4⌉ —
 * levels 1–4 ⇒ 2, 5–8 ⇒ 3, … 17–20 ⇒ 6). Level is clamped to ≥ 1. Pure.
 *
 * RC-SYS-2.1 — this is now the 5e PACKAGE's `proficiencyBonus` formula evaluated at a level, not a
 * hand-written progression; it is kept as a named export because the shape of the curve is what
 * callers asking for "the 5e progression" mean.
 */
export function derivedProficiencyBonus(
	level: number,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): number {
	const clamped = Math.max(1, Math.trunc(Number.isFinite(level) ? level : 1));
	return derivedValue(pkg, DERIVED_PROFICIENCY_BONUS, { level: clamped }) ?? 0;
}

/**
 * The character's EFFECTIVE proficiency bonus: the explicit `proficiencies.proficiencyBonus` when
 * set, otherwise DERIVED from the character level through the active package's `proficiencyBonus`
 * formula. A system that declares no such value (the built-in Generic package) has no proficiency
 * bonus at all, so an unset override reads 0 rather than a borrowed 5e number. Pure.
 */
export function effectiveProficiencyBonus(
	character: Character,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): number {
	const explicit = proficienciesOf(character).proficiencyBonus;
	if (explicit !== null) return explicit;
	return derivedProficiencyBonus(characterLevel(character), pkg);
}

/**
 * The modifier a raw score yields under the active package's ability-modifier derivation (5e:
 * ⌊(score − 10) / 2⌋; an absent score reads as 10 ⇒ +0). A package whose attributes derive nothing
 * yields 0 — a pool system counts dice, it does not add a modifier. Pure.
 */
export function abilityModifier(
	score: number | undefined,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): number {
	const value = typeof score === 'number' && Number.isFinite(score) ? score : 10;
	const derivation = pkg.attributes.find(
		(attribute) => attribute.derivation.kind === 'modifier',
	)?.derivation;
	if (!derivation || derivation.kind !== 'modifier') return 0;
	const result = evaluateFormula(derivation.formula, { score: value });
	return result.ok ? result.value : 0;
}

/** One attribute of a character, resolved against the active package. */
export interface CharacterAttributeView {
	/** The package's attribute key (`strength`, `force`, …). */
	key: string;
	label: string;
	abbreviation: string;
	/** The character's score, or `null` when they have none for this attribute. */
	score: number | null;
	/** The score run through the attribute's derivation, or `null` when it derives nothing. */
	modifier: number | null;
}

/**
 * The character's attributes AS THE ACTIVE PACKAGE DEFINES THEM, in package order (RC-SYS-2.1). A
 * package with no attributes returns an EMPTY list — that is the honest "no attributes" read every
 * surface renders, not an error and not six borrowed 5e abilities. Pure.
 */
export function characterAttributesForPackage(
	character: Character,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): CharacterAttributeView[] {
	return pkg.attributes.map((attribute) => {
		const score = characterAttributeScore(character, attribute.key) ?? null;
		let modifier: number | null = null;
		if (attribute.derivation.kind === 'modifier' && score !== null) {
			const result = evaluateFormula(attribute.derivation.formula, { score });
			modifier = result.ok ? result.value : null;
		}
		return {
			key: attribute.key,
			label: attribute.label,
			abbreviation: attribute.abbreviation,
			score,
			modifier,
		};
	});
}

/** One skill of a character, resolved against the active package. */
export interface CharacterSkillView {
	key: string;
	label: string;
	/** The package attribute key this skill keys off, or `null` for an attribute-free system. */
	attribute: string | null;
	proficiency: CharacterProficiencies['skills'][string];
	/**
	 * The total bonus: the keyed attribute's modifier plus the proficiency contribution (the effective
	 * proficiency bonus once for `proficient`, twice for `expertise`). `null` when the system derives
	 * no modifiers at all, so nothing dishonest is shown.
	 */
	bonus: number | null;
}

/**
 * The character's skills AS THE ACTIVE PACKAGE DEFINES THEM, in package order (RC-SYS-2.1). A package
 * with no skills returns an empty list. Pure.
 */
export function characterSkillsForPackage(
	character: Character,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): CharacterSkillView[] {
	const proficiencies = proficienciesOf(character);
	const bonus = effectiveProficiencyBonus(character, pkg);
	const attributesByKey = new Map(pkg.attributes.map((attribute) => [attribute.key, attribute]));
	return pkg.skills.map((skill) => {
		const proficiency = proficiencies.skills[skill.key] ?? 'none';
		const attribute = skill.attribute === null ? undefined : attributesByKey.get(skill.attribute);
		let total: number | null = null;
		if (attribute && attribute.derivation.kind === 'modifier') {
			const score = characterAttributeScore(character, attribute.key) ?? 10;
			const modifier = evaluateFormula(attribute.derivation.formula, { score });
			if (modifier.ok) {
				total =
					modifier.value +
					(proficiency === 'expertise' ? bonus * 2 : proficiency === 'proficient' ? bonus : 0);
			}
		}
		return {
			key: skill.key,
			label: skill.label,
			attribute: skill.attribute,
			proficiency,
			bonus: total,
		};
	});
}

/**
 * The character's PASSIVE score for the package's perception-equivalent skill: the package's
 * `passiveScore` formula over the keyed attribute's modifier and the skill's proficiency
 * contribution (5e: 10 + WIS modifier + the perception contribution). Derived on read, never stored,
 * so it can never drift.
 *
 * `null` when the active package declares no passive score or no perception skill — the honest read
 * for a system that simply has no such number. Pure.
 */
export function passiveSkillScore(
	character: Character,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): number | null {
	const skill = pkg.skills.find((entry) => entry.key === PASSIVE_SKILL_KEY);
	if (!skill || skill.attribute === null) return null;
	const attribute = pkg.attributes.find((entry) => entry.key === skill.attribute);
	if (!attribute || attribute.derivation.kind !== 'modifier') return null;
	const score = characterAttributeScore(character, attribute.key) ?? 10;
	const modifierResult = evaluateFormula(attribute.derivation.formula, { score });
	if (!modifierResult.ok) return null;
	const level = proficienciesOf(character).skills[skill.key] ?? 'none';
	const bonus = effectiveProficiencyBonus(character, pkg);
	const proficiency = level === 'expertise' ? bonus * 2 : level === 'proficient' ? bonus : 0;
	return derivedValue(pkg, DERIVED_PASSIVE_SCORE, { modifier: modifierResult.value, proficiency });
}

/**
 * PASSIVE PERCEPTION under the active package (RC-SYS-2.1: {@link passiveSkillScore}), falling back
 * to 10 when the package declares no such number so the long-standing numeric contract holds for
 * every existing caller. Pure + deterministic.
 */
export function passivePerception(
	character: Character,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): number {
	return passiveSkillScore(character, pkg) ?? 10;
}

/** A single character for one actor, or `null` when the actor may not see it (fail closed). */
export function getCharacterForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
	characterId: string,
): CharacterView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const character = state.characters[characterId];
	if (!character) return null;
	if (!characterVisibleToActor(character, actor, permissions)) return null;
	return redactCharacter(character, hasDmAuthority(actor.role));
}

/** Every character the actor may see, omitting hidden ones entirely, sorted by name. */
export function listCharactersForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
): CharacterView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const isDm = hasDmAuthority(actor.role);
	return Object.values(state.characters)
		.filter((character) => characterVisibleToActor(character, actor, permissions))
		.map((character) => redactCharacter(character, isDm))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** A draft as seen by its owner/DM. Drafts are only ever returned to those actors. */
export interface CharacterDraftView {
	id: string;
	name: string;
	ownerActorId: string;
	createdBy: string;
	steps: CharacterDraft['steps'];
	visibility: CharacterDraft['visibility'];
	updatedAt: string;
	revision: number;
	finalized: boolean;
	/** Whether the requesting actor may edit (the single owner only; the DM administers, not edits). */
	editableByActor: boolean;
}

function draftView(draft: CharacterDraft, actorId: string): CharacterDraftView {
	return {
		id: draft.id,
		name: draft.name,
		ownerActorId: draft.ownerActorId,
		createdBy: draft.createdBy,
		steps: draft.steps.map((step) => ({ ...step, values: { ...step.values } })),
		visibility: draft.visibility,
		updatedAt: draft.updatedAt,
		revision: draft.revision,
		finalized: draft.finalized,
		editableByActor: isDraftOwner(draft, actorId),
	};
}

/**
 * A draft for one actor, or `null` when the actor is neither the DM nor the single owner (CHAR-002
 * AC3 — a non-owner gets NO draft fields). Inspecting an existing draft by id yields a
 * pre-finalization character entity with draft state, never a permission-grant entity (CHAR-002 AC4).
 */
export function getDraftForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
	draftId: string,
): CharacterDraftView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const draft = state.drafts[draftId];
	if (!draft) return null;
	const isOwner = isDraftOwner(draft, actorId);
	if (!hasDmAuthority(actor.role) && !isOwner) return null; // fail closed: no draft fields for non-owners
	return draftView(draft, actorId);
}

/**
 * The drafts an actor may see: the DM sees all unfinalized drafts; a player sees only the draft(s)
 * they own. An observer sees none. Used by the draft list/roster surface.
 */
export function listDraftsForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
): CharacterDraftView[] {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role === 'observer') return [];
	const isDm = hasDmAuthority(actor.role);
	return Object.values(state.drafts)
		.filter((draft) => isDm || isDraftOwner(draft, actorId))
		.map((draft) => draftView(draft, actorId))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
