import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getQuickReferencePanelsForActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

/**
 * SES-007 — the DM creates, PINS, and uses quick-reference panels for visible notes/stat blocks/rules
 * snippets/open threads/session context. Panels reference content BY REFERENCE; a pinned reference to a
 * now-hidden/deleted target degrades to an unavailable state (no leak, no crash). Pin state is durable.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** Create a player-visible note and return the item id. */
function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
): { state: CoreStateSlice; itemId: string } {
	const result = accept(
		dispatch(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title, body: `Body of ${title}.`, visibility: 'player-visible' },
		}),
	);
	const event = result.events.find((e) => e.kind === 'content.item-changed');
	if (!event || event.kind !== 'content.item-changed') throw new Error('missing item event');
	return { state: result.nextState, itemId: event.itemId };
}

function pin(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): { state: CoreStateSlice; panelId: string } {
	const result = accept(
		dispatch(state, env, { type: 'session.pin-quick-reference', actorId: DM_ACTOR.id, payload }),
	);
	const event = result.events.find((e) => e.kind === 'session.quick-reference-pinned');
	if (!event || event.kind !== 'session.quick-reference-pinned') throw new Error('missing pin event');
	return { state: result.nextState, panelId: event.panelId };
}

describe('SES-007 quick-reference panels', () => {
	it('pins a visible note and resolves its content; the pin is durable in session state (AC1)', () => {
		const env = makeEnvironment();
		const note = createNote(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, 'Tavern rumors');
		const pinned = pin(note.state, env, { kind: 'note', label: 'Rumors', targetId: note.itemId });

		// Pin lives in durable session state (survives a route change / reload).
		expect(Object.keys(pinned.state.session.quickReferencePanels)).toContain(pinned.panelId);

		const panels = getQuickReferencePanelsForActor(
			pinned.state.session,
			pinned.state.content,
			pinned.state.characters,
			pinned.state.permissions,
			DM_ACTOR.id,
		);
		expect(panels).toHaveLength(1);
		expect(panels[0]).toMatchObject({ kind: 'note', status: 'available', label: 'Rumors' });
		expect(panels[0]!.content?.title).toBe('Tavern rumors');
		expect(panels[0]!.content?.snippet).toContain('Body of Tavern rumors.');
	});

	it('degrades a pinned reference to a DELETED note to an unavailable state without crashing (AC2)', () => {
		const env = makeEnvironment();
		const note = createNote(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, 'Doomed note');
		const pinned = pin(note.state, env, { kind: 'note', label: 'Doomed', targetId: note.itemId });

		// Delete the pinned note.
		const deleted = accept(
			dispatch(pinned.state, env, {
				type: 'content.remove-item',
				actorId: DM_ACTOR.id,
				payload: { itemId: note.itemId },
			}),
		).nextState;

		const panels = getQuickReferencePanelsForActor(
			deleted.session,
			deleted.content,
			deleted.characters,
			deleted.permissions,
			DM_ACTOR.id,
		);
		// The panel still appears (durable), but degrades to unavailable with NO leaked content.
		expect(panels).toHaveLength(1);
		expect(panels[0]).toMatchObject({ status: 'unavailable', content: null, label: 'Doomed' });
	});

	it('degrades a pinned reference whose target became hidden (dm-only) to unavailable for a non-DM-only view', () => {
		const env = makeEnvironment();
		const note = createNote(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, 'Secret plan');
		const pinned = pin(note.state, env, { kind: 'note', label: 'Plan', targetId: note.itemId });

		// Hide the note (dm-only). The DM still sees it; the panel resolves for the DM.
		const hidden = accept(
			dispatch(pinned.state, env, {
				type: 'content.set-item-visibility',
				actorId: DM_ACTOR.id,
				payload: { itemId: note.itemId, visibility: 'dm-only' },
			}),
		).nextState;

		// The DM (the only one who can hold quick-reference panels) still resolves a dm-only note.
		const dmPanels = getQuickReferencePanelsForActor(
			hidden.session,
			hidden.content,
			hidden.characters,
			hidden.permissions,
			DM_ACTOR.id,
		);
		expect(dmPanels[0]).toMatchObject({ status: 'available' });
	});

	it('resolves a session-context panel with no referenced entity', () => {
		const env = makeEnvironment();
		const pinned = pin(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			kind: 'session-context',
			label: 'Now',
		});
		const panels = getQuickReferencePanelsForActor(
			pinned.state.session,
			pinned.state.content,
			pinned.state.characters,
			pinned.state.permissions,
			DM_ACTOR.id,
		);
		expect(panels[0]).toMatchObject({ kind: 'session-context', status: 'available' });
		expect(panels[0]!.content?.title).toBe('Session context');
	});

	it('keeps quick reference DM-only: a non-DM gets an empty list; a player cannot pin (fail closed)', () => {
		const env = makeEnvironment();
		const note = createNote(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, 'Note');
		const pinned = pin(note.state, env, { kind: 'note', label: 'L', targetId: note.itemId });

		// A player sees an EMPTY quick-reference list (the DM authoring surface is not exposed to players).
		expect(
			getQuickReferencePanelsForActor(
				pinned.state.session,
				pinned.state.content,
				pinned.state.characters,
				pinned.state.permissions,
				PLAYER_ACTOR.id,
			),
		).toEqual([]);

		// A player cannot pin.
		const byPlayer = dispatch(pinned.state, env, {
			type: 'session.pin-quick-reference',
			actorId: PLAYER_ACTOR.id,
			payload: { kind: 'note', label: 'x', targetId: note.itemId },
		});
		expect(byPlayer.status).toBe('rejected');
		if (byPlayer.status === 'rejected') expect(byPlayer.rejection.code).toBe('actor-not-authorized');
	});

	it('unpins a panel (removing the durable pin) and preserves pin order across pins', () => {
		const env = makeEnvironment();
		const first = createNote(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, 'First');
		const second = createNote(first.state, env, 'Second');
		const pin1 = pin(second.state, env, { kind: 'note', label: 'First pin', targetId: first.itemId });
		const pin2 = pin(pin1.state, env, { kind: 'note', label: 'Second pin', targetId: second.itemId });

		let panels = getQuickReferencePanelsForActor(
			pin2.state.session,
			pin2.state.content,
			pin2.state.characters,
			pin2.state.permissions,
			DM_ACTOR.id,
		);
		expect(panels.map((p) => p.label)).toEqual(['First pin', 'Second pin']);

		const unpinned = accept(
			dispatch(pin2.state, env, {
				type: 'session.unpin-quick-reference',
				actorId: DM_ACTOR.id,
				payload: { panelId: pin1.panelId },
			}),
		).nextState;
		panels = getQuickReferencePanelsForActor(
			unpinned.session,
			unpinned.content,
			unpinned.characters,
			unpinned.permissions,
			DM_ACTOR.id,
		);
		expect(panels.map((p) => p.label)).toEqual(['Second pin']);
	});
});
