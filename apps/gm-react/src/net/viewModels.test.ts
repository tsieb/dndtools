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
