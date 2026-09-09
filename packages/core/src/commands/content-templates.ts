import {
	createFromTemplateInputSchema,
	deleteContentTemplateInputSchema,
	insertSnippetInputSchema,
	saveContentTemplateInputSchema,
} from '../schemas/commands';
import {
	renderTemplate,
	type ContentTemplate,
	type TemplateRenderResult,
} from '../state/content-templates';
import {
	USER_CONTENT_TEMPLATE_ENTITY_TYPE,
	buildUserContentTemplate,
	dropUserContentTemplate,
	isUserContentTemplateId,
	putUserContentTemplate,
	resolveContentTemplate,
	validateUserContentTemplate,
	type UserContentTemplateDraft,
	type UserContentTemplateValidationResult,
} from '../state/content-template-store';
import {
	contentSnippet,
	inheritedSnippetVisibility,
	insertSnippet,
	snippetCanInsertIntoVisibility,
	type ContentSnippet,
} from '../state/content-snippets';
import { contentItemById, isLiveContentItem, type ContentItem } from '../state/content';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureContentStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';
import { handleCreateContentItem, handleUpdateContentItem } from './content';
import { handleCreateVaultObject, handleUpdateVaultObject } from './vault-object';
import { actorMayEditItem } from './content-edit-authority';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	readObjectSubtype,
	syncNoteToObject,
} from '../state/vault-object';

/**
 * CONTENT-003 / CONTENT-004 — TEMPLATES and SNIPPETS, composed ENTIRELY over the EXISTING content path.
 *
 * These handlers introduce NO parallel write, validation, or sanitization path. They:
 *
 *   - CONTENT-003: render a STARTER PRESET with VARIABLES ({@link renderTemplate}, pure + deterministic),
 *     VALIDATE the generated content through the EXISTING pipeline BEFORE writing, and — only when valid —
 *     dispatch the EXISTING `content.create-item` / `content.create-object` command. A missing required
 *     variable or invalid generated content is rejected fail-closed; nothing is written. Visibility fails
 *     closed to `dm-only` (a template can never silently widen visibility — CONTENT-003 AC2).
 *
 *   - CONTENT-004: insert a SNIPPET into an existing note ({@link insertSnippet}), VALIDATE the result with
 *     the EXISTING validator, enforce the VISIBILITY GUARD (a snippet inherits — never widens — the note's
 *     visibility), and dispatch the EXISTING `content.update-item` / `content.update-object` command so the
 *     durable write re-validates fail-closed. A snippet can therefore never skip validation, smuggle
 *     unsanitized markdown (the render path is the shared safe block-model renderer), or escape the note's
 *     visibility metadata.
 *
 * Authoring authority is the SAME fail-closed model as `commands/content.ts`: creating from a template is a
 * vault-level authoring act (DM-only); inserting a snippet into an existing item allows the DM or an
 * authorized editor (a player holding a write-capable grant on that content-item). The GUI dispatches the
 * intent and renders the computed render/validation model; it never touches storage (Architecture Contract 1).
 */

/** Turn a blocked render result into a non-leaking rejection carrying the per-issue findings. */
function templateInvalidRejection(result: TemplateRenderResult): CommandRejection {
	return {
		code: 'template-render-invalid',
		message: 'The template could not produce valid content; nothing was created.',
		issues: result.issues.map((issue) => ({ path: issue.field, message: issue.message })),
	};
}

// --- CONTENT-003 — create content from a starter preset (validate generated content before write) ----

