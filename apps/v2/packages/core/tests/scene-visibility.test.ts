import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, getSceneForActor, listScenesForActor } from '../src';

function createSharedScene() {
	const env = makeEnvironment();
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Shared Forum', visibility: 'shared' },
	});
	if (created.status !== 'accepted') throw new Error('create');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no id');
	return { state: created.nextState, env, sceneId };
}

describe('CANVAS-013: Scene-level metadata authored independently of widget layout and entity data', () => {
	it('player assigned to a shared Scene sees the Scene shell while DM-only authoring is still distinct', () => {
		const { state, env, sceneId } = createSharedScene();
		const assigned = dispatchCommand(state, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: null }],
			},
		});
		expect(assigned.status).toBe('accepted');
		if (assigned.status !== 'accepted') return;
		const playerList = listScenesForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerList.map((s) => s.name)).toEqual(['Shared Forum']);
		const summary = getSceneForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
		);
		expect('widgets' in summary).toBe(true);
	});

	it('changing tags or background does not touch widget bindings or canonical entity revision', () => {
		const { state, env, sceneId } = createSharedScene();
		const before = state.scenes.scenes[sceneId];
		expect(before).toBeTruthy();

		const result = dispatchCommand(state, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				tags: ['new-tag'],
				visualSettings: { background: 'dark' },
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const after = result.nextState.scenes.scenes[sceneId];
		if (!before || !after) throw new Error('missing scene');
		expect(after.tags).toEqual(['new-tag']);
		expect(after.visualSettings.background).toBe('dark');
		expect(after.widgets).toEqual(before.widgets);
	});

	it('non-DM editors cannot author Scene metadata', () => {
		const { state, env, sceneId } = createSharedScene();
		const denied = dispatchCommand(state, env, {
			type: 'scene.update-metadata',
			actorId: PLAYER_ACTOR.id,
			payload: { sceneId, tags: ['hax'] },
		});
		expect(denied.status).toBe('rejected');
		if (denied.status !== 'rejected') return;
		expect(denied.rejection.code).toBe('actor-not-authorized');
	});
});
