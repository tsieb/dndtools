import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import { buildWidgetInverse, dispatchCommand, listRestorableWidgets } from '../src';
import type { CoreCommand, CoreEnvironment, CoreStateSlice } from '../src/commands/types';
import { findPackageRecordForWidgetType } from '../src/state/widget-package-state';
import type { Scene } from '../src/state/scene-state';

/**
 * RC-CAN-1.2 acceptance: destroying a widget files a tombstone, `scene.restore-widget` puts the SAME
 * instance back, tombstones expire after 30 days on the next mutation, and the whole thing replays
 * deterministically.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A clock the test drives, so the 30-day retention window can be crossed on purpose. */
function stepClock(start = '2026-06-03T12:00:00.000Z'): {
	clock: () => string;
	advanceDays: (days: number) => void;
} {
	let ms = Date.parse(start);
	return {
		clock: () => {
			ms += 1000;
			return new Date(ms).toISOString();
		},
		advanceDays: (days: number) => {
			ms += days * DAY_MS;
		},
	};
}

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

/** The scene minus the ownership stamp every ordinary mutation advances. */
function content(state: CoreStateSlice, sceneId: string): string {
	const { ownership: _ownership, ...rest } = sceneOf(state, sceneId);
	return JSON.stringify(rest);
}

function setup(env: CoreEnvironment = makeEnvironment()): {
	state: CoreStateSlice;
	env: CoreEnvironment;
	sceneId: string;
	widgetIds: string[];
} {
	const created = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Combat' },
	});
	if (created.status !== 'accepted') throw new Error('scene.create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene id');

	let state: CoreStateSlice = created.nextState;
	const widgetIds: string[] = [];
	for (const type of ['dice', 'timer', 'map']) {
		const added = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 10, y: 20, w: 100, h: 100 },
					configuration: {},
					binding: null,
				},
			},
		});
		if (added.status !== 'accepted') throw new Error('scene.add-widget failed');
		state = added.nextState;
		const event = added.events.find((e) => e.kind === 'scene.widget-added');
		if (event?.kind !== 'scene.widget-added') throw new Error('no widget-added event');
		widgetIds.push(event.widgetInstanceId);
	}
	return { state, env, sceneId, widgetIds };
}

function destroy(sceneId: string, widgetInstanceId: string): CoreCommand {
	return {
		type: 'scene.destroy-widget',
		actorId: DM_ACTOR.id,
		payload: { sceneId, widgetInstanceId },
	};
}

function restore(sceneId: string, widgetInstanceId: string): CoreCommand {
	return {
		type: 'scene.restore-widget',
		actorId: DM_ACTOR.id,
		payload: { sceneId, widgetInstanceId },
	};
}

describe('RC-CAN-1.2: scene.destroy-widget files a tombstone', () => {
	it('keeps the whole instance, its section and its position in the widget list', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const sectioned = apply(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'section-left',
						name: 'Left',
						bounds: { x: 0, y: 0, w: 100, h: 100 },
						widgetInstanceIds: [widgetIds[1]!],
					},
				],
			},
		});
		const destroyed = apply(sectioned, env, destroy(sceneId, widgetIds[1]!));

		const tombstones = sceneOf(destroyed, sceneId).tombstones ?? [];
		expect(tombstones).toHaveLength(1);
		expect(tombstones[0]?.widget.id).toBe(widgetIds[1]);
		expect(tombstones[0]?.widget.type).toBe('timer');
		expect(tombstones[0]?.sectionId).toBe('section-left');
		expect(tombstones[0]?.index).toBe(1);
		expect(tombstones[0]?.destroyedByActorId).toBe(DM_ACTOR.id);
		expect(tombstones[0]?.destroyedAt).toMatch(/^\d{4}-/);
		expect(sceneOf(destroyed, sceneId).widgets.map((w) => w.id)).not.toContain(widgetIds[1]);
	});

	it('leaves no tombstones field on a scene that has never lost a widget', () => {
		const { state, sceneId } = setup();
		expect(sceneOf(state, sceneId).tombstones).toBeUndefined();
	});
});

describe('RC-CAN-1.2: scene.restore-widget puts the same instance back', () => {
	it('round-trips destroy → restore to a byte-identical scene', () => {
		const { state, env, sceneId, widgetIds } = setup();
		// Give the middle widget a layout worth losing: z, dock, pin and focus order.
		let laid = apply(state, env, {
			type: 'scene.dock-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[1]!, dock: 'right' },
		});
		laid = apply(laid, env, {
			type: 'scene.pin-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[1]!, pinned: true },
		});
		laid = apply(laid, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[1]!, focusOrder: 2 },
		});
		laid = apply(laid, env, {
			type: 'scene.configure-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[1]!, configuration: { label: 'Round' } },
		});

		const before = content(laid, sceneId);
		const destroyed = apply(laid, env, destroy(sceneId, widgetIds[1]!));
		expect(content(destroyed, sceneId)).not.toBe(before);

		const restored = apply(destroyed, env, restore(sceneId, widgetIds[1]!));
		expect(content(restored, sceneId)).toBe(before);
		// Restore is an ordinary durable mutation, not a rewind: two commands, two revisions.
		expect(sceneOf(restored, sceneId).ownership.revision).toBe(
			sceneOf(laid, sceneId).ownership.revision + 2,
		);
	});

	it('re-inserts the instance into the section it was listed in', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const sectioned = apply(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				sections: [
					{
						id: 'section-left',
						name: 'Left',
						bounds: { x: 0, y: 0, w: 100, h: 100 },
						widgetInstanceIds: [widgetIds[0]!],
					},
				],
			},
		});
		const restored = apply(
			apply(sectioned, env, destroy(sceneId, widgetIds[0]!)),
			env,
			restore(sceneId, widgetIds[0]!),
		);
		expect(sceneOf(restored, sceneId).sections[0]?.widgetInstanceIds).toEqual([widgetIds[0]]);
		expect(sceneOf(restored, sceneId).tombstones).toBeUndefined();
	});

	it('emits scene.widget-restored carrying the original instance id', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const destroyed = apply(state, env, destroy(sceneId, widgetIds[0]!));
		const result = dispatchCommand(destroyed, env, restore(sceneId, widgetIds[0]!));
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.events).toEqual([
			{
				kind: 'scene.widget-restored',
				sceneId,
				widgetInstanceId: widgetIds[0],
				actorId: DM_ACTOR.id,
			},
		]);
		expect(result.operationIds).toHaveLength(1);
	});
});