export function handleCreateFromTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createFromTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	// RC-KNW-1.3 — the id resolves against the built-in starter presets FIRST and then the DM's own
	// saved templates. The reserved `user:` namespace keeps the two sets disjoint, so a saved template
	// can never shadow a preset. Everything downstream (render → validate → existing create command) is
	// unchanged: a saved template is not a second write path.
	const template: ContentTemplate | null = resolveContentTemplate(
		ensureContentStateSlice(state.content).userTemplates,
		parsed.data.presetId,
	);
	if (!template) {
		return reject(
			{
				code: 'template-not-found',
				message: `Template preset "${parsed.data.presetId}" does not exist.`,
			},
			state,
		);
	}

	// RENDER + VALIDATE-BEFORE-WRITE (CONTENT-003). The generated content is validated through the EXISTING
	// markdown + vault-object validators; a missing required variable or invalid generated content is a
	// fail-closed block. NOTHING is committed unless `valid`.
	const render = renderTemplate(template, parsed.data.variables);
	if (!render.valid) return reject(templateInvalidRejection(render), state);

	// VISIBILITY (CONTENT-003 AC2): the explicit choice, else the template default, else the create command's
	// own fail-closed `dm-only`. A template can never silently widen visibility.
	const visibility = parsed.data.visibility ?? render.visibility;

	// Funnel the GENERATED content through the EXISTING create command (so the durable write still runs the
	// command's own fail-closed validation + appends the op-log record). No parallel write path.
	if (render.kind === 'object') {
		const subtype = readObjectSubtype(render.body);
		// `render.valid` already guarantees a registered subtype + valid frontmatter; this is a type guard.
		if (subtype === null) return reject(templateInvalidRejection(render), state);
		const object = syncNoteToObject(subtype, render.body);
		return handleCreateVaultObject(state, env, actorId, {
			subtype,
			title: render.title,
			fields: object.fields,
			body: object.body,
			visibility,
			sharedWith: parsed.data.sharedWith,
		});
	}

	return handleCreateContentItem(state, env, actorId, {
		kind: 'note',
		title: render.title,
		body: render.body,
		visibility,
		sharedWith: parsed.data.sharedWith,
	});
}

// --- CONTENT-004 — insert a snippet into a note (no bypass of validation/visibility/sanitization) ----

export function handleInsertSnippet(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(insertSnippetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const existing: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!existing) {
		return reject(
			{
				code: 'content-item-not-found',
				message: `Content item ${parsed.data.itemId} does not exist.`,
			},
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' },
			state,
		);
	}
	if (!isLiveContentItem(existing)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this item before inserting a snippet.' },
			state,
		);
	}

	const snippet: ContentSnippet | null = contentSnippet(parsed.data.snippetId);
	if (!snippet) {
		return reject(
			{ code: 'snippet-not-found', message: `Snippet "${parsed.data.snippetId}" does not exist.` },
			state,
		);
	}

	// VISIBILITY GUARD (CONTENT-004): inserting a snippet PRESERVES the note's visibility — the resulting
	// visibility is the note's own. A snippet carries none and can never widen the note's audience. This is
	// the explicit, fail-closed invariant (the resulting visibility must be ≤ the host's breadth).
	// The second argument is inheritedSnippetVisibility (the host's own normalized visibility) because a
	// snippet carries no visibility of its own — the result is always the host's visibility unchanged.
	if (
		!snippetCanInsertIntoVisibility(
			existing.visibility,
			inheritedSnippetVisibility(existing.visibility),
		)
	) {
		return reject(
			{ code: 'snippet-widens-visibility', message: 'A snippet cannot widen the note visibility.' },
			state,
		);
	}

	// INSERT + VALIDATE through the EXISTING validator. A snippet that makes the draft invalid is rejected
	// fail-closed exactly as the same content typed by hand would be — no free pass.
	const insertion = insertSnippet(
		existing.body,
		snippet,
		parsed.data.position,
		parsed.data.caret ?? existing.body.length,
	);
	if (!insertion.valid) {
		return reject(
			{
				code: 'snippet-content-invalid',
				message: 'Inserting the snippet would make the note invalid; it was not inserted.',
				issues: insertion.validation.issues.map((issue) => ({
					path: issue.code,
					message: issue.message,
				})),
			},
			state,
		);
	}

	// Funnel the resulting body through the EXISTING update command (which RE-VALIDATES fail-closed and
	// appends the op-log record). A structured object routes through the object update so its frontmatter is
	// re-validated against its subtype schema too. The note's visibility is NOT changed (it is preserved).
	// A stored object carries its subtype in `fields` (the prose body has no frontmatter), so detect by that.
	const isObject =
		existing.kind === 'object' && typeof existing.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'string';
	if (isObject) {
		return handleUpdateVaultObject(state, env, actorId, {
			itemId: parsed.data.itemId,
			body: insertion.text,
		});
	}
	return handleUpdateContentItem(state, env, actorId, {
		itemId: parsed.data.itemId,
		body: insertion.text,
	});
}

