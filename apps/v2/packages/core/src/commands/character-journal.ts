import {
	addJournalEntryInputSchema,
	removeJournalEntryInputSchema,
	setJournalEntryVisibilityInputSchema,
	updateJournalEntryInputSchema,
} from '../schemas/commands';
import {
	CHARACTER_JOURNAL_ENTITY_TYPE,
	addJournalEntry,
	buildJournalEntry,
	journalForCharacter,
	removeJournalEntry,
	setJournalEntryVisibility,
	updateJournalEntry,
	type CharacterJournalState,
} from '../state/character-journal';
import {
	CHARACTER_ENTITY_TYPE,
	journalsOf,
	type Character,
	type CharacterState,
} from '../state/character-state';
import { hasGrantedCapability } from '../permissions/grants';
import { singularGrantsOnEntity } from '../permissions/grant-records';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';

/**
 * CHAR-012 / CHAR-016 — durable CHARACTER-JOURNAL commands (Architecture Contract 1 / Contract 3).
 *
 * WRITE authority is fail-closed: only the character's OWNER (the `owner` capability set) or the DM
 * (administrative authority) may author/update/remove a journal entry or change its visibility. A
 * player WITHOUT ownership is rejected `actor-not-authorized` (CHAR-012 AC2); an observer never
 * qualifies. The READ path is the actor-filtered query, which enforces per-entry visibility.
 *
 * CROSS-SURFACE INVALIDATION (CHAR-016 AC2) is DATA-LAYER enforced: every accepted mutation appends a
 * durable `character.journal.*` op and emits a `character.journal-changed` event carrying the OWNER
 * id and the entry's new visibility. The visibility-change command additionally reports the affected
 * actors (the previous + next delivery audiences) so the runtime can invalidate exactly those actors'
 * cached views / subscriptions before new content is delivered — not the GUI.
 */

function charactersWith(state: CoreStateSlice, characters: CharacterState): CoreStateSlice {
	return { ...state, characters };
}

function withJournals(
	characters: CharacterState,
	journals: CharacterJournalState,
): CharacterState {
	return { ...characters, journals };
}

/**
 * The character's OWNER actor id, if any (the single `owner`-grant holder). Used as the default
 * `shared` delivery target for new entries (CHAR-016 AC1) and to compute invalidation audiences.
 */
function characterOwnerActorId(state: CoreStateSlice, characterId: string): string | null {
	const owners = singularGrantsOnEntity(state.permissions.grants, CHARACTER_ENTITY_TYPE, characterId);
	return owners[0]?.playerActorId ?? null;
}

/** CHAR-012 write authority: the DM (administrator) OR the character `owner`. Fail closed otherwise. */
function actorMayAuthorJournal(state: CoreStateSlice, actor: Actor, characterId: string): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, characterId, 'owner');
}

interface JournalGuard {
	actor: Actor;
	character: Character;
	characters: CharacterState;
	ownerActorId: string | null;
}

function journalGuard(
	state: CoreStateSlice,
	actorId: string,
	characterId: string,
): JournalGuard | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const characters = ensureCharacterStateSlice(state.characters);
	const character = characters.characters[characterId];
	if (!character) {
		return {
			rejection: reject(
				{ code: 'character-not-found', message: `Character ${characterId} does not exist.` },
				state,
			),
		};
	}
	if (!actorMayAuthorJournal(state, actor, characterId)) {
		return {
			rejection: reject(
				{ code: 'actor-not-authorized', message: 'Only the character owner may author this journal.' },
				state,
			),
		};
	}
	return { actor, character, characters, ownerActorId: characterOwnerActorId(state, characterId) };
}

/**
 * Compute the actors a journal entry is delivered to for invalidation (CHAR-016 AC2). For a `shared`
 * entry these are the explicit `sharedWith` ids; for `player-visible` it is the general player
 * audience (represented as `*` so the runtime invalidates all players); for `dm-only` no player.
 */
function deliveryAudience(visibility: string, sharedWith: readonly string[]): string[] {
	if (visibility === 'player-visible') return ['*'];
	if (visibility === 'shared') return [...sharedWith];
	return [];
}

function journalChangedEvent(
	characterId: string,
	entryId: string,
	visibility: string,
	ownerActorId: string | null,
	invalidatedActorIds: string[],
	actorId: string,
): CoreEvent {
	return {
		kind: 'character.journal-changed',
		characterId,
		entryId,
		visibility,
		ownerActorId,
		invalidatedActorIds,
		actorId,
	};
}

// --- CHAR-012 — add entry -----------------------------------------------------------------------

