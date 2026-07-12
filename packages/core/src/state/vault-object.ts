import {
	parseMarkdownNote,
	serializeMarkdownNote,
	type ParsedMarkdownNote,
} from './markdown';
import {
	isSceneEntityType,
	resolveVaultObjectSchema,
	type VaultObjectFieldSchema,
	type VaultObjectFieldType,
	type VaultObjectSchema,
	type VaultObjectSchemaRegistry,
} from './vault-object-schema';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-005 — STRUCTURED VAULT OBJECTS: note-backed records with SCHEMA-VALIDATED FRONTMATTER and
 * deterministic FRONTMATTER ↔ BODY SYNCHRONIZATION.
 *
 * A Vault Object is NOT a new storage model. It is a {@link ContentItem} with `kind: 'object'` (the existing
 * note + frontmatter substrate, `state/content.ts` + `state/markdown.ts`), interpreted through a subtype
 * SCHEMA from the registry (`state/vault-object-schema.ts`). This module is the pure policy that:
 *
 *   1. VALIDATES the structured frontmatter against the subtype schema (fail closed). A frontmatter map that
 *      omits a required field, carries a wrong-typed value, or names an undeclared field is REJECTED with a
 *      clear, NON-LEAKING diagnostic (it names the field + expectation, never raw secret values). A Scene
 *      routed here is rejected — a Scene is validated through `SceneState`, never as an object (Contract 4).
 *
 *   2. SYNCHRONIZES the structured fields and the markdown body by a SINGLE DETERMINISTIC RULE: the note's
 *      FRONTMATTER BLOCK is the canonical serialization of the structured fields, and the BODY is the markdown
 *      prose beneath it. {@link syncObjectToNote} renders `fields → frontmatter + body` (the structured side
 *      is authoritative for the frontmatter); {@link syncNoteToObject} parses `note text → fields + body`
 *      (editing the note frontmatter reflects back into the structured fields). Round-tripping either
 *      direction is STABLE: `note → object → note` and `object → note → object` are fixed points for a valid
 *      object, so editing one side and re-serializing never silently drifts the other.
 *
 * Pure data + pure functions: no GUI, no storage, no clock, no locale. The command layer composes these and
 * the durable write goes through the op-log; the GUI dispatches an intent and renders the computed result
 * (Architecture Contract 1). Validation FAILS CLOSED — an invalid object never reaches a durable write.
 */

export const VAULT_OBJECT_SCHEMA_VERSION = 1 as const;

/** The frontmatter key that carries the Vault Object subtype, namespaced so it never collides with a user property. */
export const VAULT_OBJECT_SUBTYPE_KEY = 'dndtools.objectSubtype' as const;

/** A single, non-leaking validation finding against an object's frontmatter. */
export interface VaultObjectValidationIssue {
	/** The offending frontmatter field key (or `(subtype)` for a subtype-level issue). */
	field: string;
	/** A stable machine code so the GUI can localize/group the message. */
	code:
		| 'unknown-subtype'
		| 'scene-not-an-object'
		| 'missing-required-field'
		| 'wrong-type'
		| 'undeclared-field';
	/** A non-leaking explanation (names the field + expectation, never a raw secret value). */
	message: string;
}

/** The result of validating an object's frontmatter against its subtype schema. `valid` blocks the write. */
export interface VaultObjectValidationResult {
	valid: boolean;
	/**
	 * The resolved subtype id when the frontmatter validated against a KNOWN schema — a built-in
	 * `VaultObjectSubtype` OR a user-defined custom type id (both flow through this one path). `null`
	 * when the subtype was unknown/rejected (Scene, unregistered).
	 */
	subtype: string | null;
	issues: VaultObjectValidationIssue[];
}

