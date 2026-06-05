import {
	addContentEmbedInputSchema,
	removeContentEmbedInputSchema,
	setContentFieldVisibilityInputSchema,
	setContentSectionVisibilityInputSchema,
} from '../schemas/commands';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	addContentEmbed,
	contentItemById,
	isLiveContentItem,
	removeContentEmbed,
	setContentFieldVisibility,
	setContentSectionVisibility,
	type ContentItem,
	type VaultContentState,
} from '../state/content';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { VisibilityRule } from '../permissions/visibility-filter';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';

/**
 * CONTENT-009 / CONTENT-010 — durable GRANULAR-VISIBILITY + EMBED commands (Architecture Contract 1 /
 * Contract 3 / Contract 4).
 *
 * These extend the EXISTING content authoring model (`commands/content.ts`) without a new storage model:
 *
 *   - CONTENT-009 authors SECTION- and FIELD-level visibility on a note/object. The entity-level default
 *     already exists (`content.set-item-visibility`); these add the narrower granularities. The PERM
 *     precedence engine (field > section > entity, hidden-ancestor-wins) is REUSED at read through
 *     `contentItemVisibilityMetadata` + `filterEntityForActor` — these commands only persist the rules.
 *     Default/unspecified visibility fails closed to the entity default, which itself fails closed to
 *     `dm-only`.
 *
 *   - CONTENT-010 adds/removes EMBED REFERENCES in a host note. An embed stores ONLY the target id +
 *     projection (and a section id for a note-section embed) — NEVER a copy of the target's data
 *     (Contract 4). The embedded content is resolved AT READ against the LIVE target through the
 *     actor-filtered query (`queries/content-embed.ts`), so it reflects the target's current data and the
 *     viewer's own permission to the target.
 *
 * WRITE authority mirrors `commands/content.ts`: the DM, or a player holding a write-capable grant
 * (`section-editor`/`contributor`) on the content-item entity, is an authorized editor; an observer never
 * qualifies. A tombstoned item is rejected until restored. Every accepted mutation appends a durable
 * `content.*` op and emits an invalidation-carrying event. The GUI dispatches the intent and renders the
 * actor-resolved model; it never touches storage.
 */

function contentWith(state: CoreStateSlice, content: VaultContentState): CoreStateSlice {
	return { ...state, content };
}

/**
 * Authorized editor for an EXISTING item: the DM, or a player holding a write-capable grant
 * (`section-editor`/`contributor`) on that content-item entity. An observer never qualifies. (Same rule as
 * `commands/content.ts`; kept local so this module is self-contained.)
 */
function actorMayEditItem(state: CoreStateSlice, actor: Actor, itemId: string): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return (
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'section-editor') ||
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'contributor')
	);
}

/** The actors a content item is delivered to, for cross-surface invalidation (mirrors content.ts). */
function deliveryAudience(item: ContentItem): string[] {
	if (item.visibility === 'player-visible') return ['*'];
	if (item.visibility === 'shared') return [...item.sharedWith];
	return [];
}

function itemChangedEvent(item: ContentItem, actorId: string): CoreEvent {
	return {
		kind: 'content.item-changed',
		itemId: item.id,
		mutation: 'set-visibility',
		visibility: item.visibility,
		invalidatedActorIds: deliveryAudience(item),
		actorId,
	};
}

/**
 * Shared guards for an EXISTING, LIVE, editable content item: load it, require an authorized editor, and
 * reject a tombstoned item. Returns the item or a rejection {@link CommandResult}.
 */
