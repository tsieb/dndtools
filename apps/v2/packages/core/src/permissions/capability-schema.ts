import type { CapabilitySet } from '../state/permission-state';

/**
 * PERM-007 / PERM-009 — the authoritative, system-defined capability-set schema per entity type
 * (Architecture Contract 3, "Minimum Capability Sets"). Capability sets are schema-defined named
 * options, NOT freely authored per entity instance (Contract 3 binding rule 5 / Cross-Contract
 * Non-Negotiable 9). This module is the single source of truth the consistency audit uses to
 * decide whether a grant references a capability set that is actually defined for its entity type,
 * and the schema VERSION whose change invalidates participant capability caches (PERM-009).
 *
 * Pure data + pure predicates. No GUI, no storage. The GUI consumes these; it does not define
 * capability semantics.
 */

/**
 * The capability-set schema version. Bumping this string is a permission-relevant change: it
 * invalidates every participant's capability cache (PERM-009), because the meaning/scoping of a
 * granted capability may have changed even if the grant records did not. Keep it in lockstep with
 * any change to {@link CAPABILITY_SET_SCHEMA} below.
 */
export const CAPABILITY_SCHEMA_VERSION = '1' as const;

/**
 * The set of valid capability sets per entity type, exactly as defined in Contract 3. Character
 * and note entity types carry their own sets; widget/scene/timer carry theirs. Anything not listed
 * for an entity type is an unknown capability set and is a consistency error (PERM-007).
 *
 * `character-field` and `note-section` share the character/note sets respectively so a field- or
 * section-scoped grant is validated against the same named options.
 */
export const CAPABILITY_SET_SCHEMA: Record<string, readonly CapabilitySet[]> = Object.freeze({
	character: ['owner', 'combat-participant', 'backstory-editor', 'viewer'],
	'character-field': ['owner', 'combat-participant', 'backstory-editor', 'viewer'],
	note: ['section-editor', 'contributor', 'viewer'],
	'note-section': ['section-editor', 'contributor', 'viewer'],
	widget: ['manager', 'operator', 'viewer'],
	'timer-widget': ['operator', 'viewer'],
	scene: ['co-editor', 'viewer'],
});

/**
 * The single capability set per entity type that is singular-by-ownership: a character may have at
 * most ONE `owner` grant per player-per-entity in valid state, and across the entity at most one
 * owner total. Contract 3 Consistency Requirements: "A character has more than one `owner` grant"
 * is an invalid state. Used by the multiple-owner consistency check.
 */
export const SINGULAR_OWNERSHIP_CAPABILITY: Record<string, CapabilitySet> = Object.freeze({
	character: 'owner',
	'character-field': 'owner',
});

/** True when `entityType` has a defined capability-set schema. */
export function hasCapabilitySchemaForEntityType(entityType: string): boolean {
	return Object.prototype.hasOwnProperty.call(CAPABILITY_SET_SCHEMA, entityType);
}

/**
 * True when `capabilitySet` is a defined option for `entityType`. Fails closed: an entity type with
 * NO schema returns false for every capability set (an unknown-capability consistency error), and
 * any capability set not explicitly listed returns false. This is the PERM-007 "unknown capability
 * set" predicate.
 */
export function isKnownCapabilitySet(entityType: string, capabilitySet: CapabilitySet): boolean {
	const sets = CAPABILITY_SET_SCHEMA[entityType];
	if (!sets) return false;
	return sets.includes(capabilitySet);
}

/** The capability set that is singular-per-character-owner for the entity type, if any. */
export function singularOwnershipCapabilityFor(entityType: string): CapabilitySet | null {
	return SINGULAR_OWNERSHIP_CAPABILITY[entityType] ?? null;
}
