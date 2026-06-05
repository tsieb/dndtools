import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getDiceHistoryForActor,
	rollExpression,
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
 * SES-003 / SES-008 — the shared dice COMMANDS. The roll outcome is computed once in the core from a
 * recorded seed (reproducible, never re-rolled), malformed expressions fail closed, visibility composes
 * with PERM (a secret roll is withheld from players), tables draw deterministically + are attributed,
 * and a recorded result appends to a note through the existing content write path. Tests are evidence.
 */

const PLAYER_2: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Player Two' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** Build an ACTIVE session (the gate every dice command requires) with the given participants. */
function activeSession(...actors: Actor[]): { state: CoreStateSlice; env: CoreEnvironment } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const homeSceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		}),
	).nextState;
	return { state: active, env };
}

/** Create a `dice-table` Vault Object (DM-authored). Returns its item id + the next state. */
function createDiceTable(
	state: CoreStateSlice,
	env: CoreEnvironment,
	dice: string,
	entries: string[],
): { state: CoreStateSlice; itemId: string } {
	const result = accept(
		dispatch(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'object',
				title: 'Wandering monsters',
				fields: { 'dndtools.objectSubtype': 'dice-table', dice, entries },
			},
		}),
	);
	const itemId = Object.keys(result.nextState.content.items).find(
		(id) => result.nextState.content.items[id]?.title === 'Wandering monsters',
	)!;
	return { state: result.nextState, itemId };
}

/** Create a plain note (DM-authored). */
function createNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	title: string,
	body = '',
): { state: CoreStateSlice; itemId: string } {
	const result = accept(
		dispatch(state, env, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title, body },
		}),
	);
	const itemId = Object.keys(result.nextState.content.items).find(
		(id) => result.nextState.content.items[id]?.title === title,
	)!;
	return { state: result.nextState, itemId };
}

describe('SES-003 dice.roll command', () => {
	it('records dice, kept values, modifier, total, actor, and timestamp for 2d20kh1+5 (AC1)', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '2d20kh1+5', seed: 'fixed-1' },
			}),
		);
		const [roll] = result.nextState.session.diceHistory;
		expect(roll).toBeDefined();
		if (!roll) return;
		expect(roll.actorId).toBe(DM_ACTOR.id);
		expect(roll.expression).toBe('2d20kh1+5');
		expect(roll.modifier).toBe(5);
		expect(roll.dice).toHaveLength(1); // only the kept die counts
		expect(roll.total).toBe((roll.kept?.[0] as number) + 5);
		expect(roll.rolledAt).toMatch(/^2026-/);
		expect(roll.seed).toBeTypeOf('number');
	});

	it('REPRODUCES the recorded result by replaying the stored seed (no re-roll) — Contract 2', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '3d6+2', seed: 'replay-seed' },
			}),
		);
		const roll = result.nextState.session.diceHistory[0]!;
		// Replaying the stored seed + expression yields the IDENTICAL total + dice.
		const replay = rollExpression(roll.expression, roll.seed!);
		expect(replay.ok).toBe(true);
		if (replay.ok) {
			expect(replay.result.total).toBe(roll.total);
			expect(replay.result.dice).toEqual(roll.dice);
		}
	});

	it('rejects a malformed expression fail-closed: no roll is recorded (AC2)', () => {
		const { state, env } = activeSession();
		const result = rejected(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '2d6++bad' },
			}),
		);
		expect(result.rejection.code).toBe('invalid-dice-expression');
		expect(result.nextState.session.diceHistory).toHaveLength(0);
	});

	it('requires an active session (fail closed otherwise)', () => {
		const env = makeEnvironment();
		const idle = buildInitialState(DM_ACTOR);
		const result = rejected(
			dispatch(idle, env, { type: 'dice.roll', actorId: DM_ACTOR.id, payload: { expression: '1d20' } }),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('a player may roll a session-visible roll (dice are player-safe)', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				payload: { expression: '1d20+3' },
			}),
		);
		expect(result.nextState.session.diceHistory[0]?.actorId).toBe(PLAYER_ACTOR.id);
	});

	it('resolves a macro reference before rolling; an unknown macro fails closed', () => {
		const { state, env } = activeSession();
		const ok = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: {
					expression: '@attack',
					asMacro: true,
					macros: [{ name: 'attack', expression: '1d20+5' }],
					seed: 's',
				},
			}),
		);
		expect(ok.nextState.session.diceHistory[0]?.expression).toBe('1d20+5');
		expect(ok.nextState.session.diceHistory[0]?.sourceKind).toBe('macro');

		const bad = rejected(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: 'nope', asMacro: true, macros: [] },
			}),
		);
		expect(bad.rejection.code).toBe('unknown-macro');
	});

	it('records an inline roll source kind', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d4', inline: true, seed: 'x' },
			}),
		);
		expect(result.nextState.session.diceHistory[0]?.sourceKind).toBe('inline');
	});
});