function requireEditableItem(
	state: CoreStateSlice,
	content: VaultContentState,
	actor: Actor,
	itemId: string,
): ContentItem | CommandResult {
	const item = contentItemById(content, itemId);
	if (!item) {
		return reject({ code: 'content-item-not-found', message: `Content item ${itemId} does not exist.` }, state);
	}
	if (!actorMayEditItem(state, actor, itemId)) {
		return reject({ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' }, state);
	}
	if (!isLiveContentItem(item)) {
		return reject({ code: 'content-item-deleted', message: 'Restore this item before editing it.' }, state);
	}
	return item;
}

// --- CONTENT-009 — set a SECTION's visibility ----------------------------------------------------

export function handleSetContentSectionVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setContentSectionVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const before = requireEditableItem(state, content, actor, parsed.data.itemId);
	if ('status' in before) return before;

	const rule: VisibilityRule | null = parsed.data.rule
		? {
				level: parsed.data.rule.level,
				...(parsed.data.rule.sharedWith ? { sharedWith: parsed.data.rule.sharedWith } : {}),
			}
		: null;
	const nextContent = setContentSectionVisibility(
		content,
		parsed.data.itemId,
		parsed.data.sectionId,
		rule,
		env.clock(),
	);
	if (!nextContent) {
		return reject({ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` }, state);
	}
	const updated = contentItemById(nextContent, parsed.data.itemId)!;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.set-section-visibility',
		path: `content/items/${updated.id}/sections/${parsed.data.sectionId}`,
		value: { sectionId: parsed.data.sectionId, level: rule?.level ?? null },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [itemChangedEvent(updated, actor.id)],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-009 — set a FIELD's visibility ------------------------------------------------------

export function handleSetContentFieldVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setContentFieldVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const before = requireEditableItem(state, content, actor, parsed.data.itemId);
	if ('status' in before) return before;

	const rule: VisibilityRule | null = parsed.data.rule
		? {
				level: parsed.data.rule.level,
				...(parsed.data.rule.sharedWith ? { sharedWith: parsed.data.rule.sharedWith } : {}),
			}
		: null;
	const fieldPath = `fields.${parsed.data.fieldKey}`;
	const nextContent = setContentFieldVisibility(
		content,
		parsed.data.itemId,
		fieldPath,
		rule,
		parsed.data.sectionId,
		env.clock(),
	);
	if (!nextContent) {
		return reject({ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` }, state);
	}
	const updated = contentItemById(nextContent, parsed.data.itemId)!;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.set-field-visibility',
		path: `content/items/${updated.id}/${fieldPath}`,
		value: { field: fieldPath, level: rule?.level ?? null },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [itemChangedEvent(updated, actor.id)],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-010 — add an embed reference --------------------------------------------------------

export function handleAddContentEmbed(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(addContentEmbedInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const host = requireEditableItem(state, content, actor, parsed.data.hostItemId);
	if ('status' in host) return host;

	// The target must exist + be live. We do NOT check the actor's visibility to the target here: an embed
	// is a REFERENCE resolved per-VIEWER at read, so an authorized editor may reference a target whose data
	// they will (or will not) see; the read-time resolver fails closed per viewer. A broken target id is
	// rejected so a dangling reference is never persisted.
	const target = contentItemById(content, parsed.data.targetItemId);
	if (!target || !isLiveContentItem(target)) {
		return reject(
			{ code: 'content-item-not-found', message: `Embed target ${parsed.data.targetItemId} does not exist.` },
			state,
		);
	}

	const embedId = env.ids();
	const nextContent = addContentEmbed(
		content,
		parsed.data.hostItemId,
		{
			id: embedId,
			targetItemId: parsed.data.targetItemId,
			kind: parsed.data.kind,
			...(parsed.data.sectionId !== undefined ? { sectionId: parsed.data.sectionId } : {}),
		},
		env.clock(),
	);
	if (!nextContent) {
		return reject({ code: 'content-item-not-found', message: `Content item ${parsed.data.hostItemId} does not exist.` }, state);
	}
	const updated = contentItemById(nextContent, parsed.data.hostItemId)!;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.add-embed',
		path: `content/items/${updated.id}/embeds/${embedId}`,
		// The op records ONLY the reference (target id + projection) — never the target's content, so the
		// durable op-log never carries a copy of the target either (no clone anywhere).
		value: { embedId, targetItemId: parsed.data.targetItemId, kind: parsed.data.kind },
		beforeRevision: host.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [
			{
				kind: 'content.embed-changed',
				hostItemId: updated.id,
				embedId,
				targetItemId: parsed.data.targetItemId,
				mutation: 'add',
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-010 — remove an embed reference -----------------------------------------------------

export function handleRemoveContentEmbed(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeContentEmbedInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const host = requireEditableItem(state, content, actor, parsed.data.hostItemId);
	if ('status' in host) return host;

	const result = removeContentEmbed(content, parsed.data.hostItemId, parsed.data.embedId, env.clock());
	if (result === null) {
		return reject({ code: 'content-item-not-found', message: `Content item ${parsed.data.hostItemId} does not exist.` }, state);
	}
	if ('notFound' in result) {
		return reject(
			{ code: 'content-embed-not-found', message: `Embed ${parsed.data.embedId} does not exist on this item.` },
			state,
		);
	}
	const removedEmbed = host.embeds.find((embed) => embed.id === parsed.data.embedId)!;
	const updated = contentItemById(result, parsed.data.hostItemId)!;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.remove-embed',
		path: `content/items/${updated.id}/embeds/${parsed.data.embedId}`,
		value: { embedId: parsed.data.embedId },
		beforeRevision: host.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, result), sync: draft.log },
		events: [
			{
				kind: 'content.embed-changed',
				hostItemId: updated.id,
				embedId: parsed.data.embedId,
				targetItemId: removedEmbed.targetItemId,
				mutation: 'remove',
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}
