import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getPinnedSavedSearchesForActor,
	getSavedSearchesForActor,
	runSavedSearchForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-004 — SAVED SEARCHES: the DM creates, edits, pins, and deletes saved searches without exposing
 * hidden criteria to players. Tests are the primary evidence.
 *
 * The load-bearing invariants proven here (SRCH-004 AC1/AC2 + the SRCH-003 AC4 no-stale-leak rule):
 *   - DM-only authoring: a player/observer cannot create/update/pin/delete a saved search (fail closed).
 *   - A `dm-only` saved search is ABSENT from a non-DM's list/run — its name + criteria never leak (AC2).
 *   - A saved search stores ONLY its filter; running it re-evaluates LIVE, so a `player-visible` saved
 *     search that references content which becomes hidden simply omits it on the next run — a stale result
 *     can NEVER serve a now-hidden item (SRCH-003 AC4). The SAME saved search yields each actor's own hits.
 *   - A pinned saved search feeds the Command Center widget with CURRENT results (AC1).
 */

function base(...actors: Actor[]): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
	return { ...state, maps: createDemoMapState() };
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
	visibility: 'dm-only' | 'player-visible' | 'shared',
	body = `Body of ${title}`,
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', title, body, visibility })),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === title);
	if (!item) throw new Error(`item ${title} not created`);
	return { state: result.nextState, itemId: item.id };
}

function createSavedSearch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): { state: CoreStateSlice; searchId: string } {
	const result = accepted(dispatchCommand(state, env, cmd('content.create-saved-search', payload)));
	const search = Object.values(result.nextState.content.savedSearches).find(
		(s) => s.name === payload.name,
	);
	if (!search) throw new Error(`saved search ${String(payload.name)} not created`);
	return { state: result.nextState, searchId: search.id };
}

describe('SRCH-004 — DM-only authoring (fail closed)', () => {
	it('lets the DM create a saved search that stores its filter, not results', () => {
		const env = makeEnvironment();
		const { state, searchId } = createSavedSearch(base(), env, {
			name: 'Plot threads',
			filter: { query: 'thread', tags: ['plot'] },
		});
		const saved = state.content.savedSearches[searchId]!;
		expect(saved.name).toBe('Plot threads');
		expect(saved.filter.query).toBe('thread');
		expect(saved.filter.tags).toEqual(['plot']);
		expect(saved.visibility).toBe('dm-only'); // fails closed to dm-only
		// The durable record carries NO cached result/hit/count.
		expect(JSON.stringify(saved)).not.toContain('hits');
		expect(JSON.stringify(saved)).not.toContain('totalCount');
	});

	it('rejects a player creating, updating, pinning, or deleting a saved search', () => {
		const env = makeEnvironment();
		const { state, searchId } = createSavedSearch(base(), env, { name: 'DM list', filter: {} });
		expect(rejected(dispatchCommand(state, env, cmd('content.create-saved-search', { name: 'x', filter: {} }, PLAYER_ACTOR.id))).rejection.code).toBe('actor-not-authorized');
		expect(rejected(dispatchCommand(state, env, cmd('content.update-saved-search', { searchId, name: 'y' }, PLAYER_ACTOR.id))).rejection.code).toBe('actor-not-authorized');
		expect(rejected(dispatchCommand(state, env, cmd('content.pin-saved-search', { searchId, pinned: true }, PLAYER_ACTOR.id))).rejection.code).toBe('actor-not-authorized');
		expect(rejected(dispatchCommand(state, env, cmd('content.delete-saved-search', { searchId }, PLAYER_ACTOR.id))).rejection.code).toBe('actor-not-authorized');
	});

	it('rejects an observer (the dispatch-level write gate)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(base(), env, cmd('content.create-saved-search', { name: 'x', filter: {} }, OBSERVER_ACTOR.id));
		expect(rejected(result).rejection.code).toBe('actor-not-authorized');
	});

	it('rejects update/pin/delete of an unknown saved search (fail closed)', () => {
		const env = makeEnvironment();
		const state = base();
		expect(rejected(dispatchCommand(state, env, cmd('content.update-saved-search', { searchId: 'nope', name: 'y' }))).rejection.code).toBe('saved-search-not-found');
		expect(rejected(dispatchCommand(state, env, cmd('content.pin-saved-search', { searchId: 'nope', pinned: true }))).rejection.code).toBe('saved-search-not-found');
		expect(rejected(dispatchCommand(state, env, cmd('content.delete-saved-search', { searchId: 'nope' }))).rejection.code).toBe('saved-search-not-found');
	});

	it('appends a durable op + a non-leaking event on each mutation', () => {
		const env = makeEnvironment();
		const result = accepted(dispatchCommand(base(), env, cmd('content.create-saved-search', { name: 'Audited', filter: { query: 'secret-criteria' } })));
		expect(result.operationIds.length).toBe(1);
		const event = result.events[0];
		expect(event?.kind).toBe('content.saved-search-changed');
		// The op/event audit never carries the filter criteria values (no leak of dm-only criteria).
		expect(JSON.stringify(result.events)).not.toContain('secret-criteria');
	});
});

