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
	getCharacterJournalForActor,
	historyEntryVisibility,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

// RC-ENG-8.12 — rests, combats and level-ups each append a dated history entry to the character's
// journal, under the journal's visibility rules, read through the actor-scoped journal query.

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status === 'rejected' ? result.rejection : 'accepted').toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function run(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CoreStateSlice {
	return accepted(dispatchCommand(state, env, command)).nextState;
}

interface Table {
	state: CoreStateSlice;
	env: CoreEnvironment;
	/** A PC owned by PLAYER_ACTOR. PLAYER_B can see the sheet but does not own it. */
	pc: string;
	/** A DM-run NPC nobody owns. */
	npc: string;
}

function quickCreate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	kind: 'pc' | 'npc' | 'sidekick',
	name: string,
): { state: CoreStateSlice; id: string } {
	const before = new Set(Object.keys(state.characters.characters));
	const next = run(state, env, {
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: { kind, name, visibility: 'player-visible', combat: { hp: 5, maxHp: 12, ac: 13 } },
	} as CoreCommand);
	const id = Object.keys(next.characters.characters).find((key) => !before.has(key))!;
	return { state: next, id };
}

function table(): Table {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
	const pc = quickCreate(state, env, 'sidekick', 'Pip');
	state = pc.state;
	const npc = quickCreate(state, env, 'sidekick', 'Old Tam');
	state = npc.state;
	state = run(state, env, {
		type: 'permission.grant-capability-set',
		actorId: DM_ACTOR.id,
		payload: {
			entityType: 'character',
			entityId: pc.id,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'owner',
		},
	} as CoreCommand);
	return { state, env, pc: pc.id, npc: npc.id };
}

function journalTitles(state: CoreStateSlice, actorId: string, characterId: string): string[] {
	return getCharacterJournalForActor(
		state.characters,
		state.permissions,
		actorId,
		characterId,
	).entries.map((entry) => entry.title);
}

function historyEntry(state: CoreStateSlice, characterId: string, kind: string) {
	return state.characters.journals?.journals[characterId]?.entries.find((e) => e.kind === kind);
}

function startActiveSession(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	const home = run(state, env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	} as CoreCommand);
	return run(home, env, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: home.commandCenter.homeSceneId! },
	} as CoreCommand);
}

describe('RC-ENG-8.12 — history entry visibility follows the journal rules', () => {
	it('an owned character gets the shared-to-owner default; dm-only or unowned characters stay dm-only', () => {
		expect(historyEntryVisibility('player-visible', 'actor-1')).toBe('shared');
		expect(historyEntryVisibility('shared', 'actor-1')).toBe('shared');
		expect(historyEntryVisibility('dm-only', 'actor-1')).toBe('dm-only');
		expect(historyEntryVisibility('player-visible', null)).toBe('dm-only');
	});
});

