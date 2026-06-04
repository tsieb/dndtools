import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	dispatchCommand,
	entityBindingKey,
	getPlayerViewForActor,
	getSceneForActor,
	listScenesForActor,
	type CoreStateSlice,
	type EntityBindingRecord,
	type WidgetBinding,
	type WidgetDataEnvironment,
} from '../src';

function envWith(
	records: EntityBindingRecord[],
	knownEntityKeys?: string[],
): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	for (const record of records) {
		entities[entityBindingKey(record.entityType, record.entityId)] = record;
	}
	return { entities, knownEntityKeys, schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION };
}

function binding(entityType: string, entityId: string, selector?: string): WidgetBinding {
	return { source: { entityType, entityId, selector }, mode: 'read', requiredCapability: 'viewer' };
}

function createScene(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	visibility: 'dm-only' | 'shared' | 'player-visible' = 'dm-only',
): { state: CoreStateSlice; sceneId: string } {
	const result = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Player View Test', visibility },
	});
	if (result.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(result.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('missing scene id');
	return { state: result.nextState, sceneId };
}

function addWidget(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	type: string,
	bound: WidgetBinding | null = null,
): { state: CoreStateSlice; widgetId: string } {
	const result = dispatchCommand(state, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type,
				version: '1.0.0',
				layout: { x: 0, y: 0, w: 160, h: 120 },
				binding: bound,
			},
		},
	});
	if (result.status !== 'accepted') throw new Error(`add ${type} failed`);
	const event = result.events.find((item) => item.kind === 'scene.widget-added');
	if (!event || event.kind !== 'scene.widget-added') throw new Error('missing add event');
	return { state: result.nextState, widgetId: event.widgetInstanceId };
}

function grant(
	state: CoreStateSlice,
	entityType: string,
	entityId: string,
	capabilitySet: string,
): CoreStateSlice {
	return {
		...state,
		permissions: {
			...state.permissions,
			grants: [
				...state.permissions.grants,
				{
					id: `grant-${state.permissions.grants.length + 1}`,
					entityType,
					entityId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet,
					createdBy: DM_ACTOR.id,
					createdAt: '2026-06-03T00:00:00.000Z',
				},
			],
		},
	};
}

function project(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	widgetInstanceIds: string[] | null,
	connectionState: 'connected' | 'offline' = 'connected',
	kind: 'scene' | 'widget-subset' | 'handout' | 'map-region' | 'display-state' = widgetInstanceIds
		? 'widget-subset'
		: 'scene',
) {
	return dispatchCommand(state, env, {
		type: 'session.project-player-view',
		actorId: DM_ACTOR.id,
		payload: {
			playerActorIds: [PLAYER_ACTOR.id],
			connectionState,
			target: {
				kind,
				sceneId,
				sectionIds: null,
				widgetInstanceIds,
				displayState: kind === 'display-state' ? { spotlight: true } : null,
				mapRegion: kind === 'map-region' ? { mapId: 'map-1', regionId: 'north' } : null,
			},
		},
	});
}

