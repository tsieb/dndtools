import {
	createContentItemInputSchema,
	defineCalendarInputSchema,
	removeContentItemInputSchema,
	restoreContentItemInputSchema,
	setContentItemVisibilityInputSchema,
	updateContentItemInputSchema,
} from '../schemas/commands';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	addContentItem,
	buildContentItem,
	calendarById,
	contentItemById,
	isLiveContentItem,
	restoreContentItem,
	setContentItemVisibility,
	softDeleteContentItem,
	updateContentItem,
	upsertCalendarDefinition,
	type ContentItem,
	type VaultContentState,
} from '../state/content';
import {
	createCalendarDefinition,
	validateCustomDate,
	type CalendarDefinition,
	type CustomDate,
} from '../state/calendar';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';

/**
 * CONTENT-011 — durable CALENDAR/CUSTOM-TIME CONTENT commands (Architecture Contract 1 / Contract 3).
 *
 * WRITE authority is FAIL CLOSED and follows the PERM authorized-editor model:
 *
 *   - Defining a campaign calendar and CREATING a new content item are VAULT-LEVEL authoring acts with
 *     no pre-existing entity to grant against, so they are DM-only (mirrors `actorCanAuthorScene`). An
 *     unauthorized actor is rejected `actor-not-authorized`.
 *   - Editing/visibility-changing/removing/restoring an EXISTING item additionally allows a player who
 *     holds a write-capable grant (`section-editor`/`contributor`) on that `content-item` entity — an
 *     "authorized editor". An observer never qualifies; a player with no grant is rejected.
 *
 * DELETE is RECOVERABLE (CONTENT-001): `content.remove-item` SOFT-DELETES (tombstones) an item, leaving
 * it out of every actor-filtered read but restorable via `content.restore-item`. Editing or
 * visibility-changing a tombstoned item is rejected (`content-item-deleted`) until it is restored.
 *
 * DATA SAFETY: every custom-date field and timeline reference is validated against its referenced
 * calendar definition BEFORE the item is committed (`invalid-calendar-date` / `calendar-not-found`),
 * so an unrepresentable date can never enter durable state. The READ path is the actor-filtered query
 * (`queries/content-query.ts`), which enforces per-item visibility. Every accepted mutation appends a
 * durable `content.*` op and emits a `content.item-changed` event carrying the DATA-LAYER invalidation
 * audience so the runtime invalidates exactly those actors' cached views (CONTENT-011 AC2).
 */

function contentWith(state: CoreStateSlice, content: VaultContentState): CoreStateSlice {
	return { ...state, content };
}

/** Vault-level authoring (define calendar / create item): DM only. Fail closed otherwise. */
function actorMayAuthorVault(actor: Actor): boolean {
	return actor.role === 'dm';
}

/**
 * Authorized editor for an EXISTING item: the DM, or a player holding a write-capable grant
 * (`section-editor`/`contributor`) on that content-item entity. An observer never qualifies.
 */
function actorMayEditItem(state: CoreStateSlice, actor: Actor, itemId: string): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return (
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'section-editor') ||
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'contributor')
	);
}

/**
 * The actors a content item is delivered to, for cross-surface invalidation (CONTENT-011 AC2). For a
 * `shared` item these are the explicit `sharedWith` ids; for `player-visible` it is `*` (all players);
 * for `dm-only` no player.
 */
function deliveryAudience(visibility: string, sharedWith: readonly string[]): string[] {
	if (visibility === 'player-visible') return ['*'];
	if (visibility === 'shared') return [...sharedWith];
	return [];
}

function itemChangedEvent(
	itemId: string,
	mutation: 'create' | 'update' | 'set-visibility' | 'remove' | 'restore',
	visibility: string,
	invalidatedActorIds: string[],
	actorId: string,
): CoreEvent {
	return { kind: 'content.item-changed', itemId, mutation, visibility, invalidatedActorIds, actorId };
}

/**
 * Validate every custom-date field + timeline-reference date in a draft against its calendar. Returns
 * a rejection when a referenced calendar is missing or a date is invalid; `null` when all dates are
 * valid (fail closed — never commit an item carrying an unrepresentable date).
 */
function validateItemDates(
	content: VaultContentState,
	dateFields: Record<string, CustomDate>,
	timelineRefs: ReadonlyArray<{ label: string; date: CustomDate }>,
): CommandRejection | null {
	const checks: Array<{ where: string; date: CustomDate }> = [
		...Object.entries(dateFields).map(([name, date]) => ({ where: `field "${name}"`, date })),
		...timelineRefs.map((ref) => ({ where: `timeline ref "${ref.label}"`, date: ref.date })),
	];
	for (const check of checks) {
		const calendar: CalendarDefinition | undefined = calendarById(content, check.date.calendarId);
		if (!calendar) {
			return {
				code: 'calendar-not-found',
				message: `Calendar ${check.date.calendarId} referenced by ${check.where} does not exist.`,
			};
		}
		const validation = validateCustomDate(calendar, check.date);
		if (!validation.valid) {
			return {
				code: 'invalid-calendar-date',
				message: `The date for ${check.where} is invalid: ${validation.message ?? 'out of range'}.`,
			};
		}
	}
	return null;
}

