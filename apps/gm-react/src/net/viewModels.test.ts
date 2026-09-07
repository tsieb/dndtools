import { describe, expect, it } from 'vitest';
import { dispatchCommand, type CoreStateSlice } from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import { buildPlayerData } from './viewModels';

// Build a campaign with a DM-only scene, then promote the player to co-dm so the snapshot must carry
// the elevated payload (and a joined player/observer must NOT).
function campaignWithCoDm(): { state: CoreStateSlice; sceneId: string } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const created = dispatchCommand(base, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Villain Lair', visibility: 'dm-only' },
	});
	if (created.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0]!;
	const promoted = dispatchCommand(created.nextState, env, {
		type: 'permission.assign-role',
		actorId: DM_ACTOR.id,
		payload: { targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 1 },
	});
	if (promoted.status !== 'accepted') throw new Error('promote failed');
	return { state: promoted.nextState, sceneId };
}

describe('buildPlayerData: co-dm elevation', () => {
	it('preserves the co-dm role (never flattens it to player) and carries the elevated payload', () => {
		const { state, sceneId } = campaignWithCoDm();
		const data = buildPlayerData(state, PLAYER_ACTOR.id);

		expect(data.role).toBe('co-dm');
		expect(data.elevated).not.toBeNull();
		// The elevated Atlas contains the dm-only scene a player would never receive.
		expect(data.elevated!.scenes.some((s) => s.id === sceneId)).toBe(true);
		expect(data.elevated!.combat).toBeTruthy();
		expect(Array.isArray(data.elevated!.bestiary)).toBe(true);
	});

	it('a player/observer snapshot carries NO elevated payload (no leak)', () => {
		const { state } = campaignWithCoDm();
		const observer = buildPlayerData(state, OBSERVER_ACTOR.id);
		expect(observer.role).toBe('observer');
		expect(observer.elevated).toBeNull();
	});
});

/**
 * RC-CHR-3.1 — a campaign with one real PC (the draft flow is the only path to `kind: 'pc'`) owned by
 * PLAYER_ACTOR, carrying level-1 spell slots with one expended and an active concentration.
 */
function campaignWithSpellcastingPc(): { state: CoreStateSlice; characterId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const run = (command: Parameters<typeof dispatchCommand>[2]) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`${command.type}: ${result.rejection?.message ?? 'rejected'}`);
		}
		state = result.nextState;
	};

	run({
		type: 'character.create-draft',
		actorId: DM_ACTOR.id,
		payload: { ownerActorId: PLAYER_ACTOR.id, name: 'Ysolde', visibility: 'player-visible' },
	});
	const draftId = Object.keys(state.characters.drafts)[0]!;
	const step = (stepId: string, values: Record<string, unknown>) =>
		run({
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, stepId, values },
		});
	step('identity', { name: 'Ysolde', background: 'sage' });
	step('abilities', { str: 10, dex: 14, con: 12, int: 15, wis: 11, cha: 10 });
	step('class', { class: 'wizard' });
	run({ type: 'character.finalize-draft', actorId: PLAYER_ACTOR.id, payload: { draftId } });

	const characterId = Object.values(state.characters.characters).find((c) => c.kind === 'pc')!.id;
	run({
		type: 'character.set-spell-slots',
		actorId: DM_ACTOR.id,
		payload: { characterId, level: 1, max: 3 },
	});
	run({
		type: 'character.update-combat-resource',
		actorId: DM_ACTOR.id,
		payload: { characterId, kind: 'spell-slot', level: 1 },
	});
	run({
		type: 'character.update-combat-resource',
		actorId: DM_ACTOR.id,
		payload: { characterId, kind: 'concentration', effect: 'Hold person' },
	});
	return { state, characterId };
}

describe('buildPlayerData: RC-CHR-3.1 party vitals', () => {
	it('carries the owner PC with its concentration and per-level slot breakdown', () => {
		const { state, characterId } = campaignWithSpellcastingPc();
		const data = buildPlayerData(state, PLAYER_ACTOR.id);

		const me = data.partyVitals.find((m) => m.characterId === characterId);
		expect(me, 'the visible PC must reach the party vitals').toBeTruthy();
		expect(me!.isSelf).toBe(true);
		expect(me!.concentration).toBe('Hold person');
		// One of three level-1 slots was expended, so the collapsed summary reads 2 of 3.
		expect(me!.spellSlots).toEqual([{ level: 1, available: 2, max: 3 }]);
		expect(me!.availableSpellSlots).toBe(2);
		expect(me!.maxHp).toBeGreaterThan(0);
	});

	it('withholds a DM-only concentration from a player while the DM still reads it', () => {
		const { state, characterId } = campaignWithSpellcastingPc();
		// `dmOnlyFields` is not settable on a PC through a command, so declare it on the fixture the
		// way the reducer stores it. The `resources.` prefix is the convention CharacterView redacts by.
		state.characters.characters[characterId]!.dmOnlyFields = ['resources.concentration'];

		const player = buildPlayerData(state, PLAYER_ACTOR.id).partyVitals.find(
			(m) => m.characterId === characterId,
		);
		const dm = buildPlayerData(state, DM_ACTOR.id).partyVitals.find(
			(m) => m.characterId === characterId,
		);
		expect(player!.concentration).toBeNull();
		expect(dm!.concentration).toBe('Hold person');
	});

	it('an observer receives no party vitals at all (CHAR-015 ceiling)', () => {
		const { state } = campaignWithSpellcastingPc();
		expect(buildPlayerData(state, OBSERVER_ACTOR.id).partyVitals).toEqual([]);
	});
});
