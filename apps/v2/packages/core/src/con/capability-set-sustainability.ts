import type { CapabilitySet } from '../state/permission-state';
import {
	CAPABILITY_SCHEMA_VERSION,
	CAPABILITY_SET_SCHEMA,
	hasCapabilitySchemaForEntityType,
	isKnownCapabilitySet,
} from '../permissions/capability-schema';
import { describeCapabilitySet } from '../permissions/capability-sets';

/**
 * CON-004 — THE PERMISSION-SUSTAINABILITY CONSTRAINT GATE. The single, declared source of truth for
 * the invariant that keeps the permission/grant model bounded, comprehensible, and auditable over
 * time (Vision "Permission Grants (Capability Sets)"; Architecture Contract 3 binding rules 5/6;
 * Cross-Contract Non-Negotiable 9: "Capability sets are schema-defined named options, not per-instance
 * raw field lists").
 *
 * CON-004's statement: "The system must never allow per-instance raw field-list grants to replace
 * schema-defined capability sets for player permissions." Its two acceptance criteria:
 *
 *   AC1 — Given a grant command contains a RAW FIELD LIST, when validated, then it is REJECTED.
 *   AC2 — Given the DM needs a new permission grouping, when supported, then it is added as a NAMED
 *         schema-defined capability set for that entity type.
 *
 * This module delivers AC1 as a fail-closed payload detector ({@link findRawFieldListGrant}) the
 * grant command boundary composes, and AC2 as a governance audit ({@link auditCapabilitySetGovernance})
 * that proves every grantable capability set is a NAMED, schema-defined, governed (documented +
 * inheritance-resolved) option — and that the model stays BOUNDED (no entity type may exceed a declared
 * capability-set cap, the sustainability ceiling that resists uncontrolled growth).
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the SEC-008 security
 * regression-gate registry and the PERF-001 performance-budget registry): a declared invariant + a
 * pure, fail-closed validator that is cross-checked against reality so the model can never silently
 * drift past its sustainability bound. It does NOT re-implement the grant model; it COMPOSES the
 * existing capability-set schema, descriptors, and inheritance. This module is the INDEX + the proof
 * that the named-capability-set model can never be replaced by a per-instance field-list grant.
 *
 * Pure data + pure predicates. No GUI, no storage, no clock, no entropy, no network.
 */

/** CON-004 sustainability-constraint registry version, bumped on a breaking constraint-shape change. */
export const CAPABILITY_SET_SUSTAINABILITY_VERSION = 1 as const;

/**
 * THE SUSTAINABILITY BOUND. The maximum number of named capability sets ANY single entity type may
 * declare before the model is no longer comprehensible at a glance. This is the ceiling that keeps the
 * grant vocabulary bounded over time: an entity type whose set list grows past this cap is exactly the
 * "unmanageable configuration surface" CON-004 / the Vision brief warn against, and the governance
 * audit flags it fail-closed. Today the densest entity type (`character`) declares 4 sets, so this
 * leaves deliberate headroom while still drawing a hard, reviewable line.
 */
export const MAX_CAPABILITY_SETS_PER_ENTITY_TYPE = 8 as const;

/**
 * The property keys that, if present in a grant command payload, signal an attempt to author a
 * PER-INSTANCE RAW FIELD LIST instead of selecting a NAMED capability set — the precise drift CON-004
 * forbids. The grant payload's only permission selector is a single named `capabilitySet` string; any
 * of these "field list" shaped keys is a raw-field grant and is rejected fail-closed (AC1).
 *
 * The list is intentionally broad (every common way one might smuggle a field list into a grant) and
 * closed: it is the single source of truth for "what a raw field-list grant looks like". Matching is
 * case-insensitive and ignores `-`/`_` separators so `fieldList`, `field_list`, and `field-list` are
 * all caught.
 */
export const RAW_FIELD_LIST_SIGNAL_KEYS: readonly string[] = Object.freeze([
	'fields',
	'fieldlist',
	'fieldnames',
	'fieldgrants',
	'fieldpermissions',
	'allowedfields',
	'writablefields',
	'readablefields',
	'editablefields',
	'grantedfields',
	'fieldcapabilities',
	'fieldaccess',
	'perfieldgrants',
	'rawfields',
]);

const RAW_FIELD_LIST_SIGNAL_SET: ReadonlySet<string> = new Set(RAW_FIELD_LIST_SIGNAL_KEYS);

/** Normalize a payload key for raw-field-list comparison: lower-cased with `-`/`_` removed. */
function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/[-_]/g, '');
}

/** A detected attempt to author a per-instance raw field-list grant (CON-004 AC1). */
export interface RawFieldListGrantFinding {
	/** The kind of raw-field-list smell found. */
	kind: 'field-list-key' | 'capability-set-not-a-name';
	/** The offending payload key (for `field-list-key`) or `'capabilitySet'`. */
	key: string;
	/** A human-readable, fail-closed rejection reason that names CON-004. */
	message: string;
}

