import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { buildWidgetInverse, dispatchCommand } from '../src';
import type { CoreCommand, CoreEnvironment, CoreStateSlice } from '../src/commands/types';
import type { Scene } from '../src/state/scene-state';

/**
 * RC-CAN-2.4 acceptance for the folded-in core story: `scene.duplicate-widget` copies an instance from
 * the Core's own scene (definition, version, size, configuration, binding, section) under a fresh id
 * and fresh local state, fails closed on the same terms as an add, and replays deterministically.
 */

function apply(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CoreStateSlice {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') {
		throw new Error(`command ${command.type} rejected: ${JSON.stringify(result)}`);
	}
	return result.nextState;
}

function sceneOf(state: CoreStateSlice, sceneId: string): Scene {
	const scene = state.scenes.scenes[sceneId];
	if (!scene) throw new Error('scene missing');
	return scene;
}

const MAP_BINDING = {
	source: { entityType: 'map', entityId: 'map-harbor' },
	mode: 'read',
	requiredCapability: 'viewer',
} as const;

function setup(env: CoreEnvironment = makeEnvironment()) {
	let state = apply(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Harbor' },
	});
	const sceneId = Object.keys(state.scenes.scenes)[0]!;
	const add = (type: string, layout: object, extra: object = {}) => {
		state = apply(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: { type, version: '1.0.0', layout, configuration: {}, binding: null, ...extra },
			},
		});
		return sceneOf(state, sceneId).widgets.at(-1)!.id;
	};
	const timer = add(
		'timer',
		{ x: 20, y: 20, w: 200, h: 100 },
		{
			configuration: { visibility: 'player-visible' },
			localState: { running: true },
		},
	);
	// Stacked in the timer's column, and one beside it that shares no column.
	add('dice', { x: 100, y: 140, w: 200, h: 100 });
	add('dice', { x: 400, y: 600, w: 200, h: 100 });
	const map = add('map', { x: 700, y: 20, w: 300, h: 200 }, { binding: MAP_BINDING });
	return {
		get state() {
			return state;
		},
		env,
		sceneId,
		timer,
		map,
	};
}

function duplicate(sceneId: string, widgetInstanceId: string, extra: object = {}): CoreCommand {
	return {
		type: 'scene.duplicate-widget',
		actorId: DM_ACTOR.id,
		payload: { sceneId, widgetInstanceId, ...extra },
	};
}