describe('RC-ENG-8.12 — a rest appends a dated history entry', () => {
	it('records the rest for the owner and the DM, never for another player or an observer', () => {
		const { state, env, pc } = table();
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.rest',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: pc, rest: 'long' },
			} as CoreCommand),
		);
		const entry = historyEntry(result.nextState, pc, 'rest')!;
		expect(entry).toMatchObject({
			kind: 'rest',
			title: 'Long rest',
			visibility: 'shared',
			sharedWith: [PLAYER_ACTOR.id],
			authorActorId: PLAYER_ACTOR.id,
		});
		expect(entry.body).toContain('Regained 7 hit points.');
		expect(Date.parse(entry.createdAt)).not.toBeNaN();
		// The rest's own op is the durable record; the entry adds no side op.
		expect(result.operationIds).toHaveLength(1);
		expect(result.events).toContainEqual(
			expect.objectContaining({
				kind: 'character.journal-changed',
				characterId: pc,
				entryId: entry.id,
				invalidatedActorIds: [PLAYER_ACTOR.id],
			}),
		);

		expect(journalTitles(result.nextState, PLAYER_ACTOR.id, pc)).toEqual(['Long rest']);
		expect(journalTitles(result.nextState, DM_ACTOR.id, pc)).toEqual(['Long rest']);
		expect(journalTitles(result.nextState, PLAYER_B.id, pc)).toEqual([]);
		expect(journalTitles(result.nextState, OBSERVER_ACTOR.id, pc)).toEqual([]);
	});

	it("a DM-run character's rest is a DM-only entry no player may see", () => {
		const { state, env, npc } = table();
		const next = run(state, env, {
			type: 'character.rest',
			actorId: DM_ACTOR.id,
			payload: { characterId: npc, rest: 'short' },
		} as CoreCommand);
		const entry = historyEntry(next, npc, 'rest')!;
		expect(entry).toMatchObject({
			title: 'Short rest',
			body: '',
			visibility: 'dm-only',
			sharedWith: [],
		});
		expect(journalTitles(next, DM_ACTOR.id, npc)).toEqual(['Short rest']);
		expect(journalTitles(next, PLAYER_ACTOR.id, npc)).toEqual([]);
		expect(journalTitles(next, PLAYER_B.id, npc)).toEqual([]);
	});

	it('a rejected rest writes no history', () => {
		const { state, env, pc } = table();
		const result = dispatchCommand(state, env, {
			type: 'character.rest',
			actorId: PLAYER_B.id,
			payload: { characterId: pc, rest: 'long' },
		} as CoreCommand);
		expect(result.status).toBe('rejected');
		expect(historyEntry(result.nextState, pc, 'rest')).toBeUndefined();
	});
});

describe('RC-ENG-8.12 — a level-up appends a dated history entry', () => {
	it('records the staged commit and the atomic apply, owner-and-DM only', () => {
		const { state, env, pc } = table();
		let next = run(state, env, {
			type: 'character.apply-advancement',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc, mode: 'milestone', className: 'Fighter', hitPointsGained: 6 },
		} as CoreCommand);
		expect(historyEntry(next, pc, 'level-up')).toMatchObject({
			title: 'Reached level 2',
			body: 'Fighter. Maximum hit points 18.',
			visibility: 'shared',
			sharedWith: [PLAYER_ACTOR.id],
		});

		// The wizard path: open → choices → commit.
		next = run(next, env, {
			type: 'character.open-advancement',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc, mode: 'milestone' },
		} as CoreCommand);
		next = run(next, env, {
			type: 'character.set-advancement-choices',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc, className: 'Fighter', hitPointsGained: 5, subclass: 'Champion' },
		} as CoreCommand);
		next = run(next, env, {
			type: 'character.commit-advancement',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc },
		} as CoreCommand);

		expect(journalTitles(next, PLAYER_ACTOR.id, pc)).toEqual([
			'Reached level 3',
			'Reached level 2',
		]);
		expect(journalTitles(next, DM_ACTOR.id, pc)).toEqual(['Reached level 3', 'Reached level 2']);
		expect(journalTitles(next, PLAYER_B.id, pc)).toEqual([]);
		expect(historyEntry(next, pc, 'level-up')!.body).toBe(
			'Fighter (Champion). Maximum hit points 23.',
		);
	});

	it("a DM-run character's level-up is DM-only: a player may not see it", () => {
		const { state, env, npc } = table();
		const next = run(state, env, {
			type: 'character.apply-advancement',
			actorId: DM_ACTOR.id,
			payload: { characterId: npc, mode: 'milestone', className: 'Rogue', hitPointsGained: 4 },
		} as CoreCommand);
		expect(historyEntry(next, npc, 'level-up')!.visibility).toBe('dm-only');
		expect(journalTitles(next, DM_ACTOR.id, npc)).toEqual(['Reached level 2']);
		expect(journalTitles(next, PLAYER_ACTOR.id, npc)).toEqual([]);
		expect(journalTitles(next, PLAYER_B.id, npc)).toEqual([]);
	});

	it('an incomplete commit writes no history', () => {
		const { state, env, pc } = table();
		let next = run(state, env, {
			type: 'character.open-advancement',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc, mode: 'milestone' },
		} as CoreCommand);
		const result = dispatchCommand(next, env, {
			type: 'character.commit-advancement',
			actorId: PLAYER_ACTOR.id,
			payload: { characterId: pc },
		} as CoreCommand);
		expect(result.status).toBe('rejected');
		next = result.nextState;
		expect(historyEntry(next, pc, 'level-up')).toBeUndefined();
	});
});

