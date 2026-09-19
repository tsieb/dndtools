import { describe, expect, it } from 'vitest';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	dispatchCommand,
	resolveSelectionLayoutCommand,
	resolveWidgetOrderCommand,
	widgetPaintOrder,
	withWidgetOrder,
} from '../src';

function setup() {
	const env = makeEnvironment();
	const created = dispatchCommand(buildInitialState(DM_ACTOR), env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Arrange' },
	});
	if (created.status !== 'accepted') throw new Error('setup failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0]!;
	let state = created.nextState;
	const ids: string[] = [];
	for (const type of ['character', 'map', 'dice']) {
		const add = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 100, h: 100 },
					configuration: {},
					binding: null,
				},
			},
		});
		if (add.status !== 'accepted') throw new Error('add failed');
		state = add.nextState;
		const added = add.events.find((event) => event.kind === 'scene.widget-added');
		if (added?.kind === 'scene.widget-added') ids.push(added.widgetInstanceId);
	}
	return { state, env, sceneId, ids, scene: () => state.scenes.scenes[sceneId]! };
}

describe('RC-CAN-3.6: scene.set-widget-order', () => {
	it('reorders the paint order and renumbers z to match', () => {
		const { state, env, sceneId, ids } = setup();
		const order = [ids[2]!, ids[0]!, ids[1]!];
		const result = dispatchCommand(state, env, {
			type: 'scene.set-widget-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceIds: order },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const scene = result.nextState.scenes.scenes[sceneId]!;
		expect(widgetPaintOrder(scene)).toEqual(order);
		expect(scene.widgets.map((widget) => widget.layout.z)).toEqual([1, 2, 3]);
		expect(scene.ownership.revision).toBe(state.scenes.scenes[sceneId]!.ownership.revision + 1);
		expect(result.events.every((event) => event.kind === 'scene.widget-layout-changed')).toBe(true);
	});

	it('rejects an order that drops, repeats or invents a widget', () => {
		const { state, env, sceneId, ids } = setup();
		for (const widgetInstanceIds of [
			[ids[0]!, ids[1]!],
			[ids[0]!, ids[1]!, ids[1]!],
			[ids[0]!, ids[1]!, 'ghost'],
		]) {
			const result = dispatchCommand(state, env, {
				type: 'scene.set-widget-order',
				actorId: DM_ACTOR.id,
				payload: { sceneId, widgetInstanceIds },
			});
			expect(result.status).toBe('rejected');
		}
	});

	it('withWidgetOrder keeps unchanged widgets by identity', () => {
		const { scene } = setup();
		const current = scene();
		const same = withWidgetOrder(current, widgetPaintOrder(current))!;
		expect(same.widgets.every((widget, index) => widget === current.widgets[index])).toBe(true);
	});

	it('resolveWidgetOrderCommand skips no-ops and non-permutations', () => {
		const { scene, ids } = setup();
		expect(resolveWidgetOrderCommand(scene(), widgetPaintOrder(scene()))).toBeNull();
		expect(resolveWidgetOrderCommand(scene(), [ids[0]!])).toBeNull();
		expect(resolveWidgetOrderCommand(scene(), [ids[1]!, ids[0]!, ids[2]!])).toEqual({
			type: 'scene.set-widget-order',
			payload: { sceneId: scene().id, widgetInstanceIds: [ids[1], ids[0], ids[2]] },
		});
	});
});

describe('RC-CAN-3.6: grouping a selection', () => {
	it('groups, then ungroups every member of the touched group', () => {
		const { state, env, sceneId, ids } = setup();
		const group = resolveSelectionLayoutCommand(
			{ id: 'group-selection' },
			state.scenes.scenes[sceneId]!,
			[ids[0]!, ids[2]!],
		)!;
		const grouped = dispatchCommand(state, env, { actorId: DM_ACTOR.id, ...group });
		if (grouped.status !== 'accepted') throw new Error('group failed');
		const groupedScene = grouped.nextState.scenes.scenes[sceneId]!;
		const groupId = groupedScene.widgets[0]!.layout.groupId;
		expect(groupId).toBeTruthy();
		expect(groupedScene.widgets[2]!.layout.groupId).toBe(groupId);

		// Selecting ONE member still ungroups the whole group, so nobody is left in a group of one.
		const ungroup = resolveSelectionLayoutCommand({ id: 'ungroup-selection' }, groupedScene, [
			ids[0]!,
		])!;
		expect(ungroup.payload).toMatchObject({ ungroup: true, widgetInstanceIds: [ids[0], ids[2]] });
		const ungrouped = dispatchCommand(grouped.nextState, env, { actorId: DM_ACTOR.id, ...ungroup });
		if (ungrouped.status !== 'accepted') throw new Error('ungroup failed');
		expect(
			ungrouped.nextState.scenes.scenes[sceneId]!.widgets.map((widget) => widget.layout.groupId),
		).toEqual([null, null, null]);
	});

	it('refuses to group fewer than two widgets or ungroup an ungrouped selection', () => {
		const { scene, ids } = setup();
		expect(resolveSelectionLayoutCommand({ id: 'group-selection' }, scene(), [ids[0]!])).toBeNull();
		expect(
			resolveSelectionLayoutCommand({ id: 'ungroup-selection' }, scene(), [ids[0]!, ids[1]!]),
		).toBeNull();
	});
});
