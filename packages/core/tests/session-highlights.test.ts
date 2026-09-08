import { describe, expect, it } from 'vitest';
import {
	SESSION_HIGHLIGHTS_SUBTYPE,
	VAULT_OBJECT_SUBTYPE_KEY,
	composeSessionHighlightsMarkdown,
	dispatchCommand,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	isEmptyHighlightsCompile,
	resolveVaultObjectSchema,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-CHR-4.2 — HIGHLIGHT COMPILATION. `session.compile-highlights` (DM-only) gathers every character's
 * `session-highlight` journal entries into one shared, player-visible "Session highlights" note. An
 * optional `occurred` date (DM pin-to-timeline) places it on the Campaign timeline, exactly as
 * RC-SES-4.1's session-log note does.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

const HARPTOS = {
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm1', name: 'Hammer', days: 30 },
		{ id: 'm2', name: 'Alturiak', days: 28 },
	],
	epochLabel: 'DR',
};

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status, result.status === 'rejected' ? result.rejection.message : '').toBe(
		'accepted',
	);
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** Two DM-created characters, each with one `session-highlight` journal entry. */
function withTwoHighlights(): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	seraId: string;
	calId: string;
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B);
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('character.quick-create', {
				kind: 'sidekick',
				name: 'Sera',
				visibility: 'player-visible',
				combat: { hp: 10, maxHp: 10, ac: 12 },
			}),
		),
	).nextState;
	const seraId = Object.values(state.characters.characters).find((c) => c.name === 'Sera')!.id;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('character.quick-create', {
				kind: 'sidekick',
				name: 'Cal',
				visibility: 'player-visible',
				combat: { hp: 10, maxHp: 10, ac: 12 },
			}),
		),
	).nextState;
	const calId = Object.values(state.characters.characters).find((c) => c.name === 'Cal')!.id;

	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('character.add-journal-entry', {
				characterId: seraId,
				kind: 'session-highlight',
				title: 'Boss defeated',
				body: 'Sera landed the final blow on the drowned lich.',
			}),
		),
	).nextState;
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('character.add-journal-entry', {
				characterId: calId,
				kind: 'session-highlight',
				title: 'Clutch heal',
				body: 'Cal healed the party back from the brink.',
			}),
		),
	).nextState;
	// A non-highlight entry must never leak into the compile.
	state = accepted(
		dispatchCommand(
			state,
			env,
			cmd('character.add-journal-entry', {
				characterId: seraId,
				kind: 'note',
				title: 'Shopping list',
				body: 'Buy more rope.',
			}),
		),
	).nextState;

	return { state, env, seraId, calId };
}

describe('RC-CHR-4.2 — composing the compile (pure)', () => {
	it('omits a character with no highlights rather than rendering an empty heading', () => {
		const markdown = composeSessionHighlightsMarkdown([
			{
				characterId: 'a',
				characterName: 'Sera',
				highlights: [{ title: 'Boss defeated', body: 'The finishing blow.' }],
			},
			{ characterId: 'b', characterName: 'Cal', highlights: [] },
		]);
		expect(markdown).toBe('## Sera\n\n- **Boss defeated** — The finishing blow.');
	});

	it('a title-less highlight renders as a plain bullet', () => {
		const markdown = composeSessionHighlightsMarkdown([
			{
				characterId: 'a',
				characterName: 'Sera',
				highlights: [{ title: '', body: 'Rolled a natural 20.' }],
			},
		]);
		expect(markdown).toBe('## Sera\n\n- Rolled a natural 20.');
	});

	it('an all-empty compile is empty', () => {
		expect(
			isEmptyHighlightsCompile([
				{ characterId: 'a', characterName: 'Sera', highlights: [] },
				{ characterId: 'b', characterName: 'Cal', highlights: [] },
			]),
		).toBe(true);
	});
});

