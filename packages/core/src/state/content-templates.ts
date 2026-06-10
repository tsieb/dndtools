import { validateMarkdownDraft, type MarkdownValidationResult } from './content-editor';
import {
	readObjectSubtype,
	syncNoteToObject,
	validateObjectFrontmatter,
	type VaultObjectValidationResult,
} from './vault-object';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-003 — PURE, DETERMINISTIC CONTENT TEMPLATES: VARIABLE substitution, STARTER PRESETS, and
 * VALIDATE-BEFORE-WRITE of the generated content.
 *
 * A template is NOT a new content model and it does NOT introduce a parallel validation/sanitization
 * path. It is a small deterministic transform that produces ordinary note text, then funnels that text
 * through the EXISTING content validation:
 *
 *   - A `note` template's rendered text is validated by {@link validateMarkdownDraft} (the same
 *     frontmatter/wikilink validator the editor uses — `state/content-editor.ts`).
 *   - An `object` template's rendered text is additionally validated through the EXISTING Vault Object
 *     schema validator ({@link validateObjectFrontmatter} over `syncNoteToObject`, `state/vault-object.ts`).
 *
 * VALIDATE BEFORE WRITE is the data-safety crux (CONTENT-003): {@link renderTemplate} reports whether the
 * generated content is valid, and the command layer refuses to commit invalid generated content (no
 * invalid revision is ever written). A REQUIRED VARIABLE that the caller omits is a fail-closed BLOCK
 * (`missing-variable`) — creation never proceeds with an unresolved required slot.
 *
 * Rendering is a PURE function of (template, variable values): no clock, no locale, no DOM, no storage.
 * The same template + the same values always render the same bytes, so a preview and the committed write
 * are identical, and a rendered result is stable across the desktop/compact profiles.
 *
 * The command layer composes this and dispatches the EXISTING `content.create-item` / `content.create-object`
 * commands (so the durable write still passes through the op-log + the command's own fail-closed
 * re-validation). The GUI renders the computed render/validation model and dispatches an intent; it never
 * touches storage (Architecture Contract 1).
 */

export const CONTENT_TEMPLATE_SCHEMA_VERSION = 1 as const;

/** What KIND of content a template generates: a free markdown NOTE or a schema-shaped structured OBJECT. */
export type ContentTemplateKind = 'note' | 'object';

export const CONTENT_TEMPLATE_KINDS: readonly ContentTemplateKind[] = ['note', 'object'] as const;

/** A declared variable a template body/title interpolates. */
export interface ContentTemplateVariable {
	/** The variable name. Referenced in the template as `{{name}}`. */
	name: string;
	/** Human label for the authoring UI. */
	label: string;
	/** True ⇒ creation is BLOCKED until the caller supplies a non-empty value (fail closed). */
	required: boolean;
	/** Optional default substituted when the caller omits an OPTIONAL variable. Ignored for required vars. */
	defaultValue?: string;
}

/**
 * A content template (CONTENT-003): a titled, variable-driven starting point for a note or structured
 * object. `titleTemplate` and `bodyTemplate` interpolate `{{variable}}` placeholders; for an `object`
 * template the rendered body must carry the namespaced subtype frontmatter so it validates against the
 * Vault Object schema. Immutable data.
 */
export interface ContentTemplate {
	/** Stable template id. */
	id: string;
	/** Human display name. */
	name: string;
	/** A short non-leaking description of what the template produces. */
	description: string;
	kind: ContentTemplateKind;
	/** The declared variables, in presentation order. */
	variables: ContentTemplateVariable[];
	/** The note title, with `{{variable}}` placeholders. */
	titleTemplate: string;
	/** The note body (markdown, including any frontmatter for an object), with `{{variable}}` placeholders. */
	bodyTemplate: string;
	/**
	 * The visibility a created item DEFAULTS to. Fails closed to `dm-only` when omitted — a template can
	 * never silently widen visibility (CONTENT-003 AC2). The author may still choose a narrower/explicit
	 * level at create time; the create command itself fails closed to `dm-only` if none is provided.
	 */
	defaultVisibility?: VisibilityLevel;
}

/** A single deterministic placeholder: `{{name}}` (whitespace inside the braces is tolerated). */
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_][\w.-]*)\s*\}\}/g;

/** A finding against a template render: a missing required variable, or invalid generated content. */
export interface TemplateRenderIssue {
	/** A stable machine code so the GUI can localize/group the message. */
	code: 'missing-variable' | 'unknown-variable' | 'generated-content-invalid';
	/** The offending variable name, or `(content)` for a generated-content issue. */
	field: string;
	/** A non-leaking explanation (names the variable/field + expectation, never a raw secret value). */
	message: string;
}

/**
 * The result of rendering a template against caller-supplied variable values (CONTENT-003). It carries the
 * generated title/body, the resolved visibility, the EXISTING-pipeline validation results, and a single
 * fail-closed `valid` flag the command layer gates the write on. When `valid` is false NOTHING should be
 * written — invalid generated content is rejected, not committed.
 */
