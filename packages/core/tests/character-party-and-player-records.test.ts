import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	dispatchCommand,
	getCharacterJournalForActor,
	getPartyOverviewForActor,
	type Actor,
	type CharacterState,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * CHAR-011 / CHAR-012 / CHAR-015 / CHAR-016 — Party and player records.
 *
 * Tests are the primary evidence for the epic's non-leak deliverable:
 *   - per-viewer party-overview filtering (CHAR-011),
 *   - journal owner-scoping + write authority (CHAR-012),
 *   - observer denied on EVERY surface — party / journal (CHAR-015),
 *   - per-entry visibility with other-player filtering + data-layer cross-surface invalidation (CHAR-016).
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

function firstCharacterId(state: CharacterState, name: string): string {
	return Object.values(state.characters).find((c) => c.name === name)!.id;
}

/** DM quick-creates a character with the given name/visibility/combat; returns state + its id. */
function createCharacter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
	visibility: 'dm-only' | 'player-visible' | 'shared',
	combat: Record<string, number> = { hp: 10, maxHp: 10, ac: 12 },
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name, visibility, combat },
		}),
	);
	return { state: result.nextState, id: firstCharacterId(result.nextState.characters, name) };
}

/** DM grants `owner` (singular) to a player on a character. */
function grantOwner(
	state: CoreStateSlice,
	env: CoreEnvironment,
	characterId: string,
	playerActorId: string,
): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: characterId,
				playerActorId,
				capabilitySet: 'owner',
			},
		}),
	).nextState;
}

// =================================================================================================
// CHAR-011 — party overview, filtered per viewer
// =================================================================================================

