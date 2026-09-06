import { describe, expect, it } from 'vitest';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import { buildWidgetInverse, dispatchCommand } from '../src';
import type { CoreCommand, CoreStateSlice } from '../src/commands/types';
import type { Scene } from '../src/state/scene-state';

/**
 * RC-CAN-1.1 acceptance: for every covered layout op, apply → inverse → byte-identical scene.
 *
 * "Byte-identical" means the scene's CONTENT: widgets, sections and metadata. `ownership.revision`
 * and `ownership.updatedAt` legitimately advance — an undo is an ordinary durable mutation, not a
 * rewind of history (ADR-029 §1), so a round trip that left the revision untouched would mean the
 * undo never went through the command path at all.
 */

function setup(): {
	state: CoreStateSlice;
	env: ReturnType<typeof makeEnvironment>;
	sceneId: string;
	widgetIds: string[];
} {
	const initial = buildInitialState(DM_ACTOR);
	const env = makeEnvironment();
	const created = dispatchCommand(initial, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Combat' },
	});
	if (created.status !== 'accepted') throw new Error('scene.create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('no scene id');

	let state: CoreStateSlice = created.nextState;
	const widgetIds: string[] = [];
	for (const type of ['dice', 'map']) {
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

function sceneOf(state: CoreStateSlice, sceneId: string): Scene {
	const scene = state.scenes.scenes[sceneId];
	if (!scene) throw new Error('scene missing');
	return scene;
}

/** The scene minus the ownership stamp an ordinary mutation is expected to advance. */
function content(state: CoreStateSlice, sceneId: string): string {
	const { ownership: _ownership, ...rest } = sceneOf(state, sceneId);
	return JSON.stringify(rest);
}

function apply(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	command: CoreCommand,
) {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') {
		throw new Error(`command ${command.type} rejected: ${JSON.stringify(result)}`);
	}
	return result.nextState;
}

/** apply → build inverse from the state BEFORE → apply the inverse → assert the content came back. */
function expectRoundTrip(
	state: CoreStateSlice,
	env: ReturnType<typeof makeEnvironment>,
	sceneId: string,
	command: CoreCommand,
): void {
	const before = content(state, sceneId);
	const afterForward = apply(state, env, command);
	expect(content(afterForward, sceneId)).not.toBe(before);

	const inverse = buildWidgetInverse(command, state);
	expect(inverse).not.toBeNull();
	if (!inverse) return;
	expect(inverse.label.length).toBeGreaterThan(0);

	const afterInverse = apply(afterForward, env, inverse.command);
	expect(content(afterInverse, sceneId)).toBe(before);
	// The undo is itself a durable, logged mutation — two forward ops, two revisions.
	expect(sceneOf(afterInverse, sceneId).ownership.revision).toBe(
		sceneOf(state, sceneId).ownership.revision + 2,
	);
}

describe('RC-CAN-1.1: buildWidgetInverse round-trips every covered scene layout op', () => {
	it('scene.move-widget restores the prior position', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.move-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, x: 400, y: 512 },
		});
	});

	it('scene.resize-widget restores the prior size', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.resize-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, w: 640, h: 480 },
		});
	});

	it('scene.layer-widget restores the prior z', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.layer-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, z: 42 },
		});
	});

	it('scene.dock-widget restores the prior dock, including back to undocked', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.dock-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, dock: 'left' },
		});
	});

	it('scene.dock-widget restores a prior dock side, not just null', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const docked = apply(state, env, {
			type: 'scene.dock-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, dock: 'right' },
		});
		expectRoundTrip(docked, env, sceneId, {
			type: 'scene.dock-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, dock: 'top' },
		});
	});

	it('scene.pin-widget restores the prior pinned flag', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.pin-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, pinned: true },
		});
	});

	it('scene.set-focus-order restores the prior focus order, including back to unset', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, focusOrder: 3 },
		});
	});

	it('scene.set-focus-order restores a prior number when the forward op cleared it', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const ordered = apply(state, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, focusOrder: 2 },
		});
		expectRoundTrip(ordered, env, sceneId, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, focusOrder: null },
		});
	});

	it('scene.configure-widget restores the prior configuration', () => {
		const { state, env, sceneId, widgetIds } = setup();
		expectRoundTrip(state, env, sceneId, {
			type: 'scene.configure-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widgetInstanceId: widgetIds[0]!,
				configuration: { label: 'Initiative' },
			},
		});
	});

	it('scene.configure-widget leaves the untouched field alone', () => {
		const { state, sceneId, widgetIds } = setup();
		const command: CoreCommand = {
			type: 'scene.configure-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId: widgetIds[0]!, configuration: { label: 'x' } },
		};
		const inverse = buildWidgetInverse(command, state);
		expect(inverse).not.toBeNull();
		const payload = inverse?.command.payload as Record<string, unknown>;
		expect(payload).toHaveProperty('configuration');
		// The forward command never set `binding`, so the inverse must not set it either.
		expect(payload).not.toHaveProperty('binding');
	});

	it('scene.move-group restores the prior group position', () => {
		const { state, env, sceneId, widgetIds } = setup();
		const grouped = apply(state, env, {
			type: 'scene.group-widgets',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceIds: widgetIds },
		});
		const groupId = sceneOf(grouped, sceneId).widgets[0]?.layout.groupId;
		expect(groupId).toBeTruthy();
		expectRoundTrip(grouped, env, sceneId, {
			type: 'scene.move-group',
			actorId: DM_ACTOR.id,
			payload: { sceneId, groupId: groupId!, deltaX: 25, deltaY: -60 },
		});
	});
});