describe('CANVAS-005/CANVAS-006: player-view projection payloads are session-scoped and filtered', () => {
	it('projects a handout widget to a player view with visible and hidden bindings filtered before delivery', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, sceneId } = createScene(base, env);
		const visible = addWidget(state, env, sceneId, 'note', binding('note', 'handout-visible'));
		const hidden = addWidget(
			visible.state,
			env,
			sceneId,
			'note',
			binding('note', 'handout-secret'),
		);

		const projected = project(
			hidden.state,
			env,
			sceneId,
			[visible.widgetId, hidden.widgetId],
			'connected',
			'handout',
		);
		expect(projected.status).toBe('accepted');
		if (projected.status !== 'accepted') return;
		expect(projected.events[0]).toMatchObject({
			kind: 'session.player-view-projected',
			deliveryStatus: 'delivered',
		});
		const dataEnvironment = envWith([
			{
				entityType: 'note',
				entityId: 'handout-visible',
				visibility: 'player-visible',
				value: { title: 'Safe Handout' },
			},
			{
				entityType: 'note',
				entityId: 'handout-secret',
				visibility: 'dm-only',
				value: { body: 'secret cipher' },
			},
		]);

		const playerView = getPlayerViewForActor(
			projected.nextState.scenes,
			projected.nextState.permissions,
			projected.nextState.session,
			PLAYER_ACTOR.id,
			{ widgetPackages: projected.nextState.widgets, dataEnvironment },
		);
		if (playerView.kind !== 'assigned') throw new Error(`unexpected ${playerView.kind}`);
		expect(playerView.projectionKind).toBe('handout');
		expect(playerView.widgets.map((widget) => widget.kind)).toEqual(['available', 'hidden']);
		expect(JSON.stringify(playerView)).not.toContain('secret cipher');
		// Session projection does not make the DM-only Scene show up as a normal player Scene.
		expect(
			listScenesForActor(
				projected.nextState.scenes,
				projected.nextState.permissions,
				PLAYER_ACTOR.id,
			),
		).toEqual([]);
	});

	it('queues a remote projection while offline and stores degraded delivery status in session state', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const result = project(state, env, sceneId, null, 'offline');
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const assignment = result.nextState.session.playerViewAssignments[PLAYER_ACTOR.id];
		expect(assignment).toMatchObject({
			deliveryStatus: 'queued',
			deliveryReason: 'offline',
			target: { kind: 'scene', sceneId },
		});
		expect(result.nextState.sync.operations.at(-1)).toMatchObject({
			entityType: 'session',
			opType: 'session.project-player-view',
			path: `playerViews/${PLAYER_ACTOR.id}/scene/all`,
		});
	});

	it('returns no default DM Scene layout without an active player-view assignment', () => {
		const env = makeEnvironment();
		const { state } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const playerView = getPlayerViewForActor(
			state.scenes,
			state.permissions,
			state.session,
			PLAYER_ACTOR.id,
		);
		expect(playerView).toEqual({ kind: 'unassigned', playerActorId: PLAYER_ACTOR.id });
	});

	it('reports uncached assigned content as missing offline instead of substituting stale hidden data', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const added = addWidget(state, env, sceneId, 'character', binding('character', 'pc-offline'));
		const projected = project(added.state, env, sceneId, [added.widgetId]);
		if (projected.status !== 'accepted') throw new Error('projection failed');
		const playerView = getPlayerViewForActor(
			projected.nextState.scenes,
			projected.nextState.permissions,
			projected.nextState.session,
			PLAYER_ACTOR.id,
			{
				widgetPackages: projected.nextState.widgets,
				dataEnvironment: envWith([], []),
			},
		);
		if (playerView.kind !== 'assigned') throw new Error(`unexpected ${playerView.kind}`);
		expect(playerView.widgets).toEqual([
			{ kind: 'missing', widgetInstanceId: added.widgetId, type: 'character' },
		]);
		expect(JSON.stringify(playerView)).not.toContain('dmNotes');
	});

	it('omits DM-only character fields from the assigned player-view payload', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const added = addWidget(state, env, sceneId, 'character', binding('character', 'pc-1'));
		const projected = project(added.state, env, sceneId, [added.widgetId]);
		if (projected.status !== 'accepted') throw new Error('projection failed');
		const playerView = getPlayerViewForActor(
			projected.nextState.scenes,
			projected.nextState.permissions,
			projected.nextState.session,
			PLAYER_ACTOR.id,
			{
				widgetPackages: projected.nextState.widgets,
				dataEnvironment: envWith([
					{
						entityType: 'character',
						entityId: 'pc-1',
						visibility: 'player-visible',
						hiddenSelectors: ['dmNotes'],
						value: { hp: 12, dmNotes: 'ambush later' },
					},
				]),
			},
		);
		if (playerView.kind !== 'assigned') throw new Error(`unexpected ${playerView.kind}`);
		expect(playerView.widgets[0]?.kind).toBe('available');
		expect(JSON.stringify(playerView)).not.toContain('ambush later');
	});
});

