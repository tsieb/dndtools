import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getCalendarContextForActor,
	getCalendarContinuityForActor,
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
 * SES-012 — the DM maintains the campaign CALENDAR + custom-time state, LINKS dates to
 * notes/sessions/maps/events/handouts (BY REFERENCE), and the calendar context feeds prep/recap.
 *
 * Tests are the primary evidence:
 *   - a session date is stored in campaign-calendar terms AND renders in a stable canonical format (AC1),
 *   - links are BY REFERENCE (no clone) + actor-filtered + degrade-on-hidden/deleted (no leak),
 *   - the date validates against its custom calendar (fail closed), and
 *   - the calendar context partitions links into past/upcoming relative to the current campaign date.
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

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

const dateOf = (month: number, day: number, year = 1372) => ({
	calendarId: 'cal-harptos',
	year,
	month,
	day,
});

/** DM defines the demo calendar; returns the new state. */
function withCalendar(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS_PAYLOAD))).nextState;
}

/** DM creates a content item with a visibility; returns the new state + item id. */
function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
	visibility: 'dm-only' | 'player-visible' | 'shared',
): { state: CoreStateSlice; itemId: string } {
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', { kind: 'note', title, body: `Body of ${title}`, visibility }),
		),
	);
	const event = result.events.find((e) => e.kind === 'content.item-changed');
	if (!event || event.kind !== 'content.item-changed') throw new Error('missing item event');
	return { state: result.nextState, itemId: event.itemId };
}

describe('SES-012: campaign current date (custom-time state, AC1)', () => {
	it('stores a session date in campaign-calendar terms and renders a stable canonical format', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = accepted(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(2, 14) })),
		);

		// Stored in campaign calendar terms (the structural value), not a host date.
		expect(result.nextState.session.calendarContinuity.currentDate).toEqual(dateOf(2, 14));
		expect(result.nextState.session.calendarContinuity.dateRevision).toBe(1);
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('session.set-campaign-date');

		// Rendered in a stable canonical format (CONTENT-011 formatter, locale/clock independent).
		const view = getCalendarContinuityForActor(
			result.nextState.session,
			result.nextState.content,
			result.nextState.maps,
			result.nextState.permissions,
			DM_ACTOR.id,
		);
		expect(view.currentDate?.isoLike).toBe('1372-02-14');
		expect(view.currentDate?.display).toBe('14 Alturiak 1372 DR');
	});

	it('fails closed: an out-of-range date for its calendar is rejected (invalid-calendar-date)', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		// Alturiak (month 2) has only 28 days.
		const result = rejected(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(2, 30) })),
		);
		expect(result.rejection.code).toBe('invalid-calendar-date');
		expect(result.nextState.session.calendarContinuity.currentDate).toBeNull();
	});

	it('fails closed: a date in an unknown calendar is rejected (calendar-not-found)', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('session.set-campaign-date', { date: dateOf(1, 1) })),
		);
		expect(result.rejection.code).toBe('calendar-not-found');
	});

	it('fails closed: a player cannot set the campaign date', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(1, 1) }, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('SES-012: link dates to entities BY REFERENCE (actor-filtered, degrade-on-hidden)', () => {
	it('links a note to a date by reference (no clone) and resolves its live title for the DM', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const note = createNote(withCal, env, 'The Burning of Highmoor', 'player-visible');
		const linked = accepted(
			dispatchCommand(
				note.state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'note',
					label: 'Highmoor fire',
					date: dateOf(1, 5),
					targetId: note.itemId,
				}),
			),
		);

		// The durable link stores ONLY the reference (kind + target id + date) — no title/body copy.
		const links = Object.values(linked.nextState.session.calendarContinuity.links);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ kind: 'note', targetId: note.itemId, label: 'Highmoor fire' });
		expect(links[0]).not.toHaveProperty('title');
		const op = linked.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('session.link-calendar-date');
		// The op value carries the reference, not the target content.
		expect(op.value).toMatchObject({ kind: 'note', targetId: note.itemId });
		expect(JSON.stringify(op.value)).not.toContain('Body of');

		// The DM read resolves the LIVE target title.
		const view = getCalendarContinuityForActor(
			linked.nextState.session,
			linked.nextState.content,
			linked.nextState.maps,
			linked.nextState.permissions,
			DM_ACTOR.id,
		);
		expect(view.links[0]).toMatchObject({ status: 'available', targetTitle: 'The Burning of Highmoor' });
		expect(view.links[0]!.date.isoLike).toBe('1372-01-05');
	});

	it('degrades a link to a DELETED target to unavailable (no crash, no leak); the link still appears', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const note = createNote(withCal, env, 'Doomed event', 'player-visible');
		const linked = accepted(
			dispatchCommand(
				note.state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'note',
					label: 'Doomed',
					date: dateOf(1, 5),
					targetId: note.itemId,
				}),
			),
		);
		const deleted = accepted(
			dispatchCommand(linked.nextState, env, cmd('content.remove-item', { itemId: note.itemId })),
		).nextState;

		const view = getCalendarContinuityForActor(
			deleted.session,
			deleted.content,
			deleted.maps,
			deleted.permissions,
			DM_ACTOR.id,
		);
		// The link still appears (DM authored it + label), but degrades to unavailable with NO target title.
		expect(view.links).toHaveLength(1);
		expect(view.links[0]).toMatchObject({ status: 'unavailable', targetTitle: null, label: 'Doomed' });
	});

	it('degrades a link whose target is hidden (dm-only) to unavailable for a player (no leak)', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const note = createNote(withCal, env, 'Secret cabal', 'dm-only');
		const linked = accepted(
			dispatchCommand(
				note.state,
				env,
				cmd('session.link-calendar-date', {
					kind: 'note',
					label: 'Cabal',
					date: dateOf(1, 5),
					targetId: note.itemId,
				}),
			),
		).nextState;

		// The DM resolves it.
		const dmView = getCalendarContinuityForActor(
			linked.session,
			linked.content,
			linked.maps,
			linked.permissions,
			DM_ACTOR.id,
		);
		expect(dmView.links[0]).toMatchObject({ status: 'available', targetTitle: 'Secret cabal' });

		// The player sees the link (label + date) but degrades to unavailable — the dm-only title never leaks.
		const playerView = getCalendarContinuityForActor(
			linked.session,
			linked.content,
			linked.maps,
			linked.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerView.links).toHaveLength(1);
		expect(playerView.links[0]).toMatchObject({ status: 'unavailable', targetTitle: null });
		expect(JSON.stringify(playerView)).not.toContain('Secret cabal');
	});

	it('fails closed: a note link to a non-existent target is rejected (content-item-not-found)', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(
				withCal,
				env,
				cmd('session.link-calendar-date', {
					kind: 'note',
					label: 'Nope',
					date: dateOf(1, 1),
					targetId: 'does-not-exist',
				}),
			),
		);
		expect(result.rejection.code).toBe('content-item-not-found');
	});

	it('allows a bare dated session/event marker (no target id) and always resolves it as available', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const linked = accepted(
			dispatchCommand(
				withCal,
				env,
				cmd('session.link-calendar-date', { kind: 'event', label: 'Festival of the Moon', date: dateOf(3, 1) }),
			),
		).nextState;
		const view = getCalendarContinuityForActor(
			linked.session,
			linked.content,
			linked.maps,
			linked.permissions,
			PLAYER_ACTOR.id,
		);
		expect(view.links[0]).toMatchObject({ status: 'available', targetId: null, label: 'Festival of the Moon' });
	});

	it('unlinks a calendar link (removing the durable reference)', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const linked = accepted(
			dispatchCommand(
				withCal,
				env,
				cmd('session.link-calendar-date', { kind: 'event', label: 'Marker', date: dateOf(1, 1) }),
			),
		);
		const linkId = Object.keys(linked.nextState.session.calendarContinuity.links)[0]!;
		const unlinked = accepted(
			dispatchCommand(linked.nextState, env, cmd('session.unlink-calendar-date', { linkId })),
		).nextState;
		expect(Object.keys(unlinked.session.calendarContinuity.links)).toHaveLength(0);
	});

	it('fails closed: an unknown/unauthenticated actor gets an empty continuity view', () => {
		const env = makeEnvironment();
		const withCal = withCalendar(base(), env);
		const dated = accepted(
			dispatchCommand(withCal, env, cmd('session.set-campaign-date', { date: dateOf(1, 1) })),
		).nextState;
		const view = getCalendarContinuityForActor(
			dated.session,
			dated.content,
			dated.maps,
			dated.permissions,
			'ghost-actor',
		);
		expect(view).toEqual({ currentDate: null, links: [] });
	});
});

