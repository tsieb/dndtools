import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getPlayerViewController,
	getPlayerViewForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

const PLAYER_TWO: Actor = {
	id: 'actor-player-2',
	role: 'player',
	displayName: 'Second Player',
};
const PLAYER_THREE: Actor = {
	id: 'actor-player-3',
	role: 'player',
	displayName: 'Third Player',
};

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function createScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
): { state: CoreStateSlice; sceneId: string } {
	const created = accept(
		dispatch(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility: 'dm-only' },
		}),
	);
	const event = created.events.find((candidate) => candidate.kind === 'scene.created');
	if (!event || event.kind !== 'scene.created') throw new Error('missing scene.created event');
	return { state: created.nextState, sceneId: event.sceneId };
}

function addWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	sceneId: string,
	type = 'note',
): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 160, h: 120 },
					binding: null,
				},
			},
		}),
	).nextState;
}

function projectScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	playerActorId: string,
	sceneId: string,
	connectionState: 'connected' | 'offline',
): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'session.project-player-view',
			actorId: DM_ACTOR.id,
			payload: {
				playerActorIds: [playerActorId],
				connectionState,
				target: {
					kind: 'scene',
					sceneId,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		}),
	).nextState;
}

describe('CMD-004 Command Center Player View controller', () => {
	it('lets the DM inspect three participants and assign different Scene views to two players', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_TWO, PLAYER_THREE);
		const first = createScene(base, env, 'Riverside Ambush');
		const second = createScene(first.state, env, 'Secret Keep');
		let state = addWidget(second.state, env, first.sceneId, 'note');
		state = addWidget(state, env, second.sceneId, 'map');
		state = projectScene(state, env, PLAYER_ACTOR.id, first.sceneId, 'connected');
		state = projectScene(state, env, PLAYER_TWO.id, second.sceneId, 'connected');

		const controller = getPlayerViewController(state, DM_ACTOR.id);
		expect(controller.kind).toBe('available');
		if (controller.kind !== 'available') return;
		expect(controller.participants.map((participant) => participant.actorId).sort()).toEqual(
			[PLAYER_ACTOR.id, PLAYER_TWO.id, PLAYER_THREE.id].sort(),
		);
		const firstEntry = controller.participants.find(
			(participant) => participant.actorId === PLAYER_ACTOR.id,
		);
		const secondEntry = controller.participants.find(
			(participant) => participant.actorId === PLAYER_TWO.id,
		);
		const thirdEntry = controller.participants.find(
			(participant) => participant.actorId === PLAYER_THREE.id,
		);
		expect(firstEntry?.assignment).toMatchObject({
			sceneId: first.sceneId,
			sceneName: 'Riverside Ambush',
			deliveryStatus: 'delivered',
		});
		expect(secondEntry?.assignment).toMatchObject({
			sceneId: second.sceneId,
			sceneName: 'Secret Keep',
			deliveryStatus: 'delivered',
		});
		expect(thirdEntry?.assignment).toBeNull();

		const firstPlayerView = getPlayerViewForActor(
			state.scenes,
			state.permissions,
			state.session,
			PLAYER_ACTOR.id,
			{ widgetPackages: state.widgets },
		);
		const secondPlayerView = getPlayerViewForActor(
			state.scenes,
			state.permissions,
			state.session,
			PLAYER_TWO.id,
			{ widgetPackages: state.widgets },
		);
		const thirdPlayerView = getPlayerViewForActor(
			state.scenes,
			state.permissions,
			state.session,
			PLAYER_THREE.id,
			{ widgetPackages: state.widgets },
		);
		if (firstPlayerView.kind !== 'assigned' || secondPlayerView.kind !== 'assigned') {
			throw new Error('expected assigned player views');
		}
		expect(firstPlayerView.name).toBe('Riverside Ambush');
		expect(secondPlayerView.name).toBe('Secret Keep');
		expect(thirdPlayerView).toEqual({ kind: 'unassigned', playerActorId: PLAYER_THREE.id });
	});

	it('saves an offline assignment and marks the same assignment delivered when the player reconnects', () => {
		const env = makeEnvironment();
		const created = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_TWO),
			env,
			'Reconnect Scene',
		);
		const queued = projectScene(created.state, env, PLAYER_TWO.id, created.sceneId, 'offline');
		const offlineAssignment = queued.session.playerViewAssignments[PLAYER_TWO.id];
		expect(offlineAssignment).toMatchObject({
			deliveryStatus: 'queued',
			deliveryReason: 'offline',
			target: { sceneId: created.sceneId },
		});

		const reconnected = projectScene(queued, env, PLAYER_TWO.id, created.sceneId, 'connected');
		const deliveredAssignment = reconnected.session.playerViewAssignments[PLAYER_TWO.id];
		expect(deliveredAssignment).toMatchObject({
			id: offlineAssignment?.id,
			deliveryStatus: 'delivered',
			deliveryReason: 'connected',
			revision: 2,
		});
		const playerView = getPlayerViewForActor(
			reconnected.scenes,
			reconnected.permissions,
			reconnected.session,
			PLAYER_TWO.id,
		);
		expect(playerView).toMatchObject({
			kind: 'assigned',
			deliveryStatus: 'delivered',
			deliveryReason: 'connected',
			name: 'Reconnect Scene',
		});
		expect(reconnected.sync.operations.map((operation) => operation.opType)).toContain(
			'session.project-player-view',
		);
	});

	it('denies the controller view model to non-DM actors', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		expect(getPlayerViewController(state, PLAYER_ACTOR.id)).toEqual({
			kind: 'denied',
			reason: 'actor-not-authorized',
		});
	});
});