/**
 * CON-004 AC1 — detect a per-instance RAW FIELD-LIST grant in a grant command payload, fail closed.
 * Returns the first finding (a structured rejection reason) or `null` when the payload selects only a
 * single NAMED capability set, as the model requires. A `null` is the green signal the grant command
 * boundary turns into "proceed to schema validation"; a finding is turned into a rejection.
 *
 * Two drift shapes are caught:
 *
 *   1. A FIELD-LIST-SHAPED KEY ({@link RAW_FIELD_LIST_SIGNAL_KEYS}) — e.g. `fields`, `allowedFields`,
 *      `fieldGrants` — anywhere in the grant payload. This is the explicit "grant these raw fields"
 *      shape the constraint forbids.
 *   2. A `capabilitySet` that is NOT a single name — an array (a field/set LIST), an object (a
 *      structured field map), or an empty/blank string. The selector must be exactly one named set.
 *
 * Pure: a function of the payload alone. Non-object payloads return `null` here (the command's zod
 * schema rejects them earlier); this detector only owns the raw-field-list dimension.
 */
export function findRawFieldListGrant(payload: unknown): RawFieldListGrantFinding | null {
	if (payload === null || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;

	// 1. A field-list-shaped key anywhere in the grant payload is a raw-field grant.
	for (const key of Object.keys(record)) {
		if (RAW_FIELD_LIST_SIGNAL_SET.has(normalizeKey(key))) {
			return {
				kind: 'field-list-key',
				key,
				message: `Grant payload key "${key}" is a per-instance raw field-list grant, which CON-004 forbids. Grant a named, schema-defined capability set for the entity type instead.`,
			};
		}
	}

	// 2. The capability selector must be exactly ONE named set, never a list/map of fields.
	if ('capabilitySet' in record) {
		const value = record.capabilitySet;
		if (Array.isArray(value)) {
			return {
				kind: 'capability-set-not-a-name',
				key: 'capabilitySet',
				message:
					'A grant\'s capabilitySet must be a single named capability set, not a list of fields/sets (CON-004).',
			};
		}
		if (value !== null && typeof value === 'object') {
			return {
				kind: 'capability-set-not-a-name',
				key: 'capabilitySet',
				message:
					'A grant\'s capabilitySet must be a single named capability set, not a structured field map (CON-004).',
			};
		}
		if (typeof value === 'string' && value.trim() === '') {
			return {
				kind: 'capability-set-not-a-name',
				key: 'capabilitySet',
				message: 'A grant must name a non-empty, schema-defined capability set (CON-004).',
			};
		}
	}

	return null;
}

/** True when a grant payload authors a per-instance raw field-list grant (CON-004 AC1 predicate). */
export function isRawFieldListGrant(payload: unknown): boolean {
	return findRawFieldListGrant(payload) !== null;
}

/** A problem the capability-set governance audit found (CON-004 sustainability constraint). */
export interface CapabilitySetGovernanceProblem {
	kind:
		| 'unknown-entity-type'
		| 'set-not-schema-defined'
		| 'set-not-governed'
		| 'blank-set-name'
		| 'duplicate-set-name'
		| 'too-many-sets';
	entityType: string;
	capabilitySet: string | null;
	message: string;
}

/**
 * CON-004 AC2 + sustainability — audit the capability-set SCHEMA against the governance invariant,
 * fail closed. Every grantable permission grouping MUST be a named, schema-defined, GOVERNED capability
 * set (the supported path for "the DM needs a new permission grouping"); the model MUST stay BOUNDED.
 *
 * For every entity type with a declared schema, this proves:
 *
 *   - each set name is a NON-BLANK, UNIQUE NAME (never a raw field list, never an empty selector);
 *   - each set is GOVERNED — schema-defined ({@link isKnownCapabilitySet}) AND describable
 *     ({@link describeCapabilitySet} resolves a label + inheritance), so it is a documented, reviewable
 *     option rather than an ad-hoc undocumented grouping; and
 *   - the entity type declares NO MORE THAN {@link MAX_CAPABILITY_SETS_PER_ENTITY_TYPE} sets, the
 *     sustainability ceiling that resists uncontrolled growth into an unmanageable surface.
 *
 * Returns every problem found so a caller can report all at once. Pure: a function of the schema alone
 * (defaults to the real {@link CAPABILITY_SET_SCHEMA}). The CON-004 meta-test drives this against the
 * real model (expecting zero problems) and against deliberately violating fixtures (expecting a
 * problem), proving the gate goes GREEN on the real model and RED on a sustainability violation.
 */
export function auditCapabilitySetGovernance(
	schema: Record<string, readonly CapabilitySet[]> = CAPABILITY_SET_SCHEMA,
	maxSetsPerEntityType: number = MAX_CAPABILITY_SETS_PER_ENTITY_TYPE,
): CapabilitySetGovernanceProblem[] {
	const problems: CapabilitySetGovernanceProblem[] = [];
	const usesRealSchema = schema === CAPABILITY_SET_SCHEMA;

	for (const entityType of Object.keys(schema)) {
		// Against the real schema this is always true; against a fixture it guards that the entity type
		// is one the system actually knows how to govern (fail closed for an unknown type).
		if (usesRealSchema && !hasCapabilitySchemaForEntityType(entityType)) {
			problems.push({
				kind: 'unknown-entity-type',
				entityType,
				capabilitySet: null,
				message: `Entity type "${entityType}" has no governed capability schema.`,
			});
			continue;
		}

		const sets = schema[entityType] ?? [];
		if (sets.length > maxSetsPerEntityType) {
			problems.push({
				kind: 'too-many-sets',
				entityType,
				capabilitySet: null,
				message: `Entity type "${entityType}" declares ${sets.length} capability sets, exceeding the sustainability cap of ${maxSetsPerEntityType}. Consolidate or split the entity type before adding more (CON-004).`,
			});
		}

		const seen = new Set<string>();
		for (const set of sets) {
			if (typeof set !== 'string' || set.trim() === '') {
				problems.push({
					kind: 'blank-set-name',
					entityType,
					capabilitySet: set ?? null,
					message: `Entity type "${entityType}" declares a blank/unnamed capability set; every set must be a named option (CON-004).`,
				});
				continue;
			}
			if (seen.has(set)) {
				problems.push({
					kind: 'duplicate-set-name',
					entityType,
					capabilitySet: set,
					message: `Entity type "${entityType}" declares capability set "${set}" more than once.`,
				});
			}
			seen.add(set);

			// GOVERNED: the set must be schema-defined AND describable (documented + inheritance-resolved).
			// We only assert this against the REAL schema, where the descriptor copy lives; a synthetic
			// fixture set has no copy and would otherwise always fail the governance check.
			if (usesRealSchema) {
				if (!isKnownCapabilitySet(entityType, set)) {
					problems.push({
						kind: 'set-not-schema-defined',
						entityType,
						capabilitySet: set,
						message: `Capability set "${set}" is offered for "${entityType}" but is not schema-defined (CON-004 AC2).`,
					});
					continue;
				}
				if (describeCapabilitySet(entityType, set) === null) {
					problems.push({
						kind: 'set-not-governed',
						entityType,
						capabilitySet: set,
						message: `Capability set "${set}" on "${entityType}" is not governed: it has no resolvable descriptor (label/inheritance). Add it as a named, documented set (CON-004 AC2).`,
					});
				}
			}
		}
	}

	return problems;
}

/**
 * CON-004 AC2 — the SUPPORTED PATH for a new permission grouping: confirm a candidate grouping is a
 * named, schema-defined, governed capability set for the entity type (not a raw field list). True only
 * when the entity type has a schema, the name is non-blank, the set is schema-defined, AND it resolves
 * to a governed descriptor. This is the predicate the DM-facing "add a new grouping" flow checks before
 * a grouping is grantable — fail closed: anything not fully governed is not a valid grouping.
 */
export function isGovernedCapabilitySet(entityType: string, capabilitySet: string): boolean {
	if (!hasCapabilitySchemaForEntityType(entityType)) return false;
	if (capabilitySet.trim() === '') return false;
	if (!isKnownCapabilitySet(entityType, capabilitySet)) return false;
	return describeCapabilitySet(entityType, capabilitySet) !== null;
}

/** A summary of the governed permission model, for the CON-004 audit/diagnostics surface. */
export interface CapabilitySetGovernanceSummary {
	/** The capability-set schema version the governed model is pinned to. */
	schemaVersion: string;
	/** The sustainability cap on capability sets per entity type. */
	maxSetsPerEntityType: number;
	/** The number of governed entity types in the schema. */
	entityTypeCount: number;
	/** The total number of named capability sets across all entity types. */
	totalCapabilitySets: number;
	/** True when the model passes the full governance audit (bounded + governed). */
	governed: boolean;
}

/**
 * Summarize the governed permission model: schema version, the sustainability cap, how many entity
 * types and named sets exist, and whether the full governance audit passes. Pure; used by the CON-004
 * meta-test and any DM-facing governance diagnostic to report the model stays within its bound.
 */
export function summarizeCapabilitySetGovernance(
	schema: Record<string, readonly CapabilitySet[]> = CAPABILITY_SET_SCHEMA,
): CapabilitySetGovernanceSummary {
	const entityTypes = Object.keys(schema);
	let total = 0;
	for (const entityType of entityTypes) total += (schema[entityType] ?? []).length;
	return {
		schemaVersion: CAPABILITY_SCHEMA_VERSION,
		maxSetsPerEntityType: MAX_CAPABILITY_SETS_PER_ENTITY_TYPE,
		entityTypeCount: entityTypes.length,
		totalCapabilitySets: total,
		governed: auditCapabilitySetGovernance(schema).length === 0,
	};
}
