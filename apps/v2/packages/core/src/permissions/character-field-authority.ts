import type { CapabilitySet } from '../state/permission-state';
import type { CharacterFieldPath } from '../state/character-collaboration';

/**
 * CHAR-010 — the FIELD-SCOPED character-edit authority policy (Architecture Contract 3, "Minimum
 * Capability Sets" for the `character` entity type).
 *
 * Contract 3 defines what each character capability set may WRITE:
 *
 *   - `backstory-editor` — backstory, personality, relationships, goals, bonds, flaws, history, and
 *     player notes (the NARRATIVE surface) — and NOTHING else.
 *   - `combat-participant` — HP, temp HP, conditions, death saves, spell slots, etc. (the COMBAT
 *     surface).
 *   - `owner` — all player-authored fields (it inherits both of the above plus identity-level fields
 *     like the character name).
 *
 * This module maps a concrete {@link CharacterFieldPath} to the MINIMUM capability set that may write
 * it, so the field-edit command (CHAR-005) can be driven by the capability set per field rather than
 * a blunt owner-only gate. It is pure data + pure predicates: no GUI, no storage, no actor. The
 * command handler combines this with the player's effective capability set (PERM inheritance) and the
 * character's `dm-only` field metadata (PERM visibility) to decide, fail-closed, whether a non-DM
 * write is allowed. The DM bypasses this policy entirely (DM Authority — Contract 3).
 *
 * Fail-closed: a field path with NO declared write scope here requires `owner` (the most-privileged
 * narrowest grant a player can hold), so a `backstory-editor` can never reach an unmapped field, and
 * an unknown/garbage path resolves to `owner` and is denied to anyone but an owner/DM.
 */

/**
 * The NARRATIVE field surface a `backstory-editor` may write (Contract 3). These are the
 * player-authored story fields, stored as `data.<key>` structured sheet fields. The list is the
 * single source of truth for the backstory-editor field scope and is closed: a key not present here
 * is NOT a narrative field and a backstory-editor may not write it.
 *
 * Maps the human concept to its concrete `data.<key>` path:
 *   - backstory, personality, relationships, goals, bonds, flaws, history, player notes.
 */
export const BACKSTORY_EDITOR_DATA_KEYS: readonly string[] = Object.freeze([
	'backstory',
	'personality',
	'relationships',
	'goals',
	'bonds',
	'flaws',
	'history',
	'playerNotes',
]);

const BACKSTORY_EDITOR_PATHS: ReadonlySet<string> = new Set(
	BACKSTORY_EDITOR_DATA_KEYS.map((key) => `data.${key}`),
);

/** The combat scalar/array paths a `combat-participant` may write (Contract 3 combat surface). */
const COMBAT_PARTICIPANT_PATHS: ReadonlySet<string> = new Set([
	'combat.hp',
	'combat.maxHp',
	'combat.tempHp',
	'combat.ac',
	'combat.conditions',
]);

/**
 * The MINIMUM capability set required to write a given character field path. Inheritance is applied
 * by the caller (an `owner` grant inherits `backstory-editor` and `combat-participant`, so an owner
 * satisfies every field), so this returns only the narrowest set that authorizes the path:
 *
 *   - a narrative field            ⇒ `backstory-editor`
 *   - a combat field               ⇒ `combat-participant`
 *   - everything else (name, other `data.*`, unknown) ⇒ `owner`
 *
 * Fail-closed by construction: an unmapped or unknown path requires `owner`, the narrowest grant that
 * still authorizes "all player-authored fields", so a partial grant (backstory-editor /
 * combat-participant) can never write a field outside its declared scope.
 */
export function requiredCapabilityForCharacterField(
	path: CharacterFieldPath | string,
): CapabilitySet {
	if (BACKSTORY_EDITOR_PATHS.has(path)) return 'backstory-editor';
	if (COMBAT_PARTICIPANT_PATHS.has(path)) return 'combat-participant';
	return 'owner';
}

/** True when the path is part of the narrative surface a `backstory-editor` may write. */
export function isBackstoryEditorField(path: CharacterFieldPath | string): boolean {
	return BACKSTORY_EDITOR_PATHS.has(path);
}
