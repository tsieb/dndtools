import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
	sequentialIds,
} from '../src/testing/fixtures';
import {
	buildDateGraphIndex,
	dispatchCommand,
	getDateGraphIndexForActor,
	getDateRelationshipsForActor,
	relatedDatesForEntity,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type CustomDate,
	type DateIndexEntry,
} from '../src';

/**
 * GRAPH-009 — the Graph Engine indexes CALENDAR / CUSTOM-TIME references and exposes the date RELATIONSHIPS
 * through the SAME visibility-filtered graph API, ACTOR-FILTERED and fail-closed. Tests are the primary
 * evidence: both the pure index engine and the actor-filtered query path are covered, including the
 * hidden-calendar-linked-event non-leak (AC2) and DETERMINISM across fresh fixtures whose ids differ.
 */

const HARPTOS_PAYLOAD = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
		{ id: 'm3', name: 'Ches', days: 31 },
	],
	epochLabel: 'DR',
};

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function dateOf(month: number, day: number, year = 1372): CustomDate {
	return { calendarId: 'cal-harptos', year, month, day };
}

function withCalendar(env: CoreEnvironment): CoreStateSlice {
	return accepted(dispatchCommand(base(), env, cmd('content.define-calendar', HARPTOS_PAYLOAD)))
		.nextState;
}

function createDatedNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
	date: CustomDate,
	visibility: 'dm-only' | 'player-visible' | 'shared',
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title,
				body: `Body of ${title}`,
				visibility,
				dateFields: { occursOn: date },
			}),
		),
	);
	const item = Object.values(result.nextState.content.items).find((c) => c.title === title);
	if (!item) throw new Error(`item ${title} not created`);
	return { state: result.nextState, itemId: item.id };
}

function entry(
	overrides: Partial<DateIndexEntry> & Pick<DateIndexEntry, 'entityId' | 'title' | 'isoLike'>,
): DateIndexEntry {
	return {
		kind: 'content',
		calendarId: 'cal-harptos',
		absoluteDayIndex: 0,
		display: overrides.isoLike,
		targetId: null,
		...overrides,
	};
}

// --- The PURE index engine (deterministic functions of explicit entries) ------------------------------

describe('GRAPH-009 — pure engine: same-date + timeline-reference edges', () => {
	it('builds a SAME-DATE edge between two visible entities sharing a calendar date', () => {
		const index = buildDateGraphIndex([
			entry({ entityId: 'n-a', title: 'A', isoLike: '1372-01-05', absoluteDayIndex: 64 }),
			entry({ entityId: 'n-b', title: 'B', isoLike: '1372-01-05', absoluteDayIndex: 64 }),
			entry({ entityId: 'n-c', title: 'C', isoLike: '1372-02-01', absoluteDayIndex: 90 }),
		]);
		const sameDate = index.edges.filter((e) => e.kind === 'same-date');
		expect(sameDate).toHaveLength(1);
		expect(sameDate[0]).toMatchObject({ fromId: 'n-a', toId: 'n-b', isoLike: '1372-01-05' });
	});

	it('builds a TIMELINE-REFERENCE edge to a resolved visible target, and NONE to an absent target', () => {
		const index = buildDateGraphIndex([
			entry({ entityId: 'ref-1', title: 'Ref', isoLike: '1372-01-05', targetId: 'event-1' }),
			entry({ entityId: 'event-1', title: 'Event', isoLike: '1372-01-05' }),
			// A reference whose target is NOT in the visible index ⇒ no edge (fail closed).
			entry({ entityId: 'ref-2', title: 'Dangling', isoLike: '1372-02-01', targetId: 'event-hidden' }),
		]);
		const refEdges = index.edges.filter((e) => e.kind === 'timeline-reference');
		expect(refEdges).toHaveLength(1);
		expect(refEdges[0]).toMatchObject({ fromId: 'ref-1', toId: 'event-1' });
	});

	it('relatedDatesForEntity returns the same-date + reference neighbours of one entity', () => {
		const index = buildDateGraphIndex([
			entry({ entityId: 'n-a', title: 'A', isoLike: '1372-01-05', absoluteDayIndex: 64 }),
			entry({ entityId: 'n-b', title: 'B', isoLike: '1372-01-05', absoluteDayIndex: 64 }),
			entry({ entityId: 'ref-1', title: 'Ref', isoLike: '1372-01-05', absoluteDayIndex: 64, targetId: 'n-a' }),
		]);
		const rel = relatedDatesForEntity(index, 'n-a');
		expect(rel.node?.entityId).toBe('n-a');
		expect(rel.sameDate.map((n) => n.entityId).sort()).toEqual(['n-b', 'ref-1']);
		expect(rel.referencedBy.map((n) => n.entityId)).toEqual(['ref-1']);
	});

	it('an entity absent from the index yields the generic empty relationships (fail closed)', () => {
		const index = buildDateGraphIndex([entry({ entityId: 'n-a', title: 'A', isoLike: '1372-01-05' })]);
		expect(relatedDatesForEntity(index, 'n-missing')).toEqual({
			node: null,
			sameDate: [],
			references: [],
			referencedBy: [],
		});
	});
});

