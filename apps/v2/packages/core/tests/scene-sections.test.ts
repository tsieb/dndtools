import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, getSceneForActor } from '../src';

function setup() {
	const env = makeEnvironment();
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Dual Section', visibility: 'shared' },
	});
	if (created.status !== 'accepted') throw new Error('create');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no id');
	let cur = created.nextState;
	const widgetIds: string[] = [];
	for (const type of ['handout-a', 'handout-b', 'handout-c']) {
		const out = dispatchCommand(cur, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
				},
			},
		});
		if (out.status !== 'accepted') throw new Error('add');
		cur = out.nextState;
		const e = out.events.find((ev) => ev.kind === 'scene.widget-added');
		if (e && e.kind === 'scene.widget-added') widgetIds.push(e.widgetInstanceId);
	}
	return { state: cur, env, sceneId, widgetIds };
}

describe('CANVAS-018: sections are layout regions on SceneState, never independent containers', () => {
	it('persists sections as layout metadata on the Scene document, not separate widget owners', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const sectionsResult = dispatchCommand(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'sec-1',
						name: 'DM aside',
						bounds: { x: 0, y: 0, w: 500, h: 300 },
						widgetInstanceIds: [widgetIds[0]!],
					},
					{
						id: 'sec-2',
						name: 'Player handouts',
						bounds: { x: 0, y: 320, w: 500, h: 300 },
						widgetInstanceIds: [widgetIds[1]!, widgetIds[2]!],
					},
				],
			},
		});
		expect(sectionsResult.status).toBe('accepted');
		if (sectionsResult.status !== 'accepted') return;
		const scene = sectionsResult.nextState.scenes.scenes[sceneId];
		expect(scene?.sections).toHaveLength(2);
		// Widgets still live in the scene's widget list — sections only reference them by id.
		expect(scene?.widgets.map((w) => w.id).sort()).toEqual([...widgetIds].sort());
	});

	it('narrows player payload to assigned section widgets while still filtering bindings per actor', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const sectioned = dispatchCommand(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'sec-a',
						name: 'DM aside',
						bounds: { x: 0, y: 0, w: 500, h: 300 },
						widgetInstanceIds: [widgetIds[0]!],
					},
					{
						id: 'sec-b',
						name: 'Player handouts',
						bounds: { x: 0, y: 320, w: 500, h: 300 },
						widgetInstanceIds: [widgetIds[1]!, widgetIds[2]!],
					},
				],
			},
		});
		if (sectioned.status !== 'accepted') return;
		const assigned = dispatchCommand(sectioned.nextState, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: ['sec-b'] }],
			},
		});
		if (assigned.status !== 'accepted') return;
		const playerSummary = getSceneForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
		);
		if (!('widgets' in playerSummary)) throw new Error('denied');
		const visibleIds = playerSummary.widgets
			.filter((p) => p.kind === 'available')
			.map((p) => (p.kind === 'available' ? p.widget.id : null));
		expect(visibleIds.sort()).toEqual([widgetIds[1]!, widgetIds[2]!].sort());
		expect(playerSummary.assignedSectionIds).toEqual(['sec-b']);
	});

	it('rejects sections that reference unknown widget ids (no orphan ownership boundaries)', () => {
		const { state, env, sceneId } = setup();
		const bad = dispatchCommand(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'sec-x',
						name: 'Bogus',
						bounds: { x: 0, y: 0, w: 1, h: 1 },
						widgetInstanceIds: ['does-not-exist'],
					},
				],
			},
		});
		expect(bad.status).toBe('rejected');
		if (bad.status !== 'rejected') return;
		expect(bad.rejection.code).toBe('invalid-state');
	});
});
