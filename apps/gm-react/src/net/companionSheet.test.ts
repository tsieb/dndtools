import { describe, expect, it, vi } from 'vitest';
import { dispatchCommand, type Actor, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { SessionHost } from './SessionHost';
import { buildPlayerData, sheetCombatCommands, NO_SHEET_WRITES } from './viewModels';

/**
 * RC-CHR-6.1 — the companion sheet writes over the session. A joined device sends intent (type +
 * payload, no actor), the host stamps the participant it bound at invite time, and the DM's Core
 * decides. A real Core sits behind the host here, so every refusal is the Core's own verdict.
 */

const SECOND_PLAYER: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Second Player' };
/** A player with no PC of their own — handed a seat in someone else's fight. */
const HELPER: Actor = { id: 'actor-helper', role: 'player', displayName: 'Helper' };

function campaign() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, SECOND_PLAYER, HELPER, OBSERVER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted')
			throw new Error(`${command.type}: ${result.rejection.message}`);
		state = result.nextState;
	};
	// A PC exists only through the draft flow, and finalizing it grants nothing: the DM hands the player
	// `owner` explicitly, as the demo seed does.
	const pcFor = (owner: string, name: string, klass: string) => {
		const before = new Set(Object.keys(state.characters.drafts));
		run({
			type: 'character.create-draft',
			actorId: DM_ACTOR.id,
			payload: { ownerActorId: owner, name, visibility: 'player-visible' },
		});
		const draftId = Object.keys(state.characters.drafts).find((id) => !before.has(id))!;
		const step = (stepId: string, values: Record<string, unknown>) =>
			run({
				type: 'character.update-draft-step',
				actorId: owner,
				payload: { draftId, stepId, values },
			});
		step('identity', { name, background: 'sage' });
		step('abilities', { str: 10, dex: 14, con: 12, int: 15, wis: 11, cha: 10 });
		step('class', { class: klass });
		run({ type: 'character.finalize-draft', actorId: owner, payload: { draftId } });
		const id = Object.values(state.characters.characters).find((c) => c.name === name)!.id;
		run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: id,
				playerActorId: owner,
				capabilitySet: 'owner',
			},
		});
		run({
			type: 'character.set-combat',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, hp: 20, maxHp: 20, ac: 12 },
		});
		run({
			type: 'character.set-spell-slots',
			actorId: DM_ACTOR.id,
			payload: { characterId: id, level: 1, max: 2 },
		});
		return id;
	};
	const mine = pcFor(PLAYER_ACTOR.id, 'Ysolde', 'wizard');
	const theirs = pcFor(SECOND_PLAYER.id, 'Bram', 'cleric');
	run({
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			combatants: [
				{ kind: 'character', name: 'Ysolde', characterId: mine, initiative: 12, maxHp: 20 },
				{ kind: 'character', name: 'Bram', characterId: theirs, initiative: 8, maxHp: 20 },
			],
		},
	});
	const combatantOf = (characterId: string) =>
		Object.values(state.session.combat.combatants).find((c) => c.characterId === characterId)!.id;
	return {
		env,
		state,
		mine,
		theirs,
		myRow: combatantOf(mine),
		theirRow: combatantOf(theirs),
		run,
		current: () => state,
	};
}

/** A SessionHost over a real Core: `dispatch` applies the command to the live state. */
function hostOver(initial: CoreStateSlice, env: ReturnType<typeof makeEnvironment>) {
	let state = initial;
	const dispatch = vi.fn(async (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status === 'accepted') state = result.nextState;
		return result;
	});
	const runtime = {
		onDispatched: () => () => {},
		get authoritativeState() {
			return state;
		},
		dispatch,
	} as unknown as SceneRuntime;
	const host = new SessionHost(runtime, 'sess-sheet');
	const send = vi.fn(async (_message: unknown) => {});
	const request = (actorId: string, requestId: string, command: Record<string, unknown>) =>
		(
			host as unknown as {
				handleCommandRequest(
					peer: { actorId: string; link: { send: typeof send } },
					requestId: string,
					command: { type: string; payload: unknown },
				): Promise<void>;
			}
		).handleCommandRequest(
			{ actorId, link: { send } },
			requestId,
			command as { type: string; payload: unknown },
		);
	return { dispatch, send, request, current: () => state };
}

