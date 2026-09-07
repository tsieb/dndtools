import type { ActorId } from './ids';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';
import {
	CONTENT_TEMPLATE_PRESETS,
	contentTemplatePreset,
	templatePlaceholders,
	type ContentTemplate,
	type ContentTemplatePresetSummary,
	type ContentTemplateVariable,
} from './content-templates';

/**
 * RC-KNW-1.3 — the DURABLE store of DM-authored CONTENT TEMPLATES, alongside the built-in starter
 * presets in `state/content-templates.ts`.
 *
 * A user template is the SAME {@link ContentTemplate} shape a preset is, so it renders through the
 * IDENTICAL pure {@link import('./content-templates').renderTemplate} transform and its generated
 * content is validated by the SAME existing pipeline before any write (CONTENT-003). There is NO
 * second render, validation or write path here — this module only adds durability, an id namespace
 * that cannot collide with a preset, and a fail-closed validator for the authored draft.
 *
 * Fail closed by construction:
 *   - An id must sit in the reserved `user:` namespace, so a user template can NEVER shadow a preset
 *     and a resolver can always say which one it returned.
 *   - Every `{{placeholder}}` the title/body references must be DECLARED as a variable. An undeclared
 *     placeholder would render as empty text with nothing to fill it in, which is a silent hole in
 *     the generated note — so it is a validation error, not a quiet substitution.
 *   - Visibility normalizes to `dm-only` when absent or unrecognized: an authored template can never
 *     widen the audience of what it creates.
 *   - Hydration is TOLERANT: a malformed/hostile persisted record is DROPPED rather than trusted.
 *
 * Pure data + pure functions: no GUI, no storage, no clock. The command layer composes these and the
 * durable write goes through the op-log (Architecture Contract 1).
 */

/** The per-record schema version stamped onto every stored user template. */
export const USER_CONTENT_TEMPLATE_SCHEMA_VERSION = 1 as const;

/** The entity type a user template's durable ops are addressed by. */
export const USER_CONTENT_TEMPLATE_ENTITY_TYPE = 'content-template' as const;

/** The reserved id namespace every user template id must carry (guarantees no preset collision). */
export const USER_CONTENT_TEMPLATE_ID_PREFIX = 'user:' as const;

/** `user:` + a lowercase slug. The colon is impossible in a preset id, so the namespaces never overlap. */
export const USER_CONTENT_TEMPLATE_ID_PATTERN = /^user:[a-z0-9](?:-?[a-z0-9]){0,48}$/;

/** A declared variable name must be a plain identifier the `{{name}}` placeholder syntax accepts. */
export const USER_CONTENT_TEMPLATE_VARIABLE_PATTERN = /^[A-Za-z0-9_][\w-]{0,47}$/;

const MAX_NAME = 80;
const MAX_DESCRIPTION = 240;
const MAX_TITLE_TEMPLATE = 200;
const MAX_BODY_TEMPLATE = 20000;
const MAX_VARIABLES = 16;

/** The authored draft the save command carries. `kind` is always `note` (see the module note). */
export interface UserContentTemplateDraft {
	id: string;
	name: string;
	description?: string;
	variables?: ReadonlyArray<{
		name: string;
		label: string;
		required?: boolean;
		defaultValue?: string;
	}>;
	titleTemplate: string;
	bodyTemplate: string;
	defaultVisibility?: string;
}

/** A stored user template: an ordinary {@link ContentTemplate} plus its durable authoring envelope. */
export interface UserContentTemplateDefinition extends ContentTemplate {
	kind: 'note';
	authorActorId: ActorId;
	createdAt: string;
	updatedAt: string;
	/** Bumped on every accepted save of this template. */
	revision: number;
	schemaVersion: typeof USER_CONTENT_TEMPLATE_SCHEMA_VERSION;
}

/** Durable user templates keyed by their `user:<slug>` id. */
export type UserContentTemplateMap = Record<string, UserContentTemplateDefinition>;

/** One finding against an authored draft. Names the field and the expectation, never a raw value. */
export interface UserContentTemplateIssue {
	field: string;
	code:
		| 'id-invalid'
		| 'name-invalid'
		| 'description-too-long'
		| 'title-invalid'
		| 'body-invalid'
		| 'variable-invalid'
		| 'variable-duplicate'
		| 'variable-undeclared'
		| 'too-many-variables';
	message: string;
}

export interface UserContentTemplateValidationResult {
	valid: boolean;
	issues: UserContentTemplateIssue[];
}

function isNonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

/**
 * Validate an authored draft BEFORE any durable write. Fail closed: an invalid draft is never stored,
 * so a template can never be saved in a shape that would later render a hole into a real note.
 */
