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
	searchCalendarTimeForActor,
	type Actor,
	type CalendarDiscoveryFilter,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type CustomDate,
} from '../src';

/**
 * SRCH-010 — CALENDAR / CUSTOM-TIME DISCOVERY: search and filter VISIBLE content by campaign calendar
 * dates, custom-time RANGES, timeline EVENTS, and session CHRONOLOGY. Tests are the primary evidence.
 *
 * The discovery surface is composed from the EXISTING actor-filtered reads, so the no-leak guarantees of
 * CONTENT-011 (dated notes) and SES-012 (calendar links) already hold; these tests prove that the
 * discovery layer (range filter, text match, ordering, counts) preserves them — a player never sees a
 * hidden dated event NOR a count that reveals its existence (AC2) — and that a visible event appears in
 * its range with stable formatting (AC1).
 */

const HARPTOS_PAYLOAD = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
		{ id: 'm3', name: 'Ches', days: 31 },
	],
	weekdays: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
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

/** Define the campaign calendar. */
function withCalendar(env: CoreEnvironment): CoreStateSlice {
	return accepted(dispatchCommand(base(), env, cmd('content.define-calendar', HARPTOS_PAYLOAD)))
		.nextState;
}

/** Create a dated content item with explicit visibility, returning the new state + the item id. */
function createDatedItem(
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
	const items = Object.values(result.nextState.content.items);
	const item = items.find((candidate) => candidate.title === title);
	if (!item) throw new Error(`item ${title} not created`);
	return { state: result.nextState, itemId: item.id };
}

const FILTER: CalendarDiscoveryFilter = { calendarId: 'cal-harptos' };

