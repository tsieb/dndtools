import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand } from '../src';

function setupSceneWithWidgets(): {
	state: ReturnType<typeof buildInitialState>;
	env: ReturnType<typeof makeEnvironment>;
	sceneId: string;
	widgetIds: string[];
} {
	const state = buildInitialState(DM_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Combat' },
	});
	if (created.status !== 'accepted') throw new Error('setup failed');
	const sceneId = created.nextState.scenes.scenes &&
		Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene id');
	let next = created.nextState;
	const widgetIds: string[] = [];
	for (const type of ['character', 'map', 'dice']) {
		const add = dispatchCommand(next, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
					configuration: {},
					binding:
						type === 'character'
							? {
									source: { entityType: 'character', entityId: 'char-1' },
									mode: 'read' as const,
									requiredCapability: 'viewer' as const,
								}
							: null,
				},
			},
		});
		if (add.status !== 'accepted') throw new Error('add failed');
		next = add.nextState;
		const added = add.events.find((e) => e.kind === 'scene.widget-added');
		if (added && added.kind === 'scene.widget-added')
			widgetIds.push(added.widgetInstanceId);
	}
	return { state: next, env, sceneId, widgetIds };
}

describe('CANVAS-003: scene layout commands keep bound-entity revisions out of the picture', () => {
	it('resizing a character widget does not touch the bound entity', () => {
		const { state, env, sceneId, widgetIds } = setupSceneWithWidgets();
		const characterWidgetId = widgetIds[0];
		if (!characterWidgetId) throw new Error('no character widget');
		const before = state.scenes.scenes[sceneId];
		if (!before) throw new Error('no scene');

		const result = dispatchCommand(state, env, {
			type: 'scene.resize-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: characterWidgetId, w: 320, h: 240 },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const after = result.nextState.scenes.scenes[sceneId];
		if (!after) throw new Error('no after scene');
		const widget = after.widgets.find((w) => w.id === characterWidgetId);
		expect(widget?.layout.w).toBe(320);
		expect(widget?.layout.h).toBe(240);
		// Bound entity is not mutated; the binding object is unchanged structurally.
		expect(widget?.binding?.source.entityId).toBe('char-1');
		expect(after.ownership.revision).toBe(before.ownership.revision + 1);
	});

	it('move/resize/layer/dock/pin operations all flow through the same command surface', () => {
		const { state, env, sceneId, widgetIds } = setupSceneWithWidgets();
		const widgetId = widgetIds[1];
		if (!widgetId) throw new Error('no widget');
		let cur = state;
		for (const command of [
			{
				type: 'scene.move-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, x: 60, y: 80 },
			},
			{
				type: 'scene.layer-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, z: 99 },
			},
			{
				type: 'scene.dock-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, dock: 'left' },
			},
			{
				type: 'scene.pin-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, pinned: true },
			},
		]) {
			const out = dispatchCommand(cur, env, { actorId: DM_ACTOR.id, ...command });
			expect(out.status).toBe('accepted');
			if (out.status !== 'accepted') return;
			cur = out.nextState;
		}
		const finalScene = cur.scenes.scenes[sceneId];
		if (!finalScene) throw new Error('missing scene');
		const widget = finalScene.widgets.find((w) => w.id === widgetId);
		expect(widget?.layout).toMatchObject({
			x: 60,
			y: 80,
			z: 99,
			dock: 'left',
			pinned: true,
		});
	});

	it('groups and moves widgets together, preserving individual positions and z-order', () => {
		const { state, env, sceneId, widgetIds } = setupSceneWithWidgets();
		const a = widgetIds[0];
		const b = widgetIds[1];
		if (!a || !b) throw new Error('missing widgets');
		const grouped = dispatchCommand(state, env, {
			type: 'scene.group-widgets',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceIds: [a, b] },
		});
		expect(grouped.status).toBe('accepted');
		if (grouped.status !== 'accepted') return;
		const sceneWithGroup = grouped.nextState.scenes.scenes[sceneId];
		if (!sceneWithGroup) throw new Error('missing scene');
		const groupId = sceneWithGroup.widgets.find((w) => w.id === a)?.layout.groupId;
		expect(groupId).toBeTruthy();
		expect(sceneWithGroup.widgets.find((w) => w.id === b)?.layout.groupId).toBe(groupId);

		const moved = dispatchCommand(grouped.nextState, env, {
			type: 'scene.move-group',
			actorId: DM_ACTOR.id,
			payload: { sceneId, groupId, deltaX: 50, deltaY: 25 },
		});
		expect(moved.status).toBe('accepted');
		if (moved.status !== 'accepted') return;
		const sceneAfter = moved.nextState.scenes.scenes[sceneId];
		if (!sceneAfter) throw new Error('missing scene');
		const wa = sceneAfter.widgets.find((w) => w.id === a);
		const wb = sceneAfter.widgets.find((w) => w.id === b);
		expect(wa?.layout).toMatchObject({ x: 50, y: 25 });
		expect(wb?.layout).toMatchObject({ x: 50, y: 25 });
		// z-order preserved (both started at distinct z values).
		expect(wa?.layout.z).not.toEqual(wb?.layout.z);
	});

	it('produces operation records for sync replay (operation-based merge contract)', () => {
		const { state, env, sceneId, widgetIds } = setupSceneWithWidgets();
		const widgetId = widgetIds[0];
		if (!widgetId) throw new Error('no widget');
		const move = dispatchCommand(state, env, {
			type: 'scene.move-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, x: 10, y: 10 },
		});
		expect(move.status).toBe('accepted');
		if (move.status !== 'accepted') return;
		const op =
			move.nextState.sync.operations[move.nextState.sync.operations.length - 1];
		expect(op?.entityType).toBe('scene');
		expect(op?.entityId).toBe(sceneId);
		expect(op?.opType).toBe('scene.move-widget');
		expect(op?.path).toContain('layout/position');
		expect(op?.beforeRevision).toBeDefined();
		expect(op?.afterRevision).toBeDefined();
	});
});
