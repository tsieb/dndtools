import type { ActorId } from './ids';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';
import {
	VAULT_OBJECT_SUBTYPES,
	isVaultObjectFieldType,
	isVaultObjectSubtype,
	type VaultObjectFieldSchema,
	type VaultObjectFieldType,
	type VaultObjectSchema,
	type VaultObjectSchemaRegistry,
} from './vault-object-schema';
import { VAULT_OBJECT_SUBTYPE_KEY } from './vault-object';

/**
 * CUSTOM VAULT-OBJECT TYPES — user-defined Vault Object subtypes, stored durably and treated as
 * FIRST-CLASS members of the vault-object model.
 *
 * A built-in subtype (`character`, `quest`, …) is a frozen {@link VaultObjectSchema} in the code-defined
 * registry (`state/vault-object-schema.ts`). A CUSTOM type is the SAME shape authored by the DM at
 * runtime and persisted in the content slice. It carries an id, a human label, and a declared field
 * schema (key / kind / required / default visibility of each field), and — crucially — it is projected
 * to the shared vault-object path AS a `VaultObjectSchema` ({@link customObjectTypeToSchema}). An instance
 * of a custom type is therefore an ordinary note-backed `ContentItem` (`kind: 'object'`) that flows
 * through the EXACT create / update / field-projection / frontmatter-sync path a built-in object uses —
 * there is NO parallel storage or validation system.
 *
 * FAIL CLOSED by construction:
 *   - A definition is validated ({@link validateCustomObjectTypeDefinition}) before any durable write:
 *     the id must match the reserved `custom:` namespace (so it can NEVER collide with a built-in
 *     subtype), the label must be non-empty, and EVERY declared field must have a syntactically valid,
 *     unique, non-reserved key and a kind drawn from the CLOSED {@link VaultObjectFieldType} set. An
 *     unknown field kind or a hostile key is rejected — a custom type can never smuggle a field the
 *     projection/sync path does not understand.
 *   - Visibility fails closed to `dm-only` (a custom type's instances are never accidentally
 *     player-visible by default).
 *   - Hydration is TOLERANT: a persisted map with a malformed/hostile entry drops that entry rather
 *     than poisoning the registry (a bad record can never widen what the resolver trusts).
 *
 * Pure data + pure functions. No GUI, no storage, no clock. The command layer composes these and the
 * durable write goes through the op-log (Architecture Contract 1).
 */

/** The per-record schema version stamped onto every stored custom type definition. */
export const CUSTOM_OBJECT_TYPE_SCHEMA_VERSION = 1 as const;

/** The entity type a custom object-type definition's durable ops are addressed by. */
export const CUSTOM_OBJECT_TYPE_ENTITY_TYPE = 'custom-object-type' as const;

/** The reserved id namespace every custom type id must carry (guarantees no built-in collision). */
export const CUSTOM_OBJECT_TYPE_ID_PREFIX = 'custom:' as const;

/**
 * A custom type id is the reserved prefix + a lowercase slug (`custom:tavern`, `custom:magic-item`).
 * The colon is impossible in a built-in subtype, so the two namespaces can never overlap.
 */
export const CUSTOM_OBJECT_TYPE_ID_PATTERN = /^custom:[a-z0-9](?:-?[a-z0-9]){0,48}$/;

/** A declared frontmatter field key must be a plain identifier (frontmatter-safe, no dotted envelope keys). */
export const CUSTOM_OBJECT_FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/** The upper bound on declared fields per custom type (a bounded, reviewable schema). */
export const CUSTOM_OBJECT_TYPE_MAX_FIELDS = 40;

/** The max length of a custom type's human label. */
export const CUSTOM_OBJECT_TYPE_MAX_LABEL = 80;

/** One declared field of a custom object type. Mirrors {@link VaultObjectFieldSchema}. */
export interface CustomObjectFieldDefinition {
	readonly key: string;
	readonly type: VaultObjectFieldType;
	readonly required: boolean;
	readonly description: string;
	/** When true the field is DM-only: omitted from a non-DM actor-filtered projection (fail closed). */
	readonly dmOnly: boolean;
}