describe('SES-012: calendar context partitions links into past/upcoming around the current date', () => {
	it('orders links by date and splits at the current campaign date', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		// Three dated markers: before, on, and after the campaign date.
		for (const [label, m, d] of [
			['Past', 1, 5],
			['Today', 2, 14],
			['Future', 3, 1],
		] as const) {
			state = accepted(
				dispatchCommand(
					state,
					env,
					cmd('session.link-calendar-date', { kind: 'event', label, date: dateOf(m, d) }),
				),
			).nextState;
		}
		state = accepted(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(2, 14) })),
		).nextState;

		const context = getCalendarContextForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
		);
		expect(context.past.map((l) => l.label)).toEqual(['Past']);
		// On/after the current date is upcoming (inclusive of the current date).
		expect(context.upcoming.map((l) => l.label)).toEqual(['Today', 'Future']);
	});

	it('treats every link as upcoming when no current date is set (nothing has happened yet)', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', { kind: 'event', label: 'Anything', date: dateOf(1, 1) }),
			),
		).nextState;
		const context = getCalendarContextForActor(
			state.session,
			state.content,
			state.maps,
			state.permissions,
			DM_ACTOR.id,
		);
		expect(context.currentDate).toBeNull();
		expect(context.past).toHaveLength(0);
		expect(context.upcoming.map((l) => l.label)).toEqual(['Anything']);
	});
});

describe('SES-012: campaign calendar continuity persists across session resets', () => {
	it('keeps the current date + links when the session workflow resets (campaign-level, not live)', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(state, env, cmd('session.set-campaign-date', { date: dateOf(2, 14) })),
		).nextState;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('session.link-calendar-date', { kind: 'event', label: 'Marker', date: dateOf(1, 1) }),
			),
		).nextState;

		// Reset the session to idle (clears live fields). Campaign calendar continuity must survive.
		const reset = accepted(
			dispatchCommand(state, env, cmd('session.set-workflow', { workflow: 'idle' })),
		).nextState;
		expect(reset.session.calendarContinuity.currentDate).toEqual(dateOf(2, 14));
		expect(Object.keys(reset.session.calendarContinuity.links)).toHaveLength(1);
	});
});
