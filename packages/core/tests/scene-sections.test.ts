import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, getSceneForActor, type BindingResolver, type WidgetInstance } from '../src';

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
	for (const type of ['note', 'map', 'dice']) {
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

		// Add a 4th widget bound to a known entity that is hidden for the player — it will
		// land in the player's assigned section but actor-scoped binding resolution must
		// still redact it (section membership does NOT bypass binding filtering).
		const boundAdded = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'note',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
					binding: {
						source: { entityType: 'note', entityId: 'sec-b-secret' },
						mode: 'read',
						requiredCapability: 'viewer',
					},
				},
			},
		});
		if (boundAdded.status !== 'accepted') throw new Error('add bound widget');
		const boundWidgetId = (
			boundAdded.events.find((ev) => ev.kind === 'scene.widget-added') as
				| { kind: 'scene.widget-added'; widgetInstanceId: string }
				| undefined
		)?.widgetInstanceId;
		if (!boundWidgetId) throw new Error('missing bound widget id');

		const sectioned = dispatchCommand(boundAdded.nextState, env, {
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
						// widgetIds[1] and [2] are unbound (available); boundWidgetId is hidden for player
						widgetInstanceIds: [widgetIds[1]!, widgetIds[2]!, boundWidgetId],
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

		// Binding resolver: 'sec-b-secret' is a known entity but hidden for the player actor.
		// This proves actor-scoped filtering still runs even for a widget that is within the
		// assigned section scope.
		const secretEntityId = 'sec-b-secret';
		const bindingResolver: BindingResolver = {
			knownEntityIds: new Set([secretEntityId]),
			isHiddenForActor: (widget: WidgetInstance, actorId: string) =>
				actorId === PLAYER_ACTOR.id &&
				widget.binding?.source.entityId === secretEntityId,
		};

		const playerSummary = getSceneForActor(
			assigned.nextState.scenes,
			assigned.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			bindingResolver,
		);
		if (!('widgets' in playerSummary)) throw new Error('denied');

		// Section narrowing: only sec-b widgets delivered (sec-a widget excluded)
		expect(playerSummary.assignedSectionIds).toEqual(['sec-b']);
		const deliveredIds = playerSummary.widgets.map((p) =>
			'widgetInstanceId' in p ? p.widgetInstanceId : (p as { widget: { id: string } }).widget.id,
		);
		expect(deliveredIds).not.toContain(widgetIds[0]);

		// Unbound widgets inside sec-b are available to the player
		const availableIds = playerSummary.widgets
			.filter((p) => p.kind === 'available')
			.map((p) => (p.kind === 'available' ? p.widget.id : null));
		expect(availableIds.sort()).toEqual([widgetIds[1]!, widgetIds[2]!].sort());

		// Binding filter still runs: the entity-hidden widget inside sec-b is hidden, not leaked
		const hiddenPayload = playerSummary.widgets.find(
			(p) => ('widgetInstanceId' in p ? p.widgetInstanceId : null) === boundWidgetId,
		);
		expect(hiddenPayload?.kind).toBe('hidden');
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