/** A durable, DM-authored custom object-type definition. */
export interface CustomObjectTypeDefinition {
	/** The reserved-namespace id (`custom:<slug>`); also the subtype stored on each instance. */
	readonly id: string;
	/** The human-facing type label (e.g. "Tavern"). */
	readonly label: string;
	/** The declared frontmatter fields, in stable authored order. */
	readonly fields: readonly CustomObjectFieldDefinition[];
	/** The fail-closed visibility default a freshly-created instance of this type takes. */
	readonly defaultVisibility: VisibilityLevel;
	/** The DM/actor that authored the type. */
	readonly authorActorId: ActorId;
	readonly createdAt: string;
	readonly updatedAt: string;
	/** Optimistic-concurrency revision, bumped on every accepted edit of the definition. */
	readonly revision: number;
	readonly schemaVersion: typeof CUSTOM_OBJECT_TYPE_SCHEMA_VERSION;
}

/** The durable custom-type registry: definitions keyed by id. */
export type CustomObjectTypeMap = Record<string, CustomObjectTypeDefinition>;

// --- Validation (fail closed) --------------------------------------------------------------------

/** A stable machine code for one validation finding against a custom type definition. */
export type CustomObjectTypeIssueCode =
	| 'invalid-id'
	| 'id-collides-builtin'
	| 'missing-label'
	| 'label-too-long'
	| 'too-many-fields'
	| 'invalid-field-key'
	| 'reserved-field-key'
	| 'duplicate-field-key'
	| 'unknown-field-kind';

/** A single, non-leaking validation finding (names the field/expectation, never a raw value). */
export interface CustomObjectTypeIssue {
	/** The offending field key, or `(id)` / `(label)` / `(fields)` for a definition-level issue. */
	field: string;
	code: CustomObjectTypeIssueCode;
	message: string;
}

export interface CustomObjectTypeValidationResult {
	valid: boolean;
	issues: CustomObjectTypeIssue[];
}

/** The unvalidated draft a define/update command carries before it is trusted. */
export interface CustomObjectTypeDraft {
	id: string;
	label: string;
	fields: ReadonlyArray<{
		key: string;
		type: string;
		required?: boolean;
		description?: string;
		dmOnly?: boolean;
	}>;
	defaultVisibility?: string;
}

/**
 * Validate a custom type draft against the closed model. FAILS CLOSED — the id must be a well-formed
 * reserved-namespace id that does not collide with a built-in subtype, the label must be present and
 * bounded, and every field must have a valid, unique, non-reserved key and a known kind. Pure; leaks no
 * raw values.
 */
export function validateCustomObjectTypeDefinition(
	draft: CustomObjectTypeDraft,
): CustomObjectTypeValidationResult {
	const issues: CustomObjectTypeIssue[] = [];

	if (!CUSTOM_OBJECT_TYPE_ID_PATTERN.test(draft.id)) {
		issues.push({
			field: '(id)',
			code: 'invalid-id',
			message: `A custom type id must match "${CUSTOM_OBJECT_TYPE_ID_PREFIX}<slug>" (lowercase letters, digits, single hyphens).`,
		});
	} else if (isVaultObjectSubtype(draft.id)) {
		// Defensive: the reserved prefix already excludes every built-in, but never let a custom id shadow one.
		issues.push({
			field: '(id)',
			code: 'id-collides-builtin',
			message: `"${draft.id}" collides with a built-in Vault Object subtype.`,
		});
	}

	const label = draft.label.trim();
	if (label === '') {
		issues.push({ field: '(label)', code: 'missing-label', message: 'A type label is required.' });
	} else if (label.length > CUSTOM_OBJECT_TYPE_MAX_LABEL) {
		issues.push({
			field: '(label)',
			code: 'label-too-long',
			message: `A type label must be at most ${CUSTOM_OBJECT_TYPE_MAX_LABEL} characters.`,
		});
	}

	if (draft.fields.length > CUSTOM_OBJECT_TYPE_MAX_FIELDS) {
		issues.push({
			field: '(fields)',
			code: 'too-many-fields',
			message: `A custom type may declare at most ${CUSTOM_OBJECT_TYPE_MAX_FIELDS} fields.`,
		});
	}

	const seen = new Set<string>();
	for (const f of draft.fields) {
		if (f.key === VAULT_OBJECT_SUBTYPE_KEY) {
			issues.push({
				field: f.key,
				code: 'reserved-field-key',
				message: `Field key "${f.key}" is reserved by the object envelope.`,
			});
			continue;
		}
		if (!CUSTOM_OBJECT_FIELD_KEY_PATTERN.test(f.key)) {
			issues.push({
				field: f.key,
				code: 'invalid-field-key',
				message: `Field key "${f.key}" must be a plain identifier (letter, then letters/digits/underscore).`,
			});
			continue;
		}
		if (seen.has(f.key)) {
			issues.push({
				field: f.key,
				code: 'duplicate-field-key',
				message: `Field key "${f.key}" is declared more than once.`,
			});
			continue;
		}
		seen.add(f.key);
		if (!isVaultObjectFieldType(f.type)) {
			issues.push({
				field: f.key,
				code: 'unknown-field-kind',
				message: `Field "${f.key}" declares an unknown kind. Allowed: string, number, boolean, string-array, object, object-array.`,
			});
		}
	}

	return { valid: issues.length === 0, issues };
}

