import { describe, expect, it } from 'vitest';
import {
	SESSION_WORKFLOW_STATES,
	createDemoMapState,
	dispatchCommand,
	getActiveMapViewForActor,
	getSessionParticipantStatus,
	getSessionWidgetMode,
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

function withMaps(state = buildInitialState(DM_ACTOR, PLAYER_ACTOR)): CoreStateSlice {
	return { ...state, maps: createDemoMapState() };
}

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

function ensureHome(
	state: CoreStateSlice,
	env: CoreEnvironment,
): {
	state: CoreStateSlice;
	homeSceneId: string;
} {
	const result = accept(
		dispatch(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const homeSceneId = result.nextState.commandCenter.homeSceneId;
	if (!homeSceneId) throw new Error('missing home Scene');
	return { state: result.nextState, homeSceneId };
}

function startActive(state: CoreStateSlice, env: CoreEnvironment, sceneId: string): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
}

describe('CMD-003 active map control', () => {
	it('changes the Command Center map widget binding and records the active map in Session State', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		const mapWidget = state.scenes.scenes[homeSceneId]?.widgets.find(
			(widget) => widget.type === 'map',
		);
		expect(mapWidget).toBeDefined();

		const first = accept(
			dispatch(state, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-western-reaches', regionId: 'region-north-road' },
			}),
		);
		expect(first.nextState.session.activeMap).toMatchObject({
			mapId: 'map-western-reaches',
			regionId: 'region-north-road',
			sceneId: homeSceneId,
			widgetInstanceId: mapWidget?.id,
		});
		expect(
			first.nextState.scenes.scenes[homeSceneId]?.widgets.find(
				(widget) => widget.id === mapWidget?.id,
			)?.binding,
		).toMatchObject({
			source: {
				entityType: 'map',
				entityId: 'map-western-reaches',
				selector: 'region:region-north-road',
			},
		});

		const second = accept(
			dispatch(first.nextState, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-ruined-keep', regionId: 'region-ground-floor' },
			}),
		);
		expect(second.nextState.session.activeMap).toMatchObject({
			mapId: 'map-ruined-keep',
			regionId: 'region-ground-floor',
			widgetInstanceId: mapWidget?.id,
			revision: 2,
		});
		expect(
			second.nextState.scenes.scenes[homeSceneId]?.widgets.find(
				(widget) => widget.id === mapWidget?.id,
			)?.binding?.source.entityId,
		).toBe('map-ruined-keep');
		expect(second.nextState.sync.operations.map((operation) => operation.opType)).toContain(
			'session.set-active-map',
		);
	});

	it('projects only player-visible or shared map layers to the player preview', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		const selected = accept(
			dispatch(state, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-ruined-keep', regionId: 'region-ground-floor' },
			}),
		);
		const active = startActive(selected.nextState, env, homeSceneId);
		const projected = accept(
			dispatch(active, env, {
				type: 'session.project-active-map',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' },
			}),
		);

		const dmView = getActiveMapViewForActor(
			projected.nextState.maps,
			projected.nextState.permissions,
			projected.nextState.session,
			DM_ACTOR.id,
		);
		const playerView = getActiveMapViewForActor(
			projected.nextState.maps,
			projected.nextState.permissions,
			projected.nextState.session,
			PLAYER_ACTOR.id,
		);
		if (dmView.kind !== 'available' || playerView.kind !== 'available') {
			throw new Error('expected active map views');
		}
		expect(dmView.layers.map((layer) => layer.name)).toContain('Secret Ambush');
		expect(playerView.layers.map((layer) => layer.name)).toEqual(['Rooms', 'Fog of War']);
		expect(playerView.hiddenLayerCount).toBe(1);
		expect(JSON.stringify(playerView)).not.toContain('Secret Ambush');
		expect(projected.events[0]).toMatchObject({
			kind: 'session.active-map-projected',
			deliveryStatus: 'delivered',
		});
	});

	it('rejects active map controls for non-DM actors', () => {
		const env = makeEnvironment();
		const { state } = ensureHome(withMaps(), env);
		const result = dispatch(state, env, {
			type: 'session.set-active-map',
			actorId: PLAYER_ACTOR.id,
			payload: { mapId: 'map-western-reaches', regionId: null },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('CMD-006 session workflow control', () => {
	it('supports every named workflow state through the command schema', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		let current = state;
		for (const workflow of SESSION_WORKFLOW_STATES) {
			const result = dispatch(current, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: {
					workflow,
					...(workflow === 'active' ||
					workflow === 'prep' ||
					workflow === 'paused' ||
					workflow === 'ending'
						? { activeSceneId: homeSceneId }
						: {}),
				},
			});
			expect(result.status).toBe('accepted');
			if (result.status === 'accepted') current = result.nextState;
		}
		expect(current.session.workflow).toBe('archived');
	});

	it('preserves combat, dice history, timers, and active Scene across pause/resume navigation state', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		let current = startActive(state, env, homeSceneId);
		current = accept(
			dispatch(current, env, {
				type: 'session.update-combat',
				actorId: DM_ACTOR.id,
				payload: { encounterId: 'enc-1', round: 3, turn: 2, combatantIds: ['pc-1', 'goblin-1'] },
			}),
		).nextState;
		current = accept(
			dispatch(current, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20+5', total: 18 },
			}),
		).nextState;
		const timer = current.scenes.scenes[homeSceneId]?.widgets.find(
			(widget) => widget.type === 'timer',
		);
		if (!timer) throw new Error('missing timer widget');
		current = accept(
			dispatch(current, env, {
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				idempotencyKey: 'cmd-006-timer-start',
				payload: {
					sceneId: homeSceneId,
					widgetInstanceId: timer.id,
					commandType: 'timer.start',
					payload: { durationSeconds: 600 },
					expectedRevision: current.scenes.scenes[homeSceneId]?.ownership.revision,
				},
			}),
		).nextState;

		const paused = accept(
			dispatch(current, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'paused', activeSceneId: homeSceneId },
			}),
		).nextState;
		expect(paused.session.activeSceneId).toBe(homeSceneId);
		expect(paused.session.combat).toMatchObject({ encounterId: 'enc-1', round: 3, turn: 2 });
		expect(paused.session.diceHistory).toHaveLength(1);
		expect(paused.session.timers[timer.id]).toMatchObject({ durationSeconds: 600 });
		expect(
			getSessionParticipantStatus(paused.session, paused.permissions, PLAYER_ACTOR.id),
		).toMatchObject({
			connection: 'paused-degraded',
			canExecuteLiveCommands: false,
		});

		const blocked = dispatch(paused, env, {
			type: 'widget.dispatch-command',
			actorId: DM_ACTOR.id,
			idempotencyKey: 'cmd-006-paused-timer',
			payload: {
				sceneId: homeSceneId,
				widgetInstanceId: timer.id,
				commandType: 'timer.start',
				payload: { durationSeconds: 30 },
				expectedRevision: paused.scenes.scenes[homeSceneId]?.ownership.revision,
			},
		});
		expect(blocked.status).toBe('rejected');
		if (blocked.status === 'rejected') expect(blocked.rejection.code).toBe('invalid-state');

		const resumed = accept(
			dispatch(paused, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId },
			}),
		).nextState;
		expect(resumed.session.combat).toEqual(paused.session.combat);
		expect(resumed.session.diceHistory).toEqual(paused.session.diceHistory);
		expect(resumed.session.timers).toEqual(paused.session.timers);
	});

	it('archives live state when recap starts and resets active Session State', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		let current = startActive(state, env, homeSceneId);
		current = accept(
			dispatch(current, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '2d6', total: 7 },
			}),
		).nextState;
		const ending = accept(
			dispatch(current, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'ending', activeSceneId: homeSceneId },
			}),
		).nextState;
		const recap = accept(
			dispatch(ending, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'recap' },
			}),
		).nextState;

		expect(recap.session.workflow).toBe('recap');
		expect(recap.session.activeSceneId).toBeNull();
		expect(recap.session.diceHistory).toEqual([]);
		expect(recap.session.recapArchiveId).not.toBeNull();
		const archive = recap.session.archives[recap.session.recapArchiveId!];
		expect(archive).toMatchObject({
			workflowBeforeArchive: 'ending',
			activeSceneId: homeSceneId,
		});
		expect(archive?.diceHistory).toHaveLength(1);
		expect(getSessionWidgetMode(recap.session)).toMatchObject({
			mode: 'archived',
			canMutateActiveSession: false,
			recapArchiveId: recap.session.recapArchiveId,
		});
	});

	it('marks prep widgets as draft state rather than live mutable Session State', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = ensureHome(withMaps(), env);
		const prep = accept(
			dispatch(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'prep', activeSceneId: homeSceneId },
			}),
		).nextState;
		expect(getSessionWidgetMode(prep.session)).toMatchObject({
			mode: 'draft',
			canMutateActiveSession: false,
		});
	});
});
