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
import { SessionHost, isPlayerRequestable } from './SessionHost';
import { buildPlayerData } from './viewModels';

/**
 * RC-SES-5.1 — a player's initiative roll travels the EXISTING command-request path: the joined device
 * sends intent (type + payload, no actor id), the host stamps the authenticated participant and hands
 * it to the DM's runtime, and the Core decides. These tests put a real Core behind the host, so the
 * refusal for another player's character is the Core's verdict relayed, not a stub's.
 */

const SECOND_PLAYER: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Second Player' };

function campaignInCall() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, SECOND_PLAYER, OBSERVER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted')
			throw new Error(`${command.type}: ${result.rejection.message}`);
		state = result.nextState;
	};
	run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	run({
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: state.commandCenter.homeSceneId! },
	});
	const characterIds: string[] = [];
	for (const [name, owner] of [
		['Wren', PLAYER_ACTOR.id],
		['Tamsin', SECOND_PLAYER.id],
	] as const) {
		const before = new Set(Object.keys(state.characters.characters));
		run({
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name,
				visibility: 'player-visible',
				combat: { hp: 20, maxHp: 20, ac: 13 },
			},
		});
		const id = Object.keys(state.characters.characters).find((key) => !before.has(key))!;
		run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: id,
				playerActorId: owner,
				capabilitySet: 'combat-participant',
			},
		});
		characterIds.push(id);
	}
	run({
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			rollForInitiative: true,
			combatants: [
				{ kind: 'character', name: 'Wren', characterId: characterIds[0], maxHp: 20 },
				{ kind: 'character', name: 'Tamsin', characterId: characterIds[1], maxHp: 20 },
				{ kind: 'monster', name: 'Bog Lurker', initiative: 14, maxHp: 22 },
			],
		},
	});
	const idOf = (name: string) =>
		Object.values(state.session.combat.combatants).find((c) => c.name === name)!.id;
	return { env, state, mine: idOf('Wren'), theirs: idOf('Tamsin'), monster: idOf('Bog Lurker') };
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
	const host = new SessionHost(runtime, 'sess-initiative');
	const send = vi.fn(async () => {});
	/** Deliver a command request from a peer bound (at invite time) to `actorId`. */
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

describe('RC-SES-5.1 — what a player device may request', () => {
	it('admits combat.apply-resource ONLY as an initiative roll', () => {
		const roll = { combatantId: 'c1', kind: 'initiative', roll: { modifier: 2 } };
		expect(isPlayerRequestable({ type: 'combat.apply-resource', payload: roll })).toBe(true);
		expect(
			isPlayerRequestable({
				type: 'combat.apply-resource',
				payload: { combatantId: 'c1', kind: 'hp', delta: -5 },
			}),
		).toBe(false);
		expect(isPlayerRequestable({ type: 'combat.apply-resource', payload: null })).toBe(false);
		expect(
			isPlayerRequestable({ type: 'combat.start', payload: { rollForInitiative: true } }),
		).toBe(false);
		expect(isPlayerRequestable({ type: 'combat.advance-turn', payload: {} })).toBe(false);
	});

	it('keeps the existing dice and own-sheet prefixes', () => {
		expect(isPlayerRequestable({ type: 'dice.roll', payload: {} })).toBe(true);
		expect(isPlayerRequestable({ type: 'character.update-combat-resource', payload: {} })).toBe(
			true,
		);
		expect(isPlayerRequestable({ type: 'scene.create', payload: {} })).toBe(false);
	});
});

describe('RC-SES-5.1 — the roll travels the command-request path with the DM as authority', () => {
	it('stamps the authenticated player and the DM runtime records their roll', async () => {
		const { env, state, mine } = campaignInCall();
		const host = hostOver(state, env);
		// A client-supplied actor id on the envelope is ignored: identity comes from the bound peer.
		await host.request(PLAYER_ACTOR.id, 'req-1', {
			type: 'combat.apply-resource',
			actorId: DM_ACTOR.id,
			payload: { combatantId: mine, kind: 'initiative', roll: { modifier: 2 } },
		});
		expect(host.dispatch).toHaveBeenCalledWith({
			type: 'combat.apply-resource',
			actorId: PLAYER_ACTOR.id,
			payload: { combatantId: mine, kind: 'initiative', roll: { modifier: 2 } },
		});
		expect(host.send).toHaveBeenCalledWith({ kind: 'command-ack', requestId: 'req-1', ok: true });
		const entry = host.current().session.combat.log.at(-1)!;
		expect(entry).toMatchObject({ kind: 'roll', combatantId: mine, actorActorId: PLAYER_ACTOR.id });
	});

	it("relays the Core's refusal when a player rolls for another player's character", async () => {
		const { env, state, theirs } = campaignInCall();
		const host = hostOver(state, env);
		await host.request(PLAYER_ACTOR.id, 'req-2', {
			type: 'combat.apply-resource',
			payload: { combatantId: theirs, kind: 'initiative', roll: { modifier: 2 } },
		});
		expect(host.send).toHaveBeenCalledWith({
			kind: 'command-ack',
			requestId: 'req-2',
			ok: false,
			message: "You may not set this combatant's initiative.",
		});
		expect(host.current()).toBe(state);
	});

	it('never lets a player device reach an HP change through the same command', async () => {
		const { env, state, mine } = campaignInCall();
		const host = hostOver(state, env);
		await host.request(PLAYER_ACTOR.id, 'req-3', {
			type: 'combat.apply-resource',
			payload: { combatantId: mine, kind: 'hp', delta: 50 },
		});
		expect(host.dispatch).not.toHaveBeenCalled();
		expect(host.send).toHaveBeenCalledWith({
			kind: 'command-ack',
			requestId: 'req-3',
			ok: false,
			message: 'That action is not permitted from a player device.',
		});
	});
});