describe('RC-CAN-1.2: restore fails closed', () => {
	it('refuses a widget that was never destroyed, and a second restore', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const never = dispatchCommand(state, env, restore(sceneId, widgetIds[0]!));
		expect(never.status).toBe('rejected');
		if (never.status === 'rejected') expect(never.rejection.code).toBe('widget-not-restorable');

		const restored = apply(
			apply(state, env, destroy(sceneId, widgetIds[0]!)),
			env,
			restore(sceneId, widgetIds[0]!),
		);
		const again = dispatchCommand(restored, env, restore(sceneId, widgetIds[0]!));
		expect(again.status).toBe('rejected');
		if (again.status === 'rejected') expect(again.rejection.code).toBe('widget-not-restorable');
	});

	it('refuses an actor who may not edit the scene', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const destroyed = apply(state, env, destroy(sceneId, widgetIds[0]!));
		const result = dispatchCommand(destroyed, env, {
			type: 'scene.restore-widget',
			actorId: PLAYER_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]! },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(['actor-not-authorized', 'hidden-target']).toContain(result.rejection.code);
		}
	});

	it('restores as a disabled placeholder when the package went away meanwhile', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const destroyed = apply(state, env, destroy(sceneId, widgetIds[0]!));
		const packageId = findPackageRecordForWidgetType(destroyed.widgets, 'dice')?.package.id;
		expect(packageId).toBeTruthy();
		const removed = apply(destroyed, env, {
			type: 'widget.package.remove',
			actorId: DM_ACTOR.id,
			payload: { packageId: packageId! },
		});
		const restored = apply(removed, env, restore(sceneId, widgetIds[0]!));
		const widget = sceneOf(restored, sceneId).widgets.find((w) => w.id === widgetIds[0]);
		expect(widget?.disabled?.reason).toBe('package-removed');
		expect(widget?.disabled?.previousVersion).toBe('1.0.0');
	});
});

describe('RC-CAN-1.2: tombstones expire after 30 days on the next mutation', () => {
	it('refuses to restore past the retention window and prunes on the next destroy', () => {
		const timeline = stepClock();
		const env = makeEnvironment({ clock: timeline.clock });
		const { state, sceneId, widgetIds } = setup(env);

		const destroyed = apply(state, env, destroy(sceneId, widgetIds[0]!));
		expect(sceneOf(destroyed, sceneId).tombstones).toHaveLength(1);
		expect(listRestorableWidgets(sceneOf(destroyed, sceneId), timeline.clock())).toHaveLength(1);

		timeline.advanceDays(31);
		const tooLate = dispatchCommand(destroyed, env, restore(sceneId, widgetIds[0]!));
		expect(tooLate.status).toBe('rejected');
		if (tooLate.status === 'rejected') {
			expect(tooLate.rejection.code).toBe('widget-not-restorable');
		}

		// The expired record is dropped by the next tombstone mutation, not by a background timer.
		const nextDestroy = apply(destroyed, env, destroy(sceneId, widgetIds[1]!));
		const tombstones = sceneOf(nextDestroy, sceneId).tombstones ?? [];
		expect(tombstones.map((t) => t.widget.id)).toEqual([widgetIds[1]]);
	});

	it('lists restorable widgets newest destroy first', () => {
		const timeline = stepClock();
		const env = makeEnvironment({ clock: timeline.clock });
		const { state, sceneId, widgetIds } = setup(env);
		let next = apply(state, env, destroy(sceneId, widgetIds[0]!));
		timeline.advanceDays(1);
		next = apply(next, env, destroy(sceneId, widgetIds[1]!));
		const listed = listRestorableWidgets(sceneOf(next, sceneId), timeline.clock());
		expect(listed.map((t) => t.widget.id)).toEqual([widgetIds[1], widgetIds[0]]);
	});
});

describe('RC-CAN-1.2: replay determinism and undo wiring', () => {
	it('replays the same command sequence to the same scene state', () => {
		function run(): string {
			const env = makeEnvironment();
			const { state, sceneId, widgetIds } = setup(env);
			let next = apply(state, env, destroy(sceneId, widgetIds[1]!));
			next = apply(next, env, destroy(sceneId, widgetIds[0]!));
			next = apply(next, env, restore(sceneId, widgetIds[1]!));
			return JSON.stringify(sceneOf(next, sceneId));
		}
		expect(run()).toBe(run());
	});

	it('buildWidgetInverse now inverts a destroy with scene.restore-widget', () => {
		const { state, sceneId, widgetIds } = setup();
		const inverse = buildWidgetInverse(destroy(sceneId, widgetIds[0]!), state);
		expect(inverse?.command).toEqual({
			type: 'scene.restore-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0] },
		});
		expect(inverse?.label).toBe('Removed widget');
	});
});
