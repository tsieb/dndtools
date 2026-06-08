import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getSearchIndexStatus,
	recordDomainMutation,
	searchVaultForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type SearchFilter,
} from '../src';
import { findNetworkDependencies } from '../src/sync/local-first';
import type {
	SessionDiceRoll,
	SessionHandout,
	SessionState,
} from '../src/state/session-state';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * SRCH-001 — FULL-TEXT SEARCH over the VISIBLE notes, objects, maps/POIs, HANDOUTS, and SESSION ARTIFACTS
 * from the cached LOCAL indexes. Tests are the primary evidence.
 *
 * The search composes the EXISTING actor-filtered reads (content CONTENT-011, maps MAP-018, handouts
 * SES-004, dice history SES-003), so a hidden artifact in ANY domain is never a candidate. These tests
 * prove: (AC1) visible results return from local indexes OFFLINE (zero network in the path); (AC1) the
 * EXPANDED domain set — handouts + session artifacts — is searchable; (AC2) a player searching a term that
 * exists ONLY in dm-only content gets no hit/snippet; (AC3) an accepted mutation updates the index
 * incrementally (the new content is searchable) while a behind background index marks the domain stale
 * before returning results.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, PLAYER_B, ...actors);
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
	input: { title: string; body?: string; visibility?: 'dm-only' | 'player-visible' | 'shared' },
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: input.title,
				body: input.body ?? `Body of ${input.title}`,
				visibility: input.visibility ?? 'player-visible',
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((i) => i.title === input.title);
	if (!item) throw new Error(`item ${input.title} not created`);
	return { state: result.nextState, itemId: item.id };
}

/** Build a SessionState carrying a handout + dice rolls directly (the search composes the filtered reads). */
function withSessionArtifacts(
	state: CoreStateSlice,
	options: { handouts?: SessionHandout[]; rolls?: SessionDiceRoll[] } = {},
): CoreStateSlice {
	const handouts: Record<string, SessionHandout> = {};
	for (const handout of options.handouts ?? []) handouts[handout.id] = handout;
	const session: SessionState = {
		...state.session,
		handouts,
		diceHistory: options.rolls ?? [],
	};
	return { ...state, session };
}

function handout(input: Partial<SessionHandout> & { id: string; title: string }): SessionHandout {
	return {
		id: input.id,
		kind: input.kind ?? 'handout',
		title: input.title,
		sections: input.sections ?? [],
		revealedSectionIds: input.revealedSectionIds ?? [],
		recipientActorIds: input.recipientActorIds ?? [],
		persistentRecipientActorIds: input.persistentRecipientActorIds ?? [],
		deliveries: input.deliveries ?? [],
		acknowledgements: input.acknowledgements ?? [],
		revocations: input.revocations ?? [],
		createdBy: input.createdBy ?? DM_ACTOR.id,
		createdAt: input.createdAt ?? '2026-06-03T12:00:01.000Z',
		updatedAt: input.updatedAt ?? '2026-06-03T12:00:01.000Z',
		revision: input.revision ?? 1,
	};
}

function roll(input: Partial<SessionDiceRoll> & { id: string }): SessionDiceRoll {
	return {
		id: input.id,
		actorId: input.actorId ?? DM_ACTOR.id,
		actorRole: input.actorRole,
		expression: input.expression ?? '1d20',
		total: input.total ?? 10,
		rolledAt: input.rolledAt ?? '2026-06-03T12:00:01.000Z',
		visibility: input.visibility,
		label: input.label,
		sharedWith: input.sharedWith,
	};
}

function search(state: CoreStateSlice, actorId: string, filter: SearchFilter) {
	return searchVaultForActor(state.content, state.maps, state.permissions, state.session, actorId, filter);
}