export interface TemplateRenderResult {
	templateId: string;
	kind: ContentTemplateKind;
	/** The rendered note title (placeholders substituted). */
	title: string;
	/** The rendered note body (placeholders substituted). */
	body: string;
	/** The resolved per-item visibility (the template default, fail-closed to `dm-only`). */
	visibility: VisibilityLevel;
	/** Findings: missing required variables and/or invalid generated content. */
	issues: TemplateRenderIssue[];
	/**
	 * The EXISTING markdown draft validation of the generated body (frontmatter/wikilink — the SAME
	 * validator the editor uses). Present for both kinds.
	 */
	markdownValidation: MarkdownValidationResult;
	/**
	 * For an `object` template only: the EXISTING Vault Object schema validation of the generated
	 * frontmatter. `null` for a `note` template (a note has no subtype schema). When the subtype can't be
	 * read from the rendered frontmatter this is a failed result, so an object template never commits
	 * unvalidated.
	 */
	objectValidation: VaultObjectValidationResult | null;
	/**
	 * FAIL CLOSED: true only when every required variable is resolved AND the generated content passes the
	 * existing validation pipeline. The command layer commits ONLY when this is true.
	 */
	valid: boolean;
}

/** The variable names a template body/title actually references. Deterministic, de-duplicated, in order. */
export function templatePlaceholders(template: ContentTemplate): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	for (const text of [template.titleTemplate, template.bodyTemplate]) {
		for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
			const name = match[1]!;
			if (!seen.has(name)) {
				seen.add(name);
				names.push(name);
			}
		}
	}
	return names;
}

/** Whether a supplied value counts as present (a required variable needs a non-empty trimmed string). */
function isProvided(value: string | undefined): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

/**
 * Resolve the effective value for one variable: the caller-supplied value if present, else (for an OPTIONAL
 * variable) its declared default, else the empty string. Required variables with no value are reported by
 * the caller as `missing-variable` and never substituted with a guess.
 */
function resolveVariableValue(
	variable: ContentTemplateVariable,
	provided: Record<string, string>,
): string {
	const value = provided[variable.name];
	if (isProvided(value)) return value;
	if (!variable.required && isProvided(variable.defaultValue)) return variable.defaultValue;
	return '';
}

/** Substitute every `{{name}}` placeholder using the resolved value map. Unknown placeholders → empty. Pure. */
function substitute(text: string, values: Record<string, string>): string {
	return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => values[name] ?? '');
}

/**
 * CONTENT-003 — render a template against caller-supplied variable values and VALIDATE the generated
 * content through the EXISTING pipeline BEFORE any write. PURE + DETERMINISTIC.
 *
 * Fail-closed behavior:
 *
 *   - A REQUIRED variable with no (non-empty) value yields a `missing-variable` issue and forces
 *     `valid: false` — creation is blocked with a clear message (CONTENT-003 AC1). The placeholder is left
 *     unsubstituted-but-empty; nothing is guessed.
 *   - An UNKNOWN supplied variable (not declared by the template) is reported `unknown-variable`
 *     (advisory; it does not block, it simply is not substituted) so a typo is visible.
 *   - The rendered body is validated by {@link validateMarkdownDraft}; an `object` template's rendered
 *     frontmatter is ALSO validated by {@link validateObjectFrontmatter}. Any validation error forces
 *     `valid: false` so invalid generated content is rejected, never written.
 *
 * Visibility resolves to the template's `defaultVisibility` normalized through the SAME visibility model,
 * defaulting fail-closed to `dm-only` — a template can never silently widen visibility (CONTENT-003 AC2).
 */