// --- Construction + projection -------------------------------------------------------------------

/**
 * Build a durable custom type definition from a VALIDATED draft. The caller MUST have run
 * {@link validateCustomObjectTypeDefinition} first (fail closed). Normalizes each field (trims the
 * description, coerces the flags) and fails visibility closed to `dm-only`. Pure — id/clock via `meta`.
 */
export function buildCustomObjectType(
	draft: CustomObjectTypeDraft,
	meta: { authorActorId: ActorId; now: string; createdAt?: string; revision?: number },
): CustomObjectTypeDefinition {
	return {
		id: draft.id,
		label: draft.label.trim(),
		fields: draft.fields.map((f) => ({
			key: f.key,
			type: f.type as VaultObjectFieldType,
			required: f.required === true,
			description: (f.description ?? '').trim(),
			dmOnly: f.dmOnly === true,
		})),
		defaultVisibility: normalizeVisibilityLevel(draft.defaultVisibility ?? 'dm-only'),
		authorActorId: meta.authorActorId,
		createdAt: meta.createdAt ?? meta.now,
		updatedAt: meta.now,
		revision: meta.revision ?? 1,
		schemaVersion: CUSTOM_OBJECT_TYPE_SCHEMA_VERSION,
	};
}

/**
 * Project a custom type definition as an ordinary {@link VaultObjectSchema}, so the shared validate /
 * sync / project path treats it identically to a built-in subtype. `modelImplemented` is true (a custom
 * type IS its own full model — a note-backed record), `modelReference` is null (it references no
 * pre-built model).
 */
export function customObjectTypeToSchema(def: CustomObjectTypeDefinition): VaultObjectSchema {
	const fields: VaultObjectFieldSchema[] = def.fields.map((f) => ({
		key: f.key,
		type: f.type,
		required: f.required,
		description: f.description,
		...(f.dmOnly ? { dmOnly: true } : {}),
	}));
	return {
		// The id is the subtype. It is not a member of the built-in `VaultObjectSubtype` union, but the
		// resolver keys schemas by string; the cast keeps the built-in registry's field type intact.
		subtype: def.id as VaultObjectSchema['subtype'],
		displayName: def.label,
		fields,
		defaultVisibility: def.defaultVisibility,
		modelReference: null,
		modelImplemented: true,
	};
}

/** Build the {@link VaultObjectSchemaRegistry} the shared path consults for custom subtypes. Pure. */
export function buildCustomObjectTypeSchemaRegistry(
	map: CustomObjectTypeMap | undefined,
): VaultObjectSchemaRegistry {
	const out: Record<string, VaultObjectSchema> = {};
	for (const def of Object.values(map ?? {})) {
		out[def.id] = customObjectTypeToSchema(def);
	}
	return out;
}

// --- Hydration (tolerant, fail closed) -----------------------------------------------------------

/** Coerce one persisted field record to a clean {@link CustomObjectFieldDefinition}, or `null` if unusable. */
function hydrateField(raw: unknown): CustomObjectFieldDefinition | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const key = typeof r.key === 'string' ? r.key : '';
	const type = typeof r.type === 'string' ? r.type : '';
	// Drop a field whose key or kind the current build does not understand (fail closed).
	if (key === VAULT_OBJECT_SUBTYPE_KEY) return null;
	if (!CUSTOM_OBJECT_FIELD_KEY_PATTERN.test(key)) return null;
	if (!isVaultObjectFieldType(type)) return null;
	return {
		key,
		type,
		required: r.required === true,
		description: typeof r.description === 'string' ? r.description : '',
		dmOnly: r.dmOnly === true,
	};
}

