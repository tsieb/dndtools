import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	deriveVaultConflicts,
	dispatchCommand,
	getContentItemsForActor,
	getDeletedContentItemsForActor,
	isEntityConflicted,
	searchContentForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type PermissionGrant,
} from '../src';

/**
 * CONTENT-001 — markdown NOTES as the PRIMARY CONTENT UNIT: create / read / update / delete (recoverable
 * soft-delete) / restore / SEARCH, all fail-closed and actor-filtered. Tests are the primary evidence.
 *
 * These extend the existing CONTENT model (no parallel model): a note is a `content-item` of kind
 * `note`. The single actor-filtered query is the choke-point search composes, so a hidden note can never
 * surface a hit/snippet/title to an actor who cannot see it.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** Create a note and return [state, noteId]. */
function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): [CoreStateSlice, string] {
	const result = accepted(dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', ...payload })));
	const event = result.events[0] as { itemId: string };
	return [result.nextState, event.itemId];
}

function grantViewer(state: CoreStateSlice, itemId: string, playerActorId: string): CoreStateSlice {
	const grant: PermissionGrant = {
		id: `grant-${playerActorId}-${itemId}`,
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: itemId,
		playerActorId,
		capabilitySet: 'viewer',
		createdBy: DM_ACTOR.id,
		createdAt: '2026-06-03T00:00:00.000Z',
	};
	return { ...state, permissions: { ...state.permissions, grants: [...state.permissions.grants, grant] } };
}

describe('CONTENT-001: note CRUD', () => {
	it('AC1/AC2: create a note → it is durable, queued as an op, and reads back as the accepted revision', () => {
		const env = makeEnvironment();
		const [state, noteId] = createNote(base(), env, {
			title: 'Highmoor',
			body: 'An ancient keep.',
			visibility: 'player-visible',
		});
		// Durable op appended.
		const op = state.sync.operations.at(-1)!;
		expect(op.opType).toBe('content.create-item');
		expect(op.entityType).toBe(CONTENT_ITEM_ENTITY_TYPE);
		// Reads back through the actor-filtered query.
		const dmView = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id);
		expect(dmView).toHaveLength(1);
		expect(dmView[0]!.id).toBe(noteId);
		expect(dmView[0]!.title).toBe('Highmoor');
		expect(dmView[0]!.revision).toBe(1);
	});

	it('AC2: update a note → the visible revision reflects the accepted command', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'Draft', body: 'v1', visibility: 'player-visible' });
		const updated = accepted(
			dispatchCommand(created, env, cmd('content.update-item', { itemId: noteId, body: 'v2' })),
		).nextState;
		const view = getContentItemsForActor(updated.content, updated.permissions, DM_ACTOR.id)[0]!;
		expect(view.body).toBe('v2');
		expect(view.revision).toBe(2);
	});

	it('fails closed: only the DM (or a granted editor) may create a note', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.create-item', { kind: 'note', title: 'X' }, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('CONTENT-001: soft-delete + restore round-trip', () => {
	it('AC2/AC4: delete soft-deletes (recoverable) → the note leaves reads → restore brings it back at the prior content', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, {
			title: 'Recoverable',
			body: 'important lore',
			visibility: 'player-visible',
		});

		// DELETE → omitted from the actor-filtered read, but recoverable (tombstoned, in the DM bin).
		const deleted = accepted(
			dispatchCommand(created, env, cmd('content.remove-item', { itemId: noteId })),
		).nextState;
		expect(getContentItemsForActor(deleted.content, deleted.permissions, DM_ACTOR.id)).toHaveLength(0);
		expect(getContentItemsForActor(deleted.content, deleted.permissions, PLAYER_ACTOR.id)).toHaveLength(0);
		const bin = getDeletedContentItemsForActor(deleted.content, deleted.permissions, DM_ACTOR.id);
		expect(bin).toHaveLength(1);
		expect(bin[0]!.id).toBe(noteId);
		expect(deleted.sync.operations.at(-1)!.opType).toBe('content.remove-item');

		// RESTORE → the note returns at its exact prior content (no hidden prior revision re-exposed).
		const restored = accepted(
			dispatchCommand(deleted, env, cmd('content.restore-item', { itemId: noteId })),
		).nextState;
		const view = getContentItemsForActor(restored.content, restored.permissions, DM_ACTOR.id);
		expect(view).toHaveLength(1);
		expect(view[0]!.title).toBe('Recoverable');
		expect(view[0]!.body).toBe('important lore');
		expect(getDeletedContentItemsForActor(restored.content, restored.permissions, DM_ACTOR.id)).toHaveLength(0);
		expect(restored.sync.operations.at(-1)!.opType).toBe('content.restore-item');
	});

	it('fails closed: editing or re-deleting a tombstoned note is rejected until it is restored', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'T', visibility: 'dm-only' });
		const deleted = accepted(dispatchCommand(created, env, cmd('content.remove-item', { itemId: noteId }))).nextState;
		expect(rejected(dispatchCommand(deleted, env, cmd('content.update-item', { itemId: noteId, body: 'x' }))).rejection.code).toBe('content-item-deleted');
		expect(rejected(dispatchCommand(deleted, env, cmd('content.remove-item', { itemId: noteId }))).rejection.code).toBe('content-item-deleted');
	});

	it('fails closed: restoring a live note is rejected', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'Live', visibility: 'dm-only' });
		expect(rejected(dispatchCommand(created, env, cmd('content.restore-item', { itemId: noteId }))).rejection.code).toBe('content-item-not-deleted');
	});

	it('fails closed: a non-DM/non-grantee cannot delete or see the recycle bin', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'Protected', visibility: 'dm-only' });
		expect(rejected(dispatchCommand(created, env, cmd('content.remove-item', { itemId: noteId }, PLAYER_ACTOR.id))).rejection.code).toBe('actor-not-authorized');
		// Even a tombstoned note never appears in a non-DM recycle bin.
		const deleted = accepted(dispatchCommand(created, env, cmd('content.remove-item', { itemId: noteId }))).nextState;
		expect(getDeletedContentItemsForActor(deleted.content, deleted.permissions, PLAYER_ACTOR.id)).toHaveLength(0);
	});
});

