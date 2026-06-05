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
	dispatchCommand,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-011 — calendar-aware notes/structured objects: authorized-editor write authority (fail
 * closed), custom-date field/timeline-reference validation, per-item visibility filtering, and stable
 * cross-surface formatted dates. Tests are the primary evidence.
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

/** DM defines the demo calendar; returns the new state. */
function withCalendar(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS_PAYLOAD)))
		.nextState;
}

const dateOf = (month: number, day: number, year = 1372) => ({
	calendarId: 'cal-harptos',
	year,
	month,
	day,
});

describe('CONTENT-011: campaign calendar definition (authorized editor only)', () => {
	it('the DM defines a custom calendar and a durable op is appended', () => {
		const env = makeEnvironment();
		const result = accepted(dispatchCommand(base(), env, cmd('content.define-calendar', HARPTOS_PAYLOAD)));
		expect(result.nextState.content.calendars['cal-harptos']?.name).toBe('Calendar of Harptos');
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.define-calendar');
		expect(result.events[0]).toMatchObject({ kind: 'content.calendar-defined', calendarId: 'cal-harptos' });
	});

	it('fails closed: a player cannot define a calendar', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.define-calendar', HARPTOS_PAYLOAD, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('fails closed: an observer cannot define a calendar', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.define-calendar', HARPTOS_PAYLOAD, OBSERVER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a calendar with no months at the schema boundary', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.define-calendar', { ...HARPTOS_PAYLOAD, months: [] })),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});
});

describe('CONTENT-011: create calendar-aware content items (fail closed + date validation)', () => {
	it('the DM creates a dated note; visibility fails closed to dm-only', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'The Founding of Waterdeep',
					body: 'It began long ago.',
					dateFields: { foundedOn: dateOf(1, 1, 1) },
				}),
			),
		);
		const item = Object.values(result.nextState.content.items)[0]!;
		expect(item.kind).toBe('note');
		expect(item.visibility).toBe('dm-only');
		expect(item.dateFields.foundedOn).toEqual(dateOf(1, 1, 1));
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.create-item');
	});

	it('fails closed: a player with no grant cannot create a content item', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', { kind: 'note', title: 'Sneaky' }, PLAYER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a date in an unknown calendar (calendar-not-found)', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Bad date',
					dateFields: { when: { calendarId: 'cal-unknown', year: 1, month: 1, day: 1 } },
				}),
			),
		);
		expect(result.rejection.code).toBe('calendar-not-found');
	});

	it('rejects an out-of-range custom date (invalid-calendar-date)', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Impossible day',
					dateFields: { when: dateOf(2, 99) }, // Alturiak only has 28 days
				}),
			),
		);
		expect(result.rejection.code).toBe('invalid-calendar-date');
	});

	it('validates timeline-reference dates too', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Event',
					timelineRefs: [{ label: 'Battle', date: dateOf(4, 1) }], // no month 4
				}),
			),
		);
		expect(result.rejection.code).toBe('invalid-calendar-date');
	});
});

