import { describe, expect, it } from 'vitest';
import {
	crossPlayerLeakedWidgetIds,
	deliveredWidgetInstanceIds,
	dispatchCommand,
	playerCanEditPlayerView,
	projectPlayerViews,
	type CommandResult,
	type CoreStateSlice,
	type WidgetBinding,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { Actor } from '../src/state/permission-state';

/**
 * COLLAB-005 — the DM controls DIFFERENT Player View assignments for DIFFERENT players during the SAME
 * session (Architecture Contract 4 Player View Rules).
 *
 *   AC1: Given Player A and Player B are connected, when the DM projects different Scene subsets, then each
 *        player receives ONLY their assigned subset.
 *   AC2: Given a player attempts to add a widget to their Player View WITHOUT `co-editor`, when submitted,
 *        then the command is rejected.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function binding(entityType: string, entityId: string): WidgetBinding {
	return { source: { entityType, entityId }, mode: 'read', requiredCapability: 'viewer' };
}

function createScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	visibility: 'dm-only' | 'shared' | 'player-visible' = 'shared',
): { state: CoreStateSlice; sceneId: string } {
	const result = accept(
		dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Player Views', visibility },
		}),
	);
	const sceneId = Object.keys(result.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('missing scene id');
	return { state: result.nextState, sceneId };
}

function addWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	sceneId: string,
	type: string,
	bound: WidgetBinding | null = null,
): { state: CoreStateSlice; widgetId: string } {
	const result = accept(
		dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: { type, version: '1.0.0', layout: { x: 0, y: 0, w: 160, h: 120 }, binding: bound },
			},
		}),
	);
	const event = result.events.find((item) => item.kind === 'scene.widget-added');
	if (!event || event.kind !== 'scene.widget-added') throw new Error('missing add event');
	return { state: result.nextState, widgetId: event.widgetInstanceId };
}

function projectSubset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	playerActorId: string,
	sceneId: string,
	widgetInstanceIds: string[],
): CoreStateSlice {
	return accept(
		dispatchCommand(state, env, {
			type: 'session.project-player-view',
			actorId: DM_ACTOR.id,
			payload: {
				playerActorIds: [playerActorId],
				connectionState: 'connected',
				target: {
					kind: 'widget-subset',
					sceneId,
					sectionIds: null,
					widgetInstanceIds,
					displayState: null,
					mapRegion: null,
				},
			},
		}),
	).nextState;
}

function grantCoEditor(state: CoreStateSlice, sceneId: string, playerActorId: string): CoreStateSlice {
	return {
		...state,
		permissions: {
			...state.permissions,
			grants: [
				...state.permissions.grants,
				{
					id: `grant-coedit-${playerActorId}`,
					entityType: 'scene',
					entityId: sceneId,
					playerActorId,
					capabilitySet: 'co-editor',
					createdBy: DM_ACTOR.id,
					createdAt: '2026-06-05T00:00:00.000Z',
				},
			],
		},
	};
}

describe('COLLAB-005: per-player Player View assignments during one session', () => {
	it('AC1: Player A and Player B each receive ONLY their own assigned widget subset', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B);
		const { state, sceneId } = createScene(base, env);
		// Three widgets on one shared scene: A gets w1, B gets w2 — w3 goes to neither.
		const w1 = addWidget(state, env, sceneId, 'note', binding('note', 'note-a'));
		const w2 = addWidget(w1.state, env, sceneId, 'note', binding('note', 'note-b'));
		const w3 = addWidget(w2.state, env, sceneId, 'note', binding('note', 'note-c'));

		let next = projectSubset(w3.state, env, PLAYER_ACTOR.id, sceneId, [w1.widgetId]);
		next = projectSubset(next, env, PLAYER_B.id, sceneId, [w2.widgetId]);

		const snapshot = projectPlayerViews(next.scenes, next.permissions, next.session, [
			PLAYER_ACTOR.id,
			PLAYER_B.id,
		]);

		// The DM is never a projection recipient; only the two players appear.
		expect(snapshot.participants.map((p) => p.actorId)).toEqual([PLAYER_ACTOR.id, PLAYER_B.id]);

		const a = snapshot.participants.find((p) => p.actorId === PLAYER_ACTOR.id)!;
		const b = snapshot.participants.find((p) => p.actorId === PLAYER_B.id)!;

		// Each player receives ONLY their assigned subset.
		expect(deliveredWidgetInstanceIds(a.view)).toEqual([w1.widgetId]);
		expect(deliveredWidgetInstanceIds(b.view)).toEqual([w2.widgetId]);
		// Neither player's view contains the other's widget, nor the unprojected w3.
		expect(deliveredWidgetInstanceIds(a.view)).not.toContain(w2.widgetId);
		expect(deliveredWidgetInstanceIds(b.view)).not.toContain(w1.widgetId);
		expect(deliveredWidgetInstanceIds(a.view)).not.toContain(w3.widgetId);
		expect(deliveredWidgetInstanceIds(b.view)).not.toContain(w3.widgetId);

		// Hard proof: neither delivered view exceeds that participant's own assignment.
		expect(crossPlayerLeakedWidgetIds(next.session, a)).toEqual([]);
		expect(crossPlayerLeakedWidgetIds(next.session, b)).toEqual([]);
	});

	it('AC1: an unassigned connected player gets an unassigned view (no default DM layout leaks)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B);
		const { state, sceneId } = createScene(base, env);
		const w1 = addWidget(state, env, sceneId, 'note', binding('note', 'note-a'));
		// Only Player A is projected; Player B is connected but has no assignment.
		const next = projectSubset(w1.state, env, PLAYER_ACTOR.id, sceneId, [w1.widgetId]);

		const snapshot = projectPlayerViews(next.scenes, next.permissions, next.session, [
			PLAYER_ACTOR.id,
			PLAYER_B.id,
		]);
		const b = snapshot.participants.find((p) => p.actorId === PLAYER_B.id)!;
		expect(b.view.kind).toBe('unassigned');
		expect(b.assignment).toBeNull();
		expect(deliveredWidgetInstanceIds(b.view)).toEqual([]);
	});

	it('AC1: the DM and an unknown id are excluded from the projection snapshot (no view data)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state } = createScene(base, env);
		const snapshot = projectPlayerViews(state.scenes, state.permissions, state.session, [
			DM_ACTOR.id,
			PLAYER_ACTOR.id,
			'actor-ghost',
		]);
		expect(snapshot.participants.map((p) => p.actorId)).toEqual([PLAYER_ACTOR.id]);
		// `excluded` is sorted by actorId: 'actor-dm' < 'actor-ghost'.
		expect(snapshot.excluded).toEqual([
			{ actorId: DM_ACTOR.id, reason: 'is-dm' },
			{ actorId: 'actor-ghost', reason: 'unknown-actor' },
		]);
	});

	it('AC2: a player WITHOUT co-editor cannot add a widget to their Player View (rejected)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, sceneId } = createScene(base, env);
		const w1 = addWidget(state, env, sceneId, 'note', binding('note', 'note-a'));
		const next = projectSubset(w1.state, env, PLAYER_ACTOR.id, sceneId, [w1.widgetId]);

		// The gate reports the player CANNOT edit (no co-editor grant).
		expect(playerCanEditPlayerView(next.permissions, PLAYER_ACTOR.id, sceneId)).toBe(false);

		// And the actual command is rejected fail closed — no widget is added.
		const before = next.scenes.scenes[sceneId]!.widgets.length;
		const result = dispatchCommand(next, env, {
			type: 'scene.add-widget',
			actorId: PLAYER_ACTOR.id,
			payload: {
				sceneId,
				widget: { type: 'note', version: '1.0.0', layout: { x: 8, y: 8, w: 100, h: 80 }, binding: null },
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.scenes.scenes[sceneId]!.widgets.length).toBe(before);
	});

	it('AC2: a player WITH co-editor may edit their Player View (gate and command agree)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, sceneId } = createScene(base, env);
		const w1 = addWidget(state, env, sceneId, 'note', binding('note', 'note-a'));
		const projected = projectSubset(w1.state, env, PLAYER_ACTOR.id, sceneId, [w1.widgetId]);
		const next = grantCoEditor(projected, sceneId, PLAYER_ACTOR.id);

		expect(playerCanEditPlayerView(next.permissions, PLAYER_ACTOR.id, sceneId)).toBe(true);

		const result = dispatchCommand(next, env, {
			type: 'scene.add-widget',
			actorId: PLAYER_ACTOR.id,
			payload: {
				sceneId,
				widget: { type: 'note', version: '1.0.0', layout: { x: 8, y: 8, w: 100, h: 80 }, binding: null },
			},
		});
		expect(result.status).toBe('accepted');
	});

	it('AC2: an observer can never edit a Player View, regardless of grants', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		const { state, sceneId } = createScene(base, env, 'player-visible');
		// Even with a (consistency-invalid) co-editor grant on the observer, the edit gate fails closed.
		const withGrant = grantCoEditor(state, sceneId, OBSERVER_ACTOR.id);
		expect(playerCanEditPlayerView(withGrant.permissions, OBSERVER_ACTOR.id, sceneId)).toBe(false);
	});
});