/** Whether a frontmatter value matches a declared field type. Pure. */
function valueMatchesType(value: unknown, type: VaultObjectFieldType): boolean {
	switch (type) {
		case 'string':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'boolean':
			return typeof value === 'boolean';
		case 'string-array':
			return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
		case 'object':
			return typeof value === 'object' && value !== null && !Array.isArray(value);
		case 'object-array':
			return (
				Array.isArray(value) &&
				value.every(
					(entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
				)
			);
	}
}

/** Whether a value counts as "present and non-empty" for a required field. Pure. */
function isPresent(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === 'string') return value.trim() !== '';
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/** The frontmatter keys that are part of the COMMON ENVELOPE, not a subtype-declared field. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([VAULT_OBJECT_SUBTYPE_KEY]);

/**
 * CONTENT-005 — validate a structured frontmatter map against a subtype schema. FAILS CLOSED:
 *
 *   - A Scene entity type is rejected (`scene-not-an-object`) — a Scene is validated through `SceneState`,
 *     never as a note-backed object subtype (Contract 4 / CONTENT-013 AC4).
 *   - An unregistered subtype is rejected (`unknown-subtype`).
 *   - A missing/empty REQUIRED field, a wrong-typed value, or an UNDECLARED field each produce an issue.
 *
 * The diagnostics are NON-LEAKING: each names the field + the expectation, never a raw value. Pure.
 */
export function validateObjectFrontmatter(
	subtype: string,
	fields: Record<string, unknown>,
	customTypes?: VaultObjectSchemaRegistry,
): VaultObjectValidationResult {
	if (isSceneEntityType(subtype)) {
		return {
			valid: false,
			subtype: null,
			issues: [
				{
					field: '(subtype)',
					code: 'scene-not-an-object',
					message: 'A Scene is not a note-backed Vault Object; validate it through SceneState.',
				},
			],
		};
	}
	const schema = resolveVaultObjectSchema(subtype, customTypes);
	if (!schema) {
		return {
			valid: false,
			subtype: null,
			issues: [
				{
					field: '(subtype)',
					code: 'unknown-subtype',
					message: `"${subtype}" is not a registered Vault Object subtype.`,
				},
			],
		};
	}

	const issues: VaultObjectValidationIssue[] = [];
	const declared = new Map<string, VaultObjectFieldSchema>(schema.fields.map((f) => [f.key, f]));

	for (const f of schema.fields) {
		const value = fields[f.key];
		if (f.required && !isPresent(value)) {
			issues.push({
				field: f.key,
				code: 'missing-required-field',
				message: `Required field "${f.key}" is missing or empty.`,
			});
			continue;
		}
		if (value !== undefined && !valueMatchesType(value, f.type)) {
			issues.push({
				field: f.key,
				code: 'wrong-type',
				message: `Field "${f.key}" must be of type ${f.type}.`,
			});
		}
	}

	for (const key of Object.keys(fields)) {
		if (ENVELOPE_KEYS.has(key)) continue;
		if (!declared.has(key)) {
			issues.push({
				field: key,
				code: 'undeclared-field',
				message: `Field "${key}" is not declared by the ${schema.displayName} schema.`,
			});
		}
	}

	return { valid: issues.length === 0, subtype: schema.subtype, issues };
}

/**
 * A structured Vault Object value: its subtype, its validated frontmatter fields, and its markdown body. This
 * is the projection of a note-backed object; it is NOT a separate persisted record — the durable record is
 * still a `ContentItem`. The subtype + fields ARE the `ContentItem.fields`; the body IS the `ContentItem.body`.
 */
export interface VaultObject {
	/** The subtype id — a built-in `VaultObjectSubtype` OR a user-defined custom type id. */
	subtype: string;
	/** The subtype-declared frontmatter fields (excludes the namespaced subtype envelope key). */
	fields: Record<string, unknown>;
	/** The markdown prose body beneath the frontmatter. */
	body: string;
	/** The fail-closed visibility default for a freshly-created object of this subtype. */
	defaultVisibility: VisibilityLevel;
}

/** Coerce a parsed frontmatter scalar/list value back to a typed field value per the declared field type. */
function coerceFieldValue(raw: string | string[] | undefined, type: VaultObjectFieldType): unknown {
	if (raw === undefined) return undefined;
	switch (type) {
		case 'string-array':
			return Array.isArray(raw) ? [...raw] : [raw];
		case 'object-array': {
			// Each frontmatter entry is a JSON-serialized object (see `serializeFieldValue`). A
			// non-parsable entry is kept verbatim so validation fails closed on the wrong type.
			const entries = Array.isArray(raw) ? raw : [raw];
			return entries.map((entry) => {
				try {
					return JSON.parse(entry) as unknown;
				} catch {
					return entry;
				}
			});
		}
		case 'number': {
			const single = Array.isArray(raw) ? raw[0] : raw;
			const n = Number(single);
			return Number.isFinite(n) ? n : single;
		}
		case 'boolean': {
			const single = Array.isArray(raw) ? raw[0] : raw;
			if (single === 'true') return true;
			if (single === 'false') return false;
			return single;
		}
		case 'string':
		case 'object':
		default:
			return Array.isArray(raw) ? raw.join(', ') : raw;
	}
}

/** Serialize a typed field value to the markdown-frontmatter scalar/list representation. */
function serializeFieldValue(value: unknown): string | string[] {
	if (Array.isArray(value)) {
		// Object entries (an `object-array` field, e.g. quest objectives) round-trip as JSON so
		// `coerceFieldValue` can parse them back losslessly; string entries stay verbatim.
		return value.map((entry) =>
			typeof entry === 'object' && entry !== null ? JSON.stringify(entry) : String(entry),
		);
	}
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	if (value === undefined || value === null) return '';
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * CONTENT-005 — SYNC the STRUCTURED side → NOTE TEXT. Renders the object's subtype + declared fields as the
 * canonical, DETERMINISTIC frontmatter block (keys sorted by `serializeMarkdownNote`) above the markdown body.
 * The structured fields are authoritative for the frontmatter, so editing a field and re-syncing reflects in
 * the note text. Pure — reuses the existing serializer; no clock/locale.
 */
export function syncObjectToNote(
	object: VaultObject,
	customTypes?: VaultObjectSchemaRegistry,
): string {
	const properties: Record<string, string | string[]> = {
		[VAULT_OBJECT_SUBTYPE_KEY]: object.subtype,
	};
	const schema = resolveVaultObjectSchema(object.subtype, customTypes);
	// An unknown subtype (a removed custom type) serializes ONLY the envelope + body — no declared
	// fields are invented, so the note text stays honest rather than leaking arbitrary stored keys.
	const fields: readonly VaultObjectFieldSchema[] = schema ? schema.fields : [];
	for (const f of fields) {
		const value = object.fields[f.key];
		if (value === undefined) continue;
		properties[f.key] = serializeFieldValue(value);
	}
	return serializeMarkdownNote(properties, object.body);
}

/**
 * CONTENT-005 — SYNC the NOTE TEXT → STRUCTURED side. Parses a note (frontmatter + body) into a structured
 * object for the given subtype: the declared fields are coerced from the frontmatter by their declared type;
 * the body is the prose beneath. Editing the note frontmatter therefore reflects back into the structured
 * fields. The namespaced subtype key is consumed (it is the envelope, not a field). Pure — reuses the parser.
 *
 * This is a pure transform; it does NOT validate. The caller runs {@link validateObjectFrontmatter} on the
 * returned `fields` before any durable write (fail closed).
 */
export function syncNoteToObject(
	subtype: string,
	noteText: string,
	customTypes?: VaultObjectSchemaRegistry,
): VaultObject {
	const parsed: ParsedMarkdownNote = parseMarkdownNote(noteText);
	const schema: VaultObjectSchema | null = resolveVaultObjectSchema(subtype, customTypes);
	const fields: Record<string, unknown> = {};
	for (const f of schema ? schema.fields : []) {
		const raw = parsed.properties[f.key];
		const value = coerceFieldValue(raw, f.type);
		if (value !== undefined) fields[f.key] = value;
	}
	return {
		subtype,
		fields,
		body: parsed.body,
		// An unknown subtype fails visibility CLOSED to `dm-only` (it is never inferred player-visible).
		defaultVisibility: normalizeVisibilityLevel(schema ? schema.defaultVisibility : 'dm-only'),
	};
}

/**
 * Read the subtype declared in a note's namespaced frontmatter key, or `null` when absent/unregistered. Used
 * to route a raw note to its subtype schema before sync/validation. Pure.
 */
export function readObjectSubtype(
	noteText: string,
	customTypes?: VaultObjectSchemaRegistry,
): string | null {
	const parsed = parseMarkdownNote(noteText);
	const raw = parsed.properties[VAULT_OBJECT_SUBTYPE_KEY];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value !== 'string') return null;
	return resolveVaultObjectSchema(value, customTypes)?.subtype ?? null;
}

/**
 * CONTENT-005 — actor-filtered PROJECTION of a structured object's fields. For a non-DM actor the DM-only
 * fields declared by the subtype schema (revealing/relationship/secret fields) are OMITTED ENTIRELY — they
 * never appear in the projected fields (CONTENT-013 AC3, fail closed). The DM sees every field. Pure.
 */
export function projectObjectFieldsForRole(
	subtype: string,
	fields: Record<string, unknown>,
	role: 'dm' | 'player' | 'observer',
	customTypes?: VaultObjectSchemaRegistry,
): Record<string, unknown> {
	if (role === 'dm') return { ...fields };
	const schema = resolveVaultObjectSchema(subtype, customTypes);
	// FAIL CLOSED on an unknown subtype (e.g. a removed custom type): with no schema we cannot know
	// which fields are DM-only, so a non-DM projection reveals NOTHING rather than risk leaking a secret.
	if (!schema) return {};
	const hiddenKeys = new Set(schema.fields.filter((f) => f.dmOnly === true).map((f) => f.key));
	const projected: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (hiddenKeys.has(key)) continue;
		projected[key] = value;
	}
	return projected;
}
