import { createFromTemplateInputSchema, insertSnippetInputSchema } from '../schemas/commands';
import {
	contentTemplatePreset,
	renderTemplate,
	type ContentTemplate,
	type TemplateRenderResult,
} from '../state/content-templates';
import {
	contentSnippet,
	inheritedSnippetVisibility,
	insertSnippet,
	snippetCanInsertIntoVisibility,
	type ContentSnippet,
} from '../state/content-snippets';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	contentItemById,
	isLiveContentItem,
	type ContentItem,
} from '../state/content';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';
import { handleCreateContentItem, handleUpdateContentItem } from './content';
import { handleCreateVaultObject, handleUpdateVaultObject } from './vault-object';
import { VAULT_OBJECT_SUBTYPE_KEY, readObjectSubtype, syncNoteToObject } from '../state/vault-object';

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

/**
 * Authorized editor for an EXISTING item: the DM, or a player with a write-capable grant. Fail closed.
 * `now` (from `env.clock()`) is required so expired grants are treated as inert (PERM-004 AC2).
 */
function actorMayEditItem(state: CoreStateSlice, actor: Actor, itemId: string, now: string): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	// Fail closed: a dm-only item is never writable by a non-DM, regardless of any grant (CONTENT-009 AC4).
	const item = contentItemById(state.content, itemId);
	if (item && item.visibility === 'dm-only') return false;
	return (
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'section-editor', now) ||
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'contributor', now)
	);
}

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

	const template: ContentTemplate | null = contentTemplatePreset(parsed.data.presetId);
	if (!template) {
		return reject(
			{ code: 'template-not-found', message: `Template preset "${parsed.data.presetId}" does not exist.` },
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
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
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
	if (!snippetCanInsertIntoVisibility(existing.visibility, inheritedSnippetVisibility(existing.visibility))) {
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
