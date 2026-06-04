import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	MIN_WIDGET_EXTENT,
	dispatchCommand,
	listWidgetLayoutCommands,
	resolveLayoutCommandPayload,
	type CoreStateSlice,
} from '../src';
import type { Scene, WidgetInstance } from '../src';

function setup(): {
	state: CoreStateSlice;
	env: ReturnType<typeof makeEnvironment>;
	sceneId: string;
	widgetId: string;
} {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Layout Scene' },
	});
	if (created.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene id');
	const added = dispatchCommand(created.nextState, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: { type: 'note', version: '1.0.0', layout: { x: 100, y: 100, w: 200, h: 160 } },
		},
	});
	if (added.status !== 'accepted') throw new Error('add failed');
	const event = added.events.find((e) => e.kind === 'scene.widget-added');
	const widgetId = event && event.kind === 'scene.widget-added' ? event.widgetInstanceId : '';
	if (!widgetId) throw new Error('no widget id');
	return { state: added.nextState, env, sceneId, widgetId };
}

function getScene(state: CoreStateSlice, sceneId: string): Scene {
	const scene = state.scenes.scenes[sceneId];
	if (!scene) throw new Error('scene missing');
	return scene;
}

function getWidget(scene: Scene, widgetId: string): WidgetInstance {
	const widget = scene.widgets.find((w) => w.id === widgetId);
	if (!widget) throw new Error('widget missing');
	return widget;
}

describe('CANVAS-012: every Must-have layout op has a pointer-free command path', () => {
	it('lists keyboard/touch commands covering move, resize, layer, dock, pin, group, focus, remove', () => {
		const { state, sceneId, widgetId } = setup();
		const scene = getScene(state, sceneId);
		const widget = getWidget(scene, widgetId);
		const commands = listWidgetLayoutCommands(scene, widget, state.permissions, DM_ACTOR.id);

		const commandTypes = new Set(commands.map((c) => c.commandType));
		expect(commandTypes).toEqual(
			new Set([
				'scene.move-widget',
				'scene.resize-widget',
				'scene.layer-widget',
				'scene.dock-widget',
				'scene.pin-widget',
				'scene.set-focus-order',
				'scene.group-widgets',
				'scene.destroy-widget',
			]),
		);
		// No command depends on drag or hover.
		expect(commands.every((c) => c.pointerFree)).toBe(true);

		const groups = new Set(commands.map((c) => c.group));
		for (const required of [
			'move',
			'size',
			'layer',
			'dock',
			'pin',
			'group',
			'focus',
			'lifecycle',
		]) {
			expect(groups).toContain(required);
		}
	});

	it('resolves each self command to a payload that the core accepts (no pointer needed)', () => {
		const { env, sceneId, widgetId, state: initialState } = setup();
		let state = initialState;
		const selfCommandIds = [
			'move-left',
			'move-right',
			'move-up',
			'move-down',
			'grow-width',
			'shrink-width',
			'grow-height',
			'shrink-height',
			'layer-forward',
			'layer-backward',
			'dock-left',
			'pin',
			'focus-later',
		];

		for (const id of selfCommandIds) {
			const scene = getScene(state, sceneId);
			const widget = getWidget(scene, widgetId);
			const command = listWidgetLayoutCommands(scene, widget, state.permissions, DM_ACTOR.id).find(
				(c) => c.id === id,
			);
			expect(command, `command ${id} should be listed`).toBeDefined();
			if (!command) continue;
			const resolved = resolveLayoutCommandPayload(command, scene, widget);
			expect(resolved, `command ${id} should resolve`).not.toBeNull();
			if (!resolved) continue;
			const result = dispatchCommand(state, env, {
				type: resolved.type,
				actorId: DM_ACTOR.id,
				payload: resolved.payload,
			});
			expect(result.status, `dispatch ${id}`).toBe('accepted');
			if (result.status !== 'accepted') return;
			state = result.nextState;
		}

		const finalWidget = getWidget(getScene(state, sceneId), widgetId);
		expect(finalWidget.layout.dock).toBe('left');
		expect(finalWidget.layout.pinned).toBe(true);
		// focus-later establishes an explicit order one step past the baseline.
		expect(finalWidget.layout.focusOrder).toBe(1);
	});

	it('clamps resize shrink to a positive minimum and move to non-negative coordinates', () => {
		const { state, sceneId } = setup();
		// A small widget near the origin to force clamping.
		const scene = getScene(state, sceneId);
		const tiny: WidgetInstance = {
			...getWidget(scene, scene.widgets[0]!.id),
			layout: {
				...scene.widgets[0]!.layout,
				x: 5,
				y: 5,
				w: MIN_WIDGET_EXTENT,
				h: MIN_WIDGET_EXTENT,
			},
		};
		const commands = listWidgetLayoutCommands(scene, tiny, state.permissions, DM_ACTOR.id);
		const shrinkW = commands.find((c) => c.id === 'shrink-width')!;
		const moveLeft = commands.find((c) => c.id === 'move-left')!;
		const resolvedShrink = resolveLayoutCommandPayload(shrinkW, scene, tiny);
		const resolvedMove = resolveLayoutCommandPayload(moveLeft, scene, tiny);
		expect(resolvedShrink?.payload.w).toBe(MIN_WIDGET_EXTENT);
		expect(resolvedMove?.payload.x).toBe(0);
	});

	it('only offers state-applicable toggles (unpin, undock, clear focus)', () => {
		const { state, env, sceneId, widgetId } = setup();
		const baseScene = getScene(state, sceneId);
		const baseWidget = getWidget(baseScene, widgetId);
		const baseIds = new Set(
			listWidgetLayoutCommands(baseScene, baseWidget, state.permissions, DM_ACTOR.id).map(
				(c) => c.id,
			),
		);
		expect(baseIds.has('pin')).toBe(true);
		expect(baseIds.has('unpin')).toBe(false);
		expect(baseIds.has('dock-none')).toBe(false);
		expect(baseIds.has('focus-clear')).toBe(false);

		// Pin, dock, and set a focus order, then the inverse toggles appear.
		let next = state;
		for (const command of [
			{
				type: 'scene.pin-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, pinned: true },
			},
			{
				type: 'scene.dock-widget' as const,
				payload: { sceneId, widgetInstanceId: widgetId, dock: 'top' },
			},
			{
				type: 'scene.set-focus-order' as const,
				payload: { sceneId, widgetInstanceId: widgetId, focusOrder: 3 },
			},
		]) {
			const out = dispatchCommand(next, env, { actorId: DM_ACTOR.id, ...command });
			expect(out.status).toBe('accepted');
			if (out.status !== 'accepted') return;
			next = out.nextState;
		}
		const scene = getScene(next, sceneId);
		const widget = getWidget(scene, widgetId);
		const ids = new Set(
			listWidgetLayoutCommands(scene, widget, next.permissions, DM_ACTOR.id).map((c) => c.id),
		);
		expect(ids.has('unpin')).toBe(true);
		expect(ids.has('pin')).toBe(false);
		expect(ids.has('dock-none')).toBe(true);
		expect(ids.has('dock-top')).toBe(false);
		expect(ids.has('focus-clear')).toBe(true);
	});

	it('withholds layout commands from actors who cannot edit the Scene', () => {
		const { state, sceneId, widgetId } = setup();
		const scene = getScene(state, sceneId);
		const widget = getWidget(scene, widgetId);

		// Player without a grant: no layout commands.
		expect(listWidgetLayoutCommands(scene, widget, state.permissions, PLAYER_ACTOR.id)).toEqual([]);
		// Observer: never editable.
		expect(listWidgetLayoutCommands(scene, widget, state.permissions, OBSERVER_ACTOR.id)).toEqual(
			[],
		);

		// Player with a Scene co-editor grant: full command surface.
		const withGrant: CoreStateSlice = {
			...state,
			permissions: {
				...state.permissions,
				grants: [
					{
						id: 'grant-1',
						entityType: 'scene',
						entityId: sceneId,
						playerActorId: PLAYER_ACTOR.id,
						capabilitySet: 'co-editor',
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-03T00:00:00.000Z',
					},
				],
			},
		};
		const coEditorCommands = listWidgetLayoutCommands(
			scene,
			widget,
			withGrant.permissions,
			PLAYER_ACTOR.id,
		);
		expect(coEditorCommands.length).toBeGreaterThan(0);
	});
});