export function handleAddJournalEntry(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(addJournalEntryInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = journalGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	// The default `shared` delivery target is the OWNER (CHAR-016 AC1). When the DM authors for a
	// character with no owner yet, fall back to the authoring DM so the entry is never orphaned.
	const ownerActorId = guard.ownerActorId ?? guard.actor.id;
	const entry = buildJournalEntry(
		{
			kind: parsed.data.kind,
			title: parsed.data.title,
			body: parsed.data.body,
			...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
			sharedWith: parsed.data.sharedWith,
		},
		{ id: env.ids(), ownerActorId, authorActorId: guard.actor.id, now: env.clock() },
	);

	const nextJournals = addJournalEntry(journalsOf(guard.characters), parsed.data.characterId, entry);
	const nextCharacters = withJournals(guard.characters, nextJournals);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_JOURNAL_ENTITY_TYPE,
		entityId: parsed.data.characterId,
		opType: 'character.journal.add',
		path: `characters/${parsed.data.characterId}/journal/${entry.id}`,
		value: { kind: entry.kind, visibility: entry.visibility },
		afterRevision: entry.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			journalChangedEvent(
				parsed.data.characterId,
				entry.id,
				entry.visibility,
				ownerActorId,
				deliveryAudience(entry.visibility, entry.sharedWith),
				guard.actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-012 — update entry content ------------------------------------------------------------

export function handleUpdateJournalEntry(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateJournalEntryInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = journalGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const nextJournals = updateJournalEntry(
		journalsOf(guard.characters),
		parsed.data.characterId,
		parsed.data.entryId,
		{
			...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
			...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
			...(parsed.data.kind !== undefined ? { kind: parsed.data.kind } : {}),
		},
		env.clock(),
	);
	if (!nextJournals) {
		return reject(
			{ code: 'invalid-state', message: `Journal entry ${parsed.data.entryId} does not exist.` },
			state,
		);
	}
	const updated = journalForCharacter(nextJournals, parsed.data.characterId).entries.find(
		(e) => e.id === parsed.data.entryId,
	)!;
	const nextCharacters = withJournals(guard.characters, nextJournals);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_JOURNAL_ENTITY_TYPE,
		entityId: parsed.data.characterId,
		opType: 'character.journal.update',
		path: `characters/${parsed.data.characterId}/journal/${updated.id}`,
		value: { kind: updated.kind },
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			journalChangedEvent(
				parsed.data.characterId,
				updated.id,
				updated.visibility,
				guard.ownerActorId,
				deliveryAudience(updated.visibility, updated.sharedWith),
				guard.actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-016 — change entry visibility (the cross-surface invalidation trigger) ----------------

export function handleSetJournalEntryVisibility(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setJournalEntryVisibilityInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = journalGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const ownerActorId = guard.ownerActorId ?? guard.actor.id;
	const journals = journalsOf(guard.characters);
	const before = journalForCharacter(journals, parsed.data.characterId).entries.find(
		(e) => e.id === parsed.data.entryId,
	);
	const nextJournals = setJournalEntryVisibility(
		journals,
		parsed.data.characterId,
		parsed.data.entryId,
		ownerActorId,
		parsed.data.visibility,
		parsed.data.sharedWith,
		env.clock(),
	);
	if (!nextJournals || !before) {
		return reject(
			{ code: 'invalid-state', message: `Journal entry ${parsed.data.entryId} does not exist.` },
			state,
		);
	}
	const updated = journalForCharacter(nextJournals, parsed.data.characterId).entries.find(
		(e) => e.id === parsed.data.entryId,
	)!;

	// CHAR-016 AC2 — the invalidation audience is the UNION of the PREVIOUS delivery audience (so an
	// actor who LOST access has their cached view invalidated and re-evaluated) and the NEW audience
	// (so a newly-granted actor recomputes). Plus the owner, who always tracks their own journal.
	const invalidated = [
		...new Set([
			ownerActorId,
			...deliveryAudience(before.visibility, before.sharedWith),
			...deliveryAudience(updated.visibility, updated.sharedWith),
		]),
	];

	const nextCharacters = withJournals(guard.characters, nextJournals);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_JOURNAL_ENTITY_TYPE,
		entityId: parsed.data.characterId,
		opType: 'character.journal.set-visibility',
		path: `characters/${parsed.data.characterId}/journal/${updated.id}`,
		value: { from: before.visibility, to: updated.visibility },
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			journalChangedEvent(
				parsed.data.characterId,
				updated.id,
				updated.visibility,
				ownerActorId,
				invalidated,
				guard.actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-012 — remove entry --------------------------------------------------------------------

export function handleRemoveJournalEntry(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeJournalEntryInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = journalGuard(state, actorId, parsed.data.characterId);
	if ('rejection' in guard) return guard.rejection;

	const journals = journalsOf(guard.characters);
	const before = journalForCharacter(journals, parsed.data.characterId).entries.find(
		(e) => e.id === parsed.data.entryId,
	);
	const nextJournals = removeJournalEntry(journals, parsed.data.characterId, parsed.data.entryId);
	if (!nextJournals || !before) {
		return reject(
			{ code: 'invalid-state', message: `Journal entry ${parsed.data.entryId} does not exist.` },
			state,
		);
	}
	const nextCharacters = withJournals(guard.characters, nextJournals);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_JOURNAL_ENTITY_TYPE,
		entityId: parsed.data.characterId,
		opType: 'character.journal.remove',
		path: `characters/${parsed.data.characterId}/journal/${parsed.data.entryId}`,
		value: { entryId: parsed.data.entryId },
		beforeRevision: before.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			journalChangedEvent(
				parsed.data.characterId,
				parsed.data.entryId,
				before.visibility,
				guard.ownerActorId,
				deliveryAudience(before.visibility, before.sharedWith),
				guard.actor.id,
			),
		],
		operationIds: [draft.op.id],
	};
}
