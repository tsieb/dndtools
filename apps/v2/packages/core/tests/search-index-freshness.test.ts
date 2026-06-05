import { describe, expect, it } from 'vitest';
import {
	catchUpDomainIndex,
	createDemoMapState,
	createEmptySearchIndex,
	dispatchCommand,
	domainFreshnessStatus,
	getSearchIndexStatus,
	observeDomainSourceCursor,
	publishDomainFreshness,
	recordDomainMutation,
	searchVaultForActor,
	setDomainAvailability,
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
 * SRCH-009 — the Search Engine PUBLISHES index FRESHNESS, the SOURCE CURSOR, and PARTIAL-RESULT status for
 * EACH searchable DOMAIN WITHOUT blocking visible cached results. Tests are the primary evidence.
 *
 * Two acceptance criteria:
 *   - AC1: when background indexing is INCOMPLETE, search returns cached visible results AND stale/partial
 *     status is exposed with the affected domains.
 *   - AC2: when a source cursor advances after sync and indexing completes, the freshness reflects the new
 *     cursor.
 *
 * The index model is fail-closed: an unproven/unavailable domain is `stale`/`unknown`, never `fresh`.
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

function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
	visibility: 'dm-only' | 'player-visible' = 'player-visible',
): CoreStateSlice {
	return accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', { kind: 'note', title, body: `Body of ${title}`, visibility }),
		),
	).nextState;
}

describe('SRCH-009 — the freshness primitives (the foundation)', () => {
	it('a freshly-built index over an empty domain is FRESH (nothing to be behind)', () => {
		const index = createEmptySearchIndex();
		expect(domainFreshnessStatus(index.domains.note)).toBe('fresh');
		const published = publishDomainFreshness(index.domains.note);
		expect(published.behindBy).toBe(0);
	});

	it('an observed-ahead source with no indexing makes the domain STALE; partial once indexing starts', () => {
		// The source advanced (a sync pulled changes) but the local index has consumed nothing ⇒ stale.
		let index = observeDomainSourceCursor(undefined, 'note', {
			sequence: 3,
			revision: 3,
			updatedAt: '2026-06-03T12:00:03.000Z',
		});
		expect(domainFreshnessStatus(index.domains.note)).toBe('stale');
		expect(publishDomainFreshness(index.domains.note).behindBy).toBe(3);

		// The index consumes SOME work but is still behind the source ⇒ partial (indexing in progress).
		index = recordDomainMutation(index, 'note', 1, '2026-06-03T12:00:01.000Z');
		// recordDomainMutation advances both cursors, so re-observe the source as still ahead.
		index = observeDomainSourceCursor(index, 'note', {
			sequence: 5,
			revision: 5,
			updatedAt: '2026-06-03T12:00:05.000Z',
		});
		expect(domainFreshnessStatus(index.domains.note)).toBe('partial');
	});

	it('catching up the index returns the domain to FRESH and reflects the new cursor (AC2)', () => {
		let index = observeDomainSourceCursor(undefined, 'handout', {
			sequence: 4,
			revision: 7,
			updatedAt: '2026-06-03T12:00:04.000Z',
		});
		expect(domainFreshnessStatus(index.domains.handout)).toBe('stale');
		index = catchUpDomainIndex(index, 'handout');
		const published = publishDomainFreshness(index.domains.handout);
		expect(published.status).toBe('fresh');
		// The freshness now reflects the advanced source cursor.
		expect(published.indexedCursor.sequence).toBe(4);
		expect(published.indexedCursor.revision).toBe(7);
		expect(published.behindBy).toBe(0);
	});

	it('an unavailable source forces STALE regardless of cursors (fail closed, without failing search)', () => {
		let index = recordDomainMutation(undefined, 'object', 2, '2026-06-03T12:00:02.000Z');
		expect(domainFreshnessStatus(index.domains.object)).toBe('fresh');
		index = setDomainAvailability(index, 'object', false);
		expect(domainFreshnessStatus(index.domains.object)).toBe('stale');
	});

	it('hydrating a missing/partial persisted index restores every domain to a safe baseline', () => {
		// A record persisted before this slice existed (undefined) restores fully, fresh + available.
		const fresh = getSearchIndexStatus(base().content, base().maps, base().permissions, base().session, DM_ACTOR.id);
		for (const domain of fresh.domains) expect(domain.status).not.toBe('partial');
	});
});

