import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	computeWidgetFocusOrder,
	dispatchCommand,
	getSceneForActor,
	type FocusOrderInput,
} from '../src';

function widget(id: string, layout: Partial<FocusOrderInput['layout']> = {}): FocusOrderInput {
	return {
		id,
		layout: { z: 0, groupId: null, dock: null, pinned: false, focusOrder: null, ...layout },
	};
}

function orderIds(widgets: FocusOrderInput[]): string[] {
	return computeWidgetFocusOrder(widgets).map((entry) => entry.widgetInstanceId);
}

describe('CANVAS-016: Scene focus order follows declared layout metadata, not DOM order', () => {
	it('orders layered (ungrouped) widgets by z-order, top-most first', () => {
		const order = orderIds([
			widget('a', { z: 1 }),
			widget('b', { z: 3 }),
			widget('c', { z: 2 }),
		]);
		expect(order).toEqual(['b', 'c', 'a']);
	});

	it('keeps grouped widgets contiguous, anchored by their highest-priority member', () => {
		// Base z-order would interleave the group with widget d; contiguity must pull
		// the second group member up next to the anchor.
		const order = orderIds([
			widget('a', { z: 5 }),
			widget('b', { z: 1, groupId: 'g1' }),
			widget('c', { z: 4, groupId: 'g1' }),
			widget('d', { z: 3 }),
		]);
		expect(order).toEqual(['a', 'c', 'b', 'd']);
		// The two group members are adjacent.
		expect(Math.abs(order.indexOf('c') - order.indexOf('b'))).toBe(1);
	});

	it('treats explicit focus metadata as the strongest signal, ascending', () => {
		const order = orderIds([
			widget('a', { focusOrder: 2 }),
			widget('b', { focusOrder: 0 }),
			widget('c', { z: 99 }),
			widget('d', { focusOrder: 1 }),
		]);
		expect(order).toEqual(['b', 'd', 'a', 'c']);
	});

	it('ranks pinned chrome before docked chrome before floating widgets', () => {
		const order = orderIds([
			widget('floatHigh', { z: 100 }),
			widget('dockLeft', { dock: 'left' }),
			widget('pinned', { pinned: true, z: 0 }),
			widget('dockTop', { dock: 'top' }),
		]);
		expect(order).toEqual(['pinned', 'dockTop', 'dockLeft', 'floatHigh']);
	});

	it('is deterministic regardless of input (DOM insertion) order', () => {
		const widgets = [
			widget('a', { z: 5 }),
			widget('b', { z: 1, groupId: 'g1' }),
			widget('c', { z: 4, groupId: 'g1' }),
			widget('d', { z: 3 }),
		];
		const forward = orderIds(widgets);
		const reversed = orderIds([...widgets].reverse());
		expect(reversed).toEqual(forward);
		// Tie-break is the widget id, never array position.
		const tied = orderIds([widget('zeta', { z: 1 }), widget('alpha', { z: 1 })]);
		expect(tied).toEqual(['alpha', 'zeta']);
	});

	it('reaches every widget after a pin or dock change with none dropped (AC2)', () => {
		const before = [
			widget('a', { z: 3 }),
			widget('b', { z: 2 }),
			widget('c', { z: 1 }),
		];
		expect(new Set(orderIds(before))).toEqual(new Set(['a', 'b', 'c']));

		// Pin widget c and dock widget b; the order changes predictably (pinned, then
		// docked, then floating) and still includes every widget exactly once.
		const after = [
			widget('a', { z: 3 }),
			widget('b', { z: 2, dock: 'right' }),
			widget('c', { z: 1, pinned: true }),
		];
		const afterOrder = orderIds(after);
		expect(afterOrder).toEqual(['c', 'b', 'a']);
		expect(afterOrder).toHaveLength(3);
		expect(new Set(afterOrder)).toEqual(new Set(['a', 'b', 'c']));
	});

	it('returns an empty traversal for a Scene with no widgets', () => {
		expect(computeWidgetFocusOrder([])).toEqual([]);
	});
});