/** Coerce one persisted definition record to a clean {@link CustomObjectTypeDefinition}, or `null`. */
function hydrateDefinition(raw: unknown): CustomObjectTypeDefinition | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const id = typeof r.id === 'string' ? r.id : '';
	// Drop a record whose id no longer parses or shadows a built-in (fail closed — never trust it).
	if (!CUSTOM_OBJECT_TYPE_ID_PATTERN.test(id) || isVaultObjectSubtype(id)) return null;
	const label = typeof r.label === 'string' && r.label.trim() !== '' ? r.label.trim() : id;
	const rawFields = Array.isArray(r.fields) ? r.fields : [];
	const fields: CustomObjectFieldDefinition[] = [];
	const seen = new Set<string>();
	for (const rf of rawFields) {
		const field = hydrateField(rf);
		if (field && !seen.has(field.key)) {
			seen.add(field.key);
			fields.push(field);
		}
	}
	const now = typeof r.updatedAt === 'string' ? r.updatedAt : '';
	return {
		id,
		label: label.slice(0, CUSTOM_OBJECT_TYPE_MAX_LABEL),
		fields,
		defaultVisibility: normalizeVisibilityLevel(
			typeof r.defaultVisibility === 'string' ? r.defaultVisibility : 'dm-only',
		),
		authorActorId: typeof r.authorActorId === 'string' ? r.authorActorId : '',
		createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
		updatedAt: now,
		revision: typeof r.revision === 'number' && Number.isInteger(r.revision) && r.revision > 0 ? r.revision : 1,
		schemaVersion: CUSTOM_OBJECT_TYPE_SCHEMA_VERSION,
	};
}

/**
 * Tolerantly hydrate a possibly-undefined/partial persisted custom-type map. A malformed or hostile
 * entry is DROPPED (never poisons the registry); the key is re-derived from the record's own id so a
 * mismatched map key can never point at a different definition. Pure.
 */
export function ensureCustomObjectTypeMap(raw: unknown): CustomObjectTypeMap {
	if (typeof raw !== 'object' || raw === null) return {};
	const out: CustomObjectTypeMap = {};
	for (const value of Object.values(raw as Record<string, unknown>)) {
		const def = hydrateDefinition(value);
		if (def) out[def.id] = def;
	}
	return out;
}

// --- GUI summary ---------------------------------------------------------------------------------

/** A read-only summary row of a custom type for the registry inspector. */
export interface CustomObjectTypeSummary {
	id: string;
	label: string;
	fieldCount: number;
	requiredFields: string[];
	dmOnlyFields: string[];
	defaultVisibility: VisibilityLevel;
	updatedAt: string;
}

/** Summarize one custom type for the GUI. Pure. */
export function summarizeCustomObjectType(def: CustomObjectTypeDefinition): CustomObjectTypeSummary {
	return {
		id: def.id,
		label: def.label,
		fieldCount: def.fields.length,
		requiredFields: def.fields.filter((f) => f.required).map((f) => f.key),
		dmOnlyFields: def.fields.filter((f) => f.dmOnly).map((f) => f.key),
		defaultVisibility: def.defaultVisibility,
		updatedAt: def.updatedAt,
	};
}

/** Every custom type as a summary row, in stable id order. Pure. */
export function listCustomObjectTypeSummaries(map: CustomObjectTypeMap | undefined): CustomObjectTypeSummary[] {
	return Object.values(map ?? {})
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(summarizeCustomObjectType);
}

/** Whether a string is a well-formed custom object-type id. Pure. */
export function isCustomObjectTypeId(value: string): boolean {
	return CUSTOM_OBJECT_TYPE_ID_PATTERN.test(value);
}

/** Derive a suggested `custom:<slug>` id from a human label (GUI helper; still validated at dispatch). */
export function suggestCustomObjectTypeId(label: string): string {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
		.replace(/-+$/g, '');
	return `${CUSTOM_OBJECT_TYPE_ID_PREFIX}${slug}`;
}

/** The reserved built-in subtype ids (exposed so a GUI can warn before an id collides). Pure. */
export const RESERVED_BUILTIN_SUBTYPE_IDS: readonly string[] = VAULT_OBJECT_SUBTYPES;