describe('SRCH-001 AC1 — visible results return from cached local indexes (offline)', () => {
	it('returns visible cached results with zero network dependency in the path', () => {
		const env = makeEnvironment();
		const state = createNote(base(), env, { title: 'Harbor Lore', body: 'The harbor glows.' }).state;
		const result = search(state, PLAYER_ACTOR.id, { query: 'harbor' });
		expect(result.hits.some((h) => h.title === 'Harbor Lore')).toBe(true);
		// The search input AND output carry no network handle — it resolves from local storage only.
		expect(findNetworkDependencies({ state: state.content, result })).toEqual([]);
	});

	it('searches HANDOUTS the actor may see (SRCH-001 expanded domain — handouts)', () => {
		let state = base();
		state = withSessionArtifacts(state, {
			handouts: [
				handout({
					id: 'h-recipient',
					title: 'Sealed Letter',
					recipientActorIds: [PLAYER_ACTOR.id],
					sections: [
						{ id: 's1', heading: 'Greeting', body: 'A cryptic riddle awaits.', visibility: 'player-visible' },
					],
				}),
			],
		});
		// The recipient finds the handout by title AND by visible-section body.
		const byTitle = search(state, PLAYER_ACTOR.id, { query: 'sealed', contentTypes: ['handout'] });
		expect(byTitle.hits.map((h) => h.title)).toEqual(['Sealed Letter']);
		expect(byTitle.hits[0]!.type).toBe('handout');
		const byBody = search(state, PLAYER_ACTOR.id, { query: 'riddle', contentTypes: ['handout'] });
		expect(byBody.hits.map((h) => h.id)).toEqual(['h-recipient']);
	});

	it('searches SESSION ARTIFACTS the actor may see (SRCH-001 expanded domain — recorded rolls)', () => {
		let state = base();
		state = withSessionArtifacts(state, {
			rolls: [
				roll({ id: 'r1', expression: '1d20+5', label: 'Perception check', visibility: 'session-visible' }),
			],
		});
		const byLabel = search(state, PLAYER_ACTOR.id, {
			query: 'perception',
			contentTypes: ['session-artifact'],
		});
		expect(byLabel.hits.map((h) => h.id)).toEqual(['r1']);
		expect(byLabel.hits[0]!.type).toBe('session-artifact');
		expect(byLabel.hits[0]!.title).toBe('Perception check');
	});
});

describe('SRCH-001 AC2 — a term present only in dm-only content yields no player hit/snippet', () => {
	it('a dm-only note term is never returned to a player (no hit, no snippet, no count)', () => {
		const env = makeEnvironment();
		let state = base();
		state = createNote(state, env, { title: 'Public Sign', body: 'Welcome traveler.' }).state;
		state = createNote(state, env, {
			title: 'Hidden Vault',
			body: 'The cabal hides a relic.',
			visibility: 'dm-only',
		}).state;

		const dm = search(state, DM_ACTOR.id, { query: 'cabal' });
		expect(dm.hits.map((h) => h.title)).toEqual(['Hidden Vault']);

		const player = search(state, PLAYER_ACTOR.id, { query: 'cabal' });
		expect(player.hits).toEqual([]);
		expect(player.totalCount).toBe(0);
		// The hidden note's TITLE/BODY never appears (the query term itself is the player's own echoed input).
		expect(JSON.stringify(player)).not.toContain('Hidden Vault');
		expect(JSON.stringify(player)).not.toContain('relic');
	});

	it('a dm-only handout section term never reaches a recipient nor a non-recipient', () => {
		let state = base();
		state = withSessionArtifacts(state, {
			handouts: [
				handout({
					id: 'h1',
					title: 'Field Report',
					recipientActorIds: [PLAYER_ACTOR.id],
					sections: [
						{ id: 'open', heading: 'Open', body: 'Routine patrol notes.', visibility: 'player-visible' },
						{ id: 'secret', heading: 'Secret', body: 'The informant is Garrick.', visibility: 'dm-only' },
					],
				}),
			],
		});
		// The DM matches the dm-only section term.
		expect(
			search(state, DM_ACTOR.id, { query: 'garrick', contentTypes: ['handout'] }).hits.map((h) => h.id),
		).toEqual(['h1']);
		// The RECIPIENT cannot match the dm-only section term (the section is withheld from them).
		const recipient = search(state, PLAYER_ACTOR.id, { query: 'garrick', contentTypes: ['handout'] });
		expect(recipient.hits).toEqual([]);
		expect(JSON.stringify(recipient)).not.toContain('Garrick');
		// A NON-recipient cannot match the handout at all (not even by title).
		const nonRecipient = search(state, PLAYER_B.id, { query: 'field', contentTypes: ['handout'] });
		expect(nonRecipient.hits).toEqual([]);
	});

	it('a dm-only (secret) recorded roll never matches for a non-DM', () => {
		let state = base();
		state = withSessionArtifacts(state, {
			rolls: [
				roll({ id: 'secret', expression: '1d20', label: 'Assassin ambush', visibility: 'dm-only' }),
				roll({ id: 'open', expression: '1d20', label: 'Open initiative', visibility: 'session-visible' }),
			],
		});
		const dm = search(state, DM_ACTOR.id, { query: 'assassin', contentTypes: ['session-artifact'] });
		expect(dm.hits.map((h) => h.id)).toEqual(['secret']);
		const player = search(state, PLAYER_ACTOR.id, {
			query: 'assassin',
			contentTypes: ['session-artifact'],
		});
		expect(player.hits).toEqual([]);
		expect(JSON.stringify(player)).not.toContain('Assassin');
	});
});