// --- The ACTOR-FILTERED query (CONTENT-011 + SES-012 composition) -------------------------------------

describe('GRAPH-009 — actor-filtered: visible date relationships are queryable (AC1)', () => {
	const env = makeEnvironment();

	it('two visible notes sharing a date are related through the graph API', () => {
		let state = withCalendar(env);
		const a = createDatedNote(state, env, 'Festival', dateOf(1, 5), 'player-visible');
		state = a.state;
		const b = createDatedNote(state, env, 'Market Day', dateOf(1, 5), 'player-visible');
		state = b.state;

		const rel = getDateRelationshipsForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			a.itemId,
		);
		expect(rel.node?.entityId).toBe(a.itemId);
		expect(rel.sameDate.map((n) => n.entityId)).toEqual([b.itemId]);
		// Stable date formatting (CONTENT-011): the shared date renders through the pure calendar formatter.
		expect(rel.node?.isoLike).toBe('1372-01-05');
	});
});

describe('GRAPH-009 — actor-filtered: a hidden calendar-linked event + its edge are absent (AC2)', () => {
	const env = makeEnvironment();

	it('a player cannot see a dm-only dated event, nor a same-date edge to it', () => {
		let state = withCalendar(env);
		const visible = createDatedNote(state, env, 'Public Fair', dateOf(2, 10), 'player-visible');
		state = visible.state;
		const hidden = createDatedNote(state, env, 'Secret Ritual', dateOf(2, 10), 'dm-only');
		state = hidden.state;

		// For the PLAYER: the dm-only event is omitted from the index, and there is NO edge to it.
		const playerIndex = getDateGraphIndexForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerIndex.nodes.map((n) => n.entityId)).not.toContain(hidden.itemId);
		expect(
			playerIndex.edges.some((e) => e.fromId === hidden.itemId || e.toId === hidden.itemId),
		).toBe(false);
		const playerRel = getDateRelationshipsForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			visible.itemId,
		);
		expect(playerRel.sameDate).toEqual([]); // the hidden same-date neighbour is absent

		// For the DM: both events are present and a same-date edge links them.
		const dmRel = getDateRelationshipsForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			visible.itemId,
		);
		expect(dmRel.sameDate.map((n) => n.entityId)).toEqual([hidden.itemId]);
	});

	it('querying a hidden event directly returns the generic empty relationships (no probe of a hidden node)', () => {
		let state = withCalendar(env);
		const hidden = createDatedNote(state, env, 'Hidden Eclipse', dateOf(3, 1), 'dm-only');
		state = hidden.state;
		const playerRel = getDateRelationshipsForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			hidden.itemId,
		);
		expect(playerRel).toEqual({ node: null, sameDate: [], references: [], referencedBy: [] });
	});

	it('an unknown actor gets the empty index (fail closed)', () => {
		const env2 = makeEnvironment();
		let state = withCalendar(env2);
		state = createDatedNote(state, env2, 'A', dateOf(1, 1), 'player-visible').state;
		const index = getDateGraphIndexForActor(
			state.content,
			state.session,
			state.maps,
			state.permissions,
			'ghost-actor',
		);
		expect(index.nodes).toEqual([]);
		expect(index.edges).toEqual([]);
	});
});

describe('GRAPH-009 — DETERMINISM (stable across fresh fixtures + repeated runs)', () => {
	it('produces a structurally-identical index across fresh fixtures whose ids differ', () => {
		const build = (): CoreStateSlice => {
			const e = makeEnvironment({ ids: sequentialIds(`run-${Math.random()}`) });
			let state = withCalendar(e);
			state = createDatedNote(state, e, 'Festival', dateOf(1, 5), 'player-visible').state;
			state = createDatedNote(state, e, 'Market Day', dateOf(1, 5), 'player-visible').state;
			state = createDatedNote(state, e, 'Later Event', dateOf(2, 1), 'player-visible').state;
			return state;
		};
		const fingerprint = (state: CoreStateSlice): string => {
			const index = getDateGraphIndexForActor(
				state.content,
				state.session,
				state.maps,
				state.permissions,
				PLAYER_ACTOR.id,
			);
			// Normalize volatile ids to stable content titles for the structural fingerprint.
			const titleById = new Map(index.nodes.map((n) => [n.entityId, n.title]));
			return JSON.stringify({
				nodes: index.nodes.map((n) => `${n.title}@${n.isoLike}`),
				edges: index.edges.map(
					(e) => `${e.kind}:${titleById.get(e.fromId)}->${titleById.get(e.toId)}@${e.isoLike}`,
				),
			});
		};
		expect(fingerprint(build())).toBe(fingerprint(build()));
	});
});
