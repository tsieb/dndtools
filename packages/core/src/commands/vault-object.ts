import {
	createVaultObjectInputSchema,
	renameWikilinkTargetInputSchema,
	repairWikilinkInputSchema,
	updateVaultObjectInputSchema,
} from '../schemas/commands';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	addContentItem,
	buildContentItem,
	contentItemById,
	isLiveContentItem,
	updateContentItem,
	type ContentItem,
	type VaultContentState,
} from '../state/content';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	validateObjectFrontmatter,
	type VaultObjectValidationResult,
} from '../state/vault-object';
import {
	resolveVaultObjectSchema,
	type VaultObjectSchemaRegistry,
} from '../state/vault-object-schema';
import { buildCustomObjectTypeSchemaRegistry } from '../state/custom-object-type';
import {
	applyLinkRepairForActor,
	propagateRenameForActor,
} from '../queries/wikilink-graph';
import type { Actor } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';
import { actorMayEditItem } from './content-edit-authority';

/**
 * CONTENT-005 / CONTENT-006 — durable STRUCTURED VAULT OBJECT + WIKILINK LIFECYCLE commands.
 *
 * A Vault Object is a NOTE-BACKED `ContentItem` (`kind: 'object'`): there is NO new storage model. These
 * commands add the subtype-schema enforcement + wikilink graph operations over that existing substrate, and
 * compose the same fail-closed authoring model as `commands/content.ts`:
 *
 *   - CREATE an object is a VAULT-LEVEL authoring act (DM-only). Its frontmatter `fields` are SCHEMA-VALIDATED
 *     against the subtype registry BEFORE the item is committed; an invalid object is rejected
 *     (`object-schema-invalid`) and NO revision is written (CONTENT-005 AC2, fail closed). A Scene routed here
 *     is rejected — a Scene is validated through SceneState, never as an object (Contract 4).
 *
 *   - UPDATE an object allows the DM or an authorized editor (a player with a write-capable grant on the
 *     content-item entity). The MERGED frontmatter is re-validated before the revision is committed, so an
 *     edit can never persist an invalid object (CONTENT-005 AC1/AC2).
 *
 *   - RENAME a wikilink target renames the note's title AND propagates the rename deterministically to every
 *     referring link in the ACTOR'S VISIBLE notes (CONTENT-006). Repair rewrites a broken target to a chosen
 *     visible, available fix. Both are actor-filtered + fail-closed: they never read/rewrite a hidden note and
 *     never perform a destructive offline rewrite (AC3).
 *
 * Pure policy composed here; durable writes append `content.*` ops and emit cross-surface invalidation events.
 * The GUI dispatches the intent and renders the computed model; it never touches storage (Contract 1).
 */

function contentWith(state: CoreStateSlice, content: VaultContentState): CoreStateSlice {
	return { ...state, content };
}

/** Vault-level authoring (create object): DM only. Fail closed otherwise. */
function actorMayAuthorVault(actor: Actor): boolean {
	return actor.role === 'dm';
}


/** The cross-surface invalidation audience for a content item, by visibility (mirrors `commands/content.ts`). */
function deliveryAudience(visibility: string, sharedWith: readonly string[]): string[] {
	if (visibility === 'player-visible') return ['*'];
	if (visibility === 'shared') return [...sharedWith];
	return [];
}

/**
 * Turn a validation result into a non-leaking rejection (it names fields + expectations, not raw values). All
 * validation failures — including a Scene routed here and an unknown subtype — fail closed under the single
 * `object-schema-invalid` code; the per-issue codes ride the `issues` list for the authoring UI.
 */
function objectInvalidRejection(result: VaultObjectValidationResult): CommandRejection {
	return {
		code: 'object-schema-invalid',
		message: 'The structured object frontmatter failed schema validation.',
		issues: result.issues.map((issue) => ({ path: issue.field, message: issue.message })),
	};
}

/**
 * The declared-field subset of a fields map for a subtype (built-in OR custom), dropping the namespaced
 * envelope key AND any key the subtype's schema does not declare. An unknown subtype (a removed custom type)
 * resolves to no schema, so NO stored key survives — fail closed (never persist an undeclared field).
 */
function declaredFields(
	subtype: string,
	fields: Record<string, unknown>,
	customTypes: VaultObjectSchemaRegistry,
): Record<string, unknown> {
	const schema = resolveVaultObjectSchema(subtype, customTypes);
	const allowed = new Set((schema?.fields ?? []).map((f) => f.key));
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (allowed.has(key)) out[key] = value;
	}
	return out;
}