describe('CHAR-011 — party overview (filtered)', () => {
	it('shows visible combat summaries and marching order for three visible PCs', () => {
		const env = makeEnvironment();
		let state = base();
		const a = createCharacter(state, env, 'Aria', 'player-visible', { hp: 8, maxHp: 12, ac: 14 });
		state = a.state;
		const b = createCharacter(state, env, 'Borin', 'player-visible', { hp: 20, maxHp: 20, ac: 16 });
		state = b.state;
		const c = createCharacter(state, env, 'Cael', 'player-visible', { hp: 5, maxHp: 9, ac: 11 });
		state = c.state;

		// Set an explicit marching order.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-marching-order',
				actorId: DM_ACTOR.id,
				payload: { order: [b.id, a.id, c.id] },
			}),
		).nextState;

		const overview = getPartyOverviewForActor(state.characters, state.permissions, PLAYER_ACTOR.id);
		expect(overview.members).toHaveLength(3);
		expect(overview.marchingOrder).toEqual([b.id, a.id, c.id]);
		// Marching positions are 1-based in declared order.
		expect(overview.members.map((m) => m.marchingPosition)).toEqual([1, 2, 3]);
		// Visible combat summaries.
		const aria = overview.members.find((m) => m.name === 'Aria')!;
		expect(aria.hp).toBe(8);
		expect(aria.maxHp).toBe(12);
		expect(aria.ac).toBe(14);
	});

	it('omits a character not visible to the viewer from members AND marching order', () => {
		const env = makeEnvironment();
		let state = base();
		const visible = createCharacter(state, env, 'Visible', 'player-visible');
		state = visible.state;
		const hidden = createCharacter(state, env, 'Secret', 'dm-only');
		state = hidden.state;

		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-marching-order',
				actorId: DM_ACTOR.id,
				payload: { order: [hidden.id, visible.id] },
			}),
		).nextState;

		// A player sees only the visible character; the dm-only one is absent (not gapped).
		const playerView = getPartyOverviewForActor(state.characters, state.permissions, PLAYER_ACTOR.id);
		expect(playerView.members.map((m) => m.characterId)).toEqual([visible.id]);
		expect(playerView.marchingOrder).toEqual([visible.id]);
		expect(playerView.members.find((m) => m.characterId === hidden.id)).toBeUndefined();
		// The hidden character's name never appears anywhere in the player's overview.
		expect(JSON.stringify(playerView)).not.toContain('Secret');

		// The DM sees both, plus a hidden-from-players count of 1.
		const dmView = getPartyOverviewForActor(state.characters, state.permissions, DM_ACTOR.id);
		expect(dmView.members).toHaveLength(2);
		expect(dmView.hidden.members).toBe(1);
		expect(playerView.hidden.members).toBe(0); // a non-DM never receives the count.
	});

	it('filters party inventory by per-item visibility; a non-DM never sees a hidden item', () => {
		const env = makeEnvironment();
		let state = base();
		// player-visible item.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-party-inventory-item',
				actorId: DM_ACTOR.id,
				payload: { name: 'Rope', detail: '50 ft', visibility: 'player-visible' },
			}),
		).nextState;
		// dm-only item.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-party-inventory-item',
				actorId: DM_ACTOR.id,
				payload: { name: 'Cursed Idol', detail: 'do not touch', visibility: 'dm-only' },
			}),
		).nextState;

		const playerView = getPartyOverviewForActor(state.characters, state.permissions, PLAYER_ACTOR.id);
		expect(playerView.inventory.map((i) => i.name)).toEqual(['Rope']);
		expect(JSON.stringify(playerView)).not.toContain('Cursed Idol');

		const dmView = getPartyOverviewForActor(state.characters, state.permissions, DM_ACTOR.id);
		expect(dmView.inventory.map((i) => i.name).sort()).toEqual(['Cursed Idol', 'Rope']);
		expect(dmView.hidden.inventory).toBe(1);
	});

	it('rejects a marching order that references a non-existent character (fail closed)', () => {
		const env = makeEnvironment();
		const state = base();
		const rej = rejected(
			dispatchCommand(state, env, {
				type: 'character.set-marching-order',
				actorId: DM_ACTOR.id,
				payload: { order: ['no-such-character'] },
			}),
		);
		expect(rej.rejection.code).toBe('character-not-found');
	});

	it('rejects a non-DM authoring party records (DM-only)', () => {
		const env = makeEnvironment();
		const state = base();
		const rej = rejected(
			dispatchCommand(state, env, {
				type: 'character.upsert-party-inventory-item',
				actorId: PLAYER_ACTOR.id,
				payload: { name: 'Sword', visibility: 'player-visible' },
			}),
		);
		expect(rej.rejection.code).toBe('actor-not-authorized');
	});
});

// =================================================================================================
// CHAR-012 — character journal scoped to character permissions
// =================================================================================================