describe('RC-CHR-4.2 — session.compile-highlights', () => {
	it('is a registered vault-object subtype', () => {
		const schema = resolveVaultObjectSchema(SESSION_HIGHLIGHTS_SUBTYPE);
		expect(schema?.subtype).toBe('session-highlights');
		expect(schema?.defaultVisibility).toBe('dm-only');
	});

	it('a player cannot compile (DM-only, fail closed)', () => {
		const { state, env } = withTwoHighlights();
		const result = dispatchCommand(
			state,
			env,
			cmd('session.compile-highlights', {}, PLAYER_ACTOR.id),
		);
		expect(result.status).toBe('rejected');
	});

	it('rejects when no character has recorded a highlight yet', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const result = dispatchCommand(state, env, cmd('session.compile-highlights', {}));
		expect(result.status).toBe('rejected');
	});

	it('compiles every contributing character into one player-visible note, dropping non-highlight entries', () => {
		const { state, env, seraId, calId } = withTwoHighlights();
		const next = accepted(
			dispatchCommand(state, env, cmd('session.compile-highlights', {})),
		).nextState;

		const forDm = getContentItemsForActor(next.content, next.permissions, DM_ACTOR.id);
		const note = forDm.find(
			(n) => n.fields[VAULT_OBJECT_SUBTYPE_KEY] === SESSION_HIGHLIGHTS_SUBTYPE,
		)!;
		expect(note.title).toBe('Session highlights');
		expect(note.visibility).toBe('player-visible');
		expect(note.body).toContain('## Sera');
		expect(note.body).toContain('Boss defeated');
		expect(note.body).toContain('## Cal');
		expect(note.body).toContain('Clutch heal');
		expect(note.body).not.toContain('Shopping list');
		expect(note.fields.highlightCount).toBe(2);
		expect(new Set(note.fields.characterIds as string[])).toEqual(new Set([seraId, calId]));

		// player-visible ⇒ every player sees it too, not just the DM.
		expect(
			getContentItemsForActor(next.content, next.permissions, PLAYER_ACTOR.id).some(
				(n) => n.id === note.id,
			),
		).toBe(true);
		expect(
			getContentItemsForActor(next.content, next.permissions, PLAYER_B.id).some(
				(n) => n.id === note.id,
			),
		).toBe(true);
	});

	it('an explicit characterIds list narrows the compile to those characters', () => {
		const { state, env, seraId } = withTwoHighlights();
		const next = accepted(
			dispatchCommand(state, env, cmd('session.compile-highlights', { characterIds: [seraId] })),
		).nextState;
		const note = getContentItemsForActor(next.content, next.permissions, DM_ACTOR.id).find(
			(n) => n.fields[VAULT_OBJECT_SUBTYPE_KEY] === SESSION_HIGHLIGHTS_SUBTYPE,
		)!;
		expect(note.body).toContain('## Sera');
		expect(note.body).not.toContain('## Cal');
		expect(note.fields.highlightCount).toBe(1);
	});

	it('DM pin-to-timeline: an `occurred` date lands the note on the Campaign timeline', () => {
		const { state, env } = withTwoHighlights();
		const withCalendar = accepted(
			dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS)),
		).nextState;
		const occurred = { calendarId: HARPTOS.id, year: 1372, month: 1, day: 10 };
		const next = accepted(
			dispatchCommand(withCalendar, env, cmd('session.compile-highlights', { occurred })),
		).nextState;
		const note = getContentItemsForActor(next.content, next.permissions, DM_ACTOR.id).find(
			(n) => n.fields[VAULT_OBJECT_SUBTYPE_KEY] === SESSION_HIGHLIGHTS_SUBTYPE,
		)!;
		const timeline = getCalendarTimelineForActor(
			next.content,
			next.permissions,
			DM_ACTOR.id,
			HARPTOS.id,
		);
		expect(timeline.some((row) => row.itemId === note.id)).toBe(true);
	});

	it('rejects an occurred date against an unknown calendar (fail closed)', () => {
		const { state, env } = withTwoHighlights();
		const result = dispatchCommand(
			state,
			env,
			cmd('session.compile-highlights', {
				occurred: { calendarId: 'no-such-calendar', year: 1, month: 1, day: 1 },
			}),
		);
		expect(result.status).toBe('rejected');
	});

	it('every accepted compile appends a durable op', () => {
		const { state, env } = withTwoHighlights();
		const before = state.sync.operations.length;
		const result = accepted(dispatchCommand(state, env, cmd('session.compile-highlights', {})));
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.length).toBe(before + 1);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('session.compile-highlights');
	});
});