describe('RC-CAN-1.1: buildWidgetInverse refuses rather than guessing', () => {
	it('reports add and group-widgets as not undoable', () => {
		const { state, sceneId, widgetIds } = setup();
		const notUndoable: CoreCommand[] = [
			{
				type: 'scene.add-widget',
				actorId: DM_ACTOR.id,
				payload: {
					sceneId,
					widget: {
						type: 'dice',
						version: '1.0.0',
						layout: { x: 0, y: 0, w: 50, h: 50 },
						configuration: {},
						binding: null,
					},
				},
			},
			{
				type: 'scene.group-widgets',
				actorId: DM_ACTOR.id,
				payload: { sceneId, widgetInstanceIds: widgetIds },
			},
		];
		for (const command of notUndoable) {
			expect(buildWidgetInverse(command, state)).toBeNull();
		}
	});

	it('returns null for a command that is not a scene layout command', () => {
		const { state, sceneId } = setup();
		expect(
			buildWidgetInverse(
				{ type: 'scene.update-metadata', actorId: DM_ACTOR.id, payload: { sceneId, name: 'x' } },
				state,
			),
		).toBeNull();
	});

	it('returns null for a malformed payload instead of a wrong inverse', () => {
		const { state, sceneId } = setup();
		expect(
			buildWidgetInverse(
				{ type: 'scene.move-widget', actorId: DM_ACTOR.id, payload: { sceneId } },
				state,
			),
		).toBeNull();
	});

	it('returns null when the widget is absent from the given stateBefore', () => {
		const { state, sceneId } = setup();
		expect(
			buildWidgetInverse(
				{
					type: 'scene.move-widget',
					actorId: DM_ACTOR.id,
					payload: { sceneId, widgetInstanceId: 'no-such-widget', x: 1, y: 2 },
				},
				state,
			),
		).toBeNull();
	});

	it('returns null when the group has no members in the given stateBefore', () => {
		const { state, sceneId } = setup();
		expect(
			buildWidgetInverse(
				{
					type: 'scene.move-group',
					actorId: DM_ACTOR.id,
					payload: { sceneId, groupId: 'no-such-group', deltaX: 5, deltaY: 5 },
				},
				state,
			),
		).toBeNull();
	});

	it('is pure: it does not mutate the state it reads', () => {
		const { state, sceneId, widgetIds } = setup();
		const before = JSON.stringify(state.scenes);
		buildWidgetInverse(
			{
				type: 'scene.move-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId, widgetInstanceId: widgetIds[0]!, x: 7, y: 9 },
			},
			state,
		);
		expect(JSON.stringify(state.scenes)).toBe(before);
	});
});