// --- RC-KNW-1.3 — SAVE / DELETE a DM-authored template (validated before any durable write) --------

/** Vault-level authoring (save/delete a template): DM only. Mirrors `commands/custom-object-type.ts`. */
function actorMayAuthorTemplates(actor: { role: string }): boolean {
	return actor.role === 'dm';
}

/** Turn a draft validation result into a non-leaking rejection (names fields/expectations, not values). */
function templateDraftInvalidRejection(
	result: UserContentTemplateValidationResult,
): CommandRejection {
	return {
		code: 'content-template-invalid',
		message: 'The template could not be saved because it failed validation.',
		issues: result.issues.map((issue) => ({ path: issue.field, message: issue.message })),
	};
}

export function handleSaveContentTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(saveContentTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorTemplates(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may save content templates.' },
			state,
		);
	}

	const draft: UserContentTemplateDraft = {
		id: parsed.data.id,
		name: parsed.data.name,
		description: parsed.data.description,
		variables: parsed.data.variables,
		titleTemplate: parsed.data.titleTemplate,
		bodyTemplate: parsed.data.bodyTemplate,
		defaultVisibility: parsed.data.defaultVisibility,
	};
	const validation = validateUserContentTemplate(draft);
	if (!validation.valid) return reject(templateDraftInvalidRejection(validation), state);

	const content = ensureContentStateSlice(state.content);
	const existing = content.userTemplates[draft.id];
	const now = env.clock();
	const def = buildUserContentTemplate(draft, {
		authorActorId: actor.id,
		now,
		revision: (existing?.revision ?? 0) + 1,
		createdAt: existing?.createdAt,
	});
	const nextContent = {
		...content,
		userTemplates: putUserContentTemplate(content.userTemplates, def),
	};

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: USER_CONTENT_TEMPLATE_ENTITY_TYPE,
		entityId: def.id,
		opType: 'content.save-template',
		path: `content/userTemplates/${def.id}`,
		value: { id: def.id, name: def.name, variableCount: def.variables.length },
		beforeRevision: existing?.revision ?? 0,
		afterRevision: def.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, content: nextContent, sync: draftOp.log },
		events: [
			{
				kind: 'content.template-changed',
				templateId: def.id,
				mutation: existing ? 'update' : 'save',
				actorId: actor.id,
			},
		],
		operationIds: [draftOp.op.id],
	};
}

export function handleDeleteContentTemplate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteContentTemplateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorTemplates(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may delete content templates.' },
			state,
		);
	}

	const templateId = parsed.data.templateId;
	// A starter preset is CODE, not data: there is no durable record to remove and pretending to delete
	// one would be a control that reports a success it did not perform.
	if (!isUserContentTemplateId(templateId)) {
		return reject(
			{
				code: 'content-template-not-deletable',
				message: 'Built-in templates cannot be deleted; only your own templates can.',
			},
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const existing = content.userTemplates[templateId];
	if (!existing) {
		return reject(
			{ code: 'content-template-not-found', message: `Template "${templateId}" does not exist.` },
			state,
		);
	}

	const nextContent = {
		...content,
		userTemplates: dropUserContentTemplate(content.userTemplates, templateId),
	};

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: USER_CONTENT_TEMPLATE_ENTITY_TYPE,
		entityId: templateId,
		opType: 'content.delete-template',
		path: `content/userTemplates/${templateId}`,
		value: { id: templateId },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: { ...state, content: nextContent, sync: draftOp.log },
		events: [
			{
				kind: 'content.template-changed',
				templateId,
				mutation: 'delete',
				actorId: actor.id,
			},
		],
		operationIds: [draftOp.op.id],
	};
}