describe('CONTENT-011: authorized-editor edits on an existing item', () => {
	/** DM creates a note then grants PLAYER_ACTOR section-editor on it; returns state + item id. */
	function withGrantedEditor(): { state: CoreStateSlice; env: CoreEnvironment; itemId: string } {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', title: 'Lore' })),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('permission.grant-capability-set', {
					entityType: CONTENT_ITEM_ENTITY_TYPE,
					entityId: itemId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'section-editor',
				}),
			),
		).nextState;
		return { state, env, itemId };
	}

	it('a granted authorized editor may update the item', () => {
		const { state, env, itemId } = withGrantedEditor();
		const result = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.update-item', { itemId, body: 'Edited by an authorized player.' }, PLAYER_ACTOR.id),
			),
		);
		expect(result.nextState.content.items[itemId]!.body).toBe('Edited by an authorized player.');
		expect(result.nextState.content.items[itemId]!.revision).toBe(2);
	});

	it('fails closed: a DIFFERENT player without a grant cannot edit', () => {
		const { state, env, itemId } = withGrantedEditor();
		const result = rejected(
			dispatchCommand(state, env, cmd('content.update-item', { itemId, body: 'nope' }, PLAYER_B.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('updating a missing item is content-item-not-found', () => {
		const env = makeEnvironment();
		const state = withCalendar(base(), env);
		const result = rejected(
			dispatchCommand(state, env, cmd('content.update-item', { itemId: 'nope', body: 'x' })),
		);
		expect(result.rejection.code).toBe('content-item-not-found');
	});
});

describe('CONTENT-011: per-item visibility + cross-surface consistency (read path)', () => {
	/**
	 * DM defines the calendar and creates two dated notes: one dm-only ("Secret Plot") and one
	 * player-visible ("Public Festival"). Returns the state + the dm-only item id.
	 */
	function withTwoNotes(): { state: CoreStateSlice; env: CoreEnvironment; secretId: string } {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Secret Plot',
					dateFields: { occursOn: dateOf(2, 14) },
				}),
			),
		).nextState;
		const secretId = Object.values(state.content.items)[0]!.id;
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Public Festival',
					visibility: 'player-visible',
					dateFields: { occursOn: dateOf(1, 5) },
				}),
			),
		).nextState;
		return { state, env, secretId };
	}

	it('the DM sees both notes; a player sees only the player-visible one', () => {
		const { state } = withTwoNotes();
		const dmView = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id);
		const playerView = getContentItemsForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		expect(dmView.map((i) => i.title).sort()).toEqual(['Public Festival', 'Secret Plot']);
		expect(playerView.map((i) => i.title)).toEqual(['Public Festival']);
	});

	it('a dm-only dated note is OMITTED from the player calendar/timeline view (AC2)', () => {
		const { state } = withTwoNotes();
		const dmTimeline = getCalendarTimelineForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'cal-harptos',
		);
		const playerTimeline = getCalendarTimelineForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			'cal-harptos',
		);
		// DM timeline: both events, ordered by absolute day index (1-05 before 2-14).
		expect(dmTimeline.map((r) => r.title)).toEqual(['Public Festival', 'Secret Plot']);
		// Player timeline: the secret dated event is omitted entirely.
		expect(playerTimeline.map((r) => r.title)).toEqual(['Public Festival']);
	});

	it('renders the SAME stable formatted date across the item view and the timeline view (AC1)', () => {
		const { state } = withTwoNotes();
		const items = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id, 'medium');
		const timeline = getCalendarTimelineForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			'cal-harptos',
			'medium',
		);
		const secretItem = items.find((i) => i.title === 'Secret Plot')!;
		const secretRow = timeline.find((r) => r.title === 'Secret Plot')!;
		const occursOn = secretItem.dateFields.occursOn!;
		expect(occursOn.display).toBe('14 Alturiak 1372 DR');
		expect(occursOn.display).toBe(secretRow.date.display);
		expect(occursOn.isoLike).toBe('1372-02-14');
	});

	it('an unknown actor receives an empty content view (fail closed)', () => {
		const { state } = withTwoNotes();
		expect(getContentItemsForActor(state.content, state.permissions, 'ghost')).toEqual([]);
	});

	it('a shared note is delivered only to its sharedWith targets', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Whispered Rumor',
					visibility: 'shared',
					sharedWith: [PLAYER_ACTOR.id],
					dateFields: { heardOn: dateOf(3, 3) },
				}),
			),
		).nextState;
		const aView = getContentItemsForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		const bView = getContentItemsForActor(state.content, state.permissions, PLAYER_B.id);
		expect(aView.map((i) => i.title)).toEqual(['Whispered Rumor']);
		expect(bView).toEqual([]);
	});
});

describe('CONTENT-011: visibility change is the cross-surface invalidation trigger (AC2)', () => {
	it('reports the union of the previous and new delivery audiences', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-item', {
					kind: 'note',
					title: 'Reveal',
					visibility: 'shared',
					sharedWith: [PLAYER_ACTOR.id],
				}),
			),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		const result = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-item-visibility', {
					itemId,
					visibility: 'shared',
					sharedWith: [PLAYER_B.id],
				}),
			),
		);
		const event = result.events[0];
		expect(event).toMatchObject({ kind: 'content.item-changed', mutation: 'set-visibility' });
		if (event && event.kind === 'content.item-changed') {
			// Both the actor who LOST access (player A) and the one who GAINED it (player B) are invalidated.
			expect(new Set(event.invalidatedActorIds)).toEqual(new Set([PLAYER_ACTOR.id, PLAYER_B.id]));
		}
	});

	it('making an item player-visible invalidates all players (*)', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', title: 'Soon Public' })),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		const result = accepted(
			dispatchCommand(state, env, cmd('content.set-item-visibility', { itemId, visibility: 'player-visible' })),
		);
		const event = result.events[0];
		if (event && event.kind === 'content.item-changed') {
			expect(event.invalidatedActorIds).toContain('*');
		}
	});
});

describe('CONTENT-011: removal', () => {
	it('the DM removes an item (soft-delete) and a durable op is appended', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(state, env, cmd('content.create-item', { kind: 'object', title: 'Faction' })),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		const result = accepted(dispatchCommand(state, env, cmd('content.remove-item', { itemId })));
		// CONTENT-001: remove is a recoverable SOFT-DELETE — the record is tombstoned, not purged, and is
		// omitted from the actor-filtered read.
		expect(result.nextState.content.items[itemId]?.deletedAt).not.toBeNull();
		expect(
			getContentItemsForActor(result.nextState.content, result.nextState.permissions, DM_ACTOR.id),
		).toHaveLength(0);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.remove-item');
	});

	it('fails closed: a player without a grant cannot remove an item', () => {
		const env = makeEnvironment();
		let state = withCalendar(base(), env);
		state = accepted(
			dispatchCommand(state, env, cmd('content.create-item', { kind: 'note', title: 'Protected' })),
		).nextState;
		const itemId = Object.values(state.content.items)[0]!.id;
		const result = rejected(
			dispatchCommand(state, env, cmd('content.remove-item', { itemId }, PLAYER_ACTOR.id)),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