describe('CHAR-012 — character journal (owner-scoped)', () => {
	function setupOwnedCharacter(): { state: CoreStateSlice; env: CoreEnvironment; id: string } {
		const env = makeEnvironment();
		let state = base();
		const created = createCharacter(state, env, 'Mira', 'player-visible');
		state = created.state;
		state = grantOwner(state, env, created.id, PLAYER_ACTOR.id);
		return { state, env, id: created.id };
	}

	it('an owner adds an entry the owner and DM can read', () => {
		const { state, env, id } = setupOwnedCharacter();
		const after = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, kind: 'bookmark', title: 'Met the Oracle' },
			}),
		).nextState;

		const ownerView = getCharacterJournalForActor(after.characters, after.permissions, PLAYER_ACTOR.id, id);
		expect(ownerView.entries.map((e) => e.title)).toEqual(['Met the Oracle']);
		const dmView = getCharacterJournalForActor(after.characters, after.permissions, DM_ACTOR.id, id);
		expect(dmView.entries.map((e) => e.title)).toEqual(['Met the Oracle']);
	});

	it('a no-visibility entry defaults to shared-to-owner (owner+DM, NOT other players)', () => {
		const { state, env, id } = setupOwnedCharacter();
		const after = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, kind: 'note', title: 'Private thought' },
			}),
		).nextState;

		// Owner + DM see it.
		expect(getCharacterJournalForActor(after.characters, after.permissions, PLAYER_ACTOR.id, id).entries).toHaveLength(1);
		expect(getCharacterJournalForActor(after.characters, after.permissions, DM_ACTOR.id, id).entries).toHaveLength(1);
		// Another player does NOT (the default is shared-to-owner, not player-visible).
		const otherView = getCharacterJournalForActor(after.characters, after.permissions, PLAYER_B.id, id);
		expect(otherView.entries).toHaveLength(0);
		expect(JSON.stringify(otherView)).not.toContain('Private thought');
	});

	it('rejects a player WITHOUT ownership authoring the journal (CHAR-012 AC2)', () => {
		const { state, env, id } = setupOwnedCharacter();
		const rej = rejected(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_B.id,
				payload: { characterId: id, kind: 'note', title: 'Should be blocked' },
			}),
		);
		expect(rej.rejection.code).toBe('actor-not-authorized');
	});

	it('the owner can update and remove their own entry', () => {
		const { state, env, id } = setupOwnedCharacter();
		let s = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, kind: 'note', title: 'Draft' },
			}),
		).nextState;
		const entryId = s.characters.journals!.journals[id]!.entries[0]!.id;

		s = accepted(
			dispatchCommand(s, env, {
				type: 'character.update-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, entryId, title: 'Final' },
			}),
		).nextState;
		expect(getCharacterJournalForActor(s.characters, s.permissions, PLAYER_ACTOR.id, id).entries[0]!.title).toBe('Final');

		s = accepted(
			dispatchCommand(s, env, {
				type: 'character.remove-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, entryId },
			}),
		).nextState;
		expect(getCharacterJournalForActor(s.characters, s.permissions, PLAYER_ACTOR.id, id).entries).toHaveLength(0);
	});
});

// =================================================================================================
// CHAR-015 — observer denied on EVERY surface (hard non-leak)
// =================================================================================================