export function renderTemplate(
	template: ContentTemplate,
	providedValues: Record<string, string>,
): TemplateRenderResult {
	const issues: TemplateRenderIssue[] = [];

	// 1) Resolve every DECLARED variable; a missing required one is a fail-closed block.
	const resolved: Record<string, string> = {};
	for (const variable of template.variables) {
		const value = resolveVariableValue(variable, providedValues);
		resolved[variable.name] = value;
		if (variable.required && !isProvided(providedValues[variable.name])) {
			issues.push({
				code: 'missing-variable',
				field: variable.name,
				message: `The required variable "${variable.label}" must be provided before this template can create content.`,
			});
		}
	}

	// 2) Surface UNKNOWN supplied variables (advisory; never substituted — keeps a typo visible).
	const declared = new Set(template.variables.map((v) => v.name));
	for (const name of Object.keys(providedValues)) {
		if (!declared.has(name)) {
			issues.push({
				code: 'unknown-variable',
				field: name,
				message: `"${name}" is not a variable declared by the ${template.name} template; it was ignored.`,
			});
		}
	}

	// 3) Deterministic substitution → generated title + body.
	const title = substitute(template.titleTemplate, resolved).trim();
	const body = substitute(template.bodyTemplate, resolved);

	// 4) VALIDATE the generated content through the EXISTING pipeline (no parallel validator).
	const markdownValidation = validateMarkdownDraft(body);
	let objectValidation: VaultObjectValidationResult | null = null;
	if (template.kind === 'object') {
		const subtype = readObjectSubtype(body);
		if (subtype === null) {
			objectValidation = {
				valid: false,
				subtype: null,
				issues: [
					{
						field: '(subtype)',
						code: 'unknown-subtype',
						message:
							'The generated object content does not declare a registered Vault Object subtype in its frontmatter.',
					},
				],
			};
		} else {
			const object = syncNoteToObject(subtype, body);
			objectValidation = validateObjectFrontmatter(subtype, object.fields);
		}
	}

	if (!markdownValidation.valid) {
		issues.push({
			code: 'generated-content-invalid',
			field: '(content)',
			message: 'The generated markdown is invalid; fix the template or variables before creating it.',
		});
	}
	if (objectValidation && !objectValidation.valid) {
		issues.push({
			code: 'generated-content-invalid',
			field: '(content)',
			message: 'The generated object frontmatter failed schema validation; it will not be created.',
		});
	}

	const blocking = issues.some(
		(issue) => issue.code === 'missing-variable' || issue.code === 'generated-content-invalid',
	);

	return {
		templateId: template.id,
		kind: template.kind,
		title,
		body,
		visibility: normalizeVisibilityLevel(template.defaultVisibility ?? 'dm-only'),
		issues,
		markdownValidation,
		objectValidation,
		valid: !blocking,
	};
}

// --- CONTENT-003 — STARTER PRESETS ----------------------------------------------------------------

/**
 * THE built-in STARTER PRESETS (CONTENT-003): a small catalog of predefined template starting points the
 * authoring UI offers. They are authored once here as the data artifact a reviewer inspects, and they FAIL
 * CLOSED to `dm-only` visibility unless a preset explicitly declares otherwise.
 *
 *   - `session-recap` — a player-visible session recap note with required session number + summary.
 *   - `npc-statblock` — a DM-only NPC handout object (note-backed `handout` subtype, schema-validated).
 *   - `location-lore` — a DM-only location lore note with optional region (defaulted).
 */
export const CONTENT_TEMPLATE_PRESETS: readonly ContentTemplate[] = Object.freeze([
	Object.freeze({
		id: 'session-recap',
		name: 'Session recap',
		description: 'A player-visible recap of a single session.',
		kind: 'note',
		variables: [
			{ name: 'session', label: 'Session number', required: true },
			{ name: 'summary', label: 'One-line summary', required: true },
		],
		titleTemplate: 'Session {{session}} Recap',
		bodyTemplate: '# Session {{session}}\n\n{{summary}}\n\n## What happened\n\n- ',
		defaultVisibility: 'player-visible',
	}),
	Object.freeze({
		id: 'npc-statblock',
		name: 'NPC handout',
		description: 'A DM-only NPC handout (a schema-validated handout object).',
		kind: 'object',
		variables: [
			{ name: 'name', label: 'NPC name', required: true },
			{ name: 'format', label: 'Handout format', required: false, defaultValue: 'character' },
		],
		titleTemplate: '{{name}}',
		bodyTemplate:
			'---\ndndtools.objectSubtype: handout\ntitle: {{name}}\nformat: {{format}}\n---\n\nNotes about {{name}}.',
		defaultVisibility: 'dm-only',
	}),
	Object.freeze({
		id: 'location-lore',
		name: 'Location lore',
		description: 'A DM-only lore note for a location.',
		kind: 'note',
		variables: [
			{ name: 'place', label: 'Place name', required: true },
			{ name: 'region', label: 'Region', required: false, defaultValue: 'the frontier' },
		],
		titleTemplate: '{{place}}',
		bodyTemplate: '# {{place}}\n\nA location in {{region}}.\n',
		defaultVisibility: 'dm-only',
	}),
]) as readonly ContentTemplate[];

/** Resolve a starter preset by id, or `null` when the id is unknown. Pure. */
export function contentTemplatePreset(presetId: string): ContentTemplate | null {
	return CONTENT_TEMPLATE_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

/** A read-only summary row for one preset, for the authoring UI's preset list. Pure. */
export interface ContentTemplatePresetSummary {
	id: string;
	name: string;
	description: string;
	kind: ContentTemplateKind;
	requiredVariables: string[];
	defaultVisibility: VisibilityLevel;
}

/** Summarize every starter preset (required-variable names + fail-closed visibility), in declared order. */
export function listContentTemplatePresets(): ContentTemplatePresetSummary[] {
	return CONTENT_TEMPLATE_PRESETS.map((preset) => ({
		id: preset.id,
		name: preset.name,
		description: preset.description,
		kind: preset.kind,
		requiredVariables: preset.variables.filter((v) => v.required).map((v) => v.name),
		defaultVisibility: normalizeVisibilityLevel(preset.defaultVisibility ?? 'dm-only'),
	}));
}