describe('SRCH-001 AC3 — an accepted mutation updates the index incrementally or marks it stale', () => {
	it('a newly-created note is immediately searchable (the index updates incrementally)', () => {
		const env = makeEnvironment();
		const before = search(base(), DM_ACTOR.id, { query: 'newly', contentTypes: ['note'] });
		expect(before.hits).toEqual([]);
		// Accept a content mutation; the new note is searchable in the very next read (live local index).
		const { state } = createNote(base(), env, { title: 'A Newly Found Map', body: 'Fresh ink.' });
		const after = search(state, DM_ACTOR.id, { query: 'newly', contentTypes: ['note'] });
		expect(after.hits.map((h) => h.title)).toEqual(['A Newly Found Map']);
	});

	it('a behind background index marks the affected domain STALE before returning results (fail closed)', () => {
		const env = makeEnvironment();
		const { state } = createNote(base(), env, { title: 'Indexed Note', body: 'present' });
		// The persisted index has NOT yet consumed the note mutation (background indexing is behind): the
		// indexed cursor is empty while the live source cursor reflects the accepted note. The note domain is
		// reported STALE — the cached results still return, but the freshness signals "possibly behind".
		const persisted = recordDomainMutation(undefined, 'note', 0, '2026-06-03T12:00:01.000Z');
		// Reset the note domain's INDEXED cursor to empty to model the index lagging the source.
		const lagging = {
			...persisted,
			domains: {
				...persisted.domains,
				note: {
					...persisted.domains.note,
					indexedCursor: { sequence: 0, revision: 0, updatedAt: null },
				},
			},
		};
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
		expect(status.anyStale).toBe(true);
		expect(status.staleDomains).toContain('note');
		// But the cached result is NOT blocked — search still returns the note.
		expect(search(state, DM_ACTOR.id, { query: 'indexed', contentTypes: ['note'] }).hits.length).toBe(1);
	});

	it('a newly-created map artifact (POI) is immediately searchable (incremental update for map artifacts)', () => {
		// AC3 explicitly covers "map artifact" — this test proves a new POI is searchable immediately
		// after its accepted mutation, just as a new note is (the search reads live state directly).
		const env = makeEnvironment();
		// The demo map has no 'Sentry Post' POI yet.
		const before = search(base(), DM_ACTOR.id, { query: 'sentry post', contentTypes: ['poi'] });
		expect(before.hits).toEqual([]);
		// Accept a map mutation; the new POI is searchable in the very next read (live local index).
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('map.create-poi', {
					mapId: 'map-western-reaches',
					layerId: 'layer-terrain',
					label: 'Sentry Post',
					category: 'landmark',
					position: { x: 0.4, y: 0.5 },
					visibility: 'player-visible',
					notes: 'A watchtower at the crossroads.',
				}),
			),
		);
		const after = search(result.nextState, DM_ACTOR.id, { query: 'sentry', contentTypes: ['poi'] });
		expect(after.hits.map((h) => h.title)).toContain('Sentry Post');
		expect(after.hits.find((h) => h.title === 'Sentry Post')!.type).toBe('poi');
	});

	it('a behind background index marks the poi domain STALE for map artifacts without blocking results', () => {
		// AC3 explicitly covers "map artifact" — this test proves a behind index marks the poi domain
		// stale while still returning the cached visible POIs (fail closed, never blocking).
		const state = base(); // demo map includes player-visible and dm-only POIs.
		// The persisted index has NOT yet consumed the poi mutations (background indexing behind):
		// the indexed cursor is empty while the live source cursor reflects the demo POIs.
		const persisted = recordDomainMutation(undefined, 'poi', 0, '2026-06-03T12:00:01.000Z');
		const lagging = {
			...persisted,
			domains: {
				...persisted.domains,
				poi: {
					...persisted.domains.poi,
					indexedCursor: { sequence: 0, revision: 0, updatedAt: null },
				},
			},
		};
		const status = getSearchIndexStatus(
			state.content,
			state.maps,
			state.permissions,
			state.session,
			DM_ACTOR.id,
			lagging,
		);
		const poi = status.domains.find((d) => d.domain === 'poi')!;
		expect(poi.status).toBe('stale');
		expect(status.anyStale).toBe(true);
		expect(status.staleDomains).toContain('poi');
		// But the cached result is NOT blocked — visible POIs still return (Harbor Town is player-visible).
		expect(search(state, DM_ACTOR.id, { query: 'harbor', contentTypes: ['poi'] }).hits.length).toBe(1);
	});
});