describe('SRCH-010 calendar/custom-time discovery', () => {
	it('returns an empty, calendar-less result for an unknown actor (fail closed)', () => {
		const env = makeEnvironment();
		const state = withCalendar(env);
		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			'nobody',
			FILTER,
		);
		expect(result.events).toEqual([]);
		expect(result.totalCount).toBe(0);
		expect(result.calendarKnown).toBe(true);
	});

	it('reports an unknown calendar without leaking (calendarKnown=false, empty)', () => {
		const env = makeEnvironment();
		const state = withCalendar(env);
		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			{ calendarId: 'cal-missing' },
		);
		expect(result.calendarKnown).toBe(false);
		expect(result.events).toEqual([]);
	});

	// AC1 — a visible event with a custom date appears when filtered by that date range, with stable formatting.
	it('AC1: a visible dated event appears in its range with stable date formatting', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Founding Day', dateOf(1, 5), 'player-visible').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos', range: { from: dateOf(1, 1), to: dateOf(1, 30) } },
			'long',
		);
		expect(result.events).toHaveLength(1);
		const event = result.events[0]!;
		expect(event.title).toBe('Founding Day');
		expect(event.source).toBe('content');
		// Stable formatting is the pure CONTENT-011 formatter — identical on every device/locale/clock.
		expect(event.date.isoLike).toBe('1372-01-05');
		expect(event.date.display).toBe('Fourth, 5 Hammer, 1372 DR');
	});

	it('AC1: an out-of-range visible event is excluded by the date-range filter', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Founding Day', dateOf(1, 5), 'player-visible').state;
		state = createDatedItem(state, env, 'Harvest', dateOf(3, 20), 'player-visible').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos', range: { from: dateOf(1, 1), to: dateOf(1, 30) } },
		);
		expect(result.events.map((event) => event.title)).toEqual(['Founding Day']);
	});

	it('range bounds are INCLUSIVE on both ends', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'On Lower Bound', dateOf(1, 1), 'player-visible').state;
		state = createDatedItem(state, env, 'On Upper Bound', dateOf(1, 30), 'player-visible').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos', range: { from: dateOf(1, 1), to: dateOf(1, 30) } },
		);
		expect(result.events.map((event) => event.title).sort()).toEqual([
			'On Lower Bound',
			'On Upper Bound',
		]);
	});

	it('an open range (null bounds) returns every visible dated event', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Early', dateOf(1, 5), 'player-visible').state;
		state = createDatedItem(state, env, 'Late', dateOf(3, 20), 'player-visible').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos', range: { from: null, to: null } },
		);
		expect(result.events.map((event) => event.title)).toEqual(['Early', 'Late']);
	});

	// AC2 — hidden events in the same range, AND counts that reveal them, are omitted/generalized for a player.
	it('AC2: a dm-only dated event in the range is omitted for a player AND never counted', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Public Festival', dateOf(1, 10), 'player-visible').state;
		state = createDatedItem(state, env, 'Secret Ritual', dateOf(1, 12), 'dm-only').state;

		const range = { calendarId: 'cal-harptos', range: { from: dateOf(1, 1), to: dateOf(1, 30) } };

		// The DM sees BOTH events.
		const dmResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			range,
		);
		expect(dmResult.events.map((event) => event.title)).toEqual([
			'Public Festival',
			'Secret Ritual',
		]);
		expect(dmResult.totalCount).toBe(2);

		// The player sees ONLY the visible event, and the count is NOT inflated by the hidden one.
		const playerResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			range,
		);
		expect(playerResult.events.map((event) => event.title)).toEqual(['Public Festival']);
		expect(playerResult.totalCount).toBe(1);
		expect(playerResult.countsBySource.content).toBe(1);
		// No event id, title, or count reveals the hidden ritual.
		expect(JSON.stringify(playerResult)).not.toContain('Secret Ritual');
	});

	it('AC2: an observer sees only player-visible events and no hidden count', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Public Festival', dateOf(1, 10), 'player-visible').state;
		state = createDatedItem(state, env, 'Secret Ritual', dateOf(1, 12), 'dm-only').state;
		state = createDatedItem(state, env, 'Shared Note', dateOf(1, 14), 'shared').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			OBSERVER_ACTOR.id,
			{ calendarId: 'cal-harptos' },
		);
		// player-visible reaches observers; dm-only and an un-targeted shared note do not.
		expect(result.events.map((event) => event.title)).toEqual(['Public Festival']);
		expect(result.totalCount).toBe(1);
	});

	it('composes campaign TIMELINE-LINK events (SES-012) and includes a visible link', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		// A bare dated event marker (no concrete target) — always available, DM-authored label is safe.
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'event',
					label: 'Festival of the Moon',
					date: dateOf(2, 1),
				}),
			),
		).nextState;

		const playerResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos' },
		);
		const linkEvents = playerResult.events.filter((event) => event.source === 'timeline-link');
		expect(linkEvents.map((event) => event.title)).toEqual(['Festival of the Moon']);
		expect(playerResult.countsBySource['timeline-link']).toBe(1);
	});

	it('a timeline link to a HIDDEN content target never exposes the target title (no leak)', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		const created = createDatedItem(state, env, 'Hidden Lore', dateOf(2, 5), 'dm-only');
		state = created.state;
		// Link the campaign date to the hidden note: the link's own DM-authored label is the only text shown.
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'note',
					label: 'See the records',
					date: dateOf(2, 5),
					targetId: created.itemId,
				}),
			),
		).nextState;

		const playerResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos' },
		);
		// The hidden note is omitted from `content`; the link surfaces ONLY its DM-authored label.
		expect(playerResult.events.map((event) => event.title)).toEqual(['See the records']);
		expect(JSON.stringify(playerResult)).not.toContain('Hidden Lore');
	});

	it('SESSION CHRONOLOGY is DM-only: a player never gets an archive row from search', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		// Set the campaign date, then archive a session against it (the continuity thread).
		state = accepted(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(1, 1) })),
		).nextState;
		// Inject an archive snapshot directly (the chronology source) anchored to the campaign date.
		const archiveId = 'archive-session-1';
		state = {
			...state,
			session: {
				...state.session,
				archives: {
					[archiveId]: {
						id: archiveId,
						archivedBy: DM_ACTOR.id,
						archivedAt: '2026-06-03T12:00:00.000Z',
						workflowBeforeArchive: 'recap',
						activeSceneId: null,
						activeMap: null,
						combat: state.session.combat,
						diceHistory: [],
						timers: {},
						playerViewAssignments: {},
						activeMapProjections: {},
						handouts: {},
						quickReferencePanels: {},
					},
				},
			},
		};

		const dmResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			{ calendarId: 'cal-harptos' },
		);
		expect(dmResult.events.some((event) => event.source === 'session')).toBe(true);
		expect(dmResult.countsBySource.session).toBe(1);

		const playerResult = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos' },
		);
		expect(playerResult.events.some((event) => event.source === 'session')).toBe(false);
		expect(playerResult.countsBySource.session).toBe(0);
	});

	it('a TEXT query filters by visible title (case-insensitive substring)', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'Founding Day', dateOf(1, 5), 'player-visible').state;
		state = createDatedItem(state, env, 'Harvest Feast', dateOf(3, 20), 'player-visible').state;

		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			PLAYER_ACTOR.id,
			{ calendarId: 'cal-harptos', query: 'feast' },
		);
		expect(result.events.map((event) => event.title)).toEqual(['Harvest Feast']);
	});

	it('the `sources` selector narrows which sources contribute', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		state = createDatedItem(state, env, 'A Note', dateOf(1, 5), 'player-visible').state;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', { kind: 'event', label: 'A Link', date: dateOf(1, 6) }),
			),
		).nextState;

		const onlyContent = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			{ calendarId: 'cal-harptos', sources: ['content'] },
		);
		expect(onlyContent.events.map((event) => event.source)).toEqual(['content']);
	});

	it('orders events deterministically by date, then source, then id (stable tie-break)', () => {
		const env = makeEnvironment();
		let state = withCalendar(env);
		// Two events on the SAME date from different sources — ordering must be stable and reproducible.
		state = createDatedItem(state, env, 'Same-Day Note', dateOf(2, 10), 'player-visible').state;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'event',
					label: 'Same-Day Link',
					date: dateOf(2, 10),
				}),
			),
		).nextState;
		state = createDatedItem(state, env, 'Earlier Note', dateOf(1, 1), 'player-visible').state;

		const runOnce = () =>
			searchCalendarTimeForActor(
				state.session,
				state.content,
				state.maps,
				state.permissions,
				DM_ACTOR.id,
				{ calendarId: 'cal-harptos' },
			).events.map((event) => `${event.source}:${event.title}`);

		const expected = [
			'content:Earlier Note',
			// CALENDAR_EVENT_SOURCES order puts `content` before `timeline-link` on an equal date.
			'content:Same-Day Note',
			'timeline-link:Same-Day Link',
		];
		expect(runOnce()).toEqual(expected);
		expect(runOnce()).toEqual(expected); // repeated runs are identical
	});

	it('echoes the applied range with stable formatted bounds', () => {
		const env = makeEnvironment();
		const state = withCalendar(env);
		const result = searchCalendarTimeForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
			{ calendarId: 'cal-harptos', range: { from: dateOf(1, 1), to: dateOf(2, 14) } },
			'iso-like',
		);
		expect(result.appliedRange?.from?.isoLike).toBe('1372-01-01');
		expect(result.appliedRange?.to?.isoLike).toBe('1372-02-14');
	});
});