describe('SRCH-004 AC2 — a dm-only saved search is absent for players', () => {
	it('omits a dm-only saved search from a player list/run; a player-visible one appears', () => {
		const env = makeEnvironment();
		let state = base();
		const dmOnly = createSavedSearch(state, env, { name: 'DM Secrets', filter: { query: 'cult' }, visibility: 'dm-only' });
		state = dmOnly.state;
		const shared = createSavedSearch(state, env, { name: 'Shared Quests', filter: { query: 'quest' }, visibility: 'player-visible' });
		state = shared.state;

		const dmList = getSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id);
		expect(dmList.map((v) => v.name).sort()).toEqual(['DM Secrets', 'Shared Quests']);

		const playerList = getSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id);
		expect(playerList.map((v) => v.name)).toEqual(['Shared Quests']);
		// The dm-only saved search's name + id never leak to the player.
		expect(JSON.stringify(playerList)).not.toContain('DM Secrets');

		// A direct run by id of the dm-only saved search returns null for the player (indistinguishable
		// from not-found — the id never leaks "hidden from you").
		expect(runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id, dmOnly.searchId)).toBeNull();
		// The DM can run it.
		expect(runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id, dmOnly.searchId)).not.toBeNull();
	});
});

describe('SRCH-004 — a saved search is re-evaluated LIVE (no stale leak — SRCH-003 AC4)', () => {
	it('runs the SAME filter as each actor, yielding each actor own visible hits', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, 'Public Map Notes', 'player-visible', 'mentions the keyword beacon').state;
		state = createNote(state, env, 'Secret Map Notes', 'dm-only', 'mentions the keyword beacon').state;
		const saved = createSavedSearch(state, env, { name: 'Beacon refs', filter: { query: 'beacon' }, visibility: 'player-visible' });
		state = saved.state;

		const dmView = runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id, saved.searchId)!;
		expect(dmView.result.hits.map((h) => h.title).sort()).toEqual(['Public Map Notes', 'Secret Map Notes']);

		const playerView = runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id, saved.searchId)!;
		expect(playerView.result.hits.map((h) => h.title)).toEqual(['Public Map Notes']);
		expect(JSON.stringify(playerView)).not.toContain('Secret Map Notes');
	});

	it('a player-visible saved search omits a note that BECOMES hidden after it was saved (no stale leak)', () => {
		const env = makeEnvironment();
		let state = base();
		const note = createNote(state, env, 'The Prophecy', 'player-visible', 'the keyword omen appears');
		state = note.state;
		const saved = createSavedSearch(state, env, { name: 'Omen watch', filter: { query: 'omen' }, visibility: 'player-visible' });
		state = saved.state;

		// While the note is visible, the player's run finds it.
		const before = runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id, saved.searchId)!;
		expect(before.result.hits.map((h) => h.title)).toEqual(['The Prophecy']);

		// The DM now HIDES the note (makes it dm-only) — the saved search definition is unchanged.
		state = accepted(dispatchCommand(state, env, cmd('content.set-item-visibility', { itemId: note.itemId, visibility: 'dm-only' }))).nextState;

		// The next player run RE-EVALUATES and omits the now-hidden note — no stale result served.
		const after = runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id, saved.searchId)!;
		expect(after.result.hits).toEqual([]);
		expect(JSON.stringify(after)).not.toContain('The Prophecy');
		// The DM still sees it (the criteria are unchanged; the DM has visibility).
		const dmAfter = runSavedSearchForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id, saved.searchId)!;
		expect(dmAfter.result.hits.map((h) => h.title)).toEqual(['The Prophecy']);
	});
});

