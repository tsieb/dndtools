import {
	createSavedSearchInputSchema,
	deleteSavedSearchInputSchema,
	pinSavedSearchInputSchema,
	updateSavedSearchInputSchema,
} from '../schemas/commands';
import {
	SAVED_SEARCH_ENTITY_TYPE,
	buildSavedSearch,
	removeSavedSearch,
	setSavedSearchPinned,
	updateSavedSearch,
	type SavedSearch,
	type SavedSearchMap,
} from '../state/saved-search';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * SRCH-004 — SAVED SEARCH command handlers (Architecture Contract 1 / Contract 3).
 *
 * The DM CREATES, UPDATES, PINS, and DELETES saved searches for recurring campaign workflows. The
 * architecture invariants this slice upholds, fail-closed:
 *
 *   - DM-only authoring. Players/observers cannot manage saved searches (a saved search is DM authoring
 *     criteria). The observer write-gate already rejects observers at dispatch; these handlers re-check DM.
 *   - Visibility FAILS CLOSED to `dm-only` (SRCH-004 AC2): a saved search whose criteria are DM-only is
 *     never exposed to players unless the DM explicitly makes it `player-visible`/`shared`. The read
 *     (`queries/saved-search-query.ts`) enforces this; the create default makes it the safe default.
 *   - A saved search stores ONLY its filter criteria + visibility + pin state — NEVER a cached result set.
 *     There is no code path here that writes results; the filter is re-evaluated LIVE on every read, so a
 *     stale result can never serve a now-hidden item (SRCH-003 AC4). The reducer normalizes the filter.
 *
 * Each mutation appends a durable `content.*-saved-search` op (actor + saved-search id + the criteria — the
 * audit) so the change replays in order. The GUI dispatches the intent; it never writes saved searches.
 */

function withSavedSearches(state: CoreStateSlice, searches: SavedSearchMap): CoreStateSlice {
	return { ...state, content: { ...state.content, savedSearches: searches } };
}

export function handleCreateSavedSearch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(createSavedSearchInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = input.searchId ? state.content.savedSearches[input.searchId] : undefined;
	const searchId = previous?.id ?? input.searchId ?? env.ids();
	const now = env.clock();
	const search: SavedSearch = buildSavedSearch(
		{
			name: input.name,
			filter: input.filter,
			visibility: input.visibility as VisibilityLevel,
			sharedWith: input.sharedWith,
			pinned: input.pinned,
		},
		{ id: searchId, createdBy: actor.id, now },
	);
	// Preserve creator/createdAt + bump revision when an existing id is reused (idempotent create).
	const stored: SavedSearch = previous
		? {
				...search,
				createdBy: previous.createdBy,
				createdAt: previous.createdAt,
				revision: previous.revision + 1,
			}
		: search;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SAVED_SEARCH_ENTITY_TYPE,
		entityId: searchId,
		opType: 'content.create-saved-search',
		path: `savedSearches/${searchId}`,
		value: { searchId, name: stored.name, visibility: stored.visibility, pinned: stored.pinned },
		beforeRevision: previous?.revision ?? 0,
		afterRevision: stored.revision,
	});

	return {
		status: 'accepted',
		nextState: withSavedSearches(
			{ ...state, sync: nextLog },
			{ ...state.content.savedSearches, [searchId]: stored },
		),
		events: [
			{
				kind: 'content.saved-search-changed',
				searchId,
				mutation: 'create',
				visibility: stored.visibility,
				pinned: stored.pinned,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleUpdateSavedSearch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(updateSavedSearchInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.content.savedSearches[input.searchId];
	if (!previous) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}

	const nextSearches = updateSavedSearch(
		state.content.savedSearches,
		input.searchId,
		{
			...(input.name !== undefined ? { name: input.name } : {}),
			...(input.filter !== undefined ? { filter: input.filter } : {}),
			...(input.visibility !== undefined ? { visibility: input.visibility as VisibilityLevel } : {}),
			...(input.sharedWith !== undefined ? { sharedWith: input.sharedWith } : {}),
			...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
		},
		env.clock(),
	);
	if (!nextSearches) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}
	const updated = nextSearches[input.searchId]!;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SAVED_SEARCH_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.update-saved-search',
		path: `savedSearches/${updated.id}`,
		value: { searchId: updated.id, name: updated.name, visibility: updated.visibility, pinned: updated.pinned },
		beforeRevision: previous.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: withSavedSearches({ ...state, sync: nextLog }, nextSearches),
		events: [
			{
				kind: 'content.saved-search-changed',
				searchId: updated.id,
				mutation: 'update',
				visibility: updated.visibility,
				pinned: updated.pinned,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handlePinSavedSearch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(pinSavedSearchInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.content.savedSearches[input.searchId];
	if (!previous) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}

	const nextSearches = setSavedSearchPinned(
		state.content.savedSearches,
		input.searchId,
		input.pinned,
		env.clock(),
	);
	if (!nextSearches) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}
	const updated = nextSearches[input.searchId]!;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SAVED_SEARCH_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.pin-saved-search',
		path: `savedSearches/${updated.id}`,
		value: { searchId: updated.id, pinned: updated.pinned },
		beforeRevision: previous.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: withSavedSearches({ ...state, sync: nextLog }, nextSearches),
		events: [
			{
				kind: 'content.saved-search-changed',
				searchId: updated.id,
				mutation: 'pin',
				visibility: updated.visibility,
				pinned: updated.pinned,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleDeleteSavedSearch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(deleteSavedSearchInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const previous = state.content.savedSearches[input.searchId];
	if (!previous) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}

	const nextSearches = removeSavedSearch(state.content.savedSearches, input.searchId);
	if (!nextSearches) {
		return reject(
			{ code: 'saved-search-not-found', message: `Saved search ${input.searchId} does not exist.` },
			state,
		);
	}

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SAVED_SEARCH_ENTITY_TYPE,
		entityId: input.searchId,
		opType: 'content.delete-saved-search',
		path: `savedSearches/${input.searchId}`,
		value: { searchId: input.searchId },
		beforeRevision: previous.revision,
		afterRevision: previous.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: withSavedSearches({ ...state, sync: nextLog }, nextSearches),
		events: [
			{
				kind: 'content.saved-search-changed',
				searchId: input.searchId,
				mutation: 'delete',
				visibility: previous.visibility,
				pinned: previous.pinned,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}