describe('RC-SES-5.1 — the call in the player view-model', () => {
	it('offers the roll for the viewer’s own character only, and marks no one active', () => {
		const { state, mine, theirs } = campaignInCall();
		const data = buildPlayerData(state, PLAYER_ACTOR.id);
		expect(data.initiativeCall).toEqual({
			combatantId: mine,
			combatantName: 'Wren',
			modifier: 0,
			rolled: null,
			rolledCount: 0,
			owedCount: 2,
			heldCount: 1,
		});
		expect(data.round).toBeNull();
		expect(data.activeName).toBeNull();
		expect(data.turnOrder.some((row) => row.active)).toBe(false);
		// A character still owed a roll shows no number, not its placeholder 0.
		expect(data.turnOrder.find((row) => row.id === theirs)?.init).toBeNull();
		expect(data.turnOrder.find((row) => row.name === 'Bog Lurker')?.init).toBe(14);

		expect(buildPlayerData(state, SECOND_PLAYER.id).initiativeCall?.combatantId).toBe(theirs);
		// An observer watches the call; there is nothing for them to roll.
		expect(buildPlayerData(state, OBSERVER_ACTOR.id).initiativeCall?.combatantId).toBeNull();
	});

	it('walks a player who holds several characters through every roll they owe', () => {
		const { env, state, mine, theirs } = campaignInCall();
		// The DM hands this one player BOTH characters in the fight.
		const shared = dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: state.session.combat.combatants[theirs]!.characterId,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'combat-participant',
			},
		});
		if (shared.status !== 'accepted') throw new Error(shared.rejection.message);

		const first = buildPlayerData(shared.nextState, PLAYER_ACTOR.id).initiativeCall!;
		expect(first.combatantId).toBe(mine);
		expect(first.heldCount).toBe(2);

		// Roll the FIRST character high enough to sort above the second, so tracker order alone would
		// keep re-offering the character who is already done.
		const rolled = dispatchCommand(shared.nextState, env, {
			type: 'combat.apply-resource',
			actorId: PLAYER_ACTOR.id,
			payload: { combatantId: mine, kind: 'initiative', roll: { modifier: 20 } },
		});
		if (rolled.status !== 'accepted') throw new Error(rolled.rejection.message);

		// The card now names the character still owing a roll, and still offers the button.
		const next = buildPlayerData(rolled.nextState, PLAYER_ACTOR.id).initiativeCall!;
		expect(next.combatantId).toBe(theirs);
		expect(next.combatantName).toBe('Tamsin');
		expect(next.rolled).toBeNull();

		const both = dispatchCommand(rolled.nextState, env, {
			type: 'combat.apply-resource',
			actorId: PLAYER_ACTOR.id,
			payload: { combatantId: theirs, kind: 'initiative', roll: { modifier: 0 } },
		});
		if (both.status !== 'accepted') throw new Error(both.rejection.message);

		// With everything in, the card reports a result rather than going blank.
		const done = buildPlayerData(both.nextState, PLAYER_ACTOR.id).initiativeCall!;
		expect(done.rolled).not.toBeNull();
		expect(done.rolledCount).toBe(2);
		expect(done.owedCount).toBe(2);
	});

	it('reports the roll once it is in, and disappears when round 1 begins', () => {
		const { env, state, mine } = campaignInCall();
		const rolled = dispatchCommand(state, env, {
			type: 'combat.apply-resource',
			actorId: PLAYER_ACTOR.id,
			payload: { combatantId: mine, kind: 'initiative', roll: { modifier: 0 } },
		});
		if (rolled.status !== 'accepted') throw new Error(rolled.rejection.message);
		const total = rolled.nextState.session.combat.combatants[mine]!.statBlock.initiative;
		const data = buildPlayerData(rolled.nextState, PLAYER_ACTOR.id);
		expect(data.initiativeCall?.rolled).toBe(total);
		expect(data.initiativeCall?.rolledCount).toBe(1);
		expect(buildPlayerData(rolled.nextState, SECOND_PLAYER.id).initiativeCall?.rolled).toBeNull();

		const begun = dispatchCommand(rolled.nextState, env, {
			type: 'combat.advance-turn',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		if (begun.status !== 'accepted') throw new Error(begun.rejection.message);
		const after = buildPlayerData(begun.nextState, PLAYER_ACTOR.id);
		expect(after.initiativeCall).toBeNull();
		expect(after.turnOrder.filter((row) => row.active)).toHaveLength(1);
	});
});