function createSceneWithWidgets(): {
	state: ReturnType<typeof buildInitialState>;
	env: ReturnType<typeof makeEnvironment>;
	sceneId: string;
	widgetIds: string[];
} {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Focus Scene' },
	});
	if (created.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene id');
	let next = created.nextState;
	const widgetIds: string[] = [];
	for (const type of ['note', 'note', 'note']) {
		const add = dispatchCommand(next, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: { type, version: '1.0.0', layout: { x: 0, y: 0, w: 100, h: 100 } },
			},
		});
		if (add.status !== 'accepted') throw new Error('add failed');
		next = add.nextState;
		const added = add.events.find((e) => e.kind === 'scene.widget-added');
		if (added && added.kind === 'scene.widget-added') widgetIds.push(added.widgetInstanceId);
	}
	return { state: next, env, sceneId, widgetIds };
}

describe('CANVAS-016: getSceneForActor exposes the declared focus order', () => {
	it('reflects grouping and explicit metadata applied through commands', () => {
		const { state, env, sceneId, widgetIds } = createSceneWithWidgets();
		const [a, b, c] = widgetIds;
		if (!a || !b || !c) throw new Error('missing widgets');

		// Group a+c and give b an explicit focus order so it leads traversal.
		const grouped = dispatchCommand(state, env, {
			type: 'scene.group-widgets',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceIds: [a, c] },
		});
		expect(grouped.status).toBe('accepted');
		if (grouped.status !== 'accepted') return;
		const focused = dispatchCommand(grouped.nextState, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: b, focusOrder: 0 },
		});
		expect(focused.status).toBe('accepted');
		if (focused.status !== 'accepted') return;

		const summary = getSceneForActor(
			focused.nextState.scenes,
			focused.nextState.permissions,
			DM_ACTOR.id,
			sceneId,
		);
		if ('kind' in summary) throw new Error('scene denied');
		const order = summary.focusOrder.map((entry) => entry.widgetInstanceId);
		// Explicit-order widget b first; grouped a+c stay contiguous afterward.
		expect(order[0]).toBe(b);
		expect(Math.abs(order.indexOf(a) - order.indexOf(c))).toBe(1);
		expect(order).toHaveLength(3);
		expect(summary.focusOrder[0]?.tier).toBe('explicit');
	});

	it('scopes focus order to the widgets actually delivered to a player view', () => {
		const { state, env, sceneId, widgetIds } = createSceneWithWidgets();
		const [a, b] = widgetIds;
		if (!a || !b) throw new Error('missing widgets');

		// Put the Scene into a player-visible section layout and assign the player to a
		// section that only contains widget a.
		const sections = dispatchCommand(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{ id: 'sec-a', name: 'A', bounds: { x: 0, y: 0, w: 10, h: 10 }, widgetInstanceIds: [a] },
					{ id: 'sec-b', name: 'B', bounds: { x: 0, y: 0, w: 10, h: 10 }, widgetInstanceIds: [b] },
				],
			},
		});
		expect(sections.status).toBe('accepted');
		if (sections.status !== 'accepted') return;
		const shared = dispatchCommand(sections.nextState, env, {
			type: 'scene.update-metadata',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				visibility: 'shared',
				playerViewAssignments: [{ playerActorId: PLAYER_ACTOR.id, sectionIds: ['sec-a'] }],
			},
		});
		expect(shared.status).toBe('accepted');
		if (shared.status !== 'accepted') return;

		const playerSummary = getSceneForActor(
			shared.nextState.scenes,
			shared.nextState.permissions,
			PLAYER_ACTOR.id,
			sceneId,
		);
		if ('kind' in playerSummary) throw new Error('player denied');
		const ids = playerSummary.focusOrder.map((entry) => entry.widgetInstanceId);
		expect(ids).toEqual([a]);
	});
});