export function validateUserContentTemplate(
	draft: UserContentTemplateDraft,
): UserContentTemplateValidationResult {
	const issues: UserContentTemplateIssue[] = [];

	if (!USER_CONTENT_TEMPLATE_ID_PATTERN.test(draft.id ?? '')) {
		issues.push({
			field: 'id',
			code: 'id-invalid',
			message:
				'A template id must look like "user:my-template" (lowercase letters, digits, dashes).',
		});
	}
	if (!isNonEmpty(draft.name) || draft.name.length > MAX_NAME) {
		issues.push({
			field: 'name',
			code: 'name-invalid',
			message: `A template needs a name of at most ${MAX_NAME} characters.`,
		});
	}
	if (draft.description !== undefined && draft.description.length > MAX_DESCRIPTION) {
		issues.push({
			field: 'description',
			code: 'description-too-long',
			message: `A template description is at most ${MAX_DESCRIPTION} characters.`,
		});
	}
	if (!isNonEmpty(draft.titleTemplate) || draft.titleTemplate.length > MAX_TITLE_TEMPLATE) {
		issues.push({
			field: 'titleTemplate',
			code: 'title-invalid',
			message: `A template needs a title of at most ${MAX_TITLE_TEMPLATE} characters.`,
		});
	}
	if (!isNonEmpty(draft.bodyTemplate) || draft.bodyTemplate.length > MAX_BODY_TEMPLATE) {
		issues.push({
			field: 'bodyTemplate',
			code: 'body-invalid',
			message: `A template needs a body of at most ${MAX_BODY_TEMPLATE} characters.`,
		});
	}

	const declared = new Set<string>();
	const variables = draft.variables ?? [];
	if (variables.length > MAX_VARIABLES) {
		issues.push({
			field: 'variables',
			code: 'too-many-variables',
			message: `A template declares at most ${MAX_VARIABLES} variables.`,
		});
	}
	for (const variable of variables) {
		if (!USER_CONTENT_TEMPLATE_VARIABLE_PATTERN.test(variable.name ?? '')) {
			issues.push({
				field: `variables.${variable.name ?? '(unnamed)'}`,
				code: 'variable-invalid',
				message: 'A variable name uses letters, digits, underscores and dashes only.',
			});
			continue;
		}
		if (!isNonEmpty(variable.label) || variable.label.length > MAX_NAME) {
			issues.push({
				field: `variables.${variable.name}`,
				code: 'variable-invalid',
				message: `The variable "${variable.name}" needs a label of at most ${MAX_NAME} characters.`,
			});
		}
		if (declared.has(variable.name)) {
			issues.push({
				field: `variables.${variable.name}`,
				code: 'variable-duplicate',
				message: `The variable "${variable.name}" is declared twice.`,
			});
		}
		declared.add(variable.name);
	}

	// Every placeholder the template writes must have something to fill it. An undeclared one renders
	// empty with no field to type into, which is a silent hole in the generated note.
	if (isNonEmpty(draft.titleTemplate) || isNonEmpty(draft.bodyTemplate)) {
		const referenced = templatePlaceholders({
			id: draft.id ?? '',
			name: draft.name ?? '',
			description: '',
			kind: 'note',
			variables: [],
			titleTemplate: draft.titleTemplate ?? '',
			bodyTemplate: draft.bodyTemplate ?? '',
		});
		for (const name of referenced) {
			if (!declared.has(name)) {
				issues.push({
					field: `variables.${name}`,
					code: 'variable-undeclared',
					message: `The template writes "{{${name}}}" but never declares it as a variable.`,
				});
			}
		}
	}

	return { valid: issues.length === 0, issues };
}

/** Normalize one declared variable. Pure. */
function buildVariable(raw: {
	name: string;
	label: string;
	required?: boolean;
	defaultValue?: string;
}): ContentTemplateVariable {
	const variable: ContentTemplateVariable = {
		name: raw.name,
		label: raw.label,
		required: raw.required === true,
	};
	if (isNonEmpty(raw.defaultValue)) variable.defaultValue = raw.defaultValue;
	return variable;
}

/** Build the durable definition from a VALIDATED draft. Pure — the caller supplies the clock/author. */
export function buildUserContentTemplate(
	draft: UserContentTemplateDraft,
	meta: { authorActorId: ActorId; now: string; revision: number; createdAt?: string },
): UserContentTemplateDefinition {
	return {
		id: draft.id,
		name: draft.name.trim(),
		description: (draft.description ?? '').trim(),
		kind: 'note',
		variables: (draft.variables ?? []).map(buildVariable),
		titleTemplate: draft.titleTemplate,
		bodyTemplate: draft.bodyTemplate,
		// Fail closed: an absent or unrecognized level is `dm-only`, never a wider audience.
		defaultVisibility: normalizeVisibilityLevel(draft.defaultVisibility ?? 'dm-only'),
		authorActorId: meta.authorActorId,
		createdAt: meta.createdAt ?? meta.now,
		updatedAt: meta.now,
		revision: meta.revision,
		schemaVersion: USER_CONTENT_TEMPLATE_SCHEMA_VERSION,
	};
}