describe('SES-003 roll visibility composes with PERM (fail closed)', () => {
	it('a DM-only (secret) roll is omitted from a player history but visible to the DM (AC3)', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', visibility: 'dm-only', label: 'secret ambush', seed: 's' },
			}),
		);
		const next = result.nextState;
		const dmView = getDiceHistoryForActor(next.session, next.permissions, DM_ACTOR.id);
		expect(dmView.rolls).toHaveLength(1);
		expect(dmView.rolls[0]?.label).toBe('secret ambush');

		const playerView = getDiceHistoryForActor(next.session, next.permissions, PLAYER_ACTOR.id);
		// The hidden expression, values, total, and reason are OMITTED entirely (no leak).
		expect(playerView.rolls).toHaveLength(0);
		// The DM's hidden count surfaces; a player never sees the count.
		expect(dmView.hiddenCount).toBe(0);
		expect(playerView.hiddenCount).toBe(0);
	});

	it('a player cannot author a DM-only (secret) roll — fail closed', () => {
		const { state, env } = activeSession();
		const result = rejected(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				payload: { expression: '1d20', visibility: 'dm-only' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.session.diceHistory).toHaveLength(0);
	});

	it('a shared roll reaches only the listed participants; others do not see it (AC4)', () => {
		const { state, env } = activeSession(PLAYER_2);
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', visibility: 'shared', sharedWith: [PLAYER_ACTOR.id], seed: 's' },
			}),
		);
		const next = result.nextState;
		expect(getDiceHistoryForActor(next.session, next.permissions, PLAYER_ACTOR.id).rolls).toHaveLength(1);
		expect(getDiceHistoryForActor(next.session, next.permissions, PLAYER_2.id).rolls).toHaveLength(0);
		// The DM always sees it.
		expect(getDiceHistoryForActor(next.session, next.permissions, DM_ACTOR.id).rolls).toHaveLength(1);
	});

	it('the actor that rolled always sees their own roll', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				payload: { expression: '1d20', visibility: 'session-visible', seed: 's' },
			}),
		);
		const view = getDiceHistoryForActor(result.nextState.session, result.nextState.permissions, PLAYER_ACTOR.id);
		expect(view.rolls).toHaveLength(1);
		// A player never receives the recorded seed (DM-only audit field).
		expect(view.rolls[0]?.seed).toBeNull();
	});
});