describe('CANVAS-012/016: scene.set-focus-order command', () => {
	it('records an explicit focus order and a layout operation for sync', () => {
		const { state, env, sceneId, widgetId } = setup();
		const result = dispatchCommand(state, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, focusOrder: 2 },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const widget = getWidget(getScene(result.nextState, sceneId), widgetId);
		expect(widget.layout.focusOrder).toBe(2);
		const event = result.events.find((e) => e.kind === 'scene.widget-layout-changed');
		expect(event && event.kind === 'scene.widget-layout-changed' && event.field).toBe('focusOrder');
		const op = result.nextState.sync.operations.at(-1);
		expect(op?.opType).toBe('scene.set-focus-order');
		expect(op?.path).toContain('layout/focusOrder');
	});

	it('clears an explicit focus order back to null', () => {
		const { state, env, sceneId, widgetId } = setup();
		const set = dispatchCommand(state, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, focusOrder: 4 },
		});
		if (set.status !== 'accepted') throw new Error('set failed');
		const cleared = dispatchCommand(set.nextState, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, focusOrder: null },
		});
		expect(cleared.status).toBe('accepted');
		if (cleared.status !== 'accepted') return;
		expect(getWidget(getScene(cleared.nextState, sceneId), widgetId).layout.focusOrder).toBeNull();
	});

	it('rejects a negative focus order and a non-DM author', () => {
		const { state, env, sceneId, widgetId } = setup();
		const negative = dispatchCommand(state, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, focusOrder: -1 },
		});
		expect(negative.status).toBe('rejected');
		if (negative.status === 'rejected') expect(negative.rejection.code).toBe('invalid-payload');

		const player = dispatchCommand(state, env, {
			type: 'scene.set-focus-order',
			actorId: PLAYER_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetId, focusOrder: 1 },
		});
		expect(player.status).toBe('rejected');
		if (player.status === 'rejected') expect(player.rejection.code).toBe('actor-not-authorized');
	});
});
