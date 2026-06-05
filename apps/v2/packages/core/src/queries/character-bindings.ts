import type { Character, CharacterState } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import { ensureCollaboration, unresolvedConflictPaths } from '../state/character-collaboration';
import {
	EMPTY_WIDGET_DATA_ENVIRONMENT,
	entityBindingKey,
	type EntityBindingRecord,
	type WidgetDataEnvironment,
} from './binding';

/**
 * CHAR-001 — make a character's fields WIDGET-BINDABLE through the EXISTING binding model.
 *
 * Rather than inventing a second binding mechanism, this bridge projects each character into the
 * Processing Core's {@link WidgetDataEnvironment} (an {@link EntityBindingRecord} per character). A
 * Scene widget then binds to e.g. `character:<id>` with selector `combat.hp`, and the SAME
 * `resolveWidgetBinding` resolver decides the actor-scoped value and the hidden/conflicted/missing
 * fail-closed states (Contract 4 Widget Data Contract) — including redacting the character's DM-only
 * fields for non-DM actors. The widget layer needs no character-specific code.
 *
 * Pure data transform (Contract 1): no GUI, no storage. The character's `visibility` becomes the
 * record's entity visibility (so a `dm-only` NPC resolves to `hidden` for players), and the
 * character's `dmOnlyFields` become the record's `hiddenSelectors` (so a hidden field is omitted/
 * `field-hidden` for non-DM actors even on a visible character).
 */

/** The flat, bindable value map for a character: the combat fields plus declared sheet data. */
function characterBindableValue(character: Character): Record<string, unknown> {
	return {
		name: character.name,
		kind: character.kind,
		// Combat fields are addressable both flat (`hp`) and namespaced (`combat.hp`) so a widget can
		// bind to whichever selector shape it declares.
		hp: character.combat.hp,
		maxHp: character.combat.maxHp,
		tempHp: character.combat.tempHp,
		ac: character.combat.ac,
		conditions: [...character.combat.conditions],
		'combat.hp': character.combat.hp,
		'combat.maxHp': character.combat.maxHp,
		'combat.tempHp': character.combat.tempHp,
		'combat.ac': character.combat.ac,
		'combat.conditions': [...character.combat.conditions],
		...character.data,
	};
}

/** Project ONE character into a binding record the existing resolver understands. */
export function characterBindingRecord(character: Character): EntityBindingRecord {
	// CHAR-004: a field path with an UNRESOLVED same-path conflict makes that path's binding resolve
	// to the existing `conflicted` state (Contract 4) — so a widget bound to e.g. `combat.hp` never
	// silently shows one side of an unresolved conflict; it must be resolved by the DM first.
	const conflictPaths = unresolvedConflictPaths(ensureCollaboration(character.collaboration));
	return {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: character.id,
		visibility: character.visibility,
		// A `shared` character is delivered to its explicit recipients (e.g. the owner of a finalized PC).
		sharedWith: [...character.sharedWith],
		// `dm-only` fields stay hidden even when the character itself is visible: the resolver omits
		// them for non-DM actors (Contract 3 field-level visibility / CHAR-001 AC2).
		hiddenSelectors: [...character.dmOnlyFields],
		...(conflictPaths.length > 0 ? { conflict: { paths: [...conflictPaths] } } : {}),
		value: characterBindableValue(character),
	};
}

/**
 * Build the widget data environment for the whole character slice. Every character becomes a
 * resolvable binding target; `knownEntityKeys` is the authoritative existing-key set so a binding to
 * a deleted/never-known character resolves to `missing` rather than leaking a stale value.
 *
 * When `base` is supplied, the character records are merged into it (characters win on key
 * collision), so this can extend an environment that already carries other entity types.
 */
export function buildCharacterDataEnvironment(
	characters: CharacterState,
	base: WidgetDataEnvironment = EMPTY_WIDGET_DATA_ENVIRONMENT,
): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = { ...base.entities };
	const knownEntityKeys = new Set(base.knownEntityKeys ?? Object.keys(base.entities));
	for (const character of Object.values(characters.characters)) {
		const key = entityBindingKey(CHARACTER_ENTITY_TYPE, character.id);
		entities[key] = characterBindingRecord(character);
		knownEntityKeys.add(key);
	}
	return {
		entities,
		knownEntityKeys: [...knownEntityKeys],
		schemaVersion: base.schemaVersion,
	};
}