describe('RC-CHR-6.1 — what the companion sheet may offer', () => {
	it('asks the core: the owner may do everything, nobody else may touch the sheet', () => {
		const { state, mine } = campaign();
		const own = buildPlayerData(state, PLAYER_ACTOR.id);
		expect(own.pcId).toBe(mine);
		expect(own.sheetWrites).toEqual({ combat: true, manage: true });
		expect(buildPlayerData(state, OBSERVER_ACTOR.id).sheetWrites).toEqual(NO_SHEET_WRITES);
	});

	it('offers a combat participant who is not the owner the CHAR-007 writes only', () => {
		const { mine, run, current } = campaign();
		run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: mine,
				playerActorId: HELPER.id,
				capabilitySet: 'combat-participant',
			},
		});
		const data = buildPlayerData(current(), HELPER.id);
		expect(data.pcId).toBe(mine);
		expect(data.sheetWrites).toEqual({ combat: true, manage: false });
	});

	it('names the PC’s row in the running fight so a change can reach the tracker', () => {
		const { state, myRow } = campaign();
		expect(buildPlayerData(state, PLAYER_ACTOR.id).pcCombatantId).toBe(myRow);
	});

	it('mirrors an HP, temporary-HP or condition change onto the tracker row while fighting', () => {
		expect(sheetCombatCommands('pc-1', 'row-1', { kind: 'hp', delta: -3 })).toEqual([
			{
				type: 'character.update-combat-resource',
				payload: { characterId: 'pc-1', kind: 'hp', delta: -3 },
			},
			{ type: 'combat.apply-resource', payload: { combatantId: 'row-1', kind: 'hp', delta: -3 } },
		]);
		expect(
			sheetCombatCommands('pc-1', null, {
				kind: 'condition',
				condition: 'poisoned',
				present: true,
			}),
		).toEqual([
			{
				type: 'character.update-combat-resource',
				payload: { characterId: 'pc-1', kind: 'condition', condition: 'poisoned', present: true },
			},
		]);
	});
});

describe('RC-CHR-6.1 — sheet writes travel the command-request path with the core as authority', () => {
	it('applies the joined player’s damage, condition and slot to the sheet AND the tracker', async () => {
		const { env, state, mine, myRow } = campaign();
		const host = hostOver(state, env);
		const writes = [
			...sheetCombatCommands(mine, myRow, { kind: 'hp', delta: -3 }),
			...sheetCombatCommands(mine, myRow, {
				kind: 'condition',
				condition: 'poisoned',
				present: true,
			}),
			{
				type: 'character.update-combat-resource',
				payload: { characterId: mine, kind: 'spell-slot', level: 1 },
			},
		];
		for (const [index, command] of writes.entries()) {
			await host.request(PLAYER_ACTOR.id, `req-${index}`, { ...command });
		}
		for (const [index] of writes.entries()) {
			expect(host.send).toHaveBeenCalledWith({
				kind: 'command-ack',
				requestId: `req-${index}`,
				ok: true,
			});
		}
		// Every write ran as the bound participant, never as anyone the envelope named.
		for (const call of host.dispatch.mock.calls) expect(call[0].actorId).toBe(PLAYER_ACTOR.id);
		const after = host.current();
		const sheet = after.characters.characters[mine]!;
		expect(sheet.combat.hp).toBe(17);
		expect(sheet.combat.conditions).toContain('poisoned');
		const row = after.session.combat.combatants[myRow]!;
		expect(row.resources.hp).toBe(17);
		expect(row.resources.conditions).toContain('poisoned');
		const slots = buildPlayerData(after, PLAYER_ACTOR.id).resources!.spellSlots;
		expect(slots[1]).toMatchObject({ max: 2, expended: 1 });
	});

	it("relays the core's refusal when a player edits another player's PC", async () => {
		const { env, state, theirs, theirRow } = campaign();
		const host = hostOver(state, env);
		// The envelope's actor id is ignored; the bound peer is PLAYER_ACTOR, who holds nothing on Bram.
		await host.request(PLAYER_ACTOR.id, 'req-sheet', {
			type: 'character.update-combat-resource',
			actorId: SECOND_PLAYER.id,
			payload: { characterId: theirs, kind: 'hp', delta: -3 },
		});
		await host.request(PLAYER_ACTOR.id, 'req-row', {
			type: 'combat.apply-resource',
			payload: { combatantId: theirRow, kind: 'condition', condition: 'poisoned', present: true },
		});
		await host.request(PLAYER_ACTOR.id, 'req-rest', {
			type: 'character.rest',
			payload: { characterId: theirs, rest: 'long' },
		});
		expect(host.send).toHaveBeenCalledWith({
			kind: 'command-ack',
			requestId: 'req-sheet',
			ok: false,
			message: "You may not update this character's combat resources.",
		});
		expect(host.send).toHaveBeenCalledWith({
			kind: 'command-ack',
			requestId: 'req-row',
			ok: false,
			message: "You may not edit this combatant's resources.",
		});
		expect(host.send).toHaveBeenCalledWith({
			kind: 'command-ack',
			requestId: 'req-rest',
			ok: false,
			message: 'Only the character owner may manage spells and resources.',
		});
		// Nothing moved: the refusals came from the core, and the state it refused is the state kept.
		expect(host.current()).toBe(state);
	});
});