/** Hydrate one persisted record, or `null` when it is malformed (dropped, never trusted). */
function hydrateUserTemplate(raw: unknown): UserContentTemplateDefinition | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Partial<UserContentTemplateDefinition> & { variables?: unknown };
	const draft: UserContentTemplateDraft = {
		id: typeof record.id === 'string' ? record.id : '',
		name: typeof record.name === 'string' ? record.name : '',
		description: typeof record.description === 'string' ? record.description : undefined,
		variables: Array.isArray(record.variables)
			? (record.variables as ContentTemplateVariable[]).filter(
					(v): v is ContentTemplateVariable =>
						typeof v === 'object' &&
						v !== null &&
						typeof v.name === 'string' &&
						typeof v.label === 'string',
				)
			: [],
		titleTemplate: typeof record.titleTemplate === 'string' ? record.titleTemplate : '',
		bodyTemplate: typeof record.bodyTemplate === 'string' ? record.bodyTemplate : '',
		defaultVisibility:
			typeof record.defaultVisibility === 'string' ? record.defaultVisibility : undefined,
	};
	if (!validateUserContentTemplate(draft).valid) return null;
	return buildUserContentTemplate(draft, {
		authorActorId: typeof record.authorActorId === 'string' ? record.authorActorId : '',
		now: typeof record.updatedAt === 'string' ? record.updatedAt : '',
		revision: typeof record.revision === 'number' && record.revision > 0 ? record.revision : 1,
		createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
	});
}

/** Tolerantly hydrate the persisted user-template map; a malformed entry is dropped. Pure. */
export function ensureUserContentTemplateMap(raw: unknown): UserContentTemplateMap {
	if (typeof raw !== 'object' || raw === null) return {};
	const out: UserContentTemplateMap = {};
	for (const value of Object.values(raw as Record<string, unknown>)) {
		const def = hydrateUserTemplate(value);
		if (def) out[def.id] = def;
	}
	return out;
}

// --- Map reducers (pure; the content slice holds the map) -----------------------------------------

/** Store (or replace) a DM-authored template in the map. Pure: returns a new map. */
export function putUserContentTemplate(
	map: UserContentTemplateMap,
	def: UserContentTemplateDefinition,
): UserContentTemplateMap {
	return { ...map, [def.id]: def };
}

/** Remove a DM-authored template from the map. Pure: returns a new map (no-op when absent). */
export function dropUserContentTemplate(
	map: UserContentTemplateMap,
	templateId: string,
): UserContentTemplateMap {
	if (!(templateId in map)) return map;
	const next = { ...map };
	delete next[templateId];
	return next;
}

// --- The combined catalog the authoring UI reads --------------------------------------------------

/** A summary row for the template picker: a built-in preset or a DM-authored template. */
export interface ContentTemplateSummary extends ContentTemplatePresetSummary {
	source: 'preset' | 'user';
}

/** Summarize one stored user template. Pure. */
export function summarizeUserContentTemplate(
	def: UserContentTemplateDefinition,
): ContentTemplateSummary {
	return {
		id: def.id,
		name: def.name,
		description: def.description,
		kind: def.kind,
		requiredVariables: def.variables.filter((v) => v.required).map((v) => v.name),
		defaultVisibility: normalizeVisibilityLevel(def.defaultVisibility ?? 'dm-only'),
		source: 'user',
	};
}

/**
 * The whole catalog the picker offers: the built-in starter presets first, then the DM's own
 * templates in stable id order. Pure.
 */
export function listContentTemplates(
	userTemplates: UserContentTemplateMap,
): ContentTemplateSummary[] {
	const presets: ContentTemplateSummary[] = CONTENT_TEMPLATE_PRESETS.map((preset) => ({
		id: preset.id,
		name: preset.name,
		description: preset.description,
		kind: preset.kind,
		requiredVariables: preset.variables.filter((v) => v.required).map((v) => v.name),
		defaultVisibility: normalizeVisibilityLevel(preset.defaultVisibility ?? 'dm-only'),
		source: 'preset',
	}));
	const authored = Object.values(userTemplates)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(summarizeUserContentTemplate);
	return [...presets, ...authored];
}

/**
 * Resolve a template id to the full template the renderer needs: a built-in preset first, then the
 * DM's own. The `user:` namespace makes the two sets disjoint, so this is never ambiguous. Pure.
 */
export function resolveContentTemplate(
	userTemplates: UserContentTemplateMap,
	templateId: string,
): ContentTemplate | null {
	return contentTemplatePreset(templateId) ?? userTemplates[templateId] ?? null;
}

/** Whether an id belongs to the DM-authored namespace (i.e. is deletable/editable). Pure. */
export function isUserContentTemplateId(templateId: string): boolean {
	return USER_CONTENT_TEMPLATE_ID_PATTERN.test(templateId);
}

/** A visibility level the store hands the GUI, normalized fail-closed. Pure. */
export function userTemplateVisibility(def: UserContentTemplateDefinition): VisibilityLevel {
	return normalizeVisibilityLevel(def.defaultVisibility ?? 'dm-only');
}