describe('CONTENT-001: actor-filtered search (no leak)', () => {
	it('AC3: a player search never returns a note/snippet they cannot see', () => {
		const env = makeEnvironment();
		let state = base();
		[state] = createNoteOn(state, env, { title: 'Secret Plot', body: 'the lich phylactery is hidden', visibility: 'dm-only' });
		[state] = createNoteOn(state, env, { title: 'Town Gossip', body: 'a public rumor about the lich', visibility: 'player-visible' });

		// The DM sees both (title + body hits) for the query "lich".
		const dmHits = searchContentForActor(state.content, state.permissions, DM_ACTOR.id, 'lich');
		expect(dmHits.map((hit) => hit.item.title).sort()).toEqual(['Secret Plot', 'Town Gossip']);

		// The player sees ONLY the player-visible note — the dm-only note and its snippet never appear.
		const playerHits = searchContentForActor(state.content, state.permissions, PLAYER_ACTOR.id, 'lich');
		expect(playerHits).toHaveLength(1);
		expect(playerHits[0]!.item.title).toBe('Town Gossip');
		// HARD non-leak: nothing from the hidden note's body surfaces in the player's snippets.
		const playerText = JSON.stringify(playerHits);
		expect(playerText).not.toContain('phylactery');
		expect(playerText).not.toContain('Secret Plot');
	});

	it('AC2: a deleted note is excluded from search until restored', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'Findable', body: 'unique-token-zzz', visibility: 'player-visible' });
		expect(searchContentForActor(created.content, created.permissions, DM_ACTOR.id, 'unique-token-zzz')).toHaveLength(1);
		const deleted = accepted(dispatchCommand(created, env, cmd('content.remove-item', { itemId: noteId }))).nextState;
		expect(searchContentForActor(deleted.content, deleted.permissions, DM_ACTOR.id, 'unique-token-zzz')).toHaveLength(0);
		const restored = accepted(dispatchCommand(deleted, env, cmd('content.restore-item', { itemId: noteId }))).nextState;
		expect(searchContentForActor(restored.content, restored.permissions, DM_ACTOR.id, 'unique-token-zzz')).toHaveLength(1);
	});

	it('a shared note is searchable by a granted viewer but not by other players', () => {
		const env = makeEnvironment();
		const [created, noteId] = createNote(base(), env, { title: 'Whisper', body: 'only for player A', visibility: 'shared' });
		const state = grantViewer(created, noteId, PLAYER_ACTOR.id);
		expect(searchContentForActor(state.content, state.permissions, PLAYER_ACTOR.id, 'Whisper')).toHaveLength(1);
		expect(searchContentForActor(state.content, state.permissions, PLAYER_B.id, 'Whisper')).toHaveLength(0);
	});

	it('ranks a title match above a body-only match (deterministic)', () => {
		const env = makeEnvironment();
		let state = base();
		[state] = createNoteOn(state, env, { title: 'Dragon', body: 'no body hit', visibility: 'player-visible' });
		[state] = createNoteOn(state, env, { title: 'Lair', body: 'home of the dragon', visibility: 'player-visible' });
		const hits = searchContentForActor(state.content, state.permissions, DM_ACTOR.id, 'dragon');
		expect(hits[0]!.item.title).toBe('Dragon');
		expect(hits[0]!.titleMatch).toBe(true);
		expect(hits[1]!.item.title).toBe('Lair');
		expect(hits[1]!.snippet?.text).toContain('dragon');
	});

	it('fails closed: an unknown actor gets no search results', () => {
		const env = makeEnvironment();
		const [state] = createNote(base(), env, { title: 'Anything', visibility: 'player-visible' });
		expect(searchContentForActor(state.content, state.permissions, 'actor-ghost', 'Anything')).toHaveLength(0);
	});
});