describe('CANVAS-007: co-editor grants can mutate scenes subject to widget and entity permissions', () => {
	it('allows a scene co-editor with map viewer rights to add a map widget', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'shared',
		);
		const granted = grant(grant(state, 'scene', sceneId, 'co-editor'), 'map', 'map-1', 'viewer');

		const result = dispatchCommand(granted, env, {
			type: 'scene.add-widget',
			actorId: PLAYER_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'map',
					version: '1.0.0',
					layout: { x: 4, y: 8, w: 240, h: 180 },
					binding: binding('map', 'map-1'),
				},
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const added = result.events.find((event) => event.kind === 'scene.widget-added');
		expect(added).toBeTruthy();
		const summary = getSceneForActor(
			result.nextState.scenes,
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			{
				widgetPackages: result.nextState.widgets,
				dataEnvironment: envWith([
					{ entityType: 'map', entityId: 'map-1', visibility: 'player-visible' },
				]),
			},
		);
		if ('kind' in summary) throw new Error(`unexpected ${summary.kind}`);
		expect(summary.widgets[0]?.kind).toBe('available');
	});

	it('rejects rebind from a co-editor who lacks manager rights on the existing widget', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'shared',
		);
		const added = addWidget(state, env, sceneId, 'map', binding('map', 'map-1'));
		const granted = grant(
			grant(added.state, 'scene', sceneId, 'co-editor'),
			'map',
			'map-2',
			'viewer',
		);
		const result = dispatchCommand(granted, env, {
			type: 'scene.configure-widget',
			actorId: PLAYER_ACTOR.id,
			payload: {
				sceneId,
				widgetInstanceId: added.widgetId,
				binding: binding('map', 'map-2'),
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.scenes.scenes[sceneId]?.widgets[0]?.binding?.source.entityId).toBe(
			'map-1',
		);
	});

	it('queues a co-editor layout operation with a field-specific sync path', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			'shared',
		);
		const added = addWidget(state, env, sceneId, 'note');
		const granted = grant(added.state, 'scene', sceneId, 'co-editor');
		const result = dispatchCommand(granted, env, {
			type: 'scene.move-widget',
			actorId: PLAYER_ACTOR.id,
			payload: { sceneId, widgetInstanceId: added.widgetId, x: 40, y: 48 },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.sync.operations.at(-1)).toMatchObject({
			actorId: PLAYER_ACTOR.id,
			entityType: 'scene',
			entityId: sceneId,
			opType: 'scene.move-widget',
			path: `widgets/${added.widgetId}/layout/position`,
		});
	});
});

describe('CANVAS-015: projection does not grant writes or persistent visibility', () => {
	it('lets a player see a projected timer but rejects operation without an operator grant', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const added = addWidget(state, env, sceneId, 'timer');
		const projected = project(added.state, env, sceneId, [added.widgetId]);
		if (projected.status !== 'accepted') throw new Error('projection failed');

		const playerView = getPlayerViewForActor(
			projected.nextState.scenes,
			projected.nextState.permissions,
			projected.nextState.session,
			PLAYER_ACTOR.id,
			{ widgetPackages: projected.nextState.widgets },
		);
		if (playerView.kind !== 'assigned') throw new Error(`unexpected ${playerView.kind}`);
		expect(playerView.widgets[0]?.kind).toBe('available');

		const operate = dispatchCommand(projected.nextState, env, {
			type: 'widget.dispatch-command',
			actorId: PLAYER_ACTOR.id,
			idempotencyKey: 'projected-timer-start',
			payload: {
				sceneId,
				widgetInstanceId: added.widgetId,
				commandType: 'timer.start',
				payload: { durationSeconds: 60 },
				expectedRevision: projected.nextState.scenes.scenes[sceneId]?.ownership.revision,
			},
		});
		expect(operate.status).toBe('rejected');
		if (operate.status !== 'rejected') return;
		expect(operate.rejection.code).toBe('actor-not-authorized');
		expect(operate.nextState.session.timers[added.widgetId]).toBeUndefined();
	});

	it('revokes the player-view assignment without deleting the widget or leaving catch-up visibility', () => {
		const env = makeEnvironment();
		const { state, sceneId } = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const added = addWidget(state, env, sceneId, 'note');
		const projected = project(added.state, env, sceneId, [added.widgetId]);
		if (projected.status !== 'accepted') throw new Error('projection failed');
		const revoked = dispatchCommand(projected.nextState, env, {
			type: 'session.revoke-player-view',
			actorId: DM_ACTOR.id,
			payload: { playerActorIds: [PLAYER_ACTOR.id] },
		});
		expect(revoked.status).toBe('accepted');
		if (revoked.status !== 'accepted') return;
		expect(revoked.nextState.scenes.scenes[sceneId]?.widgets.map((widget) => widget.id)).toEqual([
			added.widgetId,
		]);
		expect(revoked.nextState.permissions.grants).toEqual([]);
		expect(
			getPlayerViewForActor(
				revoked.nextState.scenes,
				revoked.nextState.permissions,
				revoked.nextState.session,
				PLAYER_ACTOR.id,
			),
		).toEqual({ kind: 'unassigned', playerActorId: PLAYER_ACTOR.id });
		expect(revoked.nextState.sync.operations.at(-1)).toMatchObject({
			opType: 'session.revoke-player-view',
			path: `playerViews/${PLAYER_ACTOR.id}`,
		});
	});
});