describe('SES-008 rollable tables and append-to-notes', () => {
	it('draws a dice-table and records the roll + selected row in session history (AC1)', () => {
		const session = activeSession();
		const { state, itemId } = createDiceTable(session.state, session.env, '1d6', [
			'Goblins',
			'Merchant',
			'Storm',
			'Nothing',
			'Bandits',
			'Shrine',
		]);
		const result = accept(
			dispatch(state, session.env, {
				type: 'dice.roll-table',
				actorId: DM_ACTOR.id,
				payload: { tableItemId: itemId, seed: 'draw-1' },
			}),
		);
		const roll = result.nextState.session.diceHistory[0]!;
		expect(roll.sourceKind).toBe('table');
		expect(roll.tableItemId).toBe(itemId);
		expect(roll.tableRowNumber).toBe(roll.total);
		expect(roll.tableRowText).toBeTypeOf('string');
		// Attributed to the DM that drew it.
		expect(roll.actorId).toBe(DM_ACTOR.id);
	});

	it('rejects drawing a content item that is not a dice-table, and an unknown table', () => {
		const session = activeSession();
		const { state, itemId } = createNote(session.state, session.env, 'Plain note');
		const notTable = rejected(
			dispatch(state, session.env, {
				type: 'dice.roll-table',
				actorId: DM_ACTOR.id,
				payload: { tableItemId: itemId },
			}),
		);
		expect(notTable.rejection.code).toBe('not-a-dice-table');

		const missing = rejected(
			dispatch(state, session.env, {
				type: 'dice.roll-table',
				actorId: DM_ACTOR.id,
				payload: { tableItemId: 'no-such-item' },
			}),
		);
		expect(missing.rejection.code).toBe('content-item-not-found');
	});

	it('a player without a grant cannot draw a DM table (fail closed)', () => {
		const session = activeSession();
		const { state, itemId } = createDiceTable(session.state, session.env, '1d4', ['A', 'B', 'C', 'D']);
		const result = rejected(
			dispatch(state, session.env, {
				type: 'dice.roll-table',
				actorId: PLAYER_ACTOR.id,
				payload: { tableItemId: itemId },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('appends a generated result to a note through the content write path; note history records actor + source (AC2)', () => {
		const session = activeSession();
		const tableState = createDiceTable(session.state, session.env, '1d4', ['Coins', 'Gems', 'A ring', 'A map']);
		const noteState = createNote(tableState.state, session.env, 'Session log', 'Existing line.');
		// Draw the table.
		const drawn = accept(
			dispatch(noteState.state, session.env, {
				type: 'dice.roll-table',
				actorId: DM_ACTOR.id,
				payload: { tableItemId: tableState.itemId, seed: 'loot' },
			}),
		);
		const roll = drawn.nextState.session.diceHistory[0]!;
		const beforeRevision = drawn.nextState.content.items[noteState.itemId]!.revision;

		// Append the recorded result to the note.
		const appended = accept(
			dispatch(drawn.nextState, session.env, {
				type: 'dice.append-to-note',
				actorId: DM_ACTOR.id,
				payload: { rollId: roll.id, itemId: noteState.itemId },
			}),
		);
		const note = appended.nextState.content.items[noteState.itemId]!;
		// The append went through the content body (no clone of unrelated data) + bumped the revision.
		expect(note.body).toContain('Existing line.');
		expect(note.body).toContain(roll.tableRowText!);
		expect(note.revision).toBe(beforeRevision + 1);
		// Attribution: the roll records WHERE it was appended; the write was attributed to the DM op.
		const updatedRoll = appended.nextState.session.diceHistory.find((r) => r.id === roll.id)!;
		expect(updatedRoll.appendedToItemId).toBe(noteState.itemId);
		const op = appended.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('content.append-roll');
		expect(op.actorId).toBe(DM_ACTOR.id);
		expect((op.value as { rollId: string }).rollId).toBe(roll.id);
		// A content.item-changed event fires so dependent surfaces refresh.
		expect(appended.events.some((e) => e.kind === 'content.item-changed')).toBe(true);
	});

	it('rejects append for an unknown roll and an unauthorized editor (fail closed)', () => {
		const session = activeSession();
		const noteState = createNote(session.state, session.env, 'Notes');
		const unknownRoll = rejected(
			dispatch(noteState.state, session.env, {
				type: 'dice.append-to-note',
				actorId: DM_ACTOR.id,
				payload: { rollId: 'no-roll', itemId: noteState.itemId },
			}),
		);
		expect(unknownRoll.rejection.code).toBe('roll-not-found');

		// A player with no grant on the note cannot append even a roll they can see.
		const rolled = accept(
			dispatch(noteState.state, session.env, {
				type: 'dice.roll',
				actorId: PLAYER_ACTOR.id,
				payload: { expression: '1d6', seed: 's' },
			}),
		);
		const roll = rolled.nextState.session.diceHistory[0]!;
		const denied = rejected(
			dispatch(rolled.nextState, session.env, {
				type: 'dice.append-to-note',
				actorId: PLAYER_ACTOR.id,
				payload: { rollId: roll.id, itemId: noteState.itemId },
			}),
		);
		expect(denied.rejection.code).toBe('actor-not-authorized');
	});
});

describe('SES-003 the legacy session.record-dice command still records a minimal roll', () => {
	it('keeps the manual-total recorder working for session lifecycle tooling', () => {
		const { state, env } = activeSession();
		const result = accept(
			dispatch(state, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20+5', total: 18 },
			}),
		);
		const roll = result.nextState.session.diceHistory[0]!;
		expect(roll.total).toBe(18);
		// Hydrates to session-visible for the actor + DM (no recorded visibility ⇒ in-session default).
		const view = getDiceHistoryForActor(result.nextState.session, result.nextState.permissions, DM_ACTOR.id);
		expect(view.rolls).toHaveLength(1);
	});
});