describe('CHAR-015 — observer denied by default on every surface', () => {
	function richState(): { state: CoreStateSlice; env: CoreEnvironment; id: string } {
		const env = makeEnvironment();
		let state = base();
		const created = createCharacter(state, env, 'Hero', 'player-visible', { hp: 7, maxHp: 10, ac: 15 });
		state = created.state;
		state = grantOwner(state, env, created.id, PLAYER_ACTOR.id);
		// Owner journal entry + a player-visible party item + marching order.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: created.id, kind: 'note', title: 'Secret plan' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-party-inventory-item',
				actorId: DM_ACTOR.id,
				payload: { name: 'Lantern', visibility: 'player-visible' },
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-marching-order',
				actorId: DM_ACTOR.id,
				payload: { order: [created.id] },
			}),
		).nextState;
		return { state, env, id: created.id };
	}

	it('party overview is EMPTY for an observer (no members, marching order, inventory)', () => {
		const { state } = richState();
		const view = getPartyOverviewForActor(state.characters, state.permissions, OBSERVER_ACTOR.id);
		expect(view.members).toHaveLength(0);
		expect(view.marchingOrder).toHaveLength(0);
		expect(view.inventory).toHaveLength(0);
		expect(view.hidden).toEqual({ members: 0, inventory: 0 });
		// Indistinguishable from absent: no character or item name leaks.
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('Hero');
		expect(serialized).not.toContain('Lantern');
	});

	it('journal is EMPTY for an observer (no entries, no count, no ids)', () => {
		const { state, id } = richState();
		const view = getCharacterJournalForActor(state.characters, state.permissions, OBSERVER_ACTOR.id, id);
		expect(view.entries).toHaveLength(0);
		expect(view.hiddenFromPlayers).toBe(0);
		expect(JSON.stringify(view)).not.toContain('Secret plan');
	});

	it('an adversarial observer grant on the character/journal is rejected by the command layer', () => {
		const { state, env, id } = richState();
		// `character-journal` is not a registered entity type in the capability-set schema, so any
		// attempt to issue a grant on it (including a `viewer` grant for an observer) is rejected with
		// `invalid-payload` before it ever reaches the observer-ceiling check. The state is unchanged.
		const grantResult = dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character-journal',
				entityId: id,
				playerActorId: OBSERVER_ACTOR.id,
				capabilitySet: 'viewer',
			},
		});
		expect(grantResult.status).toBe('rejected');
		if (grantResult.status === 'rejected') {
			expect(grantResult.rejection.code).toBe('invalid-payload');
		}
		// State is unchanged; the observer still receives no character/journal data (observer ceiling).
		const view = getCharacterJournalForActor(state.characters, state.permissions, OBSERVER_ACTOR.id, id);
		expect(view.entries).toHaveLength(0);
		const party = getPartyOverviewForActor(state.characters, state.permissions, OBSERVER_ACTOR.id);
		expect(party.members).toHaveLength(0);
	});

	it('a DM-projected player-visible journal entry IS delivered to an observer? No — only the explicit non-character projection', () => {
		// CHAR-015: an observer gets NO character data unless a specific visible non-character projection
		// is delivered. A journal entry IS character data, so even a `player-visible` journal entry is
		// withheld from an observer (the observer ceiling denies character data wholesale).
		const env = makeEnvironment();
		let state = base();
		const created = createCharacter(state, env, 'Scout', 'player-visible');
		state = created.state;
		state = grantOwner(state, env, created.id, PLAYER_ACTOR.id);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: created.id, kind: 'note', title: 'Public log', visibility: 'player-visible' },
			}),
		).nextState;

		// A regular player sees the player-visible entry.
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_B.id, created.id).entries).toHaveLength(1);
		// The observer still sees nothing (character data is denied wholesale).
		expect(getCharacterJournalForActor(state.characters, state.permissions, OBSERVER_ACTOR.id, created.id).entries).toHaveLength(0);
	});
});

// =================================================================================================
// CHAR-016 — per-entry visibility + other-player filtering + cross-surface invalidation
// =================================================================================================