describe('RC-ENG-8.12 — ending a combat appends a dated history entry per character who fought', () => {
	function foughtCombat(): { next: CoreStateSlice; pc: string; npc: string } {
		const t = table();
		let state = startActiveSession(t.state, t.env);
		state = run(state, t.env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: {
				combatants: [
					{ kind: 'character', name: 'Pip', characterId: t.pc, initiative: 15, maxHp: 12 },
					{ kind: 'character', name: 'Old Tam', characterId: t.npc, initiative: 9, maxHp: 12 },
					{ kind: 'monster', name: 'Cult fanatic', initiative: 12, maxHp: 33, hidden: true },
				],
			},
		} as CoreCommand);
		state = run(state, t.env, {
			type: 'combat.advance-turn',
			actorId: DM_ACTOR.id,
			payload: {},
		} as CoreCommand);
		state = run(state, t.env, {
			type: 'combat.advance-turn',
			actorId: DM_ACTOR.id,
			payload: {},
		} as CoreCommand);
		state = run(state, t.env, {
			type: 'combat.advance-turn',
			actorId: DM_ACTOR.id,
			payload: {},
		} as CoreCommand);
		expect(historyEntry(state, t.pc, 'combat')).toBeUndefined();
		const next = run(state, t.env, {
			type: 'combat.end',
			actorId: DM_ACTOR.id,
			payload: {},
		} as CoreCommand);
		return { next, pc: t.pc, npc: t.npc };
	}

	it('records the fight for the owner and the DM; another player sees nothing', () => {
		const { next, pc } = foughtCombat();
		const entry = historyEntry(next, pc, 'combat')!;
		expect(entry).toMatchObject({
			title: 'Fought a combat (2 rounds)',
			visibility: 'shared',
			sharedWith: [PLAYER_ACTOR.id],
			authorActorId: DM_ACTOR.id,
		});
		expect(entry.body).toMatch(/^Ended the fight at \d+ of 12 hit points\.$/);
		// A hidden opponent's identity never reaches a journal.
		expect(entry.body).not.toContain('Cult fanatic');
		expect(journalTitles(next, PLAYER_ACTOR.id, pc)).toEqual(['Fought a combat (2 rounds)']);
		expect(journalTitles(next, DM_ACTOR.id, pc)).toEqual(['Fought a combat (2 rounds)']);
		expect(journalTitles(next, PLAYER_B.id, pc)).toEqual([]);
	});

	it("the DM-run character's combat entry is DM-only: no player may see it", () => {
		const { next, npc } = foughtCombat();
		expect(historyEntry(next, npc, 'combat')!.visibility).toBe('dm-only');
		expect(journalTitles(next, DM_ACTOR.id, npc)).toEqual(['Fought a combat (2 rounds)']);
		expect(journalTitles(next, PLAYER_ACTOR.id, npc)).toEqual([]);
		expect(journalTitles(next, PLAYER_B.id, npc)).toEqual([]);
	});

	it('monsters get no journal; a DM-narrowed entry stays hidden from another player', () => {
		const { next, pc, npc } = foughtCombat();
		expect(Object.keys(next.characters.journals!.journals).sort()).toEqual([pc, npc].sort());
		// The DM narrows the PC's combat entry to DM-only: the owner still reads their own journal,
		// another player still may not.
		const entry = historyEntry(next, pc, 'combat')!;
		const env = makeEnvironment();
		const narrowed = run(next, env, {
			type: 'character.set-journal-entry-visibility',
			actorId: DM_ACTOR.id,
			payload: { characterId: pc, entryId: entry.id, visibility: 'dm-only' },
		} as CoreCommand);
		expect(journalTitles(narrowed, PLAYER_B.id, pc)).toEqual([]);
		expect(journalTitles(narrowed, DM_ACTOR.id, pc)).toEqual(['Fought a combat (2 rounds)']);
	});
});