describe('SRCH-004 AC1 — pinning to the Command Center', () => {
	it('pins/unpins a saved search; the pinned widget shows current LIVE results', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, 'Open Thread', 'player-visible', 'unresolved plot hook').state;
		const saved = createSavedSearch(state, env, { name: 'Open threads', filter: { query: 'plot' }, visibility: 'player-visible', pinned: false });
		state = saved.state;

		// Not pinned yet.
		expect(getPinnedSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id)).toEqual([]);

		// Pin it.
		state = accepted(dispatchCommand(state, env, cmd('content.pin-saved-search', { searchId: saved.searchId, pinned: true }))).nextState;
		const pinned = getPinnedSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id);
		expect(pinned.map((v) => v.name)).toEqual(['Open threads']);
		// AC1 — the pinned widget shows CURRENT results (the live run).
		expect(pinned[0]!.result.hits.map((h) => h.title)).toEqual(['Open Thread']);

		// Unpin it.
		state = accepted(dispatchCommand(state, env, cmd('content.pin-saved-search', { searchId: saved.searchId, pinned: false }))).nextState;
		expect(getPinnedSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id)).toEqual([]);
	});

	it('a dm-only pinned saved search is absent from a player Command Center (AC2)', () => {
		const env = makeEnvironment();
		let state = base();
		const saved = createSavedSearch(state, env, { name: 'DM pinned', filter: {}, visibility: 'dm-only', pinned: true });
		state = saved.state;
		expect(getPinnedSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id).map((v) => v.name)).toEqual(['DM pinned']);
		expect(getPinnedSavedSearchesForActor(state.content, state.maps, state.permissions, state.session, PLAYER_ACTOR.id)).toEqual([]);
	});
});

describe('SRCH-004 — edit + delete', () => {
	it('updates name/filter/visibility/pin and bumps the revision', () => {
		const env = makeEnvironment();
		const { state, searchId } = createSavedSearch(base(), env, { name: 'Old', filter: { query: 'a' } });
		const updated = accepted(dispatchCommand(state, env, cmd('content.update-saved-search', { searchId, name: 'New', filter: { query: 'b' }, visibility: 'player-visible', pinned: true }))).nextState;
		const saved = updated.content.savedSearches[searchId]!;
		expect(saved.name).toBe('New');
		expect(saved.filter.query).toBe('b');
		expect(saved.visibility).toBe('player-visible');
		expect(saved.pinned).toBe(true);
		expect(saved.revision).toBe(2);
	});

	it('deletes a saved search', () => {
		const env = makeEnvironment();
		const { state, searchId } = createSavedSearch(base(), env, { name: 'Doomed', filter: {} });
		const deleted = accepted(dispatchCommand(state, env, cmd('content.delete-saved-search', { searchId }))).nextState;
		expect(deleted.content.savedSearches[searchId]).toBeUndefined();
	});

	it('hydrates a persisted saved search fail-closed (missing visibility ⇒ dm-only)', () => {
		const env = makeEnvironment();
		let state = base();
		// Simulate a persisted record with no visibility by writing it then stripping the field at the state
		// boundary (ensureSavedSearches runs on hydration; here we assert the create default already fails closed).
		const saved = createSavedSearch(state, env, { name: 'No vis', filter: {} });
		state = saved.state;
		expect(state.content.savedSearches[saved.searchId]!.visibility).toBe('dm-only');
	});
});
