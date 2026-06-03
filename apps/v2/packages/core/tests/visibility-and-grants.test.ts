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
	evaluateSceneVisibility,
	hasGrantedCapability,
} from '../src';

describe('Permission grants and visibility evaluation', () => {
	it('returns viewer/co-editor inheritance for scene grants', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		const created = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'S' },
		});
		if (created.status !== 'accepted') return;
		const sceneId = Object.keys(created.nextState.scenes.scenes)[0]!;
		const grantedState = {
			...created.nextState,
			permissions: {
				...created.nextState.permissions,
				grants: [
					{
						id: 'g1',
						entityType: 'scene' as const,
						entityId: sceneId,
						playerActorId: PLAYER_ACTOR.id,
						capabilitySet: 'co-editor' as const,
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T00:00:00.000Z',
					},
				],
			},
		};
		expect(
			hasGrantedCapability(
				grantedState.permissions,
				PLAYER_ACTOR,
				'scene',
				sceneId,
				'viewer',
			),
		).toBe(true);
	});

	it('treats observers as unable to read DM-only scenes', () => {
		const state = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		const env = makeEnvironment();
		const created = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Closed' },
		});
		if (created.status !== 'accepted') return;
		const scene = Object.values(created.nextState.scenes.scenes)[0]!;
		expect(evaluateSceneVisibility(scene, OBSERVER_ACTOR).kind).toBe('hidden');
	});
});