describe('SRCH-009 AC1 — incomplete indexing exposes stale/partial status with affected domains', () => {
	it('with the local store as the index, every visible domain is fresh and nothing is blocked', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, 'Visible Note');
		// No persisted index supplied ⇒ the local store IS the index (local-first) ⇒ fresh.
		const status = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
		);
		expect(status.anyStale).toBe(false);
		expect(status.staleDomains).toEqual([]);
		// And search still returns the cached visible note.
		expect(
			searchVaultForActor(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id, {
				query: 'visible',
				contentTypes: ['note'],
			}).hits.length,
		).toBe(1);
	});

	it('a behind persisted index reports the affected domain stale WITHOUT blocking cached results', () => {
		const env = makeEnvironment();
		let state = createNote(base(), env, 'Alpha');
		state = createNote(state, env, 'Beta');
		// The persisted index consumed nothing yet (background indexing has not run): note domain is behind.
		const lagging = createEmptySearchIndex();
		const status = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			lagging,
		);
		const note = status.domains.find((d) => d.domain === 'note')!;
		expect(note.status).toBe('stale');
		expect(note.behindBy).toBe(2);
		expect(status.staleDomains).toContain('note');
		// AC1 keystone: the cached results are NOT blocked.
		const results = searchVaultForActor(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			{ contentTypes: ['note'] },
		);
		expect(results.hits.map((h) => h.title).sort()).toEqual(['Alpha', 'Beta']);
	});
});

describe('SRCH-009 AC2 — the source cursor advances after sync; freshness reflects the new cursor', () => {
	it('a domain that catches up to the advanced source cursor becomes fresh again', () => {
		const env = makeEnvironment();
		let state = createNote(base(), env, 'One');
		// Index consumed the first note (sequence/revision 1). A new note arrives via sync (source advances).
		let index = recordDomainMutation(undefined, 'note', 1, '2026-06-03T12:00:01.000Z');
		state = createNote(state, env, 'Two');
		// The live source cursor now reflects TWO visible notes; the persisted index still reflects one.
		const behind = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			index,
		);
		const noteBehind = behind.domains.find((d) => d.domain === 'note')!;
		expect(noteBehind.status).toBe('partial'); // indexing in progress (consumed one of two)
		expect(noteBehind.behindBy).toBe(1);

		// Background indexing completes: the index consumes the second note.
		index = recordDomainMutation(index, 'note', 2, '2026-06-03T12:00:02.000Z');
		const caught = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			index,
		);
		const noteCaught = caught.domains.find((d) => d.domain === 'note')!;
		expect(noteCaught.status).toBe('fresh');
		expect(noteCaught.behindBy).toBe(0);
		expect(noteCaught.indexedCursor.sequence).toBe(2);
	});
});

describe('SRCH-009 — freshness is actor-scoped and fail-closed (no leak)', () => {
	it('a player freshness cursor reflects ONLY their visible artifacts (a hidden note never inflates it)', () => {
		const env = makeEnvironment();
		let state = createNote(base(), env, 'Shown', 'player-visible');
		state = createNote(state, env, 'Hidden', 'dm-only');
		const dm = getSearchIndexStatus(state.content, state.maps, state.permissions, state.session, DM_ACTOR.id);
		const player = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			PLAYER_ACTOR.id,
		);
		const dmNote = dm.domains.find((d) => d.domain === 'note')!;
		const playerNote = player.domains.find((d) => d.domain === 'note')!;
		// The DM's source cursor counts both notes; the player's counts only the visible one — the hidden
		// note never inflates the player's cursor (no leak through freshness metadata).
		expect(dmNote.sourceCursor.sequence).toBe(2);
		expect(playerNote.sourceCursor.sequence).toBe(1);
	});

	it('an unknown actor is denied: every domain unknown at the zero cursor (fail closed)', () => {
		const state = base();
		const status = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			'nobody',
		);
		expect(status.domains.every((d) => d.status === 'unknown')).toBe(true);
		expect(status.anyStale).toBe(false);
		expect(status.staleDomains).toEqual([]);
	});
});