/**
 * Read the persisted subtype from a stored object's fields, or `null` when the item is not an object whose
 * subtype resolves in the built-in OR custom registry (fail closed — a removed custom type's instance is not
 * editable through this path until the type is re-defined).
 */
function storedSubtype(item: ContentItem, customTypes: VaultObjectSchemaRegistry): string | null {
	const raw = item.fields[VAULT_OBJECT_SUBTYPE_KEY];
	if (typeof raw !== 'string') return null;
	return resolveVaultObjectSchema(raw, customTypes) ? raw : null;
}

// --- CONTENT-005 — create a structured Vault Object (DM-only; schema-validated, fail closed) ------

export function handleCreateVaultObject(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createVaultObjectInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may create structured objects.' },
			state,
		);
	}

	// Resolve the user-defined type registry so a custom subtype validates through the SAME schema path.
	const content = ensureContentStateSlice(state.content);
	const customTypes = buildCustomObjectTypeSchemaRegistry(content.customObjectTypes);

	// SCHEMA-VALIDATE the frontmatter BEFORE any state change (fail closed; no invalid revision committed).
	const validation = validateObjectFrontmatter(parsed.data.subtype, parsed.data.fields, customTypes);
	if (!validation.valid) return reject(objectInvalidRejection(validation), state);

	const subtype = validation.subtype!;
	const schema = resolveVaultObjectSchema(subtype, customTypes)!;
	// Persist the declared fields + the namespaced subtype envelope key, so the item is recognizable as an
	// object on reload. Visibility fails closed to the subtype default when omitted.
	const persistedFields: Record<string, unknown> = {
		...declaredFields(subtype, parsed.data.fields, customTypes),
		[VAULT_OBJECT_SUBTYPE_KEY]: subtype,
	};
	const visibility = parsed.data.visibility ?? schema.defaultVisibility;
	const item = buildContentItem(
		{
			kind: 'object',
			title: parsed.data.title,
			body: parsed.data.body,
			fields: persistedFields,
			visibility,
			sharedWith: parsed.data.sharedWith,
		},
		{ id: env.ids(), authorActorId: actor.id, now: env.clock() },
	);
	const nextContent = addContentItem(content, item);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: item.id,
		opType: 'content.create-object',
		path: `content/items/${item.id}`,
		value: { subtype, visibility: item.visibility },
		afterRevision: item.revision,
	});

	const event: CoreEvent = {
		kind: 'content.object-changed',
		itemId: item.id,
		subtype,
		mutation: 'create',
		visibility: item.visibility,
		invalidatedActorIds: deliveryAudience(item.visibility, item.sharedWith),
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-005 — update a structured Vault Object (authorized editor; re-validated, fail closed) -

export function handleUpdateVaultObject(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateVaultObjectInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const customTypes = buildCustomObjectTypeSchemaRegistry(content.customObjectTypes);
	const existing: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!existing) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this object.' },
			state,
		);
	}
	if (!isLiveContentItem(existing)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this object before editing it.' },
			state,
		);
	}
	const subtype = storedSubtype(existing, customTypes);
	if (subtype === null) {
		return reject(
			{ code: 'not-a-vault-object', message: `Content item ${parsed.data.itemId} is not a structured object.` },
			state,
		);
	}

	// Merge the incoming declared fields over the existing declared fields, then RE-VALIDATE the merged result
	// before committing (fail closed: an edit can never persist an invalid object).
	const mergedDeclared: Record<string, unknown> = {
		...declaredFields(subtype, existing.fields, customTypes),
		...(parsed.data.fields !== undefined ? declaredFields(subtype, parsed.data.fields, customTypes) : {}),
	};
	const validation = validateObjectFrontmatter(subtype, mergedDeclared, customTypes);
	if (!validation.valid) return reject(objectInvalidRejection(validation), state);

	const nextContent = updateContentItem(
		content,
		parsed.data.itemId,
		{
			...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
			...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
			// Persist the merged declared fields + the subtype envelope key (preserved on every write).
			fields: { ...mergedDeclared, [VAULT_OBJECT_SUBTYPE_KEY]: subtype },
		},
		env.clock(),
	);
	if (!nextContent) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	const updated = contentItemById(nextContent, parsed.data.itemId)!;

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.update-object',
		path: `content/items/${updated.id}`,
		value: { subtype },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	const event: CoreEvent = {
		kind: 'content.object-changed',
		itemId: updated.id,
		subtype,
		mutation: 'update',
		visibility: updated.visibility,
		invalidatedActorIds: deliveryAudience(updated.visibility, updated.sharedWith),
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-006 — rename a wikilink target (rename note + propagate to referring links) ----------

export function handleRenameWikilinkTarget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(renameWikilinkTargetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const target: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!target) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this note.' },
			state,
		);
	}
	if (!isLiveContentItem(target)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this note before renaming it.' },
			state,
		);
	}
	const fromTitle = target.title;
	const toTitle = parsed.data.newTitle.trim();
	if (toTitle === fromTitle) {
		return reject(
			{ code: 'wikilink-target-unchanged', message: 'The new title is identical to the current title.' },
			state,
		);
	}

	// Compute the rename propagation across the ACTOR'S VISIBLE notes (fail closed: a hidden note is never read
	// or rewritten). This is pure; we apply the computed rewrites to durable state here.
	const propagations = propagateRenameForActor(
		content,
		state.permissions,
		actor.id,
		fromTitle,
		toTitle,
	);

	let working = content;
	// First rename the target note's own title (bumping its revision).
	const renamedTarget = updateContentItem(working, target.id, { title: toTitle }, now);
	if (!renamedTarget) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${target.id} does not exist.` },
			state,
		);
	}
	working = renamedTarget;
	// Then apply each referring-note rewrite.
	for (const propagation of propagations) {
		// Skip the target itself if it self-referenced; its title is already updated and the body rewrite is
		// applied here so a self-link tracks the new title too.
		const rewritten = updateContentItem(working, propagation.itemId, { body: propagation.body }, now);
		if (rewritten) working = rewritten;
	}

	const rewrittenItemIds = propagations.map((p) => p.itemId);
	const linksRewritten = propagations.reduce((sum, p) => sum + p.rewritten, 0);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: target.id,
		opType: 'content.rename-wikilink-target',
		path: `content/items/${target.id}`,
		value: { fromTitle, toTitle, rewrittenItemIds, linksRewritten },
		beforeRevision: target.revision,
		afterRevision: target.revision + 1,
	});

	const event: CoreEvent = {
		kind: 'content.wikilink-target-renamed',
		itemId: target.id,
		fromTitle,
		toTitle,
		rewrittenItemIds,
		linksRewritten,
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, working), sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-006 — repair a broken wikilink in a note body (fail-closed, actor-filtered) -----------

export function handleRepairWikilink(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(repairWikilinkInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const item: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!item) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this note.' },
			state,
		);
	}
	if (!isLiveContentItem(item)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this note before repairing its links.' },
			state,
		);
	}

	const repair = applyLinkRepairForActor(
		content,
		state.permissions,
		actor.id,
		item.body,
		parsed.data.brokenTarget,
		parsed.data.fixTargetTitle,
	);
	// FAIL CLOSED: an unavailable source ⇒ no destructive offline rewrite; an unresolved fix ⇒ refuse. Neither
	// mutates durable state or the local draft (CONTENT-006 AC3).
	if (repair.status === 'source-unavailable') {
		return reject(
			{
				code: 'wikilink-source-unavailable',
				message: 'The linked source is unavailable and not cached; the link was not rewritten.',
			},
			state,
		);
	}
	if (repair.status === 'fix-unresolved') {
		return reject(
			{
				code: 'wikilink-fix-unresolved',
				message: 'The chosen fix target does not resolve to a visible, available note.',
			},
			state,
		);
	}

	const nextContent = updateContentItem(content, item.id, { body: repair.body }, env.clock());
	if (!nextContent) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${item.id} does not exist.` },
			state,
		);
	}
	const updated = contentItemById(nextContent, item.id)!;

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.repair-wikilink',
		path: `content/items/${updated.id}`,
		value: {
			brokenTarget: parsed.data.brokenTarget,
			fixTarget: parsed.data.fixTargetTitle,
			linksRewritten: repair.rewritten,
		},
		beforeRevision: item.revision,
		afterRevision: updated.revision,
	});

	const event: CoreEvent = {
		kind: 'content.wikilink-repaired',
		itemId: updated.id,
		brokenTarget: parsed.data.brokenTarget,
		fixTarget: parsed.data.fixTargetTitle,
		linksRewritten: repair.rewritten,
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}