describe('CHAR-016 — per-entry journal visibility (data-layer enforced)', () => {
	function ownedWithEntry(
		visibility: 'dm-only' | 'player-visible' | 'shared',
		sharedWith: string[] = [],
	): { state: CoreStateSlice; env: CoreEnvironment; id: string; entryId: string } {
		const env = makeEnvironment();
		let state = base();
		const created = createCharacter(state, env, 'Lyra', 'player-visible');
		state = created.state;
		state = grantOwner(state, env, created.id, PLAYER_ACTOR.id);
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: created.id, kind: 'npc-impression', title: 'The Baron is lying', visibility, sharedWith },
			}),
		).nextState;
		const entryId = state.characters.journals!.journals[created.id]!.entries[0]!.id;
		return { state, env, id: created.id, entryId };
	}

	it('a shared entry delivered to Player A reaches A but NOT Player B (other-player filtering)', () => {
		const { state, id } = ownedWithEntry('shared', [PLAYER_B.id]);
		// Owner (A) sees it; explicitly-shared Player B sees it; an unrelated player does not.
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_ACTOR.id, id).entries).toHaveLength(1);
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_B.id, id).entries).toHaveLength(1);

		const cael: Actor = { id: 'actor-cael', role: 'player', displayName: 'Cael' };
		const withCael = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, cael);
		// Recreate the scenario in a state that includes Cael so the actor is registered.
		const env = makeEnvironment();
		let s = withCael;
		const created = createCharacter(s, env, 'Lyra', 'player-visible');
		s = created.state;
		s = grantOwner(s, env, created.id, PLAYER_ACTOR.id);
		s = accepted(
			dispatchCommand(s, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: created.id, kind: 'note', title: 'Shared only with B', visibility: 'shared', sharedWith: [PLAYER_B.id] },
			}),
		).nextState;
		const caelView = getCharacterJournalForActor(s.characters, s.permissions, cael.id, created.id);
		expect(caelView.entries).toHaveLength(0);
		expect(JSON.stringify(caelView)).not.toContain('Shared only with B');
	});

	it('an owner-only (dm-only) entry leaks nothing to another player: no title/snippet/id/count', () => {
		const { state, id } = ownedWithEntry('dm-only');
		const otherView = getCharacterJournalForActor(state.characters, state.permissions, PLAYER_B.id, id);
		expect(otherView.entries).toHaveLength(0);
		expect(otherView.hiddenFromPlayers).toBe(0); // non-DM never receives the count
		const serialized = JSON.stringify(otherView);
		expect(serialized).not.toContain('The Baron is lying');
		// The DM still sees it (DM authority) and the owner sees it (owner access).
		expect(getCharacterJournalForActor(state.characters, state.permissions, DM_ACTOR.id, id).entries).toHaveLength(1);
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_ACTOR.id, id).entries).toHaveLength(1);
	});

	it('a visibility change is the data-layer cross-surface invalidation trigger', () => {
		const { state, env, id, entryId } = ownedWithEntry('player-visible');
		// Player B sees the player-visible entry before the change.
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_B.id, id).entries).toHaveLength(1);

		// Owner narrows it to dm-only. The accepted result reports the invalidation audience (the actors
		// whose cached views must be re-evaluated). Player B (formerly in the player-visible audience)
		// must be invalidated.
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-journal-entry-visibility',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, entryId, visibility: 'dm-only' },
			}),
		);
		const event = result.events.find((e) => e.kind === 'character.journal-changed')!;
		expect(event).toBeDefined();
		if (event.kind === 'character.journal-changed') {
			// The previous audience was all players (`*`); the next is none. The owner is always tracked.
			expect(event.invalidatedActorIds).toContain('*');
			expect(event.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
			expect(event.visibility).toBe('dm-only');
		}

		// And the data-layer read now hides it from Player B (a stale cache is never served because the
		// entry's content is gone from the filtered result, not merely flagged).
		const after = result.nextState;
		expect(getCharacterJournalForActor(after.characters, after.permissions, PLAYER_B.id, id).entries).toHaveLength(0);
	});

	it('narrowing a shared entry invalidates the actor who LOST access (previous audience)', () => {
		const { state, env, id, entryId } = ownedWithEntry('shared', [PLAYER_B.id]);
		expect(getCharacterJournalForActor(state.characters, state.permissions, PLAYER_B.id, id).entries).toHaveLength(1);

		// Re-share with nobody (just the owner). Player B loses access and must be invalidated.
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-journal-entry-visibility',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, entryId, visibility: 'shared', sharedWith: [] },
			}),
		);
		const event = result.events.find((e) => e.kind === 'character.journal-changed');
		expect(event?.kind).toBe('character.journal-changed');
		if (event?.kind === 'character.journal-changed') {
			expect(event.invalidatedActorIds).toContain(PLAYER_B.id);
		}
		const after = result.nextState;
		expect(getCharacterJournalForActor(after.characters, after.permissions, PLAYER_B.id, id).entries).toHaveLength(0);
		// The owner still sees it.
		expect(getCharacterJournalForActor(after.characters, after.permissions, PLAYER_ACTOR.id, id).entries).toHaveLength(1);
	});

	it('every accepted journal mutation appends a durable op (data-layer write, not GUI)', () => {
		const { state, env, id } = ownedWithEntry('dm-only');
		const before = state.sync.operations.length;
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.add-journal-entry',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: id, kind: 'session-highlight', title: 'Boss defeated' },
			}),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.length).toBe(before + 1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.entityType).toBe('character-journal');
		expect(op.opType).toBe('character.journal.add');
	});
});