// Threads state through multiple creates within one test (alias of createNote for readability).
function createNoteOn(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): [CoreStateSlice, string] {
	return createNote(state, env, payload);
}

describe('CONTENT-001 AC5: concurrent same-note update → durable conflict record', () => {
	it('AC5: two editors update the same note from the same base revision → a durable conflict op is recorded and the item is UNCHANGED', () => {
		const env = makeEnvironment();
		// Create a note at revision 1. Must be player-visible so the granted player can write
		// (CONTENT-009 AC4 blocks non-DM writes to dm-only items even with a grant).
		const [state0, noteId] = createNote(base(), env, {
			title: 'Lore',
			body: 'v1 content',
			visibility: 'player-visible',
		});

		// First editor (DM) updates the note → revision 2.
		const state1 = accepted(
			dispatchCommand(state0, env, cmd('content.update-item', { itemId: noteId, body: 'DM edit', baseRevision: 1 })),
		).nextState;
		const afterFirstEdit = getContentItemsForActor(state1.content, state1.permissions, DM_ACTOR.id)[0]!;
		expect(afterFirstEdit.revision).toBe(2);
		expect(afterFirstEdit.body).toBe('DM edit');

		// Second editor (PLAYER_ACTOR, granted contributor) sends an update that was based on revision 1
		// (concurrent — they didn't see the DM's edit). This is now stale.
		const grant: PermissionGrant = {
			id: 'grant-contributor',
			entityType: CONTENT_ITEM_ENTITY_TYPE,
			entityId: noteId,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'contributor',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-03T00:00:00.000Z',
		};
		const stateWithGrant = { ...state1, permissions: { ...state1.permissions, grants: [...state1.permissions.grants, grant] } };
		const conflictResult = accepted(
			dispatchCommand(stateWithGrant, env, cmd('content.update-item', { itemId: noteId, body: 'Player edit', baseRevision: 1 }, PLAYER_ACTOR.id)),
		);

		// Item MUST be unchanged (the concurrent edit did not overwrite the DM's work).
		const itemAfterConflict = getContentItemsForActor(conflictResult.nextState.content, conflictResult.nextState.permissions, DM_ACTOR.id)[0]!;
		expect(itemAfterConflict.body).toBe('DM edit');
		expect(itemAfterConflict.revision).toBe(2);

		// A durable conflict-shaped op must be recorded (so deriveVaultConflicts can reconstruct it).
		const conflictOp = conflictResult.nextState.sync.operations.at(-1)!;
		expect(conflictOp.opType).toBe('content.item-conflict');
		expect(conflictOp.entityType).toBe(CONTENT_ITEM_ENTITY_TYPE);
		expect(conflictOp.entityId).toBe(noteId);

		// The vault conflict machinery must recognize the entity as conflicted.
		const conflicts = deriveVaultConflicts(
			conflictResult.nextState.sync.operations,
			conflictResult.nextState.sync.operations,
		);
		expect(isEntityConflicted(conflicts, CONTENT_ITEM_ENTITY_TYPE, noteId)).toBe(true);

		// A `content.item-conflicted` event must be emitted.
		const event = conflictResult.events.find((e) => e.kind === 'content.item-conflicted');
		expect(event).toBeDefined();

		// The event carries the item id (non-leaking: no content in the event).
		expect((event as { itemId: string }).itemId).toBe(noteId);
	});

	it('AC5: update without baseRevision always succeeds (conflict detection is opt-in)', () => {
		const env = makeEnvironment();
		const [state0, noteId] = createNote(base(), env, { title: 'Lore', body: 'v1', visibility: 'dm-only' });
		// DM updates to revision 2.
		const state1 = accepted(dispatchCommand(state0, env, cmd('content.update-item', { itemId: noteId, body: 'v2' }))).nextState;
		// Another update without baseRevision always succeeds, even though revision is now 2.
		const state2 = accepted(dispatchCommand(state1, env, cmd('content.update-item', { itemId: noteId, body: 'v3' }))).nextState;
		expect(getContentItemsForActor(state2.content, state2.permissions, DM_ACTOR.id)[0]!.body).toBe('v3');
	});

	it('AC5: update with a fresh baseRevision (not stale) succeeds normally — no conflict', () => {
		const env = makeEnvironment();
		const [state0, noteId] = createNote(base(), env, { title: 'Lore', body: 'v1', visibility: 'dm-only' });
		// DM updates from revision 1 (fresh) → should succeed.
		const result = accepted(
			dispatchCommand(state0, env, cmd('content.update-item', { itemId: noteId, body: 'fresh edit', baseRevision: 1 })),
		);
		expect(getContentItemsForActor(result.nextState.content, result.nextState.permissions, DM_ACTOR.id)[0]!.body).toBe('fresh edit');
		// No conflict op.
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.update-item');
	});
});