describe('RC-CAN-2.4: scene.duplicate-widget', () => {
	it('copies the instance under a fresh id, below everything in its columns', () => {
		const { state, env, sceneId, timer } = setup();
		const result = dispatchCommand(state, env, duplicate(sceneId, timer));
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;

		const before = sceneOf(state, sceneId);
		const after = sceneOf(result.nextState, sceneId);
		expect(after.widgets).toHaveLength(before.widgets.length + 1);
		const source = after.widgets.find((w) => w.id === timer)!;
		const copy = after.widgets.at(-1)!;
		expect(copy.id).not.toBe(timer);
		expect(copy.type).toBe(source.type);
		expect(copy.version).toBe(source.version);
		expect(copy.configuration).toEqual({ visibility: 'player-visible' });
		// A copy starts fresh, the way a newly placed widget does.
		expect(copy.localState).toEqual({});
		// Same x and size; below the dice tile that shares its columns, ignoring the one that doesn't.
		expect(copy.layout).toMatchObject({ x: 20, y: 240, w: 200, h: 100 });
		expect(copy.layout.z).toBeGreaterThan(Math.max(...before.widgets.map((w) => w.layout.z)));
		// The source itself is untouched.
		expect(source).toEqual(before.widgets.find((w) => w.id === timer));

		expect(result.events).toEqual([
			{ kind: 'scene.widget-added', sceneId, widgetInstanceId: copy.id, actorId: DM_ACTOR.id },
		]);
		expect(result.nextState.sync.operations.at(-1)).toMatchObject({
			opType: 'scene.duplicate-widget',
			path: `widgets/${copy.id}`,
		});
	});

	it('lands at an explicit position, keeps the binding and joins the source section', () => {
		const setupResult = setup();
		const { env, sceneId, map } = setupResult;
		const sectioned = apply(setupResult.state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'section-maps',
						name: 'Maps',
						bounds: { x: 0, y: 0, w: 900, h: 900 },
						widgetInstanceIds: [map],
					},
				],
			},
		});
		const next = apply(sectioned, env, duplicate(sceneId, map, { position: { x: 700, y: 260 } }));
		const scene = sceneOf(next, sceneId);
		const copy = scene.widgets.at(-1)!;
		expect(copy.binding).toEqual(MAP_BINDING);
		expect(copy.layout).toMatchObject({ x: 700, y: 260, w: 300, h: 200 });
		expect(scene.sections[0]!.widgetInstanceIds).toEqual([map, copy.id]);
	});

	it('fails closed: unknown widget, caller-supplied content, a non-editor, a disabled package', () => {
		const { state, env, sceneId, timer } = setup();
		const code = (command: CoreCommand, from = state) => {
			const result = dispatchCommand(from, env, command);
			return result.status === 'rejected' ? result.rejection.code : result.status;
		};
		expect(code(duplicate(sceneId, 'widget-nope'))).toBe('widget-not-found');
		// The copy's content is never taken from the caller.
		expect(code(duplicate(sceneId, timer, { configuration: { visibility: 'dm-only' } }))).toBe(
			'invalid-payload',
		);
		expect(code({ ...duplicate(sceneId, timer), actorId: PLAYER_ACTOR.id })).toBe(
			'actor-not-authorized',
		);

		const packageId = Object.values(state.widgets.packages).find((record) =>
			record.package.widgets.some((definition) => definition.type === 'timer'),
		)!.package.id;
		const disabled = apply(state, env, {
			type: 'widget.package.disable',
			actorId: DM_ACTOR.id,
			payload: { packageId },
		});
		expect(code(duplicate(sceneId, timer), disabled)).toBe('invalid-state');
	});

	it('is undone like an add, and replays byte-identically', () => {
		const first = setup(makeEnvironment());
		const second = setup(makeEnvironment());
		const a = apply(first.state, first.env, duplicate(first.sceneId, first.timer));
		const b = apply(second.state, second.env, duplicate(second.sceneId, second.timer));
		expect(JSON.stringify(sceneOf(a, first.sceneId))).toBe(
			JSON.stringify(sceneOf(b, second.sceneId)),
		);
		// No pure inverse (the copy's id is minted in the handler); the lifecycle routes it to destroy.
		expect(buildWidgetInverse(duplicate(first.sceneId, first.timer), first.state)).toBeNull();
	});

	it('with a caller-minted copyId, undo destroys the copy and redo restores that same instance', () => {
		const { state, env, sceneId, timer } = setup();
		const copyId = env.ids();
		const forward = duplicate(sceneId, timer, { copyId });
		const inverse = buildWidgetInverse(forward, state);
		expect(inverse?.command).toEqual({
			type: 'scene.destroy-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: copyId },
		});
		const duplicated = apply(state, env, forward);
		const copy = sceneOf(duplicated, sceneId).widgets.find((w) => w.id === copyId)!;
		expect(copy).toBeDefined();

		const undone = apply(duplicated, env, inverse!.command);
		expect(sceneOf(undone, sceneId).widgets.map((w) => w.id)).toEqual(
			sceneOf(state, sceneId).widgets.map((w) => w.id),
		);

		// Redoing the undo restores the tombstone: the same id comes back, not a second copy.
		const redo = buildWidgetInverse(inverse!.command, duplicated);
		expect(redo?.command).toMatchObject({
			type: 'scene.restore-widget',
			payload: { sceneId, widgetInstanceId: copyId },
		});
		const redone = apply(undone, env, redo!.command);
		expect(sceneOf(redone, sceneId).widgets.find((w) => w.id === copyId)).toMatchObject({
			type: copy.type,
			configuration: copy.configuration,
		});
		// And that restore can itself be undone.
		expect(buildWidgetInverse(redo!.command, undone)?.command).toMatchObject({
			type: 'scene.destroy-widget',
			payload: { sceneId, widgetInstanceId: copyId },
		});

		// A copyId already in use, live or tombstoned, gets no inverse and is refused by the handler.
		expect(buildWidgetInverse(duplicate(sceneId, timer, { copyId }), undone)).toBeNull();
		expect(dispatchCommand(undone, env, duplicate(sceneId, timer, { copyId })).status).not.toBe(
			'accepted',
		);
		expect(
			dispatchCommand(state, env, duplicate(sceneId, timer, { copyId: timer })).status,
		).not.toBe('accepted');
	});
});
