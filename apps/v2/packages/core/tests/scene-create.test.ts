import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, listScenesForActor } from '../src';

describe('CANVAS-001: create Scene with full metadata', () => {
	it('persists name, description, tags, visibility, ownership, and visual settings on accept', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: {
				name: 'Goblin Ambush',
				description: 'Forest road, dusk',
				tags: ['session-3', 'combat'],
				visibility: 'dm-only',
				visualSettings: { background: 'parchment' },
			},
		});

		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const sceneId = (result.events.find((e) => e.kind === 'scene.created') as {
			sceneId: string;
		}).sceneId;
		const stored = result.nextState.scenes.scenes[sceneId];
		expect(stored).toMatchObject({
			name: 'Goblin Ambush',
			description: 'Forest road, dusk',
			tags: ['session-3', 'combat'],
			visibility: 'dm-only',
			visualSettings: { background: 'parchment' },
		});
		expect(stored?.ownership.ownerActorId).toBe(DM_ACTOR.id);
		expect(stored?.ownership.revision).toBe(1);
		expect(stored?.sections).toEqual([]);
		expect(stored?.widgets).toEqual([]);
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations).toHaveLength(1);
	});

	it('appears in DM Scene selection after persistence and rehydration', () => {
		// Simulate restart: the dispatcher returns next state, which a storage adapter persists.
		// Rebuilding "state" from that persisted slice recreates the selection list deterministically.
		const initial = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		const created = dispatchCommand(initial, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Tavern Recap', visibility: 'dm-only' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;

		const reloaded = {
			scenes: structuredClone(created.nextState.scenes),
			permissions: structuredClone(created.nextState.permissions),
			sync: { operations: [] },
		};

		const dmList = listScenesForActor(reloaded.scenes, reloaded.permissions, DM_ACTOR.id);
		expect(dmList.map((s) => s.name)).toEqual(['Tavern Recap']);
	});

	it('returns no Scene data to a player while a DM-only Scene exists and no projection or share is authored', () => {
		const initial = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		const created = dispatchCommand(initial, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Secret Plot', visibility: 'dm-only' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;

		const playerList = listScenesForActor(
			created.nextState.scenes,
			created.nextState.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerList).toEqual([]);
	});

	it('rejects observer and player attempts to create Scenes (DM-only command)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const env = makeEnvironment();
		for (const id of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const result = dispatchCommand(state, env, {
				type: 'scene.create',
				actorId: id,
				payload: { name: 'Player Try' },
			});
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected')
				expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('rejects payloads missing required schema fields and writes no partial SceneState', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { description: 'no name field' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected')
			expect(result.rejection.code).toBe('invalid-payload');
		expect(result.nextState.scenes.scenes).toEqual({});
		expect(result.nextState.sync.operations).toEqual([]);
	});
});