// --- CONTENT-011 — define a campaign calendar (DM-only authoring) --------------------------------

export function handleDefineCalendar(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(defineCalendarInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may define a campaign calendar.' },
			state,
		);
	}

	let calendar: CalendarDefinition;
	try {
		calendar = createCalendarDefinition({
			id: parsed.data.id,
			name: parsed.data.name,
			months: parsed.data.months,
			...(parsed.data.weekdays ? { weekdays: parsed.data.weekdays } : {}),
			...(parsed.data.epochLabel !== undefined ? { epochLabel: parsed.data.epochLabel } : {}),
		});
	} catch (error) {
		return reject(
			{
				code: 'invalid-payload',
				message: error instanceof Error ? error.message : 'Invalid calendar definition.',
			},
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const nextContent = upsertCalendarDefinition(content, calendar);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'calendar',
		entityId: calendar.id,
		opType: 'content.define-calendar',
		path: `content/calendars/${calendar.id}`,
		value: { name: calendar.name, months: calendar.months.length },
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [{ kind: 'content.calendar-defined', calendarId: calendar.id, actorId: actor.id }],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-011 — create a calendar-aware content item (DM-only authoring) ----------------------

export function handleCreateContentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createContentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may create content items.' },
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	const dateError = validateItemDates(content, parsed.data.dateFields, parsed.data.timelineRefs);
	if (dateError) return reject(dateError, state);

	const item = buildContentItem(
		{
			kind: parsed.data.kind,
			title: parsed.data.title,
			body: parsed.data.body,
			fields: parsed.data.fields,
			dateFields: parsed.data.dateFields,
			timelineRefs: parsed.data.timelineRefs.map((ref) => ({
				id: ref.id ?? env.ids(),
				label: ref.label,
				date: ref.date,
				...(ref.targetId !== undefined ? { targetId: ref.targetId } : {}),
			})),
			...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
			sharedWith: parsed.data.sharedWith,
		},
		{ id: env.ids(), authorActorId: actor.id, now: env.clock() },
	);

	const nextContent = addContentItem(content, item);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: item.id,
		opType: 'content.create-item',
		path: `content/items/${item.id}`,
		value: { kind: item.kind, visibility: item.visibility },
		afterRevision: item.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [
			itemChangedEvent(
				item.id,
				'create',
				item.visibility,
				deliveryAudience(item.visibility, item.sharedWith),
				actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-011 — update a content item (authorized editor) -------------------------------------

export function handleUpdateContentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateContentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const existing: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!existing) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' },
			state,
		);
	}
	if (!isLiveContentItem(existing)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this item before editing it.' },
			state,
		);
	}

	const dateError = validateItemDates(
		content,
		parsed.data.dateFields ?? {},
		parsed.data.timelineRefs ?? [],
	);
	if (dateError) return reject(dateError, state);

	// CONTENT-001 AC5 — concurrent-edit detection. When `baseRevision` is supplied and is stale (the
	// item was updated by another editor since the caller read it), record a durable conflict op for DM
	// resolution rather than silently clobbering the concurrent change. The item is left UNCHANGED so the
	// other editor's work is preserved. This mirrors the CHAR-004 same-path conflict model at item scope.
	if (parsed.data.baseRevision !== undefined && parsed.data.baseRevision < existing.revision) {
		const conflictId = env.ids();
		const conflictValue = {
			id: conflictId,
			reason: 'same-scalar-path',
			ancestorRevision: parsed.data.baseRevision,
			local: {
				value: { title: existing.title, body: existing.body, fields: existing.fields },
				revision: existing.revision,
				authorActorId: existing.authorActorId,
			},
			remote: {
				value: {
					title: parsed.data.title,
					body: parsed.data.body,
					fields: parsed.data.fields,
				},
				revision: parsed.data.baseRevision + 1,
				authorActorId: actor.id,
			},
		};
		const draft = appendOperationDraft(env, state.sync, actor.id, {
			entityType: CONTENT_ITEM_ENTITY_TYPE,
			entityId: parsed.data.itemId,
			opType: 'content.item-conflict',
			path: `content/items/${parsed.data.itemId}/conflicts/${conflictId}`,
			value: conflictValue,
			beforeRevision: parsed.data.baseRevision,
			afterRevision: existing.revision,
		});
		return {
			status: 'accepted',
			nextState: { ...contentWith(state, content), sync: draft.log },
			events: [{ kind: 'content.item-conflicted', itemId: parsed.data.itemId, conflictId, actorId: actor.id }],
			operationIds: [draft.op.id],
		};
	}

	const nextContent = updateContentItem(
		content,
		parsed.data.itemId,
		{
			...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
			...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
			...(parsed.data.fields !== undefined ? { fields: parsed.data.fields } : {}),
			...(parsed.data.dateFields !== undefined ? { dateFields: parsed.data.dateFields } : {}),
			...(parsed.data.timelineRefs !== undefined
				? {
						timelineRefs: parsed.data.timelineRefs.map((ref) => ({
							id: ref.id ?? env.ids(),
							label: ref.label,
							date: ref.date,
							...(ref.targetId !== undefined ? { targetId: ref.targetId } : {}),
						})),
					}
				: {}),
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
		opType: 'content.update-item',
		path: `content/items/${updated.id}`,
		value: { kind: updated.kind },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [
			itemChangedEvent(
				updated.id,
				'update',
				updated.visibility,
				deliveryAudience(updated.visibility, updated.sharedWith),
				actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-011 — change item visibility (the cross-surface invalidation trigger) ---------------

export function handleSetContentItemVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setContentItemVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const before: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!before) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' },
			state,
		);
	}
	if (!isLiveContentItem(before)) {
		return reject(
			{ code: 'content-item-deleted', message: 'Restore this item before changing its visibility.' },
			state,
		);
	}

	const nextContent = setContentItemVisibility(
		content,
		parsed.data.itemId,
		parsed.data.visibility,
		parsed.data.sharedWith,
		env.clock(),
	);
	if (!nextContent) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	const updated = contentItemById(nextContent, parsed.data.itemId)!;

	// CONTENT-011 AC2 — the invalidation audience is the UNION of the PREVIOUS delivery audience (so an
	// actor who LOST access has their cached view invalidated and re-evaluated) and the NEW audience.
	const invalidated = [
		...new Set([
			...deliveryAudience(before.visibility, before.sharedWith),
			...deliveryAudience(updated.visibility, updated.sharedWith),
		]),
	];

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.set-item-visibility',
		path: `content/items/${updated.id}`,
		value: { from: before.visibility, to: updated.visibility },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [itemChangedEvent(updated.id, 'set-visibility', updated.visibility, invalidated, actor.id)],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-001 — soft-delete a content item (authorized editor; recoverable) ------------------

export function handleRemoveContentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeContentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const before: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!before) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' },
			state,
		);
	}
	if (!isLiveContentItem(before)) {
		return reject(
			{ code: 'content-item-deleted', message: `Content item ${parsed.data.itemId} is already deleted.` },
			state,
		);
	}

	// SOFT-DELETE (CONTENT-001): tombstone the item rather than purge it, so it can be restored. The
	// item leaves every actor-filtered read immediately, so its delivery audience is invalidated.
	const nextContent = softDeleteContentItem(content, parsed.data.itemId, env.clock());
	if (!nextContent) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	const updated = contentItemById(nextContent, parsed.data.itemId)!;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: parsed.data.itemId,
		opType: 'content.remove-item',
		path: `content/items/${parsed.data.itemId}`,
		value: { itemId: parsed.data.itemId, softDelete: true },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [
			itemChangedEvent(
				parsed.data.itemId,
				'remove',
				before.visibility,
				deliveryAudience(before.visibility, before.sharedWith),
				actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CONTENT-001 — restore a soft-deleted content item (authorized editor) ----------------------

export function handleRestoreContentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(restoreContentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const content = ensureContentStateSlice(state.content);
	const before: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!before) {
		return reject(
			{ code: 'content-item-not-found', message: `Content item ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	if (!actorMayEditItem(state, actor, parsed.data.itemId)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this item.' },
			state,
		);
	}
	if (isLiveContentItem(before)) {
		return reject(
			{ code: 'content-item-not-deleted', message: `Content item ${parsed.data.itemId} is not deleted.` },
			state,
		);
	}

	const nextContent = restoreContentItem(content, parsed.data.itemId, env.clock());
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
		opType: 'content.restore-item',
		path: `content/items/${updated.id}`,
		value: { itemId: updated.id },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draft.log },
		events: [
			itemChangedEvent(
				updated.id,
				'restore',
				// The restored item re-enters its OWN visibility's delivery audience (the prior content's
				// visibility is preserved — no hidden prior revision is re-exposed, CONTENT-001 AC4).
				updated.visibility,
				deliveryAudience(updated.visibility, updated.sharedWith),
				actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}
